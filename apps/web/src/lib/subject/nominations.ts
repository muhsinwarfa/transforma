import "server-only";
import { createRlsClient } from "@/lib/supabase/server";

export type NominationStatus = "not-started" | "pending" | "approved" | "changes_requested";

export interface Candidate {
  accountId: string;
  name: string;
  department: string | null;
}

export interface NominationData {
  reviewId: string;
  cycleId: string;
  status: NominationStatus;
  selectedIds: string[];
  candidates: Candidate[];
  managerNote: string | null;
  min: number;
  max: number;
}

export async function getNominationData(): Promise<NominationData | null> {
  const supabase = await createRlsClient();
  const { data: status } = await supabase
    .from("subject_review_status")
    .select("review_id, cycle_id")
    .maybeSingle();
  if (!status) return null;
  const cycleId = status.cycle_id as string;

  const [{ data: cand }, { data: noms }, { data: roster }, { data: minVal }, { data: maxVal }] =
    await Promise.all([
      supabase.from("nomination_candidates").select("candidate_account_id, display_name, department").eq("cycle_id", cycleId),
      supabase.from("nominations").select("nominee_account_id, status, manager_note").eq("cycle_id", cycleId),
      supabase.from("rosters").select("id").eq("cycle_id", cycleId).maybeSingle(),
      supabase.schema("app").rpc("effective_threshold", { p_cycle: cycleId }),
      supabase.schema("app").rpc("effective_setting", { p_cycle: cycleId, p_key: "maxPeerNominations" }),
    ]);

  const nomRows = noms ?? [];
  let nominationStatus: NominationStatus = "not-started";
  if (roster) nominationStatus = "approved";
  else if (nomRows.some((n) => n.status === "changes_requested")) nominationStatus = "changes_requested";
  else if (nomRows.length > 0) nominationStatus = "pending";

  const managerNote = (nomRows.find((n) => (n.manager_note as string | null)?.trim())?.manager_note as
    | string
    | null) ?? null;

  return {
    reviewId: status.review_id as string,
    cycleId,
    status: nominationStatus,
    selectedIds: nomRows.map((n) => n.nominee_account_id as string),
    candidates: (cand ?? []).map((c) => ({
      accountId: c.candidate_account_id as string,
      name: c.display_name as string,
      department: (c.department as string | null) ?? null,
    })),
    managerNote,
    min: typeof minVal === "number" ? minVal : 3,
    max: maxVal ? Number.parseInt(maxVal as unknown as string, 10) || 5 : 5,
  };
}
