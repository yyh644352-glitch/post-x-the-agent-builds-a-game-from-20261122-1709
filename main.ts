// main.ts — entry point for the post-x bounty submission.
// Copies POST.json from the repository root to /output, so the
// submission bundle can name the X post that carries the video.
// Standard library only; no network access needed.
import { copyFileSync, mkdirSync } from "node:fs";

const outDir = "/output";
mkdirSync(outDir, { recursive: true });
copyFileSync("POST.json", `${outDir}/POST.json`);
console.log("POST.json copied to /output/POST.json");
