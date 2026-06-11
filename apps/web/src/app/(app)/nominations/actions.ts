"use server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@transforma/db";
import { TransformaError } from "@transforma/review-core";
import { requireRole } from "@/lib/auth/session";
import { createRlsClient } from "@/lib/supabase/server";

// best-effort audit beside the RLS-gated write (approve audits atomically inside
// app.approve_nominations; this is only for request-changes).
async function audit(companyId: string, action: string, actor: string, reviewId: string | null, target: object = {}) {
  try {
    await createServiceRoleClient()
      .schema("app")
      .rpc("append_audit", { p_company: companyId, p_action: action, p_actor: actor, p_review: reviewId, p_target: target });
  } catch {
    /* best-effort */
  }
}

/**
 * PROC-02 approve. The whole multi-table write — create the roster (=> rosterId),
 * record roster_peers, attach reviews.roster_id, open the feedback window, SEED
 * one private peer_feedback request per peer, flip nominations to 'approved', and
 * audit — runs atomically inside app.approve_nominations, which RE-ASSERTS the
 * actor is the approver/manager (the service role bypasses RLS, so the function
 * does not trust the caller). We still requireRole('approver') at the edge.
 */
export async function approveNominations(cycleId: string, employeeId: string) {
  const session = await requireRole("approver");
  const svc = createServiceRoleClient();
  const { error } = await svc.schema("app").rpc("approve_nominations", {
    p_cycle: cycleId,
    p_employee: employeeId,
    p_actor: session.accountId,
  });
  if (error) throw new TransformaError("ERR_FORBIDDEN", error.message, 403);
  revalidatePath("/nominations");
  revalidatePath(`/nominations/${employeeId}`);
  // Approval moves the subject's nominate/timeline/hub state to "approved";
  // revalidate their surfaces so a fresh navigation reflects it.
  revalidatePath("/review/nominate");
  revalidatePath("/review");
  revalidatePath("/home");
}

/**
 * PROC-02 request changes — return the set to the subject with a note. No roster
 * is created (so the subject's edit-lock stays open and they can resubmit). The
 * whole set is flipped uniformly to 'changes_requested' under the approver RLS
 * UPDATE policy (no service-role needed).
 */
export async function requestNominationChanges(cycleId: string, employeeId: string, note: string) {
  const session = await requireRole("approver");
  const trimmed = note.trim();
  if (!trimmed) throw new Error("A note is required so they know what to change.");
  const supabase = await createRlsClient();
  const { error } = await supabase
    .from("nominations")
    .update({ status: "changes_requested", manager_note: trimmed })
    .eq("cycle_id", cycleId)
    .eq("employee_id", employeeId);
  if (error) throw new Error(error.message);

  const { data: review } = await supabase
    .from("reviews")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  await audit(session.companyId, "nomination_changes_requested", session.accountId, (review?.id as string) ?? null);

  revalidatePath("/nominations");
  revalidatePath(`/nominations/${employeeId}`);
  // The send-back moves the subject's state to changes-requested; revalidate their
  // surfaces so a fresh navigation leaves any cached "sent for approval" view and
  // lands on the editable form (with the manager's note).
  revalidatePath("/review/nominate");
  revalidatePath("/review");
  revalidatePath("/home");
}
