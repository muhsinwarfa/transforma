import "server-only";
import { createRlsClient } from "@/lib/supabase/server";

export interface NominationSetRow {
  cycleId: string;
  employeeId: string;
  subjectName: string;
  /** subject's roster department (for the queue row meta) */
  department: string | null;
  /** set_status from nomination_sets (the whole set is kept uniform) */
  status: string;
  nomineeCount: number;
}

export interface Nominee {
  accountId: string;
  name: string;
  department: string | null;
}

export interface NominationDetail {
  cycleId: string;
  employeeId: string;
  subjectName: string;
  department: string | null;
  status: string;
  nominees: Nominee[];
  managerNote: string | null;
  /** the anonymity floor (>= 3) — encouraged, not enforced at approval */
  minPeers: number;
  maxPeers: number;
}

/**
 * The manager's nomination-approval queue. `nomination_sets` (RLS view) returns
 * only sets the signed-in account is the approver/manager of — a manager never
 * sees another manager's reports' nominations (absence at the data layer).
 */
export async function getNominationQueue(): Promise<NominationSetRow[]> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("nomination_sets")
    .select("cycle_id, employee_id, subject_name, set_status, nominee_count");
  const rows = data ?? [];

  // The set view carries no department; resolve it from `roster_members` keyed on
  // the queue's own subject ids (the approver has a roster_members read for their
  // reports). Keyed on ids already surfaced ⇒ nothing cross-tenant rides in.
  const ids = rows.map((r) => r.employee_id as string);
  const deptOf = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: members } = await supabase
      .from("roster_members")
      .select("account_id, department")
      .in("account_id", ids);
    for (const m of members ?? []) {
      deptOf.set(m.account_id as string, (m.department as string | null) ?? null);
    }
  }

  return rows.map((r) => ({
    cycleId: r.cycle_id as string,
    employeeId: r.employee_id as string,
    subjectName: r.subject_name as string,
    department: deptOf.get(r.employee_id as string) ?? null,
    status: r.set_status as string,
    nomineeCount: (r.nominee_count as number) ?? 0,
  }));
}

/**
 * One subject's nominated peer set, for the approve / request-changes screen.
 * Resolves the cycle from `nomination_sets` (so the URL only needs employeeId);
 * returns null when the set isn't this approver's to act on — absence, not a
 * hidden row. Exposes nominee NAMES only (peer SELECTION, pre-feedback) — never
 * the self-review or any feedback content.
 */
export async function getNominationDetail(employeeId: string): Promise<NominationDetail | null> {
  const supabase = await createRlsClient();
  const { data: sets } = await supabase
    .from("nomination_sets")
    .select("cycle_id, subject_name, set_status")
    .eq("employee_id", employeeId)
    .limit(1);
  const set = sets?.[0];
  if (!set) return null; // not this approver's report → nothing crosses the wire
  const cycleId = set.cycle_id as string;

  const { data: noms } = await supabase
    .from("nominations")
    .select("nominee_account_id, status, manager_note")
    .eq("cycle_id", cycleId)
    .eq("employee_id", employeeId);
  const nomineeIds = (noms ?? []).map((n) => n.nominee_account_id as string);

  const ids = [employeeId, ...nomineeIds];
  const { data: accounts } = await supabase.from("accounts").select("id, display_name").in("id", ids);
  const { data: members } = await supabase
    .from("roster_members")
    .select("account_id, department")
    .eq("cycle_id", cycleId)
    .in("account_id", ids);
  const nameOf = new Map((accounts ?? []).map((a) => [a.id as string, a.display_name as string]));
  const deptOf = new Map((members ?? []).map((m) => [m.account_id as string, (m.department as string | null) ?? null]));

  const [thr, maxRaw] = await Promise.all([
    supabase.schema("app").rpc("effective_threshold", { p_cycle: cycleId }),
    supabase.schema("app").rpc("effective_setting", { p_cycle: cycleId, p_key: "maxPeerNominations" }),
  ]);

  return {
    cycleId,
    employeeId,
    subjectName: (set.subject_name as string) ?? nameOf.get(employeeId) ?? "",
    department: deptOf.get(employeeId) ?? null,
    status: (set.set_status as string) ?? "pending",
    nominees: nomineeIds.map((id) => ({ accountId: id, name: nameOf.get(id) ?? "", department: deptOf.get(id) ?? null })),
    managerNote: ((noms ?? []).find((n) => n.manager_note)?.manager_note as string | null) ?? null,
    minPeers: (thr.data as number | null) ?? 3,
    maxPeers: maxRaw.data ? Number.parseInt(maxRaw.data as unknown as string, 10) || 5 : 5,
  };
}
