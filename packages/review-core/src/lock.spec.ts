import { describe, expect, it } from "vitest";
import { LEGAL, isLegalTransition } from "./fsm.js";
import {
  acknowledge,
  commitLock,
  editNarrative,
  finalizeReview,
  reassignApprover,
  respond,
  setRating,
} from "./engine.js";
import { assertNoPostLockMutationRoutes, findForbiddenRoutes } from "./routes.js";
import { InMemoryReviewStore } from "./store.js";
import { asAccount, cleanDraft, id, makeReview } from "./fixtures.js";

function lockedStore(): InMemoryReviewStore {
  const store = new InMemoryReviewStore();
  store.seedReview(makeReview({ rating: "Meets expectations" }));
  store.seedDraft(id.draft, cleanDraft);
  finalizeReview(store, id.review, id.approver, 7); // → awaiting-acknowledgement (reveal)
  acknowledge(store, id.review, asAccount(id.subject)); // → locked
  return store;
}

// Non-negotiable #2 — Lock is permanent & immutable; no post-lock correction.
describe("Lock immutable, fails closed", () => {
  it("a locked review reaches the terminal state and snapshots once", () => {
    const store = lockedStore();
    expect(store.load(id.review)?.status).toBe("locked");
    expect(store.getLock(id.review)).toBeDefined();
    expect(store.auditLog.filter((a) => a.action === "review_locked")).toHaveLength(1);
  });

  it("every pre-lock mutator is rejected on a locked review", () => {
    const store = lockedStore();
    expect(() => editNarrative(store, id.review, id.approver, cleanDraft)).toThrowError(/ERR_REVIEW_LOCKED/);
    expect(() => setRating(store, id.review, id.approver, "Exceeds expectations")).toThrowError(/ERR_REVIEW_LOCKED/);
    expect(() => reassignApprover(store, id.review, id.outsider)).toThrowError(/ERR_REVIEW_LOCKED/);
    expect(() => finalizeReview(store, id.review, id.approver, 7)).toThrowError(/ERR_REVIEW_LOCKED/);
  });

  it("locked is terminal — no legal outbound transition", () => {
    for (const to of LEGAL["awaiting-acknowledgement"].concat(["in-review", "draft", "aborted"])) {
      expect(isLegalTransition("locked", to)).toBe(false);
    }
  });

  it("a second lock is a no-op (ack vs window-close race loser)", () => {
    const store = lockedStore();
    const before = store.getLock(id.review);
    commitLock(store, id.review, "window_closed"); // must not throw, must not double-lock
    expect(store.getLock(id.review)).toEqual(before);
    expect(store.auditLog.filter((a) => a.action === "review_locked")).toHaveLength(1);
  });

  it("no post-lock correction/supersede/appeal route exists (structural)", () => {
    const goodRoutes = [
      "/api/reviews/:id/narrative",
      "/api/reviews/:id/rating",
      "/api/reviews/:id/finalize",
      "/api/reviews/:id/acknowledge",
      "/api/reviews/:id/respond",
      "/api/reviews/:id/locked",
      "/api/admin/reviews/:id/reassign-approver",
    ];
    expect(findForbiddenRoutes(goodRoutes)).toEqual([]);
    expect(() => assertNoPostLockMutationRoutes(goodRoutes)).not.toThrow();

    const badRoutes = [...goodRoutes, "/api/reviews/:id/correct", "/api/reviews/:id/unlock"];
    expect(findForbiddenRoutes(badRoutes).length).toBeGreaterThan(0);
    expect(() => assertNoPostLockMutationRoutes(badRoutes)).toThrowError(/non-negotiable #2/);
  });
});
