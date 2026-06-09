// Pure dispatch for the subject's "My review" screen — the reveal boundary in
// one testable place. The narrative is shown ONLY when the review is revealed
// (awaiting-acknowledgement or locked) AND a finished narrative is present.
// Any pre-reveal status renders status-only, no matter what.
export type SubjectView = "status" | "reveal" | "locked";

export function decideSubjectView(displayStatus: string, hasNarrative: boolean): SubjectView {
  if (displayStatus === "locked" && hasNarrative) return "locked";
  if (displayStatus === "awaiting-acknowledgement" && hasNarrative) return "reveal";
  return "status";
}
