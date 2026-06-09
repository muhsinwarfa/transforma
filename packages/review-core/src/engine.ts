import { createHash } from "node:crypto";
import type { AccountId, AckOutcome, Rating, ReviewId } from "@transforma/db";
import { fail } from "./errors.js";
import { isLegalTransition } from "./fsm.js";
import { assertEligibleApprover } from "./sod.js";
import type { ReviewStore } from "./store.js";
import type { NarrativeSections, ReviewView } from "./types.js";

const EDITABLE_STATES = new Set<ReviewView["status"]>(["in-review", "flagged"]);
const nowIso = () => new Date().toISOString();

function mustLoad(store: ReviewStore, id: ReviewId): ReviewView {
  const r = store.load(id);
  if (!r) fail("ERR_REVIEW_NOT_FOUND", `review ${id} not found`, 404);
  return r;
}

/** Every pre-lock mutator passes through here first. */
export function assertNotLocked(review: ReviewView): void {
  if (review.status === "locked") {
    fail("ERR_REVIEW_LOCKED", "Locked reviews are immutable — no post-lock correction.", 409);
  }
}

function applyTransition(
  store: ReviewStore,
  review: ReviewView,
  to: ReviewView["status"],
  patch: Partial<ReviewView>,
): void {
  if (!isLegalTransition(review.status, to)) {
    fail("ERR_ILLEGAL_TRANSITION", `${review.status} -> ${to}`, 409);
  }
  store.patch(review.id, { ...patch, status: to });
}

// ── PROC-05: manager edits narrative + sets rating (no gate / no override) ──
export function editNarrative(
  store: ReviewStore,
  id: ReviewId,
  approver: AccountId,
  sections: NarrativeSections,
): void {
  const review = mustLoad(store, id);
  assertNotLocked(review);
  if (!EDITABLE_STATES.has(review.status)) {
    fail("ERR_ILLEGAL_TRANSITION", `cannot edit narrative in status ${review.status}`);
  }
  assertEligibleApprover(review, approver);
  if (!review.reviewDraftId) fail("ERR_REVIEW_NOT_FOUND", "no draft to edit", 404);
  store.setDraft(review.reviewDraftId, sections);
  store.audit({ action: "narrative_edited", actorId: approver, reviewId: id, target: {} });
}

export function setRating(
  store: ReviewStore,
  id: ReviewId,
  approver: AccountId,
  rating: Rating,
): void {
  const review = mustLoad(store, id);
  assertNotLocked(review);
  if (!EDITABLE_STATES.has(review.status)) {
    fail("ERR_ILLEGAL_TRANSITION", `cannot set rating in status ${review.status}`);
  }
  assertEligibleApprover(review, approver);
  store.patch(id, { rating });
  store.audit({ action: "rating_set", actorId: approver, reviewId: id, target: { rating } });
}

// ── PROC-05: finalize → REVEAL (never locks here) ───────────────────────────
export function finalizeReview(
  store: ReviewStore,
  id: ReviewId,
  approver: AccountId,
  ackWindowDays: number,
): void {
  const review = mustLoad(store, id);
  assertNotLocked(review);
  if (!EDITABLE_STATES.has(review.status)) {
    fail("ERR_ILLEGAL_TRANSITION", `cannot finalize in status ${review.status}`);
  }
  // The fail-closed SoD re-check — rejects an ineligible finalize even if the UI hid it.
  assertEligibleApprover(review, approver);
  if (!review.rating) fail("ERR_RATING_REQUIRED", "set a rating before finalizing");

  const revealedAt = nowIso();
  const ackWindowEndsAt = new Date(Date.now() + ackWindowDays * 86_400_000).toISOString();
  applyTransition(store, review, "awaiting-acknowledgement", { revealedAt, ackWindowEndsAt });
  store.audit({ action: "review_finalized", actorId: approver, reviewId: id, target: {} });
  store.audit({ action: "review_revealed", actorId: approver, reviewId: id, target: {} });
}

// ── PROC-06: admin reassign — must re-pass SoD ──────────────────────────────
export function reassignApprover(
  store: ReviewStore,
  id: ReviewId,
  newApprover: AccountId,
): void {
  const review = mustLoad(store, id);
  assertNotLocked(review);
  assertEligibleApprover(review, newApprover);
  store.patch(id, { approverId: newApprover });
  store.audit({ action: "approver_reassigned", actorId: null, reviewId: id, target: {} });
}

// ── lock — the ONLY path to `locked`; idempotent (ack vs window-close race) ──
function contentHash(narrative: NarrativeSections, rating: string): string {
  return createHash("sha256").update(`${JSON.stringify(narrative)}|${rating}`).digest("hex");
}

export function commitLock(store: ReviewStore, id: ReviewId, reason: AckOutcome): void {
  const review = mustLoad(store, id);
  if (review.status === "locked") return; // idempotent: the race loser no-ops
  if (review.status !== "awaiting-acknowledgement") {
    fail("ERR_NOT_REVEALED", `cannot lock a review in status ${review.status}`);
  }
  if (!review.rating) fail("ERR_RATING_REQUIRED");
  const narrative: NarrativeSections =
    (review.reviewDraftId && store.getDraft(review.reviewDraftId)) || {
      summary: "",
      strengths: "",
      areasToGrow: "",
      focusNextCycle: "",
    };
  store.insertLock({
    reviewId: id,
    rating: review.rating,
    narrative,
    lockedAt: nowIso(),
    lockReason: reason,
    contentHash: contentHash(narrative, review.rating),
  });
  applyTransition(store, review, "locked", { status: "locked" });
  store.audit({ action: "review_locked", actorId: null, reviewId: id, target: { reason } });
}

// ── PROC-05: subject acknowledges / responds; worker window-close ───────────
export function acknowledge(
  store: ReviewStore,
  id: ReviewId,
  subject: AccountId,
  responseBody?: string,
): void {
  const review = mustLoad(store, id);
  if (review.status !== "awaiting-acknowledgement") fail("ERR_NOT_REVEALED");
  if (subject !== (review.employeeId as unknown as AccountId)) fail("ERR_FORBIDDEN", undefined, 403);
  store.insertResponse(id, "acknowledged", responseBody ?? null);
  commitLock(store, id, "acknowledged");
}

export function respond(
  store: ReviewStore,
  id: ReviewId,
  subject: AccountId,
  body: string,
): void {
  const review = mustLoad(store, id);
  if (review.status !== "awaiting-acknowledgement") fail("ERR_NOT_REVEALED");
  if (subject !== (review.employeeId as unknown as AccountId)) fail("ERR_FORBIDDEN", undefined, 403);
  if (!body || body.trim().length === 0) fail("ERR_RESPONSE_REQUIRED", "a written response is required", 400);
  store.insertResponse(id, "responded", body);
  commitLock(store, id, "responded");
}

/** Worker cron: window closed with no response → documented silence, then lock. */
export function closeAckWindow(store: ReviewStore, id: ReviewId): void {
  const review = mustLoad(store, id);
  if (review.status !== "awaiting-acknowledgement") return; // already moved on
  store.insertResponse(id, "window_closed", null);
  commitLock(store, id, "window_closed");
}
