"use server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@transforma/db";
import { requireSession } from "@/lib/auth/session";
import { REQUIRED_PEER_PROMPT_IDS, sanitizeAnswers, type PeerAnswers } from "@/lib/peer/feedback";
import { createRlsClient } from "@/lib/supabase/server";

async function audit(
  companyId: string,
  action: string,
  actor: string,
  reviewId: string,
  target: object = {},
) {
  try {
    await createServiceRoleClient()
      .schema("app")
      .rpc("append_audit", { p_company: companyId, p_action: action, p_actor: actor, p_review: reviewId, p_target: target });
  } catch {
    /* best-effort */
  }
}

/**
 * Completion-driven synthesis (PROC-04 ruling): once this peer resolves their
 * request (submit or decline), the review's inputs may now be complete — the
 * self-review is submitted and every approved peer has resolved. Fire the
 * completion check; app.close_feedback runs only if complete (it self-skips
 * otherwise). Best-effort: the feedback-deadline cron remains the fallback sweep,
 * so a hiccup here never blocks the peer's action or strands the review.
 */
async function maybeTriggerSynthesis(reviewId: string) {
  try {
    await createServiceRoleClient().schema("app").rpc("maybe_close_on_completion", { p_review_id: reviewId });
  } catch {
    /* best-effort; the deadline sweep is the fallback */
  }
}

/**
 * Autosave a draft. Touches ONLY this peer's own peer_feedback row — the
 * single-author RLS (peer_account_id = current, state in 'new'|'draft') is the
 * floor; we never read or write the self-review, the draft, or anyone else's row.
 * Keys are constrained to the known prompts.
 */
export async function savePeerFeedback(reviewId: string, answers: PeerAnswers) {
  await requireSession();
  const supabase = await createRlsClient();
  const { error } = await supabase
    .from("peer_feedback")
    .update({ responses: sanitizeAnswers(answers), state: "draft" })
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
}

export async function submitPeerFeedback(reviewId: string, answers: PeerAnswers) {
  const session = await requireSession();
  const clean = sanitizeAnswers(answers);
  const missing = REQUIRED_PEER_PROMPT_IDS.filter((id) => !(clean[id] ?? "").trim());
  if (missing.length > 0) throw new Error("Please answer the required prompts before submitting.");

  const supabase = await createRlsClient();
  // RLS allows UPDATE only while state in ('new','draft'); a re-submit on an
  // already-submitted row matches zero rows (fail-closed, no un-submit).
  const { error } = await supabase
    .from("peer_feedback")
    .update({ responses: clean, state: "submitted", submitted_at: new Date().toISOString() })
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
  await audit(session.companyId, "peer_feedback_submitted", session.accountId, reviewId);
  await maybeTriggerSynthesis(reviewId);
  revalidatePath("/peer");
  revalidatePath(`/peer/${reviewId}`);
}

export async function declinePeerFeedback(reviewId: string, reason?: string) {
  const session = await requireSession();
  const supabase = await createRlsClient();
  const { error } = await supabase
    .from("peer_feedback")
    .update({ state: "declined", declined_at: new Date().toISOString() })
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
  // The schema has no decline-reason column; rather than silently drop the chosen
  // reason, it rides into the append_audit target jsonb (no schema change).
  const trimmed = reason?.trim();
  await audit(
    session.companyId,
    "peer_feedback_declined",
    session.accountId,
    reviewId,
    trimmed ? { reason: trimmed } : {},
  );
  // A decline RESOLVES this peer's request — the review may now be input-complete.
  await maybeTriggerSynthesis(reviewId);
  revalidatePath("/peer");
  revalidatePath(`/peer/${reviewId}`);
}
