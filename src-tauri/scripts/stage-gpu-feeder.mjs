// Build the standalone gpu-feeder crate and stage its binary where Tauri's
// externalBin bundler expects it (`src-tauri/binaries/gpu-feeder-<triple>.exe`),
// plus next to the app's dev/release build outputs so the main app can spawn it
// by plain path. Run from before{Dev,Build}Command (CWD = repo root).
import { execSync } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url)); // src-tauri/scripts
const srcTauri = dirname(scriptDir); // src-tauri
const repoRoot = dirname(srcTauri); // repo root
const feederDir = join(repoRoot, "gpu-feeder");

// Detect the rustc host triple (e.g. x86_64-pc-windows-msvc).
const host = (execSync("rustc -vV", { encoding: "utf8" }).match(/host:\s*(\S+)/) || [])[1];
if (!host) {
  console.error("[stage-gpu-feeder] could not detect rustc host triple");
  process.exit(1);
}

console.log("[stage-gpu-feeder] building gpu-feeder (release) …");
execSync("cargo build --release", { cwd: feederDir, stdio: "inherit" });

const win = process.platform === "win32";
const exeName = win ? "gpu-feeder.exe" : "gpu-feeder";
const built = join(feederDir, "target", "release", exeName);
if (!existsSync(built)) {
  console.error(`[stage-gpu-feeder] built binary not found: ${built}`);
  process.exit(1);
}

// 1) externalBin location (bundled into the installer, placed next to the app).
const binariesDir = join(srcTauri, "binaries");
mkdirSync(binariesDir, { recursive: true });
const dest = join(binariesDir, `gpu-feeder-${host}${win ? ".exe" : ""}`);
copyFileSync(built, dest);
console.log(`[stage-gpu-feeder] staged -> ${dest}`);

// 2) Next to the app build outputs, so `tauri dev` / a local `cargo run` can
//    spawn it by plain path even if the externalBin isn't copied in dev.
for (const profile of ["debug", "release"]) {
  const outDir = join(srcTauri, "target", profile);
  if (existsSync(outDir)) {
    copyFileSync(built, join(outDir, exeName));
    console.log(`[stage-gpu-feeder] copied -> ${join(outDir, exeName)}`);
  }
}
