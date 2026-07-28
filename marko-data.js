// Supabase-backed data layer for the Marko web app.
//
// Exposes window.MarkoData.api(path, opts) with the SAME signature and return
// shapes the app used against the old Cloudflare Worker, so the dashboard's
// render code is untouched — only the transport changed. Paths map to Postgres
// queries (via supabase-js) and, for screenshots, to the R2 proxy worker.
(() => {
  const SHOTS_URL = "https://marko-shots.strativ.workers.dev";
  const sb = window.marko && window.marko.supabase;

  // ── shape mappers: DB rows → the JSON the app expects ──
  const mapComment = (c) => ({
    id: c.id, by: c.author_email, byName: c.author_name, text: c.text, at: c.created_at,
  });
  const mapPin = (h) => ({
    id: h.id, pageUrl: h.page_url, selector: h.selector, xr: h.xr, yr: h.yr,
    comment: h.comment, severity: h.severity, status: h.status, assignee: h.assignee,
    due: h.due, device: h.device, viewport: h.viewport, hasShot: h.has_shot,
    createdBy: h.created_by_email, createdAt: h.created_at,
    comments: (h.comments || [])
      .slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(mapComment),
  });
  const mapProject = (p) => ({
    id: p.id, name: p.name, url: p.url, description: p.description || "",
    owner: p.owner_email, members: (p.project_members || []).map((m) => m.email),
    archived: !!p.archived, shareToken: p.share_token,
    createdAt: p.created_at, updatedAt: p.updated_at,
  });

  function hostOf(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    try {
      const url = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
      return url.host.replace(/^www\./i, "").toLowerCase();
    } catch { return ""; }
  }
  function countsOf(pins) {
    const c = { active: 0, resolved: 0, total: 0 };
    for (const p of pins) { c.total++; if (p.status === "resolved" || p.status === "done") c.resolved++; else c.active++; }
    return c;
  }
  async function me() {
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) throw new Error("unauthorized");
    return data.user;
  }
  async function accessToken() {
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.access_token : "";
  }

  // ── screenshots via the R2 proxy worker ──
  async function uploadShot(pid, pinId, dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const r = await fetch(`${SHOTS_URL}/shot/${pid}/${pinId}`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + (await accessToken()), "Content-Type": blob.type || "image/png" },
      body: blob,
    });
    if (!r.ok) throw new Error("shot_upload_failed");
  }
  async function getShot(pid, pinId) {
    const r = await fetch(`${SHOTS_URL}/shot/${pid}/${pinId}`, {
      headers: { Authorization: "Bearer " + (await accessToken()) },
    });
    if (!r.ok) return { shot: null };
    return { shot: URL.createObjectURL(await r.blob()) };
  }

  function fail(e) {
    const msg = (e && e.message) || String(e);
    const err = new Error(msg);
    err.data = { error: msg };
    return err;
  }

  // ── the router ──
  async function api(path, opts = {}) {
    if (!sb) throw new Error("supabase not initialised");
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};
    const [rawPath, query = ""] = path.split("?");
    const seg = rawPath.split("/").filter(Boolean); // e.g. ["projects","<id>","pins","<hid>"]

    try {
      // /projects  and  /projects/find
      if (seg[0] === "projects" && seg.length === 1) {
        if (method === "POST") {
          const u = await me();
          const { data, error } = await sb.from("projects")
            .insert({ name: body.name, url: body.url || "", description: body.description || "", owner: u.id, owner_email: u.email })
            .select("*, project_members(email)").single();
          if (error) throw error;
          return { project: mapProject(data) };
        }
        const { data, error } = await sb.from("projects")
          .select("*, project_members(email)").order("updated_at", { ascending: false });
        if (error) throw error;
        const ids = data.map((p) => p.id);
        const byId = {};
        if (ids.length) {
          const { data: pins } = await sb.from("pins").select("project_id,status").in("project_id", ids);
          for (const p of pins || []) (byId[p.project_id] ||= []).push(p);
        }
        return { projects: data.map((p) => ({ ...mapProject(p), counts: countsOf(byId[p.id] || []) })) };
      }

      if (seg[0] === "projects" && seg[1] === "find") {
        const url = new URLSearchParams(query).get("url") || "";
        const host = hostOf(url);
        const { data } = await sb.from("projects").select("*, project_members(email)");
        const hit = (data || []).find((p) => !p.archived && hostOf(p.url) === host);
        if (!hit) return { project: null };
        const { data: pins } = await sb.from("pins").select("status").eq("project_id", hit.id);
        return { project: mapProject(hit), counts: countsOf(pins || []) };
      }

      // /projects/:id [ /pins/:hid [ /comments | /shot ] | /invites ]
      if (seg[0] === "projects" && seg[1]) {
        const pid = seg[1];

        if (seg.length === 2) {
          if (method === "GET") {
            const { data: proj, error } = await sb.from("projects")
              .select("*, project_members(email)").eq("id", pid).single();
            if (error) throw new Error("not_found");
            const { data: pins } = await sb.from("pins")
              .select("*, comments(*)").eq("project_id", pid).order("created_at");
            return { project: mapProject(proj), pins: (pins || []).map(mapPin) };
          }
          if (method === "PATCH") {
            const patch = { updated_at: new Date().toISOString() };
            for (const k of ["name", "url", "description", "archived"]) if (k in body) patch[k] = body[k];
            const { data, error } = await sb.from("projects").update(patch).eq("id", pid)
              .select("*, project_members(email)").single();
            if (error) throw error;
            return { project: mapProject(data) };
          }
          if (method === "DELETE") {
            const { error } = await sb.from("projects").delete().eq("id", pid);
            if (error) throw error;
            return { ok: true };
          }
        }

        if (seg[2] === "invites" && method === "POST") {
          // Route through the invite-user Edge Function: it adds members and
          // sends Supabase's invite email to brand-new addresses (needs the
          // service-role key, so it can't run here in the browser).
          const { data, error } = await sb.functions.invoke("invite-user", {
            body: { projectId: pid, emails: body.emails || [] },
          });
          if (error) throw error;
          const { data: all } = await sb.from("project_members").select("email").eq("project_id", pid);
          return { members: (all || []).map((m) => m.email), added: data.added || [], emailed: data.emailed || [] };
        }

        if (seg[2] === "pins" && seg.length === 3 && method === "POST") {
          const u = await me();
          const row = {
            project_id: pid, page_url: body.pageUrl || "", selector: body.selector || "",
            xr: body.xr || 0, yr: body.yr || 0, comment: body.comment || "",
            severity: body.severity || "neutral", status: body.status || "backlog", assignee: body.assignee || "",
            due: Number.isFinite(body.due) ? body.due : null, device: body.device || "desktop",
            viewport: body.viewport || "", has_shot: false,
            created_by: u.id, created_by_email: u.email,
          };
          const { data, error } = await sb.from("pins").insert(row).select("*, comments(*)").single();
          if (error) throw error;
          if (body.shot) {
            try {
              await uploadShot(pid, data.id, body.shot);
              await sb.from("pins").update({ has_shot: true }).eq("id", data.id);
              data.has_shot = true;
            } catch { /* pin still saved without its shot */ }
          }
          return { pin: mapPin(data) };
        }

        if (seg[2] === "pins" && seg[3]) {
          const hid = seg[3];
          if (seg[4] === "shot") {
            if (method === "PUT") { await uploadShot(pid, hid, body.shot); await sb.from("pins").update({ has_shot: true }).eq("id", hid); return { ok: true }; }
            if (method === "DELETE") { await fetch(`${SHOTS_URL}/shot/${pid}/${hid}`, { method: "DELETE", headers: { Authorization: "Bearer " + (await accessToken()) } }); return { ok: true }; }
            return await getShot(pid, hid);
          }
          if (seg[4] === "comments" && method === "POST") {
            const u = await me();
            const name = (u.user_metadata || {}).name || u.email.split("@")[0];
            const { data, error } = await sb.from("comments")
              .insert({ pin_id: hid, project_id: pid, author: u.id, author_email: u.email, author_name: name, text: body.text })
              .select("*").single();
            if (error) throw error;
            return { comment: mapComment(data) };
          }
          if (method === "PATCH") {
            const patch = {};
            for (const k of ["comment", "severity", "status", "assignee", "due"]) if (k in body) patch[k] = body[k];
            const { data, error } = await sb.from("pins").update(patch).eq("id", hid).select("*, comments(*)").single();
            if (error) throw error;
            return { pin: mapPin(data) };
          }
          if (method === "DELETE") {
            await fetch(`${SHOTS_URL}/shot/${pid}/${hid}`, { method: "DELETE", headers: { Authorization: "Bearer " + (await accessToken()) } }).catch(() => {});
            const { error } = await sb.from("pins").delete().eq("id", hid);
            if (error) throw error;
            return { ok: true };
          }
        }
      }

      // /me
      if (seg[0] === "me") {
        const u = await me();
        if (method === "PATCH") {
          const patch = {};
          if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
          if (body.prefs && typeof body.prefs === "object") patch.prefs = body.prefs;
          const { data, error } = await sb.from("profiles").update(patch).eq("id", u.id).select("email,name,prefs").single();
          if (error) throw error;
          // Keep auth metadata in sync so the name survives a fresh session load.
          if (patch.name) { try { await sb.auth.updateUser({ data: { name: patch.name } }); } catch {} }
          return { email: data.email, name: data.name, prefs: data.prefs };
        }
        const { data } = await sb.from("profiles").select("email,name,prefs").eq("id", u.id).single();
        return { email: u.email, name: (data && data.name) || "", prefs: (data && data.prefs) || { mention: true, newComment: true, invited: true } };
      }

      // /auth/change-password
      if (rawPath === "/auth/change-password" && method === "POST") {
        const { error } = await sb.auth.updateUser({ password: body.newPassword });
        if (error) throw error;
        return { ok: true };
      }

      // /notifications
      if (seg[0] === "notifications") {
        if (method === "POST") {
          let q = sb.from("notifications").update({ read: true });
          q = body.all === true ? q.eq("read", false) : q.in("id", body.ids || []);
          await q;
          const { data } = await sb.from("notifications").select("read");
          return { ok: true, unread: (data || []).filter((n) => !n.read).length };
        }
        const { data } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
        const notes = (data || []).map((n) => ({
          id: n.id, read: n.read, at: n.created_at, kind: n.kind,
          projectId: n.project_id, pinId: n.pin_id, projectName: n.project_name,
          pageUrl: n.page_url, byEmail: n.by_email, byName: n.by_name, text: n.text,
        }));
        return { notifications: notes, unread: notes.filter((n) => !n.read).length };
      }

      throw new Error("unrouted: " + method + " " + rawPath);
    } catch (e) {
      if ((e.message || "").toLowerCase().includes("jwt") || (e.message || "").includes("unauthorized")) {
        throw new Error("unauthorized");
      }
      throw fail(e);
    }
  }

  window.MarkoData = { api };
})();
