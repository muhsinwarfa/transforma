import { describe, expect, it } from "vitest";
import { acknowledge, finalizeReview } from "./engine.js";
import { subjectReadProjection } from "./reveal.js";
import { InMemoryReviewStore } from "./store.js";
import { asAccount, cleanDraft, id, makeReview } from "./fixtures.js";
import type { ReviewStatus } from "@transforma/db";

// Non-negotiable #3 — Reveal before lock; the subject never sees draft/flag.
describe("Reveal before lock, fails closed", () => {
  const preReveal: ReviewStatus[] = ["draft", "in-review", "flagged", "blocked_sod", "aborted"];

  it("pre-finalize: no narrative, no rating, status masked to 'in-review' (incl. flagged)", () => {
    for (const status of preReveal) {
      const review = makeReview({ status, flaggedInternal: true, rating: "Exceeds expectations" });
      // even if a finished narrative is handed in, it must be withheld pre-reveal
      const proj = subjectReadProjection(review, cleanDraft);
      expect(proj.displayStatus).toBe("in-review");
      expect(proj.narrative).toBeUndefined();
      expect(proj.rating).toBeUndefined();
      // the internal flag is never serialized
      expect(JSON.stringify(proj)).not.toContain("flag");
    }
  });

  it("at reveal (awaiting-acknowledgement): finished narrative + rating are returned", () => {
    const review = makeReview({
      status: "awaiting-acknowledgement",
      rating: "Meets expectations",
      revealedAt: new Date().toISOString(),
    });
    const proj = subjectReadProjection(review, cleanDraft);
    expect(proj.displayStatus).toBe("awaiting-acknowledgement");
    expect(proj.narrative).toEqual(cleanDraft);
    expect(proj.rating).toBe("Meets expectations");
  });

  it("locked: read-only snapshot is returned", () => {
    const review = makeReview({ status: "locked", rating: "Meets expectations" });
    const proj = subjectReadProjection(review, cleanDraft);
    expect(proj.displayStatus).toBe("locked");
    expect(proj.narrative).toEqual(cleanDraft);
  });

  it("finalize REVEALS but does not lock (reveal strictly precedes lock)", () => {
    const store = new InMemoryReviewStore();
    store.seedReview(makeReview({ rating: "Meets expectations" }));
    store.seedDraft(id.draft, cleanDraft);
    finalizeReview(store, id.review, id.approver, 7);
    const r = store.load(id.review)!;
    expect(r.status).toBe("awaiting-acknowledgement");
    expect(r.revealedAt).not.toBeNull();
    expect(store.getLock(id.review)).toBeUndefined(); // revealed, NOT yet locked
    // ...then the subject acknowledges → lock
    acknowledge(store, id.review, asAccount(id.subject));
    expect(store.load(id.review)?.status).toBe("locked");
  });
});
