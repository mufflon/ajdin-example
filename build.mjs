#!/usr/bin/env node
/* Brew Picker build — zero dependencies, Node 18+.
 *
 * What it does:
 *   1. Copies the static source from src/ into dist/
 *   2. Generates PWA icons (pure-Node PNG encoder — no image libraries)
 *   3. Generates sw.js with a content hash, so a changed build invalidates
 *      the offline cache automatically.
 *
 * Run:  node build.mjs      (or: npm run build)
 * Output: dist/  — a self-contained static site ready for GitHub Pages.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import zlib from "node:zlib";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

// Static files copied verbatim from src/ and precached by the service worker.
const STATIC_FILES = ["index.html", "styles.css", "app.js", "manifest.webmanifest"];

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGBA, 8-bit). Enough to emit app icons with no deps.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10..12 = compression/filter/interlace = 0

  // Prepend a 0 (filter "none") byte per scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Vector-ish icon drawing via signed distance fields (1px anti-aliasing).
// ---------------------------------------------------------------------------
function drawIcon(size, { rounded = true, contentScale = 1 } = {}) {
  const N = size;
  const buf = Buffer.alloc(N * N * 4);

  const set = (x, y, r, g, b, a) => {
    const i = (y * N + x) * 4;
    const sa = a / 255;
    const da = buf[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    buf[i] = (r * sa + buf[i] * da * (1 - sa)) / oa;
    buf[i + 1] = (g * sa + buf[i + 1] * da * (1 - sa)) / oa;
    buf[i + 2] = (b * sa + buf[i + 2] * da * (1 - sa)) / oa;
    buf[i + 3] = oa * 255;
  };

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // coverage from a signed distance in pixel units (negative = inside)
  const cover = (d) => clamp01(0.5 - d);

  // SDF primitives (all in pixel coordinates)
  const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;
  const sdRing = (px, py, cx, cy, r, half) => Math.abs(sdCircle(px, py, cx, cy, r)) - half;
  const sdRoundRect = (px, py, cx, cy, hw, hh, rad) => {
    const qx = Math.abs(px - cx) - (hw - rad);
    const qy = Math.abs(py - cy) - (hh - rad);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rad;
  };
  const sdEllipse = (px, py, cx, cy, rx, ry) => {
    const dx = (px - cx) / rx, dy = (py - cy) / ry;
    return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry);
  };

  const u = (v) => v * N; // unit [0,1] -> pixels
  // center-scaled unit -> pixels, so we can shrink cup into the maskable safe zone
  const s = (v) => (0.5 + (v - 0.5) * contentScale) * N;

  const white = [255, 252, 248];

  for (let y = 0; y < N; y++) {
    const t = y / (N - 1);
    // Vertical coffee-tone gradient background
    const bgR = Math.round(176 + (106 - 176) * t);
    const bgG = Math.round(106 + (63 - 106) * t);
    const bgB = Math.round(59 + (34 - 59) * t);

    for (let x = 0; x < N; x++) {
      // Background (rounded square, or full bleed for maskable)
      let bgCov = 1;
      if (rounded) bgCov = cover(sdRoundRect(x, y, N / 2, N / 2, N / 2, N / 2, u(0.22)));
      if (bgCov <= 0) continue;
      set(x, y, bgR, bgG, bgB, Math.round(bgCov * 255));

      // Steam: two soft rounded lines rising from the cup
      const steam1 = sdRoundRect(x, y, s(0.44), s(0.30), u(0.018) * contentScale, u(0.075) * contentScale, u(0.018) * contentScale);
      const steam2 = sdRoundRect(x, y, s(0.57), s(0.29), u(0.018) * contentScale, u(0.085) * contentScale, u(0.018) * contentScale);
      const steamCov = Math.max(cover(steam1), cover(steam2));
      if (steamCov > 0) set(x, y, white[0], white[1], white[2], Math.round(steamCov * 0.55 * 255));

      // Saucer ellipse under the cup
      const saucer = sdEllipse(x, y, s(0.5), s(0.78), u(0.28) * contentScale, u(0.045) * contentScale);
      if (cover(saucer) > 0) set(x, y, white[0], white[1], white[2], Math.round(cover(saucer) * 255));

      // Handle (ring on the right side of the cup)
      const handle = sdRing(x, y, s(0.70), s(0.56), u(0.085) * contentScale, u(0.028) * contentScale);
      if (cover(handle) > 0) set(x, y, white[0], white[1], white[2], Math.round(cover(handle) * 255));

      // Cup body
      const cup = sdRoundRect(x, y, s(0.47), s(0.57), u(0.19) * contentScale, u(0.135) * contentScale, u(0.05) * contentScale);
      if (cover(cup) > 0) set(x, y, white[0], white[1], white[2], Math.round(cover(cup) * 255));
    }
  }
  return encodePNG(N, N, buf);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
function build() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  mkdirSync(join(DIST, "icons"), { recursive: true });

  // 1. Copy static source
  for (const f of STATIC_FILES) cpSync(join(SRC, f), join(DIST, f));

  // 2. Generate icons
  const icons = {
    "icons/icon-192.png": drawIcon(192, { rounded: true }),
    "icons/icon-512.png": drawIcon(512, { rounded: true }),
    "icons/apple-touch-icon.png": drawIcon(180, { rounded: false }), // iOS applies its own mask
    "icons/maskable-512.png": drawIcon(512, { rounded: false, contentScale: 0.78 }),
  };
  for (const [rel, data] of Object.entries(icons)) writeFileSync(join(DIST, rel), data);

  // 3. Compute a content hash over everything the SW will cache
  const PRECACHE = ["./", ...STATIC_FILES.map((f) => "./" + f), ...Object.keys(icons).map((f) => "./" + f)];
  const hash = createHash("sha256");
  for (const f of STATIC_FILES) hash.update(readFileSync(join(DIST, f)));
  for (const data of Object.values(icons)) hash.update(data);
  const version = hash.digest("hex").slice(0, 12);

  // 4. Emit the service worker (cache-first, self-cleaning, offline nav fallback)
  const sw = `/* Auto-generated by build.mjs — do not edit. */
const CACHE = "brew-picker-${version}";
const ASSETS = ${JSON.stringify(PRECACHE)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Navigations: try network, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }

  // Everything else: cache-first, then populate the cache on miss.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
    )
  );
});
`;
  writeFileSync(join(DIST, "sw.js"), sw);

  // GitHub Pages: don't run the output through Jekyll.
  writeFileSync(join(DIST, ".nojekyll"), "");

  console.log(`✓ Built dist/  (cache: brew-picker-${version})`);
  console.log(`  ${PRECACHE.length} assets precached · ${Object.keys(icons).length} icons generated`);
}

build();
