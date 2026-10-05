#!/usr/bin/env node
/**
 * Copies the built Tauri installers into `public/downloads/` so the deployed
 * site serves them from its own origin (/downloads/<file>).
 *
 *   pnpm tauri:build        # produces src-tauri/target/release/bundle/...
 *   pnpm desktop:stage      # copies them into public/downloads/
 *
 * Run this on the machine that built the app, then deploy. Netlify/Vercel will
 * publish anything in `public/` as-is, so the installers go live with the site.
 *
 * Only files that already exist locally are copied - this never invents an
 * installer, and it fails loudly if nothing has been built yet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = path.join(projectRoot, "src-tauri", "target", "release", "bundle");
const destRoot = path.join(projectRoot, "public", "downloads");

const INSTALLER_EXTENSIONS = new Set([".dmg", ".exe", ".msi", ".appimage", ".deb", ".AppImage"]);

function walk(dir, hits = []) {
  if (!fs.existsSync(dir)) return hits;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, hits);
    else if (INSTALLER_EXTENSIONS.has(path.extname(entry.name))) hits.push(full);
  }
  return hits;
}

if (!fs.existsSync(bundleRoot)) {
  console.error(
    `[desktop:stage] No bundle directory at ${bundleRoot}\n` +
      `[desktop:stage] Run "pnpm tauri:build" first (requires the Rust toolchain).`
  );
  process.exit(1);
}

const installers = walk(bundleRoot);

if (installers.length === 0) {
  console.error(
    `[desktop:stage] No installer files (.dmg/.exe/.AppImage/...) found under ${bundleRoot}.\n` +
      `[desktop:stage] Run "pnpm tauri:build" first.`
  );
  process.exit(1);
}

fs.mkdirSync(destRoot, { recursive: true });

let copied = 0;
for (const file of installers) {
  const name = path.basename(file);
  const dest = path.join(destRoot, name);
  fs.copyFileSync(file, dest);
  const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
  console.log(`[desktop:stage] ${name} (${mb} MB)`);
  copied += 1;
}

// A tiny manifest so the deployed site can be sanity-checked from the browser.
fs.writeFileSync(
  path.join(destRoot, "manifest.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      files: installers.map((f) => path.basename(f)).sort(),
    },
    null,
    2
  )
);

console.log(`[desktop:stage] ${copied} installer(s) staged in public/downloads/`);