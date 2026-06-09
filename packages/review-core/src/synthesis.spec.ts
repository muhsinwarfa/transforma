import { describe, expect, it, vi } from "vitest";
import { runDeterministicGate, type GateContext } from "./gate.js";
import {
  DeterministicSynthesisError,
  MAX_SYNTHESIS_ATTEMPTS,
  runSynthesis,
  type JudgeVerdict,
} from "./synthesis.js";
import type { NarrativeSections } from "./types.js";
import { cleanDraft } from "./fixtures.js";

const cleanCtx: GateContext = { identifiers: [], rawInputs: [], belowFloor: false };
const lenientJudge = async (): Promise<JudgeVerdict> => ({ pass: true, issues: [] }); // judge fooled — floor must still hold

// ── the deterministic gate is the binding floor: each adversarial vector caught ──
describe("Deterministic gate vs adversarial model output", () => {
  const adversarial: { name: string; draft: NarrativeSections; ctx: GateContext; category: string }[] = [
    {
      name: "the word AI",
      draft: { ...cleanDraft, summary: "This review was prepared with AI to help the manager." },
      ctx: cleanCtx,
      category: "brand",
    },
    {
      name: "a smuggled rating",
      draft: { ...cleanDraft, summary: "She is clearly an exceeds expectations performer this cycle." },
      ctx: cleanCtx,
      category: "rating",
    },
    {
      name: "a proper-noun identifier",
      draft: { ...cleanDraft, strengths: "Worked closely with Deqa on the Pharmacy intake launch." },
      ctx: { identifiers: ["Deqa", "Pharmacy"], rawInputs: [], belowFloor: false },
      category: "identifier",
    },
    {
      name: "a verbatim peer span",
      draft: {
        ...cleanDraft,
        strengths: "In one moment she single-handedly rescued the launch when the team had nearly given up.",
      },
      ctx: {
        identifiers: [],
        rawInputs: ["she single-handedly rescued the launch when the team had nearly given up entirely"],
        belowFloor: false,
      },
      category: "verbatim",
    },
  ];

  for (const a of adversarial) {
    it(`catches ${a.name}`, () => {
      const res = runDeterministicGate(a.draft, a.ctx);
      expect(res.pass).toBe(false);
      expect(res.issues.some((i) => i.category === a.category)).toBe(true);
    });
  }
});

// ── red-team regression: the MECHANICAL evasions the gate now closes ──
describe("Gate red-team regression (mechanical evasions now caught)", () => {
  const caught: { name: string; text: string; category: string }[] = [
    { name: "A.I. with periods", text: "Built our A.I. product suite end to end.", category: "brand" },
    { name: "machine-generated", text: "Designed machine-generated content systems.", category: "brand" },
    { name: "auto-generated", text: "Pipelines where text is auto-generated at scale.", category: "brand" },
    { name: "LLM", text: "Expert in the LLM namespace and tooling.", category: "brand" },
    { name: "9/10", text: "Performs at roughly 9/10 across the role.", category: "rating" },
    { name: "10/10", text: "A near 10/10 cycle by any measure.", category: "rating" },
    { name: "4-star", text: "Deserves recognition as a 4-star contributor.", category: "rating" },
    { name: "8 on a 10-point scale", text: "Scored an 8 on a 10-point scale in feedback.", category: "rating" },
    { name: "top decile", text: "Ranks in the top decile of performers.", category: "rating" },
    { name: "top-quartile", text: "A clear top-quartile performer this period.", category: "rating" },
    { name: "perfect 10", text: "Frankly a perfect 10 this cycle.", category: "rating" },
  ];
  for (const c of caught) {
    it(`now catches: ${c.name}`, () => {
      const res = runDeterministicGate({ ...cleanDraft, summary: c.text }, cleanCtx);
      expect(res.issues.some((i) => i.category === c.category)).toBe(true);
    });
  }
  it("does NOT false-positive on a clean themes-only draft", () => {
    expect(runDeterministicGate(cleanDraft, cleanCtx).pass).toBe(true);
  });
});

// ── the synthesis loop: caught on EVERY attempt → regenerate → flag / abort ──
describe("runSynthesis drives regenerate-then-flag against a misbehaving model", () => {
  it("a clean draft passes on attempt 1 (ready); the gate ran once", async () => {
    const generate = vi.fn(async () => cleanDraft);
    const res = await runSynthesis({ generate, judge: lenientJudge }, cleanCtx);
    expect(res.outcome).toBe("ready");
    expect(res.attempts).toBe(1);
    expect(res.gateCalls).toBe(1);
  });

  it("an always-'AI' model is caught on EVERY attempt and flagged after 3 — with regenerate feedback", async () => {
    const seenPriorIssues: string[][] = [];
    const generate = vi.fn(async (priorIssues: string[]) => {
      seenPriorIssues.push(priorIssues);
      return { ...cleanDraft, summary: "Prepared with AI assistance." };
    });
    const res = await runSynthesis({ generate, judge: lenientJudge }, cleanCtx);

    expect(res.outcome).toBe("flagged");
    expect(res.attempts).toBe(MAX_SYNTHESIS_ATTEMPTS);
    expect(res.gateCalls).toBe(MAX_SYNTHESIS_ATTEMPTS); // the floor ran on every attempt
    expect(res.issues.some((i) => i.category === "brand")).toBe(true);
    expect(generate).toHaveBeenCalledTimes(3);
    // regenerate-with-feedback: attempts 2 and 3 were told what failed
    expect(seenPriorIssues[0]).toEqual([]);
    expect(seenPriorIssues[1]?.join(" ")).toMatch(/brand/);
    expect(seenPriorIssues[2]?.join(" ")).toMatch(/brand/);
  });

  it("recovers when the model fixes the issue on a later attempt (regenerate → ready)", async () => {
    const generate = vi.fn(async (priorIssues: string[]) =>
      priorIssues.length === 0 ? { ...cleanDraft, summary: "Done with AI." } : cleanDraft,
    );
    const res = await runSynthesis({ generate, judge: lenientJudge }, cleanCtx);
    expect(res.outcome).toBe("ready");
    expect(res.attempts).toBe(2);
  });

  it("a smuggled rating is caught even if the judge passes (deterministic floor binds)", async () => {
    const generate = vi.fn(async () => ({
      ...cleanDraft,
      summary: "Clearly an exceeds expectations performer.",
    }));
    const res = await runSynthesis({ generate, judge: lenientJudge }, cleanCtx);
    expect(res.outcome).toBe("flagged");
    expect(res.issues.some((i) => i.category === "rating")).toBe(true);
  });

  it("a deterministic generation failure ABORTS (never completes)", async () => {
    const generate = vi.fn(async () => {
      throw new DeterministicSynthesisError("invalid_request");
    });
    const res = await runSynthesis({ generate, judge: lenientJudge }, cleanCtx);
    expect(res.outcome).toBe("aborted");
    expect(res.draft).toBeNull();
  });

  it("a transient failure propagates (caller leaves the job queued)", async () => {
    const generate = vi.fn(async () => {
      throw new Error("503 overloaded");
    });
    await expect(runSynthesis({ generate, judge: lenientJudge }, cleanCtx)).rejects.toThrow(/overloaded/);
  });
});
