# ☕ Brew Picker 🍵

A tiny, installable **offline** web app that helps you pick between **coffee and tea**,
customize your cup, and keep a little brew log. No frameworks, no dependencies — just
open it, and "Add to Home Screen" on your iPhone for an app-like experience.

**Live:** https://mufflon.github.io/ajdin-example/

## Features

- Pick coffee or tea, then customize style, strength/serve, milk, and sweetness
- "Can't decide?" dice roll picks for you
- A brew log saved on your device (works offline)
- Light/dark theme, installable as a PWA (works fully offline once loaded)

## Develop

Requires **Node 18+**. No `npm install` needed — there are no dependencies.

```bash
npm run build     # build the static site into dist/
npm run serve     # build, then serve at http://localhost:8080
```

Edit source in `src/`. The build generates icons and the offline service worker.

## Deploy

Push to `main` — GitHub Actions builds and deploys to GitHub Pages automatically.
One-time: set **Settings → Pages → Source → "GitHub Actions"** in the repo.

For full details (architecture, how to extend it, how offline works), see
[CLAUDE.md](CLAUDE.md).
