"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { SELF_PROMPTS, type SelfAnswers } from "@/lib/subject/selfReview";
import { createRlsClient } from "@/lib/supabase/server";

/**
 * PROC-03 self-review. Collected IN PARALLEL with peer feedback — there is no
 * gate here on peer-feedback state (no "self before peers"). It is the subject's
 * own row; RLS keeps it readable by the subject + admin only (a peer never gains
 * a read path — proven by the DB probe).
 */
async function upsertSelf(answers: SelfAnswers, submit: boolean) {
  const session = await requireSession();
  const supabase = await createRlsClient();
  const { data: status } = await supabase
    .from("subject_review_status")
    .select("review_id, cycle_id")
    .maybeSingle();
  if (!status) throw new Error("No active review.");

  const payload: Record<string, unknown> = {
    company_id: session.companyId,
    cycle_id: status.cycle_id,
    employee_id: session.accountId,
    review_id: status.review_id,
    sections: answers,
    state: submit ? "submitted" : "draft",
  };
  if (submit) payload.submitted_at = new Date().toISOString();

  const { error } = await supabase.from("self_reviews").upsert(payload, { onConflict: "cycle_id,employee_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/review/self");
}

export async function saveSelfReview(answers: SelfAnswers) {
  await upsertSelf(answers, false);
}

export async function submitSelfReview(answers: SelfAnswers) {
  const missing = SELF_PROMPTS.some((p) => !(answers[p.id] ?? "").trim());
  if (missing) throw new Error("Answer all prompts before submitting.");
  await upsertSelf(answers, true);
}
