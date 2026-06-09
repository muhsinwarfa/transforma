import type {
  AccountId,
  CompanyId,
  CycleId,
  EmployeeId,
  InputAuthorId,
  Rating,
  ReviewDraftId,
  ReviewId,
  ReviewStatus,
} from "@transforma/db";

/** The review fields the enforcement core reasons about. */
export interface ReviewView {
  id: ReviewId;
  companyId: CompanyId;
  cycleId: CycleId;
  employeeId: EmployeeId;
  approverId: AccountId | null;
  inputAuthorId: InputAuthorId | null;
  /** the plural inputAuthorId exclusion set (review_contributors) */
  contributorIds: AccountId[];
  status: ReviewStatus;
  rating: Rating | null;
  reviewDraftId: ReviewDraftId | null;
  flaggedInternal: boolean;
  revealedAt: string | null;
  ackWindowEndsAt: string | null;
}

/** The four narrative sections — NO rating field, by construction. */
export interface NarrativeSections {
  summary: string;
  strengths: string;
  areasToGrow: string;
  focusNextCycle: string;
}

export const NARRATIVE_SECTION_KEYS = [
  "summary",
  "strengths",
  "areasToGrow",
  "focusNextCycle",
] as const;

/** What the subject is allowed to see (rule 3). */
export interface SubjectProjection {
  reviewId: ReviewId;
  /** draft/in-review/flagged/blocked_sod/aborted all collapse to "in-review" */
  displayStatus: "in-review" | "awaiting-acknowledgement" | "locked";
  /** present ONLY at/after reveal */
  narrative?: NarrativeSections;
  rating?: Rating;
}
