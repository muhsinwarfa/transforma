// The 9 scenes. Each: id, kind ('card'|'app'), optional account to log in as,
// narration text, and an async run(page) that drives the LIVE app using the
// verified selectors. Card scenes are rendered by cards.mjs. run() errors are
// caught by the orchestrator so one flaky scene never kills the whole render.
import path from "node:path";
import { CONFIG } from "./config.mjs";
import * as R from "./rig.mjs";

const A = CONFIG.accounts;
const REV = CONFIG.reviews;
const CSV = path.join(CONFIG.root, "meridian-roster.csv");
const CSV_BAD = path.join(CONFIG.root, "meridian-roster-bad.csv");

const EEDO_SELF = {
  q3: "The vendor migration ran longer than planned and pulled focus from the smaller fixes.",
  q4: "Tightening our intake hand-offs so nothing slips between teams.",
};
const EEDO_PEER = [
  "We've worked across Operations together for the past year.",
  "Faisal keeps the day-to-day calm and unblocks people fast — the team plans around that.",
  "Could share project context a little earlier so the rest of us can get ahead of it.",
];

export const SCENES = [
  {
    id: "s1",
    kind: "card",
    card: {
      eyebrow: "",
      title: "Transforma",
      tagline: "360\u00B0 feedback. The whole picture.",
    },
    narration:
      "For most teams, one person's opinion decides your whole year. One meeting. One memory. One point of view. There's a better way to see your people.",
  },

  {
    id: "s2",
    kind: "app",
    account: A.nasra,
    narration:
      "Transforma starts with something you already have: your org chart. One simple upload, and every voice in your organization is mapped — who works with whom, who reports to whom. Because a complete picture starts with everyone in the frame.",
    run: async (page) => {
      await R.gotoApp(page, "/admin/roster");
      await R.dwell(page, 1400);
      // dwell on the dropzone copy (it spells out the 4 columns the VO names)
      const dz = page.locator(".dropzone, h3").first();
      if (await dz.count()) { await R.glideTo(page, dz); await R.dwell(page, 2200); }
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ state: "attached", timeout: 20000 }).catch(() => {});
      // (cheap teaching error) drop a CSV with a name in manager_email — validate-only.
      try {
        await fileInput.setInputFiles(CSV_BAD);
        await page.getByText(/email address|isn't in this file|more than once/i).first().waitFor({ timeout: 9000 });
        await R.dwell(page, 1900);
      } catch { /* skip the error beat if it doesn't surface */ }
      // the clean roster — the input persists across states, so just re-set it.
      await fileInput.setInputFiles(CSV);
      await page.getByText(/reviewed this cycle/i).first().waitFor({ timeout: 14000 }).catch(() => {});
      await R.dwell(page, 2200);
      await R.smoothScroll(page, 320);
      await R.dwell(page, 1400);
      const confirm = page.getByRole("button", { name: /Confirm & add to cycle/i });
      if (await confirm.count()) {
        await R.clickEl(page, confirm.first());
        await page.getByText(/people imported|added to/i).first().waitFor({ timeout: 25000 }).catch(() => {});
        await R.dwell(page, 1600);
      }
    },
  },

  {
    id: "s3",
    kind: "app",
    account: A.caasho,
    narration:
      "Then, something top-down reviews never do: each person chooses the colleagues who've actually seen their work. Teammates. Cross-functional partners. Even direct reports. Feedback from the people with a front-row seat — not just the view from above.",
    run: async (page) => {
      await R.gotoApp(page, "/home");
      await R.dwell(page, 1400);
      const cta = page.getByRole("link").filter({ hasText: /Nominate/i }).first();
      if (await cta.count()) await R.clickEl(page, cta);
      else await R.gotoApp(page, "/review/nominate");
      await page.waitForURL(/\/review\/nominate/).catch(() => {});
      await page.locator(".nom-card").first().waitFor({ timeout: 14000 }).catch(() => {});
      await R.dwell(page, 1400);
      const cards = page.locator(".nom-card");
      const n = Math.min(3, await cards.count());
      for (let i = 0; i < n; i++) {
        await R.clickEl(page, cards.nth(i));
        await R.dwell(page, 600);
      }
      await R.dwell(page, 900);
      const submit = page.getByRole("button", { name: /Submit for approval/i }).first();
      await R.clickEl(page, submit);
      await R.dwell(page, 2200);
    },
  },

  {
    id: "s4",
    kind: "app",
    account: A.farah,
    narration:
      "Managers approve each panel for balance — and Transforma guards the process. If a panel is too small to keep feedback anonymous, it says so before anyone proceeds. Honest input needs safe input.",
    run: async (page) => {
      await R.gotoApp(page, "/nominations");
      await R.dwell(page, 1400);
      let row = page.locator(".aq-row").filter({ hasText: /Caasho/i }).first();
      if (!(await row.count())) row = page.locator(".aq-row").first();
      if (await row.count()) {
        await R.clickEl(page, row);
        await page.waitForURL(/\/nominations\//).catch(() => {});
        await R.dwell(page, 1500);
        const approve = page.getByRole("button", { name: /Approve nominations/i }).first();
        if (await approve.count()) {
          await R.clickEl(page, approve);
          await R.dwell(page, 1800);
        }
      }
      // quick cut: the below-floor concealment line in the approver queue (Subject D)
      await R.gotoApp(page, "/approvals");
      await R.dwell(page, 1200);
      const bf = page.getByText(/below the confidentiality threshold/i).first();
      if (await bf.count()) {
        await bf.scrollIntoViewIfNeeded().catch(() => {});
        await R.glideTo(page, bf);
        await R.dwell(page, 2400);
      }
    },
  },

  {
    id: "s5",
    kind: "app",
    account: A.eedo,
    narration:
      "Now the picture gets painted from every side. Self-reflection and peer feedback, gathered in parallel — and completely confidential. When people know their words can't be traced, they tell you what's true, not what's safe.",
    run: async (page) => {
      // ── self-review ──
      await R.gotoApp(page, "/review/self");
      await R.dwell(page, 1200);
      for (const [q, text] of Object.entries(EEDO_SELF)) {
        const ta = page.locator(`#sr-${q}`);
        if ((await ta.count()) && !(await ta.inputValue())) {
          await R.typeSlow(page, ta, text);
          await R.dwell(page, 500);
        }
      }
      const save = page.locator(".autosave").first();
      if (await save.count()) { await R.glideTo(page, save); await R.dwell(page, 1300); }
      const sub = page.getByRole("button", { name: /Submit self-review/i }).first();
      if (await sub.count()) { await R.clickEl(page, sub); await R.dwell(page, 1800); }
      // revisit → the "you won't see who said what" confidentiality line
      await R.gotoApp(page, "/review/self");
      const line = page.getByText(/won.?t see who said what/i).first();
      if (await line.count()) { await R.glideTo(page, line); await R.dwell(page, 2400); }
      // ── peer feedback (Eedo → Faisal) ──
      await R.gotoApp(page, "/peer/" + REV.faisal);
      await R.dwell(page, 1200);
      const fields = page.locator("textarea[id^='pf-'], input[id^='pf-']");
      const fc = await fields.count();
      for (let i = 0; i < fc; i++) {
        await R.typeSlow(page, fields.nth(i), EEDO_PEER[i] || "A steady, reliable colleague who lifts the team.");
        await R.dwell(page, 400);
      }
      const psub = page.getByRole("button", { name: /Submit feedback/i }).first();
      if (await psub.count()) { await R.clickEl(page, psub); await R.dwell(page, 2200); }
    },
  },

  {
    id: "s6",
    kind: "app",
    account: A.farah,
    narration:
      "Then it all comes together. Every response is distilled into one clear, actionable narrative — the strengths multiple voices agree on, the growth areas that actually matter, with no way to tell who said what. The manager reviews it, adds judgment, sets the rating. One decision — informed by everyone, biased by no one.",
    run: async (page) => {
      await R.gotoApp(page, "/approvals/" + REV.B);
      await R.dwell(page, 1600);
      await R.smoothScroll(page, 280);
      const strengths = page.locator(".draft-sec-label").filter({ hasText: /Strengths/i }).first();
      if (await strengths.count()) { await R.glideTo(page, strengths); await R.dwell(page, 2400); }
      await R.smoothScroll(page, 260);
      const chip = page.locator(".draft-card-sub").first();
      if (await chip.count()) { await R.glideTo(page, chip); await R.dwell(page, 2000); }
      const rating = page.locator(".rating-opt");
      const rc = await rating.count();
      if (rc) { await R.clickEl(page, rating.nth(rc > 1 ? 1 : 0)); await R.dwell(page, 1100); }
      const fin = page.getByRole("button", { name: /Finalize & reveal/i }).first();
      if (await fin.count()) {
        await R.clickEl(page, fin);
        await R.dwell(page, 1400);
        const dlg = page.getByRole("dialog");
        const confirm = (await dlg.count())
          ? dlg.getByRole("button", { name: /Finalize & reveal/i }).first()
          : page.getByRole("button", { name: /Finalize & reveal/i }).last();
        await R.dwell(page, 1800);
        await R.clickEl(page, confirm);
        await R.dwell(page, 2400);
      }
    },
  },

  {
    id: "s7",
    kind: "app",
    account: A.amal,
    narration:
      "And the person at the center? They get a review that finally reflects their whole impact — specific, balanced, built from every angle. They respond on the record: agree, or push back in their own words. A review that's a conversation, not a verdict.",
    run: async (page) => {
      await R.gotoApp(page, "/review");
      await page.getByRole("heading", { name: /Your review is ready to read/i }).waitFor({ timeout: 16000 }).catch(() => {});
      await R.dwell(page, 2000);
      await R.smoothScroll(page, 460);
      await R.dwell(page, 1500);
      await R.smoothScroll(page, 360);
      const oc = page.locator(".oc-value").first();
      if (await oc.count()) { await R.glideTo(page, oc); await R.dwell(page, 1600); }
      const ack = page.getByRole("button", { name: /Acknowledge/i }).first();
      if (await ack.count()) { await R.glideTo(page, ack); await R.dwell(page, 2600); }
    },
  },

  {
    id: "s8",
    kind: "app",
    account: A.nasra,
    narration:
      "And your HR team sees the whole cycle at a glance — participation, progress, fairness — with individual feedback sealed and every access logged. Insight at the top. Confidentiality all the way down.",
    run: async (page) => {
      await R.gotoApp(page, "/admin/cycle");
      await R.dwell(page, 2200);
      await R.smoothScroll(page, 240);
      await R.dwell(page, 1800);
      await R.gotoApp(page, "/admin/reviews");
      await R.dwell(page, 1600);
      const note = page.getByText(/recorded in the audit log/i).first();
      if (await note.count()) { await R.glideTo(page, note); await R.dwell(page, 2400); }
      const row = page.locator("button.aq-row, .aq-row").first();
      if (await row.count()) {
        await R.clickEl(page, row);
        await R.dwell(page, 2600);
        await R.smoothScroll(page, 300);
        await R.dwell(page, 1500);
      }
    },
  },

  {
    id: "s9",
    kind: "card",
    card: {
      eyebrow: "",
      title: "Transforma",
      layout: "outro", // headline-first, wordmark beneath
      headline: "Every voice. One clear picture.",
      tagline: "",
      contact: "hello@transforma.example",
    },
    narration: "Stop grading people on one opinion. See the whole picture. Transforma.",
  },
];
