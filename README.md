<div align="center">

<img src="marko-128.png" width="80" height="80" alt="Marko" />

# Marko — web app & downloads

**Spot it. Pin it. Shipped by Friday.**

[![Live](https://img.shields.io/badge/live-strativ--dev.github.io%2Fmarko--site-0099ff)](https://strativ-dev.github.io/marko-site/)
[![Download](https://img.shields.io/badge/download-latest%20release-black?logo=googlechrome&logoColor=white)](https://github.com/strativ-dev/marko-site/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-black)](https://github.com/strativ-dev/marko-ux-tool/blob/main/LICENSE)

</div>

---

> **This is a published mirror, not the source repo.**
> It serves the live web app on GitHub Pages and hosts the extension download.
> Do all development in **[`strativ-dev/marko-ux-tool`](https://github.com/strativ-dev/marko-ux-tool)** — files here are copied from its `docs/` folder.

Marko is a Chrome extension + web app for pinning bug reports and UX feedback directly onto real page elements — with annotated screenshots, severities, assignees, and comment threads — tracked on a shared team kanban board.

## Get started

1. **[Download the latest release](https://github.com/strativ-dev/marko-site/releases/latest)** → unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, select the unzipped folder.
3. Open the **[web app](https://strativ-dev.github.io/marko-site/)** and sign in — a new email creates an account automatically.
4. On any site, press **Alt+M** (**⌘⇧M** on Mac) to start reviewing.

## What's in this repo

| File | Serves |
|---|---|
| `index.html` | Landing page + sign-in |
| `app.html` | Dashboard — kanban board, mentions, sharing, export |
| `reset.html` | Password reset |
| `marko-web.js` | Supabase client |
| `marko-data.js` | `api()` data router |
| `vendor/supabase.js` | Vendored supabase-js |

## Contributing

Open issues and PRs on the source repo:
**[github.com/strativ-dev/marko-ux-tool](https://github.com/strativ-dev/marko-ux-tool)** — it holds the extension, workers, SQL schema, and the `docs/` originals of every file here.

## License

[MIT](https://github.com/strativ-dev/marko-ux-tool/blob/main/LICENSE)
