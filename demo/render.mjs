// Orchestrator. Phases: narrate (edge-tts) → cards (title-card PNGs) → record
// (Playwright per app scene, against the LIVE app) → assemble (ffmpeg clips + final).
// A manifest persists between phases so you can re-run one phase in isolation.
//
//   node render.mjs                 full pipeline
//   node render.mjs --only=narrate  just (re)generate narration
//   node render.mjs --only=record   just (re)record scenes
//   node render.mjs --only=assemble rebuild clips + final from existing raw/narration
//   node render.mjs --scene=s6      restrict record/assemble to one scene
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";
import { SCENES } from "./scenes.mjs";
import { narrateAll } from "./narrate.mjs";
import { renderCards } from "./cards.mjs";
import { buildClip, assembleFinal } from "./assemble.mjs";
import * as R from "./rig.mjs";

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;
const sceneFilter = (args.find((a) => a.startsWith("--scene=")) || "").split("=")[1] || null;
const MANIFEST = path.join(CONFIG.dirs.work, "manifest.json");

const want = (phase) => !only || only === phase;
const load = () => { try { return JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch { return {}; } };
const save = (m) => fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));

async function recordScenes(manifest) {
  const browser = await R.launch();
  manifest.raw = manifest.raw || {};
  manifest.status = manifest.status || {};
  // warm the (possibly cold) Render service first
  try {
    const w = await browser.newContext();
    const wp = await w.newPage();
    console.log("   warming up the app…");
    await wp.goto(CONFIG.siteUrl + "/login", { waitUntil: "domcontentloaded", timeout: 90000 });
    await w.close();
  } catch (e) { console.warn("   warmup note:", e.message); }

  for (const s of SCENES) {
    if (s.kind !== "app") continue;
    if (sceneFilter && s.id !== sceneFilter) continue;
    console.log(`   recording ${s.id} (as ${s.account})…`);
    const scene = await R.newScene(browser, s.id);
    try {
      if (s.account) await R.login(scene.page, s.account);
      await s.run(scene.page);
      manifest.status[s.id] = "ok";
    } catch (e) {
      manifest.status[s.id] = "error: " + e.message;
      console.warn(`   ⚠ ${s.id}: ${e.message}`);
    }
    const raw = await R.finishScene(scene, s.id);
    manifest.raw[s.id] = raw;
    save(manifest);
  }
  await browser.close();
}

async function main() {
  for (const d of Object.values(CONFIG.dirs)) {
    if (d.endsWith(".mp4")) continue;
    fs.mkdirSync(d, { recursive: true });
  }
  const manifest = load();

  if (want("narrate")) {
    console.log("== narrate ==");
    manifest.durations = await narrateAll(SCENES);
    save(manifest);
  }
  if (want("cards")) {
    console.log("== cards ==");
    manifest.cards = await renderCards(SCENES);
    save(manifest);
  }
  if (want("record")) {
    console.log("== record (live app) ==");
    await recordScenes(manifest);
  }
  if (want("assemble")) {
    console.log("== assemble ==");
    const clips = [];
    for (const s of SCENES) {
      if (sceneFilter && only === "assemble" && s.id !== sceneFilter) { /* still include for full video unless single-scene */ }
      const narr = path.join(CONFIG.dirs.narration, s.id + ".mp3");
      const source = s.kind === "card" ? (manifest.cards?.[s.id]) : (manifest.raw?.[s.id]);
      if (!source || !fs.existsSync(source)) {
        console.warn(`   skip ${s.id}: no source (${s.kind === "card" ? "card png" : "raw recording"} missing)`);
        continue;
      }
      try {
        const dur = await buildClip(s, source, narr);
        clips.push({ id: s.id, path: path.join(CONFIG.dirs.clips, s.id + ".mp4"), dur });
        console.log(`   clip ${s.id} — ${dur.toFixed(1)}s`);
      } catch (e) {
        console.warn(`   ⚠ clip ${s.id}: ${e.message}`);
      }
    }
    if (clips.length) {
      const out = await assembleFinal(clips);
      console.log(`\n   FINAL → ${out}  (${clips.length}/${SCENES.length} scenes)`);
    } else {
      console.warn("   no clips built — nothing to assemble.");
    }
  }

  console.log("\n== status ==");
  for (const s of SCENES) {
    const st = s.kind === "card" ? "card" : (manifest.status?.[s.id] || "not recorded");
    console.log(`   ${s.id}  ${st}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exitCode = 1; });
