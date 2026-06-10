import "server-only";
import type { StructuralRole } from "@transforma/db";
import { createRlsClient } from "@/lib/supabase/server";

export interface CycleMeta {
  id: string;
  name: string;
  opensAt: string | null;
  closesAt: string | null;
}

export interface Milestone {
  label: string;
  done: number;
  total: number;
}

export interface CycleMonitor {
  cycle: CycleMeta;
  // active lifecycle counts only (aborted is excluded from the active tiles)
  counts: { draft: number; "in-review": number; "awaiting-acknowledgement": number; locked: number; flagged: number };
  activeTotal: number;
  // roster size — an aggregate admin read, never per-person content
  participants: number;
  // whole-number days remaining until the cycle closes (null when no close date)
  daysLeft: number | null;
  // aggregate progress meters derived from status counts + roster size ONLY.
  // (Admins cannot read peer_feedback — confidentiality — so every meter is a
  //  no-content lifecycle aggregate, consistent with the cycle_monitor fence.)
  milestones: Milestone[];
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

  // Roster size — an admin-readable aggregate (HEAD count), no per-person content.
  const { count } = await supabase
    .from("roster_members")
    .select("id", { count: "exact", head: true })
    .eq("cycle_id", cycle.id);
  const participants = count ?? 0;
  const total = participants > 0 ? participants : activeTotal;

  // Days remaining until close (timestamp-derived; the rig masks it).
  let daysLeft: number | null = null;
  if (cycle.closesAt) {
    const ms = new Date(cycle.closesAt).getTime() - Date.now();
    daysLeft = Math.max(0, Math.ceil(ms / 86_400_000));
  }

  // Aggregate, no-content progress meters. Self-reviews are "in" once a review
  // leaves draft; decisions are "done" once finalized (awaiting-ack or locked).
  // Peer feedback is shown as a lifecycle proxy (reviews that reached review or
  // beyond) because admins cannot read peer_feedback rows by design.
  const pastDraft = counts["in-review"] + counts["awaiting-acknowledgement"] + counts.locked + counts.flagged;
  const decided = counts["awaiting-acknowledgement"] + counts.locked;
  const milestones: Milestone[] = [
    { label: "Self-reviews", done: pastDraft, total },
    { label: "Peer feedback", done: pastDraft, total },
    { label: "Manager decisions", done: decided, total },
  ];

  return { cycle, counts, activeTotal, participants, daysLeft, milestones };
}

export interface CycleSetupData {
  name: string;
  opensAt: string | null;
  closesAt: string | null;
  peerRange: string; // "2–3" | "3–5" | "Open"
  ackWindowDays: number; // 3 | 7 | 14
  overridesCompanyDefaults: boolean;
}

/** The current cycle's setup fields (name, window, and the operational knobs that
 *  live in cycles.settings jsonb). Returns null when no cycle exists yet — the
 *  Setup form then seeds with the prototype's placeholder defaults. */
export async function getCycleSetup(): Promise<CycleSetupData | null> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("cycles")
    .select("name, opens_at, closes_at, settings")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const s = (data.settings ?? {}) as Record<string, unknown>;
  return {
    name: data.name as string,
    opensAt: (data.opens_at as string | null) ?? null,
    closesAt: (data.closes_at as string | null) ?? null,
    peerRange: typeof s.peerRange === "string" ? (s.peerRange as string) : "3–5",
    ackWindowDays: typeof s.ackWindowDays === "number" ? (s.ackWindowDays as number) : 7,
    overridesCompanyDefaults: s.overridesCompanyDefaults !== false,
  };
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
