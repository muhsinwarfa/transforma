// Central config for the walkthrough rig. Voice + pacing are env-overridable so the
// video is re-renderable with one command after tweaking a scene or the narration.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const map = JSON.parse(readFileSync(path.join(dir, "demo-map.json"), "utf8"));

const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");

export const CONFIG = {
  root: dir,
  siteUrl: map.siteUrl.replace(/\/$/, ""),
  password: map.password,
  accounts: map.accounts,
  reviews: map.reviews,

  // ── narration (edge-tts) ──────────────────────────────────────────────────
  voice: process.env.DEMO_VOICE || "en-US-AvaMultilingualNeural", // ← replaced by bake-off winner
  voiceFallback: "en-US-AriaNeural",
  ttsRate: process.env.DEMO_TTS_RATE || "+4%", // v2: upbeat, energetic, conversational
  python: process.env.DEMO_PYTHON || (process.platform === "win32"
    ? path.join(localAppData, "Programs", "Python", "Python312", "python.exe")
    : "python3"),

  // ── recording (Playwright) ────────────────────────────────────────────────
  width: 1920,
  height: 1080,
  slowMo: Number(process.env.DEMO_SLOWMO || 280), // ms between actions — human pacing
  dwellMs: Number(process.env.DEMO_DWELL || 1400), // default "brief dwell on key copy"

  // ── assembly (ffmpeg) ─────────────────────────────────────────────────────
  ffmpeg: process.env.DEMO_FFMPEG || "ffmpeg",
  ffprobe: process.env.DEMO_FFPROBE || "ffprobe",
  xfade: 0.6, // crossfade seconds between clips
  tailPadSec: 1.0, // pad each scene to narration length + this
  bgMusic: process.env.DEMO_BG_MUSIC || "", // optional path; only under title cards

  // ── brand (docs/design tokens — navy family) ──────────────────────────────
  navy: "#1F3A5F",
  navyDeep: "#162B47",
  ink: "#0E1B2E",
  paper: "#F7F9FC",
  accent: "#3E6FB0",

  // ── paths ─────────────────────────────────────────────────────────────────
  dirs: {
    work: path.join(dir, ".work"),
    raw: path.join(dir, ".work", "raw"), // playwright webm per scene
    narration: path.join(dir, "narration"), // mp3 per scene
    cards: path.join(dir, ".work", "cards"), // title-card pngs
    clips: path.join(dir, "clips"), // finished per-scene mp4 (kept for re-renders)
    out: path.join(dir, "walkthrough.mp4"),
  },
};
