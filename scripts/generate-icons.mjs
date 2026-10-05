#!/usr/bin/env node
/**
 * Regenerates every Tokenizer icon from the app's existing logo mark
 * (flat #0B0F1A rounded tile + a large four-point star and a smaller companion).
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs:
 *   src-tauri/app-icon.png   1024px source, feed this to `pnpm exec tauri icon`
 *   src-tauri/icons/*.png|ico|icns   fallback set if the Tauri CLI is unavailable
 *   public/logo.svg          vector mark
 *   public/favicon.ico       web favicon (16/32/48)
 *
 * Pure Node - no image libraries required.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGBA, filter 0)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Logo renderer (analytic anti-aliasing via signed distance fields)
// ---------------------------------------------------------------------------

const TILE = [11, 15, 26]; // #0B0F1A - flat dark navy tile
const STAR_MAIN = [255, 255, 255]; // white
const STAR_SMALL = [255, 255, 255]; // white (drawn at reduced opacity)

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function gradientColor(t) {
  const stops = GRADIENT.map(hexToRgb);
  const clamped = Math.min(Math.max(t, 0), 1);
  const seg = clamped < 0.5 ? 0 : 1;
  const localT = clamped < 0.5 ? clamped / 0.5 : (clamped - 0.5) / 0.5;
  const a = stops[seg];
  const b = stops[seg + 1];
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * localT);
}

function sdRoundedRect(px, py, half, radius) {
  const qx = Math.abs(px) - (half - radius);
  const qy = Math.abs(py) - (half - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

function starValue(px, py, cx, cy, r) {
  const dx = Math.abs(px - cx) / r;
  const dy = Math.abs(py - cy) / r;
  return Math.pow(dx, 0.6) + Math.pow(dy, 0.6); // <= 1 -> inside the sparkle
}

// Geometry mirrors public/logo.svg (a 200x200 viewBox, normalised to 0..1):
// one large four-point star plus a smaller companion in the upper right.
const STARS = [
  { cx: 0.5, cy: 0.46, r: 0.23, color: STAR_MAIN, softness: 0.055, alpha: 1 },
  { cx: 0.715, cy: 0.305, r: 0.095, color: STAR_SMALL, softness: 0.07, alpha: 0.85 },
];

function renderLogo(size) {
  const out = Buffer.alloc(size * size * 4);
  const tileInset = 0.03; // 6/200 in the source SVG
  const tileRadius = 0.21; // 42/200
  const aa = 1.0 / size; // one device pixel in normalised units

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size; // 0..1
      const py = (y + 0.5) / size;
      const cx = px - 0.5;
      const cy = py - 0.5;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      // Flat rounded-square tile
      const dTile = sdRoundedRect(cx, cy, 0.5 - tileInset, tileRadius);
      const covTile = Math.min(Math.max(0.5 - dTile / aa, 0), 1);
      if (covTile > 0) {
        r = TILE[0]; g = TILE[1]; b = TILE[2]; a = covTile;
      }

      // Four-point stars, composited over the tile
      for (const star of STARS) {
        const v = starValue(px, py, star.cx, star.cy, star.r);
        const cov = Math.min(Math.max((1 - v) / star.softness, 0), 1) * (star.alpha ?? 1);
        if (cov <= 0) continue;
        const na = cov;
        const sc = star.color;
        r = sc[0] * na + r * (1 - na);
        g = sc[1] * na + g * (1 - na);
        b = sc[2] * na + b * (1 - na);
        a = na + a * (1 - na);
      }

      const o = (y * size + x) * 4;
      out[o] = Math.round(r);
      out[o + 1] = Math.round(g);
      out[o + 2] = Math.round(b);
      out[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// ICO / ICNS containers (PNG payloads)
// ---------------------------------------------------------------------------

function encodeICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  entries.forEach((entry, i) => {
    const o = i * 16;
    dir[o] = entry.size >= 256 ? 0 : entry.size;
    dir[o + 1] = entry.size >= 256 ? 0 : entry.size;
    dir[o + 2] = 0;
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(entry.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

const ICNS_ENTRIES = [
  ["ic11", 32],
  ["ic12", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
];

function encodeICNS(pngBySize) {
  const parts = [];
  for (const [type, size] of ICNS_ENTRIES) {
    const png = pngBySize.get(size);
    if (!png) continue;
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, "ascii");
    head.writeUInt32BE(png.length + 8, 4);
    parts.push(head, png);
  }
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

// ---------------------------------------------------------------------------
// SVG mark - same geometry as the raster renderer (64pt design grid)
// ---------------------------------------------------------------------------

function sparkleOutline(cx, cy, r, samples = 96) {
  const points = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const x = cx + Math.sign(cos) * Math.pow(Math.abs(cos), 2 / 0.6) * r;
    const y = cy + Math.sign(sin) * Math.pow(Math.abs(sin), 2 / 0.6) * r;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${points.join(" L")} Z`;
}

function renderLogoSvg(size = 64) {
  const stars = STARS.map((star) => ({
    d: sparkleOutline(star.cx * size, star.cy * size, star.r * size),
    fill: `#${star.color.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
    opacity: star.alpha !== undefined && star.alpha !== 1 ? String(star.alpha) : null,
  }));

  const tile = `#${TILE.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Tokenizer">
  <rect x="${(0.03 * size).toFixed(2)}" y="${(0.03 * size).toFixed(2)}" width="${(0.94 * size).toFixed(2)}" height="${(0.94 * size).toFixed(2)}" rx="${(0.21 * size).toFixed(2)}" fill="${tile}"/>
${stars.map((s) => `  <path d="${s.d}" fill="${s.fill}"${s.opacity ? ` opacity="${s.opacity}"` : ""}/>`).join("\n")}
</svg>
`;
}


// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const pngCache = new Map();

function png(size) {
  if (!pngCache.has(size)) pngCache.set(size, encodePNG(size, size, renderLogo(size)));
  return pngCache.get(size);
}

function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

// 1. 1024px source for `pnpm exec tauri icon src-tauri/app-icon.png`
writeFile(path.join(projectRoot, "src-tauri", "app-icon.png"), png(1024));

// 2. Fallback platform icon set (tauri.conf.json -> bundle.icon)
const iconsDir = path.join(projectRoot, "src-tauri", "icons");
writeFile(path.join(iconsDir, "32x32.png"), png(32));
writeFile(path.join(iconsDir, "128x128.png"), png(128));
writeFile(path.join(iconsDir, "128x128@2x.png"), png(256));
writeFile(path.join(iconsDir, "icon.png"), png(512));
writeFile(
  path.join(iconsDir, "icon.ico"),
  encodeICO([16, 32, 48, 64, 128, 256].map((size) => ({ size, png: png(size) })))
);
writeFile(
  path.join(iconsDir, "icon.icns"),
  encodeICNS(new Map(PNG_SIZES.map((size) => [size, png(size)])))
);

// 3. Web assets
const publicDir = path.join(projectRoot, "public");
writeFile(
  path.join(publicDir, "favicon.ico"),
  encodeICO([16, 32, 48].map((size) => ({ size, png: png(size) })))
);
writeFile(path.join(publicDir, "logo.svg"), renderLogoSvg());

console.log("Tokenizer icons written:");
console.log("  src-tauri/app-icon.png (1024px source)");
console.log("  src-tauri/icons/{32x32,128x128,128x128@2x,icon}.png + icon.ico + icon.icns");
console.log("  public/favicon.ico + public/logo.svg");

