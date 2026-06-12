// ffmpeg assembly: normalize each scene to a 1080p/30fps mp4 clip whose length is
// slaved to its narration (video padded by freezing the last frame; narration padded
// with trailing silence so nothing is cut), then stitch all clips with gentle
// crossfades. Per-scene clips are written to clips/ and kept for selective re-renders.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";
import { audioDuration } from "./narrate.mjs";

const exec = promisify(execFile);
const X = CONFIG.xfade;

async function ff(args) {
  try {
    await exec(CONFIG.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 27 });
  } catch (e) {
    throw new Error(`ffmpeg failed: ${e.stderr || e.message}`);
  }
}
async function videoDuration(file) {
  const { stdout } = await exec(CONFIG.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(String(stdout).trim()) || 0;
}

const V_OUT = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "20", "-r", "30",
  "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart"];

// Build ONE normalized clip; returns its exact duration.
export async function buildClip(scene, source, narrMp3) {
  const out = path.join(CONFIG.dirs.clips, scene.id + ".mp4");
  const narrDur = fs.existsSync(narrMp3) ? await audioDuration(narrMp3) : 0;

  if (scene.kind === "card") {
    const target = Math.max(narrDur + 2, 8);
    await ff([
      "-loop", "1", "-i", source, "-i", narrMp3,
      "-filter_complex",
      `[0:v]scale=1920:1080,fps=30,format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${(target - 0.6).toFixed(2)}:d=0.6,setsar=1[v];` +
      `[1:a]aresample=48000,adelay=450|450,apad,atrim=0:${target.toFixed(3)},asetpts=N/SR/TB[a]`,
      "-map", "[v]", "-map", "[a]", "-t", target.toFixed(3), ...V_OUT, out,
    ]);
    return target;
  }

  // app scene: pad video by cloning the last frame to the target length.
  const vDur = await videoDuration(source);
  const target = Math.max(vDur, narrDur) + CONFIG.tailPadSec;
  const pad = Math.max(0, target - vDur);
  await ff([
    "-i", source, "-i", narrMp3,
    "-filter_complex",
    `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0E1B2E,fps=30,` +
    `tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)},setsar=1[v];` +
    `[1:a]aresample=48000,apad,atrim=0:${target.toFixed(3)},asetpts=N/SR/TB[a]`,
    "-map", "[v]", "-map", "[a]", "-t", target.toFixed(3), ...V_OUT, out,
  ]);
  return target;
}

// Stitch clips (in order) with crossfades into the final mp4. Done INCREMENTALLY
// (pairwise) so ffmpeg only ever decodes two 1080p streams at once — a single
// xfade graph over all 9 inputs exhausts memory ("Cannot allocate memory").
export async function assembleFinal(clips /* [{id, path, dur}] */) {
  if (!clips.length) throw new Error("no clips to assemble");
  if (clips.length === 1) {
    await ff(["-i", clips[0].path, ...V_OUT, CONFIG.dirs.out]);
    return CONFIG.dirs.out;
  }
  const tmpDir = path.join(CONFIG.dirs.work, "stitch");
  fs.mkdirSync(tmpDir, { recursive: true });
  let acc = clips[0].path;
  let accDur = clips[0].dur;
  for (let i = 1; i < clips.length; i++) {
    const off = Math.max(0, accDur - X).toFixed(3);
    const last = i === clips.length - 1;
    const out = last ? CONFIG.dirs.out : path.join(tmpDir, `acc${i}.mp4`);
    await ff([
      "-i", acc, "-i", clips[i].path,
      "-filter_complex",
      `[0:v][1:v]xfade=transition=fade:duration=${X}:offset=${off}[v];[0:a][1:a]acrossfade=d=${X}[a]`,
      "-map", "[v]", "-map", "[a]", ...V_OUT, out,
    ]);
    acc = out;
    accDur = accDur + clips[i].dur - X;
  }
  return CONFIG.dirs.out;
}
