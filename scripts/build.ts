import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const staticFiles = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "options.html",
  "options.css",
  "icons"
];

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const tscResult = spawnSync("pnpm", ["exec", "tsc", "--project", "tsconfig.build.json"], {
  cwd: rootDir,
  stdio: "inherit"
});

if (tscResult.status !== 0) {
  process.exit(tscResult.status ?? 1);
}

for (const file of staticFiles) {
  cpSync(path.join(rootDir, file), path.join(distDir, file), { recursive: true });
}

const requiredFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "lib/keywords.js"
];

for (const file of requiredFiles) {
  const fullPath = path.join(distDir, file);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing required build artifact: ${file}`);
  }
}

const manifest = JSON.parse(readFileSync(path.join(distDir, "manifest.json"), "utf8")) as {
  manifest_version?: number;
};

if (manifest.manifest_version !== 3) {
  throw new Error("manifest_version must be 3");
}

console.log(`Build complete. Load unpacked extension from ${distDir}`);
