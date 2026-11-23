// main.ts — entry point for the post-x bounty submission.
// Copies POST.json from the repository root to the output directory, so the
// submission bundle can name the X post that carries the video.
// POST.json is resolved relative to this script's own directory, not the
// working directory: the grader runs `node /bot/main.ts` from another cwd,
// and a relative "POST.json" would throw ENOENT there.
// The output directory comes from MAKEFUN_OUTPUT_DIR when set (the grader
// sets it to /output); otherwise it falls back to /output.
// Standard library only; no network access needed.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const source = join(scriptDir, "POST.json");
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outDir, { recursive: true });
copyFileSync(source, join(outDir, "POST.json"));
console.log(`POST.json copied to ${join(outDir, "POST.json")}`);
