// Supabase client for the Marko web app (landing sign-in, dashboard, reset).
// The publishable key is meant to ship in client code — Postgres row-level
// security is what actually guards the data, not the secrecy of this key.
// Never put the service_role key here.
(() => {
  const SUPABASE_URL = "https://snzzbhllukfgqwsooyzl.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Eql7htJAaY1v7QariGDn3Q_gnbkUGJb";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("supabase-js failed to load before marko-web.js");
    return;
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Needed so the emailed recovery link (tokens in the URL hash) is
      // picked up automatically on reset.html.
      detectSessionInUrl: true,
    },
  });

  window.marko = { supabase: client, SUPABASE_URL, SUPABASE_KEY };
})();
