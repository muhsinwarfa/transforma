// Voice bake-off: render the S1 line in three edge-tts candidates at +4%.
// Output: narration/bakeoff/{jenny,aria,emma}.mp3 — pick one, then set
// DEMO_VOICE (or config.voice) and run `node render.mjs --only=narrate`.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";
import { SCENES } from "./scenes.mjs";

const exec = promisify(execFile);
const LINE = SCENES.find((s) => s.id === "s1").narration;
const CANDIDATES = {
  jenny: "en-US-JennyNeural",
  aria: "en-US-AriaNeural",
  emma: "en-US-EmmaMultilingualNeural",
};

const out = path.join(CONFIG.dirs.narration, "bakeoff");
fs.mkdirSync(out, { recursive: true });
for (const [name, voice] of Object.entries(CANDIDATES)) {
  const mp3 = path.join(out, `${name}.mp3`);
  await exec(CONFIG.python, ["-m", "edge_tts", "--voice", voice, "--rate=+4%", "--text", LINE, "--write-media", mp3], { maxBuffer: 1 << 25 });
  console.log(`rendered ${voice} → ${mp3}`);
}
