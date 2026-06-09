import "server-only";
import type { StructuralRole } from "@transforma/db";
import { createRlsClient } from "@/lib/supabase/server";

export interface CycleMeta {
  id: string;
  name: string;
  opensAt: string | null;
  closesAt: string | null;
}

export interface CycleMonitor {
  cycle: CycleMeta;
  // active lifecycle counts only (aborted is excluded from the active tiles)
  counts: { draft: number; "in-review": number; "awaiting-acknowledgement": number; locked: number; flagged: number };
  activeTotal: number;
}

export interface Participant {
  accountId: string;
  name: string;
  department: string | null;
  withdrawn: boolean;
}

const ACTIVE_STATUSES = ["draft", "in-review", "awaiting-acknowledgement", "locked", "flagged"] as const;

export async function getActiveCycle(): Promise<CycleMeta | null> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("cycles")
    .select("id, name, opens_at, closes_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    opensAt: (data.opens_at as string | null) ?? null,
    closesAt: (data.closes_at as string | null) ?? null,
  };
}

/**
 * Cycle-level oversight ONLY — `cycle_monitor` (admin RLS view) returns aggregate
 * status counts, never any review content or per-person row. We surface only the
 * active lifecycle tiles (aborted/withdrawn reviews drop out of the active view).
 */
export async function getCycleMonitor(): Promise<CycleMonitor | null> {
  const cycle = await getActiveCycle();
  if (!cycle) return null;
  const supabase = await createRlsClient();
  const { data } = await supabase.from("cycle_monitor").select("status, n").eq("cycle_id", cycle.id);
  const counts = { draft: 0, "in-review": 0, "awaiting-acknowledgement": 0, locked: 0, flagged: 0 };
  for (const row of data ?? []) {
    const s = row.status as string;
    if (s in counts) counts[s as keyof typeof counts] = (row.n as number) ?? 0;
  }
  const activeTotal = ACTIVE_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  return { cycle, counts, activeTotal };
}

/** Roster participants for the mid-cycle action pickers (admin read). */
export async function getParticipants(cycleId: string): Promise<Participant[]> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("roster_members")
    .select("account_id, display_name, department, withdrawn_at")
    .eq("cycle_id", cycleId)
    .not("account_id", "is", null)
    .order("display_name");
  return (data ?? []).map((r) => ({
    accountId: r.account_id as string,
    name: r.display_name as string,
    department: (r.department as string | null) ?? null,
    withdrawn: r.withdrawn_at !== null,
  }));
}

export type RoleLabels = Record<StructuralRole, string>;

export async function getRoleLabels(): Promise<RoleLabels> {
  const supabase = await createRlsClient();
  const { data } = await supabase.from("companies").select("role_labels").limit(1).maybeSingle();
  const l = (data?.role_labels ?? {}) as Partial<RoleLabels>;
  return {
    subject: l.subject ?? "subject",
    peer: l.peer ?? "peer",
    approver: l.approver ?? "approver",
    admin: l.admin ?? "admin",
  };
}

export interface CycleDefaults {
  feedbackDeadlineDays: number;
  peerAnonymityThreshold: number;
  maxPeerNominations: number;
  ackWindowDays: number;
}

export async function getCycleDefaults(): Promise<CycleDefaults> {
  const supabase = await createRlsClient();
  const { data } = await supabase.from("companies").select("default_settings").limit(1).maybeSingle();
  const s = (data?.default_settings ?? {}) as Record<string, unknown>;
  const num = (k: string, d: number) => (typeof s[k] === "number" ? (s[k] as number) : d);
  return {
    feedbackDeadlineDays: num("feedbackDeadlineDays", 14),
    peerAnonymityThreshold: num("peerAnonymityThreshold", 3),
    maxPeerNominations: num("maxPeerNominations", 5),
    ackWindowDays: num("ackWindowDays", 7),
  };
}
