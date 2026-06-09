import { describe, expect, it } from "vitest";
import { decideSubjectView } from "./view";

// The reveal boundary (non-negotiable #3) as a unit: a pre-reveal status NEVER
// resolves to a narrative-bearing view, even if a narrative were somehow present.
describe("decideSubjectView — reveal boundary", () => {
  it("in-review renders status-only, regardless of narrative presence", () => {
    expect(decideSubjectView("in-review", false)).toBe("status");
    expect(decideSubjectView("in-review", true)).toBe("status");
  });

  it("awaiting-acknowledgement reveals the finished review only when present", () => {
    expect(decideSubjectView("awaiting-acknowledgement", true)).toBe("reveal");
    expect(decideSubjectView("awaiting-acknowledgement", false)).toBe("status");
  });

  it("locked renders the read-only locked review", () => {
    expect(decideSubjectView("locked", true)).toBe("locked");
    expect(decideSubjectView("locked", false)).toBe("status");
  });
});
