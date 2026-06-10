"use server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@transforma/db";
import { TransformaError } from "@transforma/review-core";
import { getAdminReviewContent, type ReviewContent } from "@/lib/admin/content";
import { requireRole } from "@/lib/auth/session";
import { pgQuery } from "@/lib/db/pg";
import { createRlsClient } from "@/lib/supabase/server";

const STRUCTURAL_ROLES = ["subject", "peer", "approver", "admin"] as const;

async function activeCycleId(): Promise<string> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("cycles")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No active cycle.");
  return data.id as string;
}

async function reviewIdFor(cycleId: string, employeeId: string): Promise<string> {
  // Admins no longer have RLS read of `reviews` (1300 — aggregate-only oversight),
  // so resolve the review id via the service-role client. This only reads the id;
  // the PROC-06 definer functions re-assert the actor is an admin before acting.
  const { data } = await createServiceRoleClient()
    .from("reviews")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!data) throw new TransformaError("ERR_REVIEW_NOT_FOUND", "No review for that participant.", 404);
  return data.id as string;
}

// ── cycle setup — write the cycles row via the EXISTING cycles_admin_write RLS ─
// (migration 0400 grants admins full write to their own company's cycles). We
// persist the basics (name, window) as columns and the operational knobs (peer
// range, ack window, the per-cycle override flag) into cycles.settings jsonb —
// the per-cycle override of company defaults the contract describes. The DB CHECK
// `cycle_anonymity_threshold_min` backstops the anonymity floor (>= 3).
export interface CycleSettingsInput {
  name: string;
  opensAt: string | null; // ISO or null when unparseable
  closesAt: string | null;
  peerRange: string; // "2–3" | "3–5" | "Open"
  ackWindowDays: number; // 3 | 7 | 14
  overridesCompanyDefaults: boolean;
}

export async function saveCycleSettings(input: CycleSettingsInput): Promise<{ id: string }> {
  const session = await requireRole("admin");
  const name = input.name.trim();
  if (!name) throw new Error("A cycle name is required.");

  const settings = {
    peerRange: input.peerRange,
    ackWindowDays: input.ackWindowDays,
    overridesCompanyDefaults: input.overridesCompanyDefaults,
  };

  const supabase = await createRlsClient();
  // Update the most recent cycle if one exists; otherwise create it. The RLS
  // policy re-asserts company + admin on every path, so this fails closed.
  const { data: existing } = await supabase
    .from("cycles")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("cycles")
      .update({ name, opens_at: input.opensAt, closes_at: input.closesAt, settings, updated_at: new Date().toISOString() })
      .eq("id", existing.id as string);
    if (error) throw new Error(error.message);
    await createServiceRoleClient()
      .schema("app")
      .rpc("append_audit", { p_company: session.companyId, p_action: "cycle_settings_changed", p_actor: session.accountId, p_review: null, p_target: {} })
      .then(undefined, () => {});
    revalidatePath("/admin/cycle");
    return { id: existing.id as string };
  }

  const { data: created, error } = await supabase
    .from("cycles")
    .insert({ company_id: session.companyId, name, opens_at: input.opensAt, closes_at: input.closesAt, status: "draft", settings })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await createServiceRoleClient()
    .schema("app")
    .rpc("append_audit", { p_company: session.companyId, p_action: "cycle_settings_changed", p_actor: session.accountId, p_review: null, p_target: {} })
    .then(undefined, () => {});
  revalidatePath("/admin/cycle");
  return { id: created.id as string };
}

// ── PROC-MAIN: start the cycle (eager fan-out) ──────────────────────────────
export async function startCycleFanout() {
  const session = await requireRole("admin");
  const cycleId = await activeCycleId();
  const { error } = await createServiceRoleClient()
    .schema("app")
    .rpc("start_cycle_fanout", { p_cycle: cycleId, p_actor: session.accountId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cycle");
}

// ── PROC-06 (a) reassign approver (re-passes SoD inside the function) ────────
export async function reassignApprover(employeeId: string, newApproverId: string) {
  const session = await requireRole("admin");
  const cycleId = await activeCycleId();
  const reviewId = await reviewIdFor(cycleId, employeeId);
  const { error } = await createServiceRoleClient()
    .schema("app")
    .rpc("reassign_approver", { p_review_id: reviewId, p_new_approver: newApproverId, p_actor: session.accountId });
  if (error) throw new TransformaError("ERR_SOD_INELIGIBLE", error.message, 409);
  revalidatePath("/admin/settings");
}

// ── PROC-06 (b) extend one subject's deadline ───────────────────────────────
export async function extendDeadline(employeeId: string, kind: "feedback" | "ack", newIso: string) {
  const session = await requireRole("admin");
  const cycleId = await activeCycleId();
  const reviewId = await reviewIdFor(cycleId, employeeId);
  const { error } = await createServiceRoleClient()
    .schema("app")
    .rpc("extend_deadline", { p_review_id: reviewId, p_kind: kind, p_new: newIso, p_actor: session.accountId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
}

// ── PROC-06 (c) withdraw a departed subject ─────────────────────────────────
export async function withdrawSubject(employeeId: string) {
  const session = await requireRole("admin");
  const cycleId = await activeCycleId();
  const { error } = await createServiceRoleClient()
    .schema("app")
    .rpc("withdraw_subject", { p_cycle: cycleId, p_employee: employeeId, p_actor: session.accountId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/cycle");
}

// ── role labels (companies.role_labels — the tenant-config the whole UI reads) ─
// A tenant label is rendered on every user-facing surface, so it must obey the
// same brand rule the build-time contract lint enforces (forbidden brand / model
// terms never appear). Reject them at the write chokepoint — a label is data, not
// source the lint can scan. The denylist below must name the terms it forbids, so
// its line carries the lint's own escape marker.
const FORBIDDEN_LABEL = [/\bAI\b/i, /artificial intelligence/i, /\banthropic\b/i, /\bclaude\b/i]; // contract-lint-ignore

export async function saveRoleLabels(labels: Record<string, string>) {
  const session = await requireRole("admin");
  const clean: Record<string, string> = {};
  for (const r of STRUCTURAL_ROLES) {
    const v = (labels[r] ?? "").trim();
    if (!v) throw new Error(`A label for ${r} is required.`);
    if (FORBIDDEN_LABEL.some((re) => re.test(v)))
      throw new Error(`The label for ${r} can't reference the underlying system.`);
    clean[r] = v;
  }
  const supabase = await createRlsClient();
  const { error } = await supabase.from("companies").update({ role_labels: clean }).eq("id", session.companyId);
  if (error) throw new Error(error.message);
  await createServiceRoleClient()
    .schema("app")
    .rpc("append_audit", { p_company: session.companyId, p_action: "role_labels_changed", p_actor: session.accountId, p_review: null, p_target: {} })
    .then(undefined, () => {});
  revalidatePath("/", "layout"); // labels are read app-wide
}

// ── company default settings (per-cycle override lives elsewhere) ───────────
export async function saveCycleDefaults(d: {
  feedbackDeadlineDays: number;
  peerAnonymityThreshold: number;
  maxPeerNominations: number;
  ackWindowDays: number;
}) {
  const session = await requireRole("admin");
  const settings = {
    feedbackDeadlineDays: Math.max(1, Math.floor(d.feedbackDeadlineDays)),
    peerAnonymityThreshold: Math.max(3, Math.floor(d.peerAnonymityThreshold)), // hard floor 3 (DB CHECK backstops)
    maxPeerNominations: Math.max(1, Math.floor(d.maxPeerNominations)),
    ackWindowDays: Math.max(1, Math.floor(d.ackWindowDays)),
  };
  const supabase = await createRlsClient();
  // MERGE, never replace — preserve other keys (e.g. retentionDays, the data-
  // protection retention window) that this form doesn't edit.
  const { data: cur } = await supabase
    .from("companies")
    .select("default_settings")
    .eq("id", session.companyId)
    .maybeSingle();
  const merged = { ...((cur?.default_settings as Record<string, unknown>) ?? {}), ...settings };
  const { error } = await supabase.from("companies").update({ default_settings: merged }).eq("id", session.companyId);
  if (error) throw new Error(error.message);
  await createServiceRoleClient()
    .schema("app")
    .rpc("append_audit", { p_company: session.companyId, p_action: "cycle_settings_changed", p_actor: session.accountId, p_review: null, p_target: {} })
    .then(undefined, () => {});
  revalidatePath("/admin/settings");
}

// ── roster CSV import — validate EVERY row; import NOTHING until all valid ───
export interface RowError {
  row: number;
  col: string;
  msg: string;
  value: string;
}
export interface RosterRow {
  name: string;
  email: string;
  role: string;
  manager: string;
  department: string;
}
export interface ImportResult {
  ok: boolean;
  imported: number;
  errors: RowError[];
  // a small preview of the imported rows (for the success table); only set on ok
  rows: RosterRow[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function importRoster(csvText: string): Promise<ImportResult> {
  const session = await requireRole("admin");
  const cycleId = await activeCycleId();

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { ok: false, imported: 0, errors: [{ row: 0, col: "file", msg: "No data rows found.", value: "" }], rows: [] };

  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const need = ["name", "email", "role", "manager", "department"];
  const missing = need.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { ok: false, imported: 0, errors: [{ row: 1, col: "header", msg: `Missing columns: ${missing.join(", ")}`, value: header.join(",") }], rows: [] };
  }
  const idx = Object.fromEntries(need.map((c) => [c, header.indexOf(c)]));

  const errors: RowError[] = [];
  const rows: { name: string; email: string; role: string; manager: string; department: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",").map((c) => c.trim());
    const name = cells[idx.name!] ?? "";
    const email = (cells[idx.email!] ?? "").toLowerCase();
    const role = (cells[idx.role!] ?? "").toLowerCase();
    const manager = cells[idx.manager!] ?? "";
    const department = cells[idx.department!] ?? "";
    if (!name) errors.push({ row: i + 1, col: "name", msg: "Name is required.", value: cells.join(",") });
    if (!EMAIL_RE.test(email)) errors.push({ row: i + 1, col: "email", msg: "Invalid email.", value: email });
    if (!(STRUCTURAL_ROLES as readonly string[]).includes(role))
      errors.push({ row: i + 1, col: "role", msg: `Role must be one of ${STRUCTURAL_ROLES.join("/")}.`, value: role });
    rows.push({ name, email, role, manager, department });
  }
  // nothing is imported until EVERY row is valid (contract: validate-before-import)
  if (errors.length > 0) return { ok: false, imported: 0, errors, rows: [] };

  for (const r of rows) {
    await pgQuery(
      `insert into roster_members (company_id, cycle_id, email, display_name, department, manager_ref, structural_roles)
         values ($1,$2,$3,$4,$5,$6, array[$7]::app_role[])
       on conflict (cycle_id, lower(email)) do update
         set display_name = excluded.display_name, department = excluded.department,
             manager_ref = excluded.manager_ref, structural_roles = excluded.structural_roles, updated_at = now()`,
      [session.companyId, cycleId, r.email, r.name, r.department || null, r.manager || null, r.role],
    );
  }
  await createServiceRoleClient()
    .schema("app")
    .rpc("append_audit", { p_company: session.companyId, p_action: "roster_imported", p_actor: session.accountId, p_review: null, p_target: { count: rows.length } })
    .then(undefined, () => {});
  revalidatePath("/admin/roster");
  return { ok: true, imported: rows.length, errors: [], rows };
}

// ── admin content access — the gated, audited read path (migrations 1800/1900) ─
// A read needs BOTH the company setting ON and the per-account capability; the DB
// fails closed and audits every successful content read. These actions manage the
// two gates; the read itself is `readReviewContent` below.

/** Open ONE review's content. Audited in the DB (admin_content_view). Returns
 *  null if this admin lacks the capability or the setting is off. */
export async function readReviewContent(reviewId: string): Promise<ReviewContent | null> {
  await requireRole("admin");
  return getAdminReviewContent(reviewId);
}

/** Flip the company-wide adminContentAccessEnabled setting (default on). */
export async function saveAdminContentAccess(enabled: boolean) {
  const session = await requireRole("admin");
  const supabase = await createRlsClient();
  const { data: cur } = await supabase
    .from("companies")
    .select("default_settings")
    .eq("id", session.companyId)
    .maybeSingle();
  // MERGE — never drop the other settings keys.
  const merged = { ...((cur?.default_settings as Record<string, unknown>) ?? {}), adminContentAccessEnabled: enabled };
  const { error } = await supabase.from("companies").update({ default_settings: merged }).eq("id", session.companyId);
  if (error) throw new Error(error.message);
  await createServiceRoleClient()
    .schema("app")
    .rpc("append_audit", { p_company: session.companyId, p_action: "cycle_settings_changed", p_actor: session.accountId, p_review: null, p_target: { adminContentAccessEnabled: enabled } })
    .then(undefined, () => {});
  revalidatePath("/admin/settings");
  revalidatePath("/admin/reviews");
}

/** Grant the review-content capability to one admin (distinct from plain admin). */
export async function grantReviewContentAdmin(accountId: string) {
  const session = await requireRole("admin");
  const supabase = await createRlsClient();
  const { error } = await supabase
    .from("review_content_grants")
    .insert({ company_id: session.companyId, account_id: accountId, granted_by: session.accountId });
  if (error && !/duplicate key|already exists/i.test(error.message)) throw new Error(error.message);
  await createServiceRoleClient()
    .schema("app")
    .rpc("append_audit", { p_company: session.companyId, p_action: "cycle_settings_changed", p_actor: session.accountId, p_review: null, p_target: { grantedReviewContent: accountId } })
    .then(undefined, () => {});
  revalidatePath("/admin/settings");
  revalidatePath("/admin/reviews");
}

/** Revoke the review-content capability from one admin. */
export async function revokeReviewContentAdmin(accountId: string) {
  const session = await requireRole("admin");
  const supabase = await createRlsClient();
  const { error } = await supabase
    .from("review_content_grants")
    .delete()
    .eq("company_id", session.companyId)
    .eq("account_id", accountId);
  if (error) throw new Error(error.message);
  await createServiceRoleClient()
    .schema("app")
    .rpc("append_audit", { p_company: session.companyId, p_action: "cycle_settings_changed", p_actor: session.accountId, p_review: null, p_target: { revokedReviewContent: accountId } })
    .then(undefined, () => {});
  revalidatePath("/admin/settings");
  revalidatePath("/admin/reviews");
}
