"use server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@transforma/db";
import { requireSession } from "@/lib/auth/session";
import { getMyReviewStatus } from "@/lib/subject/data";
import { createRlsClient } from "@/lib/supabase/server";

/**
 * PROC-05 subject tail. Records the response BESIDE the review (subject's own
 * row, RLS-allowed) then commits the permanent lock via `app.commit_lock` (the
 * ONLY locker; service-role-only). The lock fires strictly AFTER reveal —
 * commit_lock itself rejects anything not in `awaiting-acknowledgement`.
 * "Acknowledging is not agreeing": ack and respond differ only in the stored
 * outcome; both lock.
 */
async function lockWithResponse(
  reviewId: string,
  outcome: "acknowledged" | "responded",
  body: string | null,
) {
  const session = await requireSession();

  const status = await getMyReviewStatus();
  if (!status || status.reviewId !== reviewId || status.displayStatus !== "awaiting-acknowledgement") {
    throw new Error("This review is not awaiting your acknowledgement.");
  }

  const rls = await createRlsClient();
  const { error: respErr } = await rls.from("employee_responses").insert({
    company_id: session.companyId,
    review_id: reviewId,
    employee_id: session.accountId,
    outcome,
    body,
  });
  if (respErr) throw new Error(respErr.message);

  const svc = createServiceRoleClient();
  const { error: lockErr } = await svc
    .schema("app")
    .rpc("commit_lock", { p_review_id: reviewId, p_reason: outcome });
  if (lockErr) throw new Error(lockErr.message);

  revalidatePath("/review");
}

export async function acknowledgeReview(reviewId: string, response?: string) {
  const body = response && response.trim().length > 0 ? response.trim() : null;
  await lockWithResponse(reviewId, "acknowledged", body);
}

export async function respondToReview(reviewId: string, body: string) {
  if (!body || body.trim().length === 0) {
    throw new Error("A written response is required.");
  }
  await lockWithResponse(reviewId, "responded", body.trim());
}
