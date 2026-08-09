# CLAUDE.md — Brew Picker

Guidance for AI coding agents (and humans) working in this repo.

## What this is

**Brew Picker** is a tiny, installable **Progressive Web App (PWA)** for choosing
between **coffee and tea**, customizing the cup, and keeping an offline "brew log".
It is a demo. It has **zero runtime dependencies and zero build dependencies** — the
only tool required is **Node 18+** (for the build script). It is deployed as a static
site to **GitHub Pages**.

Design goals, in priority order:
1. **Works fully offline** once loaded (service worker precache).
2. **Installable** on iPhone via Safari → *Share* → *Add to Home Screen*, and on
   Android/desktop via the browser install prompt.
3. **No dependencies, no framework.** Plain HTML/CSS/JS. Easy for any agent to read.
4. **Path-portable.** All asset paths are relative (`./…`) so the site works whether
   served from a domain root or a project subpath like `user.github.io/ajdin-example/`.

## Repository layout

```
.
├── src/                     # Hand-edited source (THIS is what you change)
│   ├── index.html           # Markup + PWA meta tags
│   ├── styles.css           # Styling (light/dark, safe-area aware)
│   ├── app.js               # All app logic (vanilla JS, IIFE, no deps)
│   └── manifest.webmanifest # PWA manifest
├── build.mjs                # Zero-dep build: copies src → dist, makes icons + sw.js
├── package.json             # Scripts only; no dependencies
├── .github/workflows/deploy.yml  # CI: build + deploy to GitHub Pages on push to main
├── dist/                    # BUILD OUTPUT — generated, git-ignored, never edit by hand
└── CLAUDE.md                # This file
```

> **Do not edit `dist/`.** It is deleted and regenerated on every build. Edit `src/`
> (and `build.mjs` for icons / service worker), then rebuild.

## Build

```bash
node build.mjs        # or: npm run build
```

This produces `dist/`, a self-contained static site. The build does three things:

1. **Copies** the static files from `src/` into `dist/`.
2. **Generates icons** into `dist/icons/` using a small pure-Node PNG encoder
   (`build.mjs`). No image libraries are needed — the coffee-cup icon is drawn with
   signed-distance-field math. Sizes: `icon-192`, `icon-512`, `apple-touch-icon` (180,
   for iOS), and `maskable-512` (Android adaptive, drawn inside the safe zone).
3. **Generates `dist/sw.js`** (the service worker) with a **content hash** baked into
   the cache name (e.g. `brew-picker-629c0da1c604`). Because the hash is derived from
   the built assets, any change to `src/` or the icons produces a new cache name, which
   makes the service worker update itself and drop the stale cache on next visit.

It also writes `dist/.nojekyll` so GitHub Pages serves the files as-is.

## Run / preview locally

A service worker requires `http://` (or `https://`) — it will **not** register from a
`file://` URL. Serve the built `dist/` folder over HTTP:

```bash
npm run serve        # builds, then serves dist/ at http://localhost:8080
```

Or manually:

```bash
node build.mjs
cd dist && python3 -m http.server 8080
# then open http://localhost:8080
```

To verify offline behavior: load the page once, then in DevTools → Network set
"Offline" (or stop the server) and reload — it should still work.

## Deploy (GitHub Pages)

Deployment is automated via GitHub Actions (`.github/workflows/deploy.yml`):

- On every push to `main`, CI runs `node build.mjs` and publishes `dist/` to Pages.
- **One-time setup** in the GitHub repo: **Settings → Pages → Build and deployment →
  Source: "GitHub Actions".** (Not "Deploy from a branch".)
- The live URL is `https://<user>.github.io/<repo>/` — for this repo,
  `https://mufflon.github.io/ajdin-example/`.

Because `dist/` is git-ignored, the build output is never committed; CI is the single
source of truth for what gets published.

## How the app works (for agents extending it)

- **`src/app.js`** is a single IIFE, no framework. Key pieces:
  - `MENU` — a data object describing the two drinks and their option groups
    (`style`, `strength`/`temp`, `milk`, `sweet`). **The customize screen is generated
    from this object**, so to add an option or a drink you usually only edit `MENU`.
  - Three "screens" (`#screen-choose`, `#screen-customize`, `#screen-result`) are plain
    `<section>`s toggled with a `hidden` class via `goTo(name)`.
  - The **brew log** is persisted in `localStorage` under `brew-picker.log.v1`
    (capped at 50 entries). Theme override is `brew-picker.theme.v1`.
  - The service worker is registered at the end of `app.js` (`./sw.js`).
- **Theming**: light/dark via `prefers-color-scheme`, with a manual toggle that stamps
  `data-theme="light|dark"` on `<html>`. CSS variables live in `:root` in `styles.css`.
- **iOS specifics**: `apple-mobile-web-app-*` meta tags + `apple-touch-icon` in
  `index.html`, `viewport-fit=cover` plus `env(safe-area-inset-*)` padding for the
  notch/home indicator.

### Common change recipes

- **Add a drink option** (e.g. a coffee size): add an entry to the relevant drink's
  `options` array in `MENU` in `src/app.js`. No other code changes needed.
- **Add a third drink**: add a key to `MENU` with `label`, `emoji`, `options`, then add
  a matching `<button class="choice …" data-drink="…">` in `src/index.html`.
- **Change the icon**: edit the `drawIcon()` function in `build.mjs` and rebuild.
- **Change cached files**: `STATIC_FILES` in `build.mjs` drives both the copy step and
  the service-worker precache list — keep new top-level assets listed there.

## Conventions & guardrails

- Keep it **dependency-free**. Do not add npm packages, bundlers, or frameworks unless
  there is a strong reason; the whole point is that any agent can read and ship it.
- Keep **all asset paths relative** (`./…`). Absolute paths (`/styles.css`) break the
  GitHub Pages project-subpath deployment.
- After changing `src/` or `build.mjs`, **rebuild and verify offline** (load once, go
  offline, reload).
- Don't hand-edit `dist/` or `sw.js`; regenerate them with `node build.mjs`.
- Bump `version` in `package.json` for notable releases if you want a version marker.
