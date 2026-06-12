// Narration via edge-tts (one mp3 per scene). Voice + rate are config-driven; falls
// back to a second voice if the primary is unavailable. Returns per-scene durations.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";

const exec = promisify(execFile);

export async function audioDuration(file) {
  const { stdout } = await exec(CONFIG.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(String(stdout).trim()) || 0;
}

async function synth(voice, text, outFile) {
  // --rate value starts with '-', so it MUST be one token (--rate=-6%), else argparse
  // treats it as a flag and errors "expected one argument".
  await exec(CONFIG.python, ["-m", "edge_tts", "--voice", voice, `--rate=${CONFIG.ttsRate}`, "--text", text, "--write-media", outFile], { maxBuffer: 1 << 25 });
}

export async function narrateAll(scenes) {
  fs.mkdirSync(CONFIG.dirs.narration, { recursive: true });
  const durations = {};
  for (const s of scenes) {
    const mp3 = path.join(CONFIG.dirs.narration, s.id + ".mp3");
    try {
      await synth(CONFIG.voice, s.narration, mp3);
    } catch (e) {
      console.warn(`   narrate ${s.id}: primary voice failed (${e.message}); using ${CONFIG.voiceFallback}`);
      await synth(CONFIG.voiceFallback, s.narration, mp3);
    }
    durations[s.id] = await audioDuration(mp3);
    console.log(`   narrated ${s.id} — ${durations[s.id].toFixed(1)}s`);
  }
  return durations;
}
