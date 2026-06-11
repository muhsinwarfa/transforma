import "server-only";
import type { NarrativeSections, SynthesisIssue } from "@transforma/review-core";
import { createRlsClient } from "@/lib/supabase/server";

/** Short calendar date, e.g. "Jun 9" — matches the design's queue metadata strings. */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface QueueItem {
  reviewId: string;
  subjectName: string;
  department: string | null;
  status: string;
  flaggedInternal: boolean;
  belowFloor: boolean;
  /** exact count ONLY at/above the floor; null below (non-quantifying) */
  peerCount: number | null;
  /** routed-to-approver timestamp (reviews.created_at), for "Submitted {date}" */
  submittedAt: string | null;
  /** reveal timestamp (awaiting-ack), for "Finalized {date}" */
  finalizedAt: string | null;
  /** permanent-lock timestamp, for "Locked {date}" */
  lockedAt: string | null;
}

export interface Workspace {
  reviewId: string;
  subjectName: string;
  department: string | null;
  status: string;
  rating: string | null;
  narrative: NarrativeSections | null;
  flagged: boolean;
  belowFloor: boolean;
  /** exact count ONLY at/above the floor; null below (non-quantifying) */
  peerCount: number | null;
  /**
   * Internal flag reason (e.g. 'below_floor_threshold'). Approver-only context —
   * the subject-facing views strip this. Null ⇒ render the generic flag banner.
   */
  flagReason: string | null;
  /**
   * The synthesis objections from the final attempt (why it flagged) — the gate +
   * judge issues, so the manager sees WHAT to address, not just THAT it's flagged.
   * Approver-only (no peer content); null when the draft wasn't flagged.
   */
  flagDetail: SynthesisIssue[] | null;
}

/** SoD-filtered queue — `approver_queue` excludes ineligible reviews by absence. */
export async function getApproverQueue(): Promise<QueueItem[]> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("approver_queue")
    .select("review_id, subject_name, subject_department, status, flagged_internal, below_floor, peer_count");
  const rows = data ?? [];

  // The queue view carries no timestamps; the approver has a direct SELECT grant
  // on `reviews` for their own rows (RLS: approver_id = current), so we read the
  // "Submitted {date}" (created_at) / "Finalized {date}" (revealed_at) / "Locked
  // {date}" (locked_at) metadata there. Keyed on the queue's own review ids ⇒ no
  // cross-tenant or SoD-barred row can ride in.
  const ids = rows.map((r) => r.review_id as string);
  const tsById = new Map<string, { created: string | null; revealed: string | null; locked: string | null }>();
  if (ids.length > 0) {
    const { data: ts } = await supabase
      .from("reviews")
      .select("id, created_at, revealed_at, locked_at")
      .in("id", ids);
    for (const t of ts ?? []) {
      tsById.set(t.id as string, {
        created: (t.created_at as string | null) ?? null,
        revealed: (t.revealed_at as string | null) ?? null,
        locked: (t.locked_at as string | null) ?? null,
      });
    }
  }

  return rows.map((r) => {
    const t = tsById.get(r.review_id as string);
    return {
      reviewId: r.review_id as string,
      subjectName: r.subject_name as string,
      department: (r.subject_department as string | null) ?? null,
      status: r.status as string,
      flaggedInternal: Boolean(r.flagged_internal),
      belowFloor: Boolean(r.below_floor),
      peerCount: (r.peer_count as number | null) ?? null,
      submittedAt: t?.created ?? null,
      finalizedAt: t?.revealed ?? null,
      lockedAt: t?.locked ?? null,
    };
  });
}

/**
 * The edit workspace for one review. RLS returns the `reviews` row ONLY to the
 * assigned approver (or admin); a non-assigned approver hand-typing the URL gets
 * nothing here — absence at the data layer (proven in probes.dbspec).
 */
export async function getWorkspace(reviewId: string): Promise<Workspace | null> {
  const supabase = await createRlsClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, status, rating, review_draft_id, flag_reason")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return null; // not the assigned approver → nothing crosses the wire

  const { data: draft } = await supabase
    .from("review_drafts")
    .select("sections, flagged, flag_detail")
    .eq("review_id", reviewId)
    .maybeSingle();
  const { data: q } = await supabase
    .from("approver_queue")
    .select("subject_name, subject_department, below_floor, peer_count")
    .eq("review_id", reviewId)
    .maybeSingle();

  // flag_detail holds the per-attempt objection log; surface the FINAL attempt's
  // issues (the ones that ultimately flagged it) — most actionable for the manager.
  const attemptIssues = (draft?.flag_detail as SynthesisIssue[][] | null) ?? null;
  const flagDetail = attemptIssues && attemptIssues.length > 0 ? attemptIssues[attemptIssues.length - 1] : null;

  return {
    reviewId,
    subjectName: (q?.subject_name as string | undefined) ?? "",
    department: (q?.subject_department as string | null) ?? null,
    status: review.status as string,
    rating: (review.rating as string | null) ?? null,
    narrative: (draft?.sections as NarrativeSections | null) ?? null,
    flagged: Boolean(draft?.flagged),
    belowFloor: Boolean(q?.below_floor),
    peerCount: (q?.peer_count as number | null) ?? null,
    flagReason: (review.flag_reason as string | null) ?? null,
    flagDetail: flagDetail && flagDetail.length > 0 ? flagDetail : null,
  };
}
