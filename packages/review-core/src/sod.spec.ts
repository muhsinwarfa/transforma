import { describe, expect, it } from "vitest";
import { TransformaError } from "./errors.js";
import { finalizeReview, reassignApprover } from "./engine.js";
import { isEligibleApprover } from "./sod.js";
import { InMemoryReviewStore } from "./store.js";
import { asAccount, asInputAuthor, id, makeReview } from "./fixtures.js";

// Non-negotiable #1 — Segregation of duties. Fails closed at finalize AND
// reassign, and the ineligible never matches the queue (predicate-driven).
describe("SoD fails closed", () => {
  it("predicate rejects subject, input author, contributor, and null", () => {
    const review = makeReview({
      inputAuthorId: asInputAuthor(id.contributor),
      contributorIds: [id.contributor],
    });
    expect(isEligibleApprover(review, asAccount(id.subject))).toBe(false); // the subject
    expect(isEligibleApprover(review, id.contributor)).toBe(false); // input author / contributor
    expect(isEligibleApprover(review, null)).toBe(false);
    expect(isEligibleApprover(review, id.approver)).toBe(true); // a clean approver
  });

  it("rejects an ineligible finalize server-side (subject as approver)", () => {
    const store = new InMemoryReviewStore();
    // a review whose 'approver' slot is the subject — the UI hid it, but finalize must reject
    store.seedReview(makeReview({ approverId: asAccount(id.subject), rating: "Meets expectations" }));
    expect(() => finalizeReview(store, id.review, asAccount(id.subject), 7)).toThrowError(
      TransformaError,
    );
    expect(store.load(id.review)?.status).toBe("in-review"); // unchanged
    expect(store.auditLog.find((a) => a.action === "review_finalized")).toBeUndefined();
  });

  it("rejects an ineligible finalize (input author as approver)", () => {
    const store = new InMemoryReviewStore();
    store.seedReview(
      makeReview({
        approverId: id.contributor,
        inputAuthorId: asInputAuthor(id.contributor),
        contributorIds: [id.contributor],
        rating: "Meets expectations",
      }),
    );
    expect(() => finalizeReview(store, id.review, id.contributor, 7)).toThrowError(/ERR_SOD_INELIGIBLE/);
  });

  it("admin reassign re-passes SoD (rejects the subject)", () => {
    const store = new InMemoryReviewStore();
    store.seedReview(makeReview());
    expect(() => reassignApprover(store, id.review, asAccount(id.subject))).toThrowError(
      /ERR_SOD_INELIGIBLE/,
    );
  });

  it("an eligible approver finalizes successfully → awaiting-acknowledgement", () => {
    const store = new InMemoryReviewStore();
    store.seedReview(makeReview({ rating: "Meets expectations" }));
    finalizeReview(store, id.review, id.approver, 7);
    expect(store.load(id.review)?.status).toBe("awaiting-acknowledgement");
  });

  it("finalize WITHOUT a rating is rejected (rating-required gate)", () => {
    const store = new InMemoryReviewStore();
    store.seedReview(makeReview({ rating: null }));
    expect(() => finalizeReview(store, id.review, id.approver, 7)).toThrowError(/ERR_RATING_REQUIRED/);
    expect(store.load(id.review)?.status).toBe("in-review"); // unchanged — no reveal, no lock
  });
});
