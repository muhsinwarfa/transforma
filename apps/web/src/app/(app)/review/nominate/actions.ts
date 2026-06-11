"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createRlsClient } from "@/lib/supabase/server";

/**
 * PROC-02 — the subject submits/resubmits peer nominations for approval.
 *
 * Watch items honored:
 *  - APPROVED ROSTER CAN'T BE SILENTLY RE-EDITED: rejected here on the write path
 *    AND structurally by RLS (the subject insert/update/delete policies require no
 *    `rosters` row yet — migration 0500). Belt and suspenders.
 *  - ENCOURAGES BUT DOESN'T BLOCK BELOW THE FLOOR: any count up to max submits;
 *    below the floor simply flows to the self-only path at feedback compile.
 */
export async function submitNominations(selectedIds: string[]) {
  const session = await requireSession();
  const supabase = await createRlsClient();

  const { data: status } = await supabase
    .from("subject_review_status")
    .select("review_id, cycle_id")
    .maybeSingle();
  if (!status) throw new Error("No active review to nominate for.");
  const cycleId = status.cycle_id as string;

  // approved-edit guard (explicit): once a roster exists, nominations are closed
  const { data: roster } = await supabase.from("rosters").select("id").eq("cycle_id", cycleId).maybeSingle();
  if (roster) throw new Error("Your peer reviewers are already approved and can no longer be changed.");

  const maxVal = await supabase.schema("app").rpc("effective_setting", { p_cycle: cycleId, p_key: "maxPeerNominations" });
  const max = maxVal.data ? Number.parseInt(maxVal.data as unknown as string, 10) || 5 : 5;
  const unique = Array.from(new Set(selectedIds));
  if (unique.length > max) throw new Error(`You can nominate at most ${max} people.`);

  // replace the pending set (delete then insert). RLS blocks both if approved.
  const { error: delErr } = await supabase.from("nominations").delete().eq("cycle_id", cycleId).eq("employee_id", session.accountId);
  if (delErr) throw new Error(delErr.message);

  if (unique.length > 0) {
    const rows = unique.map((nomineeId) => ({
      company_id: session.companyId,
      cycle_id: cycleId,
      employee_id: session.accountId,
      nominee_account_id: nomineeId,
      status: "pending" as const,
    }));
    const { error: insErr } = await supabase.from("nominations").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }

  revalidatePath("/review/nominate");
  revalidatePath("/review"); // the status timeline
  revalidatePath("/home"); // the hub task card
}
