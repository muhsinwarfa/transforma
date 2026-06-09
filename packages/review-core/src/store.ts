import type { AckOutcome, ReviewDraftId, ReviewId } from "@transforma/db";
import type { NarrativeSections, ReviewView } from "./types.js";

export interface LockedSnapshot {
  reviewId: ReviewId;
  rating: string;
  narrative: NarrativeSections;
  lockedAt: string;
  lockReason: AckOutcome;
  contentHash: string;
}

export interface AuditRecord {
  action: string;
  actorId: string | null;
  reviewId: ReviewId | null;
  target: Record<string, unknown>;
}

/**
 * Storage seam for the enforcement engine. The Supabase-backed implementation
 * (added with the approver/worker slices) routes lock through `app.commit_lock`
 * and audit through `app.append_audit`. The in-memory implementation below
 * mirrors the same invariants so the fail-closed specs run without a DB.
 */
export interface ReviewStore {
  load(id: ReviewId): ReviewView | undefined;
  patch(id: ReviewId, patch: Partial<ReviewView>): void;
  getDraft(id: ReviewDraftId): NarrativeSections | undefined;
  setDraft(id: ReviewDraftId, sections: NarrativeSections): void;
  getLock(id: ReviewId): LockedSnapshot | undefined;
  insertLock(snap: LockedSnapshot): void;
  insertResponse(reviewId: ReviewId, outcome: AckOutcome, body: string | null): void;
  audit(rec: AuditRecord): void;
}

export class InMemoryReviewStore implements ReviewStore {
  private reviews = new Map<string, ReviewView>();
  private drafts = new Map<string, NarrativeSections>();
  private locks = new Map<string, LockedSnapshot>();
  readonly responses: Array<{ reviewId: ReviewId; outcome: AckOutcome; body: string | null }> = [];
  readonly auditLog: AuditRecord[] = [];

  seedReview(review: ReviewView): void {
    this.reviews.set(review.id, { ...review });
  }
  seedDraft(id: ReviewDraftId, sections: NarrativeSections): void {
    this.drafts.set(id, sections);
  }

  load(id: ReviewId): ReviewView | undefined {
    const r = this.reviews.get(id);
    return r ? { ...r, contributorIds: [...r.contributorIds] } : undefined;
  }
  patch(id: ReviewId, patch: Partial<ReviewView>): void {
    const r = this.reviews.get(id);
    if (!r) return;
    this.reviews.set(id, { ...r, ...patch });
  }
  getDraft(id: ReviewDraftId): NarrativeSections | undefined {
    return this.drafts.get(id);
  }
  setDraft(id: ReviewDraftId, sections: NarrativeSections): void {
    this.drafts.set(id, sections);
  }
  getLock(id: ReviewId): LockedSnapshot | undefined {
    return this.locks.get(id);
  }
  insertLock(snap: LockedSnapshot): void {
    if (this.locks.has(snap.reviewId)) {
      // mirrors the locked_reviews PK: a second lock is impossible
      throw new Error("ERR_DOUBLE_LOCK: a lock already exists for this review");
    }
    this.locks.set(snap.reviewId, snap);
  }
  insertResponse(reviewId: ReviewId, outcome: AckOutcome, body: string | null): void {
    this.responses.push({ reviewId, outcome, body });
  }
  audit(rec: AuditRecord): void {
    this.auditLog.push(rec);
  }
}
