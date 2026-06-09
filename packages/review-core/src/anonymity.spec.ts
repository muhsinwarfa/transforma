import { describe, expect, it } from "vitest";
import { applyFloor, buildSynthesisInput, clampThreshold } from "./anonymity.js";
import { runDeterministicGate } from "./gate.js";
import { cleanDraft, maryanLeakyDraft } from "./fixtures.js";

// Peer anonymity floor — below floor excludes peer content entirely; the gate is
// the binding fail-closed control for quotes/identifiers/rating/"AI".
describe("Anonymity floor", () => {
  it("clamps the threshold to the hard minimum of 3", () => {
    expect(clampThreshold(2)).toBe(3);
    expect(clampThreshold(1)).toBe(3);
    expect(clampThreshold(null)).toBe(3);
    expect(clampThreshold(5)).toBe(5);
  });

  it("below floor: peer content excluded, self-only, flagged path", () => {
    const d = applyFloor(2, 3);
    expect(d.belowFloor).toBe(true);
    expect(d.peerIncluded).toBe(false);
    expect(d.selfOnly).toBe(true);
  });

  it("at the floor: peers included", () => {
    const d = applyFloor(3, 3);
    expect(d.atOrAboveFloor).toBe(true);
    expect(d.peerIncluded).toBe(true);
  });

  it("synthesis input OMITS peers below floor (not filtered downstream)", () => {
    const below = buildSynthesisInput({ self: "..." }, ["theme a", "theme b"], applyFloor(2, 3));
    expect(below.peerThemes).toBeNull();
    expect(below.belowFloor).toBe(true);
    const above = buildSynthesisInput({ self: "..." }, ["theme a", "theme b", "theme c"], applyFloor(3, 3));
    expect(above.peerThemes).toHaveLength(3);
  });
});

describe("Deterministic gate (calibrated, fails closed)", () => {
  const ctx = { identifiers: [] as string[], rawInputs: [] as string[], belowFloor: false };

  it("passes a clean, themes-only draft (low false positive)", () => {
    expect(runDeterministicGate(cleanDraft, ctx).pass).toBe(true);
  });

  it("maryan fixture: rejects peer-attributable claims in a below-floor draft", () => {
    const res = runDeterministicGate(maryanLeakyDraft, { ...ctx, belowFloor: true });
    expect(res.pass).toBe(false);
    expect(res.issues.some((i) => i.category === "peer_attributable")).toBe(true);
  });

  it("rejects 'AI' / model names", () => {
    const d = { ...cleanDraft, summary: "This review was prepared with AI assistance." };
    expect(runDeterministicGate(d, ctx).issues.some((i) => i.category === "brand")).toBe(true);
  });

  it("rejects an echoed rating label and numeric scores", () => {
    const labelDraft = { ...cleanDraft, summary: "Clearly Exceeds expectations this cycle." };
    expect(runDeterministicGate(labelDraft, ctx).issues.some((i) => i.category === "rating")).toBe(true);
    const scoreDraft = { ...cleanDraft, strengths: "Performance was a solid 4/5 overall." };
    expect(runDeterministicGate(scoreDraft, ctx).issues.some((i) => i.category === "rating")).toBe(true);
  });

  it("strips KNOWN identifiers (name/department) but not arbitrary words", () => {
    const d = { ...cleanDraft, summary: "Strong work on the Pharmacy intake project with Deqa." };
    const res = runDeterministicGate(d, { ...ctx, identifiers: ["Pharmacy", "Deqa"] });
    expect(res.issues.filter((i) => i.category === "identifier").length).toBeGreaterThanOrEqual(2);
    // the same draft with no declared identifiers is NOT nuked for ordinary capitals
    expect(runDeterministicGate(d, ctx).issues.some((i) => i.category === "identifier")).toBe(false);
  });

  it("rejects a near-verbatim peer span", () => {
    const raw = "she single-handedly rescued the launch when the whole team was about to give up entirely";
    const d = {
      ...cleanDraft,
      strengths:
        "In one case she single-handedly rescued the launch when the whole team was about to give up entirely.",
    };
    const res = runDeterministicGate(d, { ...ctx, rawInputs: [raw] });
    expect(res.issues.some((i) => i.category === "verbatim")).toBe(true);
  });
});
