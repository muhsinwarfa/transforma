# Transforma — Walkthrough Video Pipeline

An automated, **re-renderable** demo video. Each scene is recorded against the live app,
narrated with edge-tts, and stitched with ffmpeg into `walkthrough.mp4`. Per-scene clips
are kept in `clips/` so you can re-render one scene without redoing the rest.

```
demo/
  demo-seed.mjs ......... (in packages/db) provisions + stages the demo tenant
  meridian-roster.csv ... the org chart S2 imports (emitted by the seed)
  demo-map.json ......... account emails, review IDs, shared password (emitted by the seed)
  config.mjs ............ voice, pacing, brand colors, paths — all env-overridable
  scenes.mjs ............ the 9 scenes: narration text + the Playwright actions
  rig.mjs ............... recorded browser context, injected glide-cursor, login, helpers
  cards.mjs ............. branded navy title cards (rendered HTML → PNG)
  narrate.mjs ........... edge-tts per scene → narration/*.mp3
  assemble.mjs ......... ffmpeg: per-scene clip (length slaved to narration) + crossfade stitch
  render.mjs ........... orchestrator (narrate → cards → record → assemble)
  narration/ ........... generated mp3 per scene (kept)
  clips/ ............... finished per-scene mp4 (kept — re-render any one)
  walkthrough.mp4 ...... the final video
  .work/ ............... scratch (raw recordings, title-card PNGs, manifest.json)
```

## Prerequisites (one-time, already installed on this machine)

- **Node + Playwright + Chromium**: `cd demo && npm install && npx playwright install chromium`
- **Python 3.12 + edge-tts**: `py -m pip install edge-tts` (narration voices)
- **ffmpeg / ffprobe** on PATH (assembly)

## The re-render loop

Everything keys off `scenes.mjs` (actions + narration) and `config.mjs` (voice/pacing).
A manifest persists between phases, so you can re-run any phase alone.

```bash
# full pipeline (narration → cards → record live app → assemble)
node render.mjs

# change only narration text in scenes.mjs, then re-voice + re-stitch (no re-record):
node render.mjs --only=narrate
node render.mjs --only=assemble

# re-record (and re-stitch) a single scene after editing its actions:
node render.mjs --only=record --scene=s6
node render.mjs --only=assemble

# swap the voice or pacing without touching code:
DEMO_VOICE=en-US-AriaNeural DEMO_SLOWMO=240 node render.mjs --only=narrate
```

**Scenes**: `s1` title · `s2` admin import · `s3` employee nominates · `s4` manager approves ·
`s5` self-review + peer feedback · `s6` the draft + decision (centerpiece) · `s7` employee reads ·
`s8` oversight · `s9` outro.

## The demo tenant (Meridian Care · `demo-co`)

Staged on the production Supabase, isolated by `company_id` (verified disjoint from
`warfa-group`). All accounts share one password (`demo-map.json → password`) so the rig can
sign in as anyone. Drafts are **hand-seeded** narrative (no live synthesis needed); the hero
(Subject A / Amal) is revealed + awaiting-acknowledgement, and one manager review (Omar) is
locked through the real `commit_lock` for a correct audit chain.

**Re-seed (resets all mid-flight states — do this before re-recording the mutating scenes):**

```bash
cd packages/db
DEMO_SEED_PASSWORD='MeridianDemo2026!' node --env-file=../../.env demo-seed.mjs
# teardown only:  node --env-file=../../.env demo-seed.mjs --teardown
```

> **One-shot scenes.** `s3` (nominate), `s4` (approve), `s5` (submit self + peer), and `s6`
> (finalize) **mutate** the tenant. After a full record they can't simply re-run — re-seed
> first, then re-record. `s2` (import) is idempotent; `s7`/`s8` are read-only.

## Recording target

Records against the **live Render URL** (`config.siteUrl`). The orchestrator warms the service
first (free-tier cold-start) and uses generous timeouts. To point elsewhere, edit `siteUrl` in
`demo-map.json` (or re-run the seed with `NEXT_PUBLIC_SITE_URL` set).

## Clip length

Each scene's clip length is `max(recording, narration) + 1s` — narration is padded with
trailing silence and video by freezing the last frame, so **no on-screen action is ever
truncated** to fit the voiceover. (The brief said "narration + 1s"; this variant only ever
errs longer, never cuts an action.)

## Workarounds — UI friction worth a product decision

These are places the script had to bend around the current UI. Each is a candidate to **fix in
the product** rather than the script:

1. **Self-review submit has no confirmation surface.** Submitting redirects straight to `/home`;
   the "you won't see who said what" promise only appears if you *revisit* `/review/self`
   (the `SelfSubmittedCard`). The rig navigates back to show it. **Product:** a post-submit
   confirmation (toast or screen) carrying that confidentiality line would land the moment far
   better than a silent redirect.
2. **"Download CSV template" is a Blob `<a download>` click** that disrupts headless recording
   (download/navigation race). Harmless for real users; the rig simply skips the click and dwells
   on the dropzone copy (which already names the four columns). **Product:** no change needed,
   but a server-served template URL would be more automation/test friendly.
3. **Rating options aren't labelled in a stable, scriptable way** (radio buttons selected by
   index). Fine for users; a `data-rating="..."` hook would make automation robust.
4. **No in-app account switcher**, so the rig uses a fresh browser context + login per scene
   (by design — there's only sign-out). Not a defect; noted for anyone scripting multi-role flows.

*(Rig-side techniques, not product issues: the OS cursor isn't captured in Playwright video, so a
synthetic glide-cursor is injected; the Render free tier cold-starts, so the run warms it first.)*
