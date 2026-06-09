import "server-only";
import type { NarrativeSections } from "@transforma/review-core";
import { createRlsClient } from "@/lib/supabase/server";

export interface QueueItem {
  reviewId: string;
  subjectName: string;
  department: string | null;
  status: string;
  flaggedInternal: boolean;
  belowFloor: boolean;
  /** exact count ONLY at/above the floor; null below (non-quantifying) */
  peerCount: number | null;
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
}

/** SoD-filtered queue — `approver_queue` excludes ineligible reviews by absence. */
export async function getApproverQueue(): Promise<QueueItem[]> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("approver_queue")
    .select("review_id, subject_name, subject_department, status, flagged_internal, below_floor, peer_count");
  return (data ?? []).map((r) => ({
    reviewId: r.review_id as string,
    subjectName: r.subject_name as string,
    department: (r.subject_department as string | null) ?? null,
    status: r.status as string,
    flaggedInternal: Boolean(r.flagged_internal),
    belowFloor: Boolean(r.below_floor),
    peerCount: (r.peer_count as number | null) ?? null,
  }));
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
    .select("id, status, rating, review_draft_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return null; // not the assigned approver → nothing crosses the wire

  const { data: draft } = await supabase
    .from("review_drafts")
    .select("sections, flagged")
    .eq("review_id", reviewId)
    .maybeSingle();
  const { data: q } = await supabase
    .from("approver_queue")
    .select("subject_name, subject_department, below_floor, peer_count")
    .eq("review_id", reviewId)
    .maybeSingle();

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
  };
}
