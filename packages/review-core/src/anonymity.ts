/**
 * Peer anonymity floor. Below the floor, peer content is EXCLUDED ENTIRELY
 * (never surfaced to draft or approver); the draft is built from the self-review
 * only and the review is flagged. Pure, fail-closed, hard-min clamp.
 */
export const HARD_MIN_THRESHOLD = 3;

export function clampThreshold(setting: number | null | undefined): number {
  const s =
    typeof setting === "number" && Number.isFinite(setting)
      ? Math.floor(setting)
      : HARD_MIN_THRESHOLD;
  return Math.max(s, HARD_MIN_THRESHOLD);
}

export interface FloorDecision {
  threshold: number;
  submittedPeerCount: number;
  atOrAboveFloor: boolean;
  belowFloor: boolean;
  peerIncluded: boolean;
  selfOnly: boolean;
}

/** `submittedPeerCount` counts SUBMITTED peers only — declines/never-submitted excluded. */
export function applyFloor(
  submittedPeerCount: number,
  thresholdSetting?: number | null,
): FloorDecision {
  const threshold = clampThreshold(thresholdSetting);
  const atOrAboveFloor = submittedPeerCount >= threshold;
  return {
    threshold,
    submittedPeerCount,
    atOrAboveFloor,
    belowFloor: !atOrAboveFloor,
    peerIncluded: atOrAboveFloor,
    selfOnly: !atOrAboveFloor,
  };
}

export interface SynthesisInput {
  selfReview: unknown;
  /** de-identified themes; NULL when below floor (peers omitted, not filtered downstream) */
  peerThemes: string[] | null;
  belowFloor: boolean;
}

/**
 * Build the bundle handed to synthesis. Below the floor, peers are OMITTED
 * (peerThemes = null) — the model never receives peer content at all.
 */
export function buildSynthesisInput(
  selfReview: unknown,
  peerThemes: string[],
  decision: FloorDecision,
): SynthesisInput {
  return {
    selfReview,
    peerThemes: decision.belowFloor ? null : peerThemes,
    belowFloor: decision.belowFloor,
  };
}
