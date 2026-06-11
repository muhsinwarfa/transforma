"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@transforma/db";
import { TransformaError } from "@transforma/review-core";
import { getAdminReviewContent, type ReviewContent } from "@/lib/admin/content";
import { requireRole } from "@/lib/auth/session";
import { pgQuery } from "@/lib/db/pg";
import { parsePgTextArray } from "@/lib/db/pg-array";
import { createRlsClient } from "@/lib/supabase/server";
import { STRUCTURAL_ROLES, parseAndValidateRoster, type ImportResult, type InvitedMember } from "@/lib/admin/roster-parse";

// data types live with the pure parser; re-exported here for the import UI's imports
export type { RowError, RosterRow, InvitedMember, ImportResult } from "@/lib/admin/roster-parse";

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
// The pure parser + org-chart role inference + guard rails live in
// `@/lib/admin/roster-parse` (unit-tested); the server actions below add the writes.

/** App origin for the set-password redirect — the onrender pilot URL until a custom domain. */
function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://transforma-re46.onrender.com";
}

/**
 * B5 — provision ONE imported roster member: create the auth user + account + roles,
 * generate a set-password link to surface for manual distribution (the RELIABLE path
 * pilot admins use), and best-effort send the branded email. Email/SMTP failures NEVER
 * fail the import — the surfaced link always works.
 */
async function inviteImportedMember(rosterMemberId: string, email: string, name: string, companyId: string): Promise<InvitedMember> {
  const svc = createServiceRoleClient();
  // random temp password — never shared; the person sets their own via the link.
  const tempPw = "Tf-" + crypto.randomBytes(12).toString("base64url") + "-7Q!";
  let authUserId: string | null = null;
  const created = await svc.auth.admin.createUser({ email, password: tempPw, email_confirm: true });
  if (created.data?.user?.id) authUserId = created.data.user.id;
  else if (created.error && /already|registered|exists/i.test(created.error.message)) {
    const list = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
    authUserId = list.data?.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase())?.id ?? null;
  }
  if (!authUserId) throw new Error(`Couldn't create an account for ${email}.`);

  const { rows: acct } = await pgQuery<{ id: string }>(
    `insert into accounts (company_id, auth_user_id, email, display_name, status)
       values ($1,$2,$3,$4,'invited')
     on conflict (company_id, lower(email)) do update set auth_user_id = excluded.auth_user_id, updated_at = now()
     returning id`,
    [companyId, authUserId, email, name],
  );
  const accountId = acct[0]!.id;
  await pgQuery(`update roster_members set account_id = $1, updated_at = now() where id = $2`, [accountId, rosterMemberId]);
  await pgQuery(
    `insert into account_roles (account_id, role, company_id)
       select $1, unnest(rm.structural_roles), rm.company_id from roster_members rm where rm.id = $2
     on conflict (account_id, role) do nothing`,
    [accountId, rosterMemberId],
  );

  // Surfaced set-password link (admin distributes manually) → /reset-password.
  const redirectTo = `${appBaseUrl()}/reset-password`;
  let link: string | null = null;
  try {
    const res = await svc.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    link = (res.data?.properties as { action_link?: string } | undefined)?.action_link ?? null;
  } catch {
    /* the best-effort email may still reach them */
  }

  // Best-effort branded email — a failure (SMTP off / rate limit) does NOT fail the import.
  let emailed = false;
  try {
    const { error } = await svc.auth.resetPasswordForEmail(email, { redirectTo });
    emailed = !error;
  } catch {
    /* best-effort */
  }

  return { email, name, link, emailed };
}

/**
 * A3 phase 1 — read-only validation. Parses + checks every row and returns the
 * preview WITHOUT touching the database. Nothing is written here; the import only
 * happens when the admin confirms via importRoster.
 */
export async function validateRoster(csvText: string): Promise<ImportResult> {
  await requireRole("admin");
  return parseAndValidateRoster(csvText);
}

/**
 * A3 phase 2 — the commit. Re-validates (defensive) then runs the existing
 * all-or-nothing insert + roster_imported audit. The write path is unchanged; the
 * read-only validate pass is simply split out in front of it.
 */
export async function importRoster(csvText: string): Promise<ImportResult> {
  const session = await requireRole("admin");
  const cycleId = await activeCycleId();
  const v = parseAndValidateRoster(csvText);
  if (!v.ok) return v;

  // 1) upsert roster_members. manager_ref holds the manager's EMAIL; resolved in (3).
  //    structural_roles is the FULL inferred set (subject and/or approver, possibly
  //    empty for a not-reviewed participant) — peer is added later by the trigger.
  for (const r of v.rows) {
    await pgQuery(
      `insert into roster_members (company_id, cycle_id, email, display_name, department, manager_ref, structural_roles)
         values ($1,$2,$3,$4,$5,$6, $7::app_role[])
       on conflict (cycle_id, lower(email)) do update
         set display_name = excluded.display_name, department = excluded.department,
             manager_ref = excluded.manager_ref, structural_roles = excluded.structural_roles, updated_at = now()`,
      [session.companyId, cycleId, r.email, r.name, r.department || null, r.manager || null, r.roles],
    );
  }

  // 2) provision + invite everyone not yet linked to an account (account_id IS NULL).
  //    Each gets a surfaced set-password link (reliable) + a best-effort branded email.
  const { rows: pending } = await pgQuery<{ id: string; email: string; display_name: string }>(
    `select id, email, display_name from roster_members
      where cycle_id = $1 and account_id is null and lower(email) = any($2::text[])
      order by display_name`,
    [cycleId, v.rows.map((r) => r.email)],
  );
  const invites: InvitedMember[] = [];
  for (const m of pending) {
    try {
      invites.push(await inviteImportedMember(m.id, m.email, m.display_name, session.companyId));
    } catch (e) {
      invites.push({ email: m.email, name: m.display_name, link: null, emailed: false, error: e instanceof Error ? e.message : "Couldn't provision this person." });
    }
  }

  // 3) resolve manager_email → manager_account_id now that every account exists.
  await pgQuery(
    `update roster_members rm set manager_account_id = a.id, updated_at = now()
       from accounts a
      where rm.cycle_id = $1 and rm.manager_ref is not null and rm.manager_ref <> ''
        and a.company_id = $2 and lower(a.email) = lower(rm.manager_ref)`,
    [cycleId, session.companyId],
  );

  await createServiceRoleClient()
    .schema("app")
    .rpc("append_audit", { p_company: session.companyId, p_action: "roster_imported", p_actor: session.accountId, p_review: null, p_target: { count: v.rows.length, invited: invites.length } })
    .then(undefined, () => {});
  revalidatePath("/admin/roster");
  return { ok: true, imported: v.rows.length, errors: [], rows: v.rows, invites, info: v.info };
}

export interface RosterMemberRow {
  id: string;
  name: string;
  email: string;
  roles: string[];
  /** account state: active (signed in), invited (provisioned, not yet signed in), or unprovisioned */
  status: "active" | "invited" | "unprovisioned";
}

/** B7 — roster members of the active cycle + their account status (admin oversight). */
export async function listRosterMembers(): Promise<RosterMemberRow[]> {
  await requireRole("admin");
  let cycleId: string;
  try {
    cycleId = await activeCycleId();
  } catch {
    return [];
  }
  // structural_roles is app_role[] (a custom enum array). The raw pg driver can't parse
  // that dynamic OID and returns the array LITERAL string ("{subject,approver}"), so
  // normalize to a real string[] HERE — the UI must never .map() a string. (typed
  // `unknown` because the runtime shape is driver-dependent: array | string | null.)
  const { rows } = await pgQuery<{ id: string; display_name: string; email: string; structural_roles: unknown; status: string | null }>(
    `select rm.id, rm.display_name, rm.email, rm.structural_roles, a.status
       from roster_members rm
       left join accounts a on a.id = rm.account_id
      where rm.cycle_id = $1 and rm.withdrawn_at is null
      order by rm.display_name`,
    [cycleId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.display_name,
    email: r.email,
    roles: parsePgTextArray(r.structural_roles),
    status: r.status === "active" ? "active" : r.status === "invited" ? "invited" : "unprovisioned",
  }));
}

/**
 * B7 — (re)generate a member's set-password link to surface, optionally resending the
 * branded email. Powers the roster's "Copy link" (sendEmail=false) and "Resend invite"
 * (sendEmail=true). Provisions the account first if the member was never invited. Each
 * call yields a FRESH link (the implicit "regenerate"); old links remain valid till expiry.
 */
export async function memberSetupLink(rosterMemberId: string, sendEmail: boolean): Promise<{ link: string | null; emailed: boolean }> {
  const session = await requireRole("admin");
  const { rows } = await pgQuery<{ email: string; display_name: string; account_id: string | null }>(
    `select rm.email, rm.display_name, rm.account_id
       from roster_members rm join cycles c on c.id = rm.cycle_id
      where rm.id = $1 and c.company_id = $2`,
    [rosterMemberId, session.companyId],
  );
  const m = rows[0];
  if (!m) throw new Error("That person isn't on your roster.");
  if (!m.account_id) {
    // never invited → provision + invite (creates the account, sends the email, returns a link)
    const inv = await inviteImportedMember(rosterMemberId, m.email, m.display_name, session.companyId);
    revalidatePath("/admin/roster");
    return { link: inv.link, emailed: inv.emailed };
  }
  const svc = createServiceRoleClient();
  const redirectTo = `${appBaseUrl()}/reset-password`;
  let link: string | null = null;
  try {
    const res = await svc.auth.admin.generateLink({ type: "recovery", email: m.email, options: { redirectTo } });
    link = (res.data?.properties as { action_link?: string } | undefined)?.action_link ?? null;
  } catch {
    /* surface a null link; the UI shows it couldn't generate */
  }
  let emailed = false;
  if (sendEmail) {
    try {
      const { error } = await svc.auth.resetPasswordForEmail(m.email, { redirectTo });
      emailed = !error;
    } catch {
      /* best-effort */
    }
  }
  return { link, emailed };
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
