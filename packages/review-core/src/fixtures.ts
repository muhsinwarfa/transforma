import type {
  AccountId,
  CompanyId,
  CycleId,
  EmployeeId,
  InputAuthorId,
  ReviewDraftId,
  ReviewId,
} from "@transforma/db";
import type { NarrativeSections, ReviewView } from "./types.js";

export const id = {
  company: "11111111-1111-1111-1111-111111111111" as CompanyId,
  cycle: "22222222-2222-2222-2222-222222222222" as CycleId,
  review: "33333333-3333-3333-3333-333333333333" as ReviewId,
  draft: "44444444-4444-4444-4444-444444444444" as ReviewDraftId,
  subject: "a0000000-0000-0000-0000-000000000002" as EmployeeId,
  approver: "a0000000-0000-0000-0000-000000000001" as AccountId,
  contributor: "a0000000-0000-0000-0000-000000000004" as AccountId,
  outsider: "a0000000-0000-0000-0000-000000000009" as AccountId,
};

export function makeReview(overrides: Partial<ReviewView> = {}): ReviewView {
  return {
    id: id.review,
    companyId: id.company,
    cycleId: id.cycle,
    employeeId: id.subject,
    approverId: id.approver,
    inputAuthorId: null,
    contributorIds: [],
    status: "in-review",
    rating: null,
    reviewDraftId: id.draft,
    flaggedInternal: false,
    revealedAt: null,
    ackWindowEndsAt: null,
    ...overrides,
  };
}

export const cleanDraft: NarrativeSections = {
  summary: "A steady, dependable cycle with clear contributions to shared goals.",
  strengths: "Reliable execution and a calm presence under pressure.",
  areasToGrow: "Could delegate more rather than absorbing the work alone.",
  focusNextCycle: "Hand off one workstream and coach a teammate through it.",
};

/**
 * The prototype's below-floor case (maryan): narrative copy that LEAKS
 * peer-derived claims into a self-only draft. The gate must reject this below
 * the floor. Reference-only / non-binding — it must never reproduce.
 */
export const maryanLeakyDraft: NarrativeSections = {
  summary: "Maryan is dependable and steady on the floor this cycle.",
  strengths:
    "Calm under pressure and trusted by patients. Colleagues describe her as the person they want on a hard shift.",
  areasToGrow: "Take more initiative surfacing problems early.",
  focusNextCycle: "Lead a small improvement on the unit.",
};

export const asAccount = (e: EmployeeId): AccountId => e as unknown as AccountId;
export const asInputAuthor = (a: AccountId): InputAuthorId => a as InputAuthorId;
