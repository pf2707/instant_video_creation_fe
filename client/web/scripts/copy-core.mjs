// Copies the single-threaded @ffmpeg/core dist into public/ffmpeg so it is
// served same-origin. Runs before dev/build; no-op if already up to date.
import { mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The ffmpeg worker runs as a module worker and loads the core via
// `import(coreURL).default`, so we must serve the ESM build (the UMD build has
// no default export and fails with "failed to import ffmpeg-core.js").
const src = join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const dest = join(root, "public", "ffmpeg");
const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

if (!existsSync(src)) {
  console.error("[copy-core] @ffmpeg/core not installed — run `npm install`.");
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const f of files) {
  const from = join(src, f);
  const to = join(dest, f);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  console.log(`[copy-core] ${f}`);
}
