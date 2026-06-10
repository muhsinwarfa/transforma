// ============================================================================
// Transforma — DISPOSABLE QA FIXTURE SEED  (packages/db/qa-fixture.mjs)
//
// Seeds two disposable, tenant-isolated test companies into the platform's
// Supabase project so a Playwright pixel-diff rig can render EVERY launcher UI
// state with content mirroring docs/design/prototype/data.jsx.
//
//   node qa-fixture.mjs              -> teardown (idempotent), then seed both tenants
//   node qa-fixture.mjs --teardown   -> full-clean removal of BOTH zztest tenants
//
// PROD-SAFETY: every tenant slug this script touches MUST start with 'zztest'.
// The guard below refuses to run otherwise, so it can never mutate a real
// tenant even if pointed at the production Supabase project.
//
// ENV (the runner sources the repo-root .env before invoking):
//   NEXT_PUBLIC_SUPABASE_URL    – Supabase project URL (GoTrue admin API)
//   SUPABASE_SERVICE_ROLE_KEY   – service-role key (create/delete GoTrue users)
//   SUPABASE_DB_URL             – direct Postgres connection string (pg Pool)
//   QA_SEED_PASSWORD            – password for ALL seeded GoTrue users.
//                                 FAILS LOUDLY if unset; never hard-coded.
//
// WRITE STRATEGY
//   - GoTrue users: supabase.auth.admin.createUser({email, password, email_confirm})
//   - All structural rows: a direct `pg` Pool against SUPABASE_DB_URL. The pg
//     connection runs as the DB owner/superuser so RLS does not block the
//     multi-table writes; the DB-level *immutability triggers* still bind every
//     caller, so terminal/append-only states are seeded either through the
//     privileged RPCs (commit_lock) or with the `user` triggers briefly
//     disabled inside teardown.
//
// TIMESTAMP STRATEGY (Risk #7 — frozen clock)
//   "today" is FROZEN at 2026-06-10. Every *_at column is seeded DIRECTLY to a
//   fixed absolute date (no now()+interval). Where a service-role RPC produces
//   side-effects whose timestamps are now()-relative (approve_nominations seeds
//   feedback windows; commit_lock writes locked_at/ack), we CALL the RPC for the
//   correct side-effects + audit chain, then UPDATE the moving timestamps to the
//   fixed absolute values (with immutability triggers disabled where required).
//
// ----------------------------------------------------------------------------
// LAUNCHER STATES THAT COULD NOT BE FULLY REALIZED IN THE SCHEMA (documented per
// requirement #10 — preconditions are seeded; the click/animation is the rig's):
//
//   * INTERACTION-only states (Section A / Risk #6) are NOT data states. The
//     fixture seeds their PRECONDITION row; the Pixel-Verifier drives the click:
//       - subject: ack-form, flag-form, below-floor modal (all on subj-ready /
//         subj-nominate; AckPanel client toggle / BelowFloorModal)
//       - peer: decline mode (PeerForm toggle)
//       - approver: finalize modal, request-changes mode
//       - admin: roster/success, roster/error (CSV paste), reviews/detail
//         (client open -> readReviewContent), settings form-expand
//       - shell: user-menu, token toggle, mobile drawer/bottom-nav
//       - auth: set-password strength meter / confirm mismatch
//
//   * reviews/off  — requires companies.default_settings.adminContentAccessEnabled
//     = false. We DO NOT seed it off (that would break reviews/list + reviews/
//     detail on the same tenant). The rig toggles it transiently via settings/
//     access, OR runs against a throwaway flip. Seeded ON.
//
//   * /forgot, /forgot-sent, /reset (auth) — NO live route exists yet
//     (BUILD-SPEC Risk #3, Lane 2 MUST-BUILD). No DB precondition seeds them;
//     they are pre-auth and cannot be pixel-verified until the routes are built.
//     Out of scope for this fixture (no rows to write).
//
//   * reviews/nogrant vs reviews/empty (Risk #1) — both make admin_review_list()
//     return []. The DB conditions ARE realized distinctly (admin-nogrant has NO
//     grant on the primary tenant; admin-empty HAS a grant but the empty tenant
//     has no reviews). Whether the UI can *visually* distinguish them is a web
//     concern, not a seed concern — the fixture provides both row-states.
// ============================================================================

import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const { Pool } = pg;

// Where to emit the dynamic ID map the pixel-rig manifest consumes.
const FIXTURE_MAP_PATH =
  process.env.FIXTURE_MAP_OUT || "C:/Users/shaan/AppData/Local/Temp/tf-rig/fixture-map.json";

// ── frozen clock ────────────────────────────────────────────────────────────
// All absolute timestamps below are anchored to this. data.jsx daysLeft values
// are computed from this same base so the prototype and the fixture agree.
const TODAY = "2026-06-10T00:00:00Z";

// ── the two disposable tenants (PROD-SAFETY: slugs MUST start with 'zztest') ──
const PRIMARY_SLUG = "zztest-qa";
const EMPTY_SLUG = "zztest-qa-empty";
const ALL_SLUGS = [PRIMARY_SLUG, EMPTY_SLUG];

// Stable UUIDs — deterministic so re-runs (teardown+seed) are idempotent and the
// rig can hard-code deep targets if it wants. zz-prefixed for grep-ability.
const CO_QA = "a0000000-0000-4000-8000-000000000001";
const CO_EMPTY = "a0000000-0000-4000-8000-000000000002";
const CYC_MAIN = "a0000000-0000-4000-8000-0000000000c1";

// B.1 — company config (verbatim per spec).
const ROLE_LABELS = {
  subject: "Team Member",
  peer: "Peer",
  approver: "Manager",
  admin: "People Ops",
};
const DEFAULT_SETTINGS = {
  feedbackDeadlineDays: 14,
  peerAnonymityThreshold: 3,
  maxPeerNominations: 5,
  ackWindowDays: 7,
  retentionDays: 730,
  adminContentAccessEnabled: true,
};

// ── B.2 ACCOUNTS — emails + display names VERBATIM from the spec/data.jsx ─────
// `roles` are structural app_role values. `key` is an internal handle used to
// wire reviews/nominations/peer rows. The email domain encodes the tenant.
// NOTE (Risk #5): display names echo data.jsx; the rv-* admin-readable subjects
// reuse names (Said Ahmed / Idil Warsame / Maryan Noor) but are DISTINCT
// accounts/emails from the subject-track accounts so the per-account
// single-status rule is never violated.
const PRIMARY_ACCOUNTS = [
  { key: "amina",         email: "amina@zztest-qa.example",          name: "Amina Yusuf",   roles: ["subject", "peer", "approver", "admin"] },
  { key: "mgr-a",         email: "mgr-a@zztest-qa.example",          name: "Liban Farah",   roles: ["approver", "subject"] },
  { key: "mgr-empty",     email: "mgr-empty@zztest-qa.example",      name: "Faduma Aden",   roles: ["approver"] },
  { key: "admin-grant",   email: "admin-grant@zztest-qa.example",    name: "Khadra Hassan", roles: ["admin"] },
  { key: "admin-nogrant", email: "admin-nogrant@zztest-qa.example",  name: "Bashir Omar",   roles: ["admin"] },
  { key: "subj-nominate", email: "subj-nominate@zztest-qa.example",  name: "Hodan Abdi",    roles: ["subject"] },
  { key: "subj-nompending", email: "subj-nompending@zztest-qa.example", name: "Maryan Noor", roles: ["subject"] },
  { key: "subj-nomchanges", email: "subj-nomchanges@zztest-qa.example", name: "Yusuf Ali",  roles: ["subject"] },
  { key: "subj-approved", email: "subj-approved@zztest-qa.example",  name: "Sahra Mohamed", roles: ["subject"] },
  { key: "subj-selfprog", email: "subj-selfprog@zztest-qa.example",  name: "Idil Warsame",  roles: ["subject"] },
  { key: "subj-selfdone", email: "subj-selfdone@zztest-qa.example",  name: "Omar Jama",     roles: ["subject"] },
  { key: "subj-inreview", email: "subj-inreview@zztest-qa.example",  name: "Deqa Osman",    roles: ["subject"] },
  { key: "subj-ready",    email: "subj-ready@zztest-qa.example",     name: "Said Ahmed",    roles: ["subject"] },
  { key: "subj-lockedack", email: "subj-lockedack@zztest-qa.example", name: "Asha Noor",    roles: ["subject"] },
  { key: "subj-lockedflag", email: "subj-lockedflag@zztest-qa.example", name: "Warsan Ali", roles: ["subject"] },
  { key: "subj-noreview", email: "subj-noreview@zztest-qa.example",  name: "Nima Yusuf",    roles: ["subject"] },
  { key: "peer-multi",    email: "peer-multi@zztest-qa.example",     name: "Ayan Farah",    roles: ["peer"] },
  { key: "nom-pending",   email: "nom-pending@zztest-qa.example",    name: "Sucad Jama",    roles: ["subject"] },
  { key: "nom-approved",  email: "nom-approved@zztest-qa.example",   name: "Hibo Osman",    roles: ["subject"] },
  { key: "rv-said",       email: "rv-said@zztest-qa.example",        name: "Said Ahmed",    roles: ["subject"] },
  { key: "rv-idil",       email: "rv-idil@zztest-qa.example",        name: "Idil Warsame",  roles: ["subject"] },
  { key: "rv-maryan",     email: "rv-maryan@zztest-qa.example",      name: "Maryan Noor",   roles: ["subject"] },
];
const EMPTY_ACCOUNTS = [
  { key: "admin-empty", email: "admin-empty@zztest-qa-empty.example", name: "Layla Mire", roles: ["admin"] },
];

// Department per account (from data.jsx ROSTER / NOMINATION population).
const DEPT = {
  amina: "Clinical Ops", "mgr-a": "Nursing", "mgr-empty": "Operations",
  "admin-grant": "People Ops", "admin-nogrant": "People Ops",
  "subj-nominate": "Clinical Ops", "subj-nompending": "Nursing",
  "subj-nomchanges": "Clinical Ops", "subj-approved": "Pharmacy",
  "subj-selfprog": "Operations", "subj-selfdone": "Pharmacy",
  "subj-inreview": "Clinical Ops", "subj-ready": "Pharmacy",
  "subj-lockedack": "Nursing", "subj-lockedflag": "Nursing",
  "subj-noreview": "Operations", "peer-multi": "Clinical Ops",
  "nom-pending": "Clinical Ops", "nom-approved": "Nursing",
  "rv-said": "Pharmacy", "rv-idil": "Operations", "rv-maryan": "Nursing",
};

// ── content anchors (verbatim from data.jsx) ─────────────────────────────────
const SELF_SECTIONS_FULL = {
  q1: "Kept the pharmacy running through two staffing gaps without a single missed order.",
  q2: "Got better at flagging risks early instead of absorbing them quietly.",
  q3: "The Q1 stock audit consumed most of February.",
  q4: "Mentoring the two new technicians.",
};
const SELF_SECTIONS_PARTIAL = { q1: SELF_SECTIONS_FULL.q1, q2: SELF_SECTIONS_FULL.q2 };

// NarrativeSections is camelCase (summary/strengths/areasToGrow/focusNextCycle) —
// the app reads those keys verbatim from the view; display-label keys render blank.
const DRAFT_GENERIC = {
  summary: "A solid, consistent cycle with clear contributions to the team’s goals and dependable delivery throughout.",
  strengths: "Reliable execution, good collaboration, and a steady hand on shared work.",
  areasToGrow: "Could take more initiative in surfacing problems early rather than absorbing them.",
  focusNextCycle: "Pick one stretch goal that pushes beyond the current role.",
};
// Below-floor draft: self-only, partial sections (data.jsx maryan).
const DRAFT_BELOW_FLOOR = {
  summary: "Maryan is dependable and steady on the floor. Peer feedback fell below the confidentiality threshold this cycle, so this draft is built from her self-review alone — worth weighing as you decide.",
  strengths: "Calm under pressure and trusted by patients.",
  areasToGrow: "",
  focusNextCycle: "",
};
const PEER_SEED_DRAFT = {
  pq1: "We’ve been on the Clinical Ops team together for about a year.",
  pq2: "Deqa is the person who keeps a launch calm.",
};
const PEER_SUBMITTED = {
  pq1: "Same unit for two cycles.",
  pq2: "Steady, fair, and good in a crisis.",
  pq3: "Could delegate a little more.",
};
const CHANGE_NOTE =
  "Two of these sit outside your day-to-day. Could you swap one for someone from the intake project who saw your work directly?";
const RV_MARYAN_FLAG =
  "Finalized below the peer-feedback confidentiality threshold — drawn from the self-review only.";
const RV1_RESPONSE =
  "Thanks — this reads fair. I’d note the Q1 stock audit shaped my availability more than the review lets on.";
const RV3_RESPONSE =
  "I don’t agree that delegation is the growth area — I handed off the intake triage in April. I’d like that on record.";

// Absolute deadline dates (Risk #7). All UTC midnight.
const D = {
  peerNew: "2026-06-16T00:00:00Z",      // peer-multi -> subj-nompending
  peerDraft: "2026-06-12T00:00:00Z",    // peer-multi -> subj-inreview
  peerSubmitted: "2026-06-20T00:00:00Z", // peer-multi -> subj-approved
  peerDeclined: "2026-06-18T00:00:00Z",  // peer-multi -> subj-selfprog
  peerClosed: "2026-06-04T00:00:00Z",    // peer-multi -> subj-selfdone (past)
  feedbackDeadline: "2026-06-24T00:00:00Z",
  revealedReady: "2026-06-16T00:00:00Z",
  ackEndsReady: "2026-06-23T00:00:00Z",
  revealedLocked: "2026-06-03T00:00:00Z",
  ackEndsLocked: "2026-06-10T00:00:00Z",
  locked: "2026-06-05T00:00:00Z",
  revealedAwaiting: "2026-06-08T00:00:00Z",
  ackEndsAwaiting: "2026-06-15T00:00:00Z",
  submittedAt: "2026-06-09T00:00:00Z",
};

// Tables that carry append-only / reveal-freeze / immutability `user` triggers
// (0300 BEFORE UPDATE/DELETE guards). Teardown disables `user` triggers on these
// before DELETE, then re-enables.
const GUARDED_TABLES = ["employee_responses", "locked_reviews", "audit_log", "reviews"];

// ============================================================================
// env + prod-safety guard
// ============================================================================
function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  const password = process.env.QA_SEED_PASSWORD;

  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!dbUrl) missing.push("SUPABASE_DB_URL");
  // QA_SEED_PASSWORD is the loud one: never hard-code; never default.
  if (!password) missing.push("QA_SEED_PASSWORD");
  if (missing.length) {
    throw new Error(
      `missing required env var(s): ${missing.join(", ")}. ` +
        `Source the repo-root .env (and set QA_SEED_PASSWORD) before running.`,
    );
  }
  return { url, serviceKey, dbUrl, password };
}

// Hard refuse unless every slug we touch is a disposable zztest tenant.
function assertProdSafe() {
  for (const slug of ALL_SLUGS) {
    if (!slug.startsWith("zztest")) {
      throw new Error(
        `PROD-SAFETY ABORT: tenant slug "${slug}" does not start with 'zztest'. ` +
          `This script only ever touches disposable zztest tenants.`,
      );
    }
  }
}

// ============================================================================
// teardown — removes BOTH zztest tenants, full clean. Safe when nothing exists.
// ============================================================================
async function teardown(pool, supabase) {
  console.log("== teardown: removing zztest tenants ==");

  // 1) Collect the GoTrue auth_user_ids we are about to orphan, BEFORE deleting
  //    the accounts rows (companies cascade to accounts on delete).
  const { rows: authRows } = await pool.query(
    `select a.auth_user_id
       from accounts a
       join companies c on c.id = a.company_id
      where c.slug = any($1) and a.auth_user_id is not null`,
    [ALL_SLUGS],
  );

  // 2) Delete tenant data. Immutability triggers (0300) block DELETE on the
  //    append-only/guarded tables even for the owner, so disable `user` triggers
  //    on those tables for the duration of the wipe, then re-enable.
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const t of GUARDED_TABLES) {
      await client.query(`alter table ${t} disable trigger user`);
    }
    // Deleting the companies cascades (on delete cascade) through accounts,
    // cycles, reviews, drafts, bundles, nominations, rosters, peer_feedback,
    // self_reviews, audit_heads, audit_log, locked_reviews, employee_responses,
    // review_content_grants, etc. We delete by company_id (resolved from slug).
    await client.query(`delete from companies where slug = any($1)`, [ALL_SLUGS]);
    for (const t of GUARDED_TABLES) {
      await client.query(`alter table ${t} enable trigger user`);
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    // Always try to re-enable triggers even on failure (best-effort).
    for (const t of GUARDED_TABLES) {
      try { await pool.query(`alter table ${t} enable trigger user`); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    client.release();
  }

  // 3) Delete the GoTrue users (auth.admin.deleteUser by id). Safe if absent.
  let deleted = 0;
  for (const row of authRows) {
    const id = row.auth_user_id;
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error && !/not.?found/i.test(error.message)) {
      console.warn(`  warn: deleteUser(${id}) -> ${error.message}`);
    } else {
      deleted++;
    }
  }
  console.log(`   tenants deleted (by company cascade); GoTrue users removed: ${deleted}`);
}

// ============================================================================
// seed helpers
// ============================================================================

// Create a GoTrue user (idempotent: if it already exists, find + reuse its id).
async function ensureAuthUser(supabase, email, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data?.user?.id) return data.user.id;

  // Already registered? look it up (createUser is the only admin create path;
  // listUsers is paginated, so page until found).
  if (error && /already|registered|exists/i.test(error.message)) {
    let page = 1;
    for (;;) {
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) throw new Error(`listUsers failed for ${email}: ${listErr.message}`);
      const hit = list.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
      if (hit) return hit.id;
      if (list.users.length < 200) break;
      page++;
    }
  }
  throw new Error(`createUser failed for ${email}: ${error ? error.message : "no id returned"}`);
}

// Insert a company.
async function insertCompany(pool, id, name, slug) {
  await pool.query(
    `insert into companies (id, name, slug, role_labels, default_settings)
       values ($1,$2,$3,$4::jsonb,$5::jsonb)`,
    [id, name, slug, JSON.stringify(ROLE_LABELS), JSON.stringify(DEFAULT_SETTINGS)],
  );
}

// Insert an account + its roles; returns the accounts.id.
async function insertAccount(pool, companyId, authUserId, acct) {
  const { rows } = await pool.query(
    `insert into accounts (company_id, auth_user_id, email, display_name, status)
       values ($1,$2,$3,$4,'active') returning id`,
    [companyId, authUserId, acct.email, acct.name],
  );
  const accountId = rows[0].id;
  for (const role of acct.roles) {
    await pool.query(
      `insert into account_roles (account_id, role, company_id) values ($1,$2,$3)`,
      [accountId, role, companyId],
    );
  }
  return accountId;
}

// Insert a roster_member (population row). manager resolved by accounts.id.
async function insertRosterMember(pool, companyId, cycleId, acct, accountId, managerAccountId) {
  await pool.query(
    `insert into roster_members
       (company_id, cycle_id, account_id, email, display_name, department,
        manager_account_id, structural_roles)
     values ($1,$2,$3,$4,$5,$6,$7,$8::app_role[])`,
    [companyId, cycleId, accountId, acct.email, acct.name, DEPT[acct.key] ?? null,
      managerAccountId, `{${acct.roles.join(",")}}`],
  );
}

// Create the spine review row directly (bypasses fan-out so we control status +
// approver + timestamps). Returns reviews.id. Satisfies the SoD CHECKs because
// approver_id is always mgr-a (never the subject) for queued reviews.
async function insertReview(pool, companyId, cycleId, employeeId, opts = {}) {
  const {
    approverId = null, status = "draft", rating = null,
    flaggedInternal = false, flagReason = null,
    revealedAt = null, ackWindowEndsAt = null,
    feedbackDeadlineAt = null, rosterId = null, reviewDraftId = null,
  } = opts;
  const { rows } = await pool.query(
    `insert into reviews
       (company_id, cycle_id, employee_id, roster_id, review_draft_id, approver_id,
        rating, status, flagged_internal, flag_reason,
        revealed_at, ack_window_ends_at, feedback_deadline_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning id`,
    [companyId, cycleId, employeeId, rosterId, reviewDraftId, approverId,
      rating, status, flaggedInternal, flagReason,
      revealedAt, ackWindowEndsAt, feedbackDeadlineAt],
  );
  return rows[0].id;
}

async function insertReviewDraft(pool, companyId, cycleId, employeeId, reviewId, sections, opts = {}) {
  const { flagged = false, flagReason = null, bundleId = null } = opts;
  const { rows } = await pool.query(
    `insert into review_drafts
       (company_id, cycle_id, employee_id, review_id, bundle_id, sections,
        flagged, flag_reason, attempt_count, generated_by_model)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,1,'claude-opus-4-8')
     returning id`,
    [companyId, cycleId, employeeId, reviewId, bundleId, JSON.stringify(sections), flagged, flagReason],
  );
  return rows[0].id;
}

// feedback_bundles — at/above floor (peer included) OR below floor (self only).
// Honors CHECK below_floor_excludes_peer + below_floor_no_payload.
async function insertBundle(pool, companyId, cycleId, employeeId, reviewId, rosterId, selfReviewId, submittedPeerCount) {
  const threshold = DEFAULT_SETTINGS.peerAnonymityThreshold; // 3
  const below = submittedPeerCount < threshold;
  const { rows } = await pool.query(
    `insert into feedback_bundles
       (company_id, cycle_id, employee_id, review_id, roster_id, self_review_id,
        submitted_peer_count, anonymity_threshold, at_or_above_floor, below_floor,
        peer_included, self_only, peer_theme_payload, compiled_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, null, $13)
     returning id`,
    [companyId, cycleId, employeeId, reviewId, rosterId, selfReviewId,
      submittedPeerCount, threshold,
      !below /*at_or_above_floor*/, below /*below_floor*/,
      !below /*peer_included*/, below /*self_only*/, TODAY],
  );
  return rows[0].id;
}

async function insertSelfReview(pool, companyId, cycleId, employeeId, reviewId, sections, state, submittedAt) {
  const { rows } = await pool.query(
    `insert into self_reviews
       (company_id, cycle_id, employee_id, review_id, sections, state, submitted_at)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7) returning id`,
    [companyId, cycleId, employeeId, reviewId, JSON.stringify(sections), state, submittedAt],
  );
  return rows[0].id;
}

// roster + roster_peers built directly (the cheap path for peer-track subjects).
async function insertRosterWithPeers(pool, companyId, cycleId, employeeId, approvedBy, peerAccountIds) {
  const { rows } = await pool.query(
    `insert into rosters (company_id, cycle_id, employee_id, approved_by, approved_at)
       values ($1,$2,$3,$4,$5) returning id`,
    [companyId, cycleId, employeeId, approvedBy, TODAY],
  );
  const rosterId = rows[0].id;
  for (const pid of peerAccountIds) {
    await pool.query(
      `insert into roster_peers (company_id, roster_id, peer_account_id) values ($1,$2,$3)`,
      [companyId, rosterId, pid],
    );
  }
  return rosterId;
}

async function insertPeerFeedback(pool, companyId, cycleId, employeeId, reviewId, rosterId, peerAccountId, opts) {
  const { state, responses = {}, deadlineAt = null, submittedAt = null, declinedAt = null } = opts;
  await pool.query(
    `insert into peer_feedback
       (company_id, cycle_id, employee_id, review_id, roster_id, peer_account_id,
        responses, state, deadline_at, submitted_at, declined_at)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
    [companyId, cycleId, employeeId, reviewId, rosterId, peerAccountId,
      JSON.stringify(responses), state, deadlineAt, submittedAt, declinedAt],
  );
}

async function insertNomination(pool, companyId, cycleId, employeeId, nomineeAccountId, status, managerNote = null) {
  await pool.query(
    `insert into nominations
       (company_id, cycle_id, employee_id, nominee_account_id, status, manager_note)
     values ($1,$2,$3,$4,$5,$6)`,
    [companyId, cycleId, employeeId, nomineeAccountId, status, managerNote],
  );
}

// Lock a revealed review through the REAL committer (correct audit chain +
// snapshot), then UPDATE the now()-driven timestamps to fixed absolute values.
// commit_lock requires status='awaiting-acknowledgement' + rating set.
async function lockReviewFixed(pool, reviewId, ackOutcome, lockedAtFixed) {
  await pool.query(`select app.commit_lock($1, $2::ack_outcome)`, [reviewId, ackOutcome]);
  // Pin the moving timestamps. The reviews_transition_guard (0300) raises
  // ERR_REVIEW_LOCKED on ANY update to a locked review (its first check is
  // `old.status = 'locked'`), and locked_reviews is immutability-guarded — so
  // BOTH tables' `user` triggers must be disabled for the pin, then re-enabled.
  // retention_due_at is left relative (it is masked / off-screen).
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`alter table reviews disable trigger user`);
    await client.query(`alter table locked_reviews disable trigger user`);
    await client.query(`update reviews set locked_at = $2 where id = $1`, [reviewId, lockedAtFixed]);
    await client.query(`update locked_reviews set locked_at = $2 where review_id = $1`, [reviewId, lockedAtFixed]);
    await client.query(`alter table locked_reviews enable trigger user`);
    await client.query(`alter table reviews enable trigger user`);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    // best-effort re-enable (a rolled-back ALTER is reverted, but be safe).
    try { await pool.query(`alter table locked_reviews enable trigger user`); } catch { /* ignore */ }
    try { await pool.query(`alter table reviews enable trigger user`); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// Link a review's draft AFTER reveal without tripping the reveal-freeze guard.
// reviews has a BEFORE UPDATE trigger (ERR_REVEALED_FROZEN) that freezes
// rating/narrative/draft on a revealed review; disable the `user` trigger for the
// single-column update, then re-enable. CHECK constraints stay enforced.
async function linkDraft(pool, reviewId, draftId) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`alter table reviews disable trigger user`);
    await client.query(`update reviews set review_draft_id = $2 where id = $1`, [reviewId, draftId]);
    await client.query(`alter table reviews enable trigger user`);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    try { await pool.query(`alter table reviews enable trigger user`); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// Insert an employee_response. outcome='responded' REQUIRES a body
// (CHECK response_body_when_responded).
async function insertResponseBeforeLock(pool, companyId, reviewId, employeeId, outcome, body, createdAt) {
  await pool.query(
    `insert into employee_responses (company_id, review_id, employee_id, outcome, body, created_at)
       values ($1,$2,$3,$4::ack_outcome,$5,$6)`,
    [companyId, reviewId, employeeId, outcome, body, createdAt],
  );
}

// activation_tokens — token_hash bytea (we store a deterministic sha256-shaped
// placeholder; the rig hands the raw token in via the URL it constructs). Three
// lifecycle states: valid / expired / used.
async function insertActivationToken(pool, companyId, rosterMemberId, label, opts) {
  const { expiresAt, consumedAt = null, consumedBy = null } = opts;
  // token_hash must be unique bytea; derive from a stable label so re-runs match.
  // pgcrypto lives in the `extensions` schema (0100), so qualify digest().
  await pool.query(
    `insert into activation_tokens
       (company_id, roster_member_id, token_hash, expires_at, consumed_at, consumed_by_auth_user)
     values ($1,$2, extensions.digest($3,'sha256'), $4, $5, $6)`,
    [companyId, rosterMemberId, `zztest-token-${label}`, expiresAt, consumedAt, consumedBy],
  );
}

async function insertGrant(pool, companyId, accountId, grantedBy) {
  await pool.query(
    `insert into review_content_grants (company_id, account_id, granted_by, granted_at)
       values ($1,$2,$3,$4)`,
    [companyId, accountId, grantedBy, TODAY],
  );
}

// ============================================================================
// seed — orchestrates both tenants
// ============================================================================
async function seed(pool, supabase, password) {
  console.log("== seed: zztest-qa (primary) + zztest-qa-empty (sibling) ==");

  // ---- companies + cycle ----------------------------------------------------
  await insertCompany(pool, CO_QA, "zztest-qa Health", PRIMARY_SLUG);
  await insertCompany(pool, CO_EMPTY, "zztest-qa-empty Health", EMPTY_SLUG);
  await pool.query(
    `insert into cycles (id, company_id, name, opens_at, closes_at, status)
       values ($1,$2,'H1 2026 Review','2026-06-01T00:00:00Z','2026-06-30T00:00:00Z','open')`,
    [CYC_MAIN, CO_QA],
  );
  // zztest-qa-empty deliberately has NO cycle (realizes cycles/empty + reviews/empty).

  // ---- accounts (primary) ---------------------------------------------------
  const id = {}; // key -> accounts.id
  for (const acct of PRIMARY_ACCOUNTS) {
    const authId = await ensureAuthUser(supabase, acct.email, password);
    id[acct.key] = await insertAccount(pool, CO_QA, authId, acct);
  }
  // ---- accounts (empty tenant) ----------------------------------------------
  const emptyId = {};
  for (const acct of EMPTY_ACCOUNTS) {
    const authId = await ensureAuthUser(supabase, acct.email, password);
    emptyId[acct.key] = await insertAccount(pool, CO_EMPTY, authId, acct);
  }

  // ---- roster population (primary) ------------------------------------------
  // Manager link: every subject's manager = mgr-a so nomination_sets + approver
  // resolution surface to mgr-a. (Risk #4: Amina is NOT a manager of anyone, so
  // her approver queue stays empty.)
  for (const acct of PRIMARY_ACCOUNTS) {
    if (!acct.roles.includes("subject")) continue;
    await insertRosterMember(pool, CO_QA, CYC_MAIN, acct, id[acct.key], id["mgr-a"]);
  }

  // ════════════════════════════════════════════════════════════════════════
  // B.4 — NOMINATION sets (subject-side: pending / changes / approved)
  // ════════════════════════════════════════════════════════════════════════
  // subj-nompending: pending set, no roster -> nominate-pending
  for (const nominee of ["subj-inreview", "subj-nomchanges", "subj-approved"]) {
    await insertNomination(pool, CO_QA, CYC_MAIN, id["subj-nompending"], id[nominee], "pending");
  }
  // subj-nomchanges: changes_requested + manager_note -> nominate-changes
  for (const [i, nominee] of ["subj-inreview", "subj-approved", "subj-selfdone"].entries()) {
    await insertNomination(
      pool, CO_QA, CYC_MAIN, id["subj-nomchanges"], id[nominee],
      "changes_requested", i === 0 ? CHANGE_NOTE : null,
    );
  }
  // subj-approved: approved set + roster row -> nominate-approved
  for (const nominee of ["subj-inreview", "subj-selfdone", "subj-selfprog"]) {
    await insertNomination(pool, CO_QA, CYC_MAIN, id["subj-approved"], id[nominee], "approved");
  }
  await insertRosterWithPeers(pool, CO_QA, CYC_MAIN, id["subj-approved"], id["mgr-a"],
    [id["subj-inreview"], id["subj-selfdone"], id["subj-selfprog"]]);

  // ── manager-side nomination queue (mgr-a is the approver via roster manager) ──
  // nom-pending: pending set (4 nominees per data.jsx nq1) -> manager detail pending
  for (const nominee of ["subj-inreview", "subj-nomchanges", "subj-approved", "subj-selfprog"]) {
    await insertNomination(pool, CO_QA, CYC_MAIN, id["nom-pending"], id[nominee], "pending");
  }
  // nom-approved: approved set (2 nominees per nq2) + roster -> manager detail post-decision
  for (const nominee of ["mgr-a", "subj-selfdone"]) {
    await insertNomination(pool, CO_QA, CYC_MAIN, id["nom-approved"], id[nominee], "approved");
  }
  await insertRosterWithPeers(pool, CO_QA, CYC_MAIN, id["nom-approved"], id["mgr-a"],
    [id["mgr-a"], id["subj-selfdone"]]);

  // ════════════════════════════════════════════════════════════════════════
  // B.3 — SUBJECT-track review rows (single-status per account)
  // ════════════════════════════════════════════════════════════════════════

  // subj-nominate: status=draft, NO nominations, NO roster -> nominate (start).
  await insertReview(pool, CO_QA, CYC_MAIN, id["subj-nominate"], { status: "draft" });

  // subj-nompending / subj-nomchanges: a draft review so subject_review_status
  // exists (getNominationData returns null without it); their nominations (NO
  // roster) then drive the nominate-pending / nominate-changes screens.
  await insertReview(pool, CO_QA, CYC_MAIN, id["subj-nompending"], { status: "draft" });
  await insertReview(pool, CO_QA, CYC_MAIN, id["subj-nomchanges"], { status: "draft" });

  // subj-selfprog: self_reviews state=draft (partial), review in-review -> self-progress.
  {
    const rev = await insertReview(pool, CO_QA, CYC_MAIN, id["subj-selfprog"], {
      status: "in-review", approverId: id["mgr-a"], feedbackDeadlineAt: D.feedbackDeadline,
    });
    await insertSelfReview(pool, CO_QA, CYC_MAIN, id["subj-selfprog"], rev, SELF_SECTIONS_PARTIAL, "draft", null);
  }

  // subj-selfdone: self_reviews state=submitted (all 4), review in-review -> self-submitted.
  {
    const rev = await insertReview(pool, CO_QA, CYC_MAIN, id["subj-selfdone"], {
      status: "in-review", approverId: id["mgr-a"], feedbackDeadlineAt: D.feedbackDeadline,
    });
    await insertSelfReview(pool, CO_QA, CYC_MAIN, id["subj-selfdone"], rev, SELF_SECTIONS_FULL, "submitted", D.submittedAt);
  }

  // subj-inreview: status=in-review, roster approved, self submitted, ≥3 peers,
  // bundle at/above floor. -> subject `status` view + approver-queue "ready"
  // + peer FORM target (peer-multi gives draft feedback on this subject).
  let reviewInReview, rosterInReview;
  {
    rosterInReview = await insertRosterWithPeers(
      pool, CO_QA, CYC_MAIN, id["subj-inreview"], id["mgr-a"],
      [id["peer-multi"], id["subj-selfdone"], id["subj-approved"]],
    );
    reviewInReview = await insertReview(pool, CO_QA, CYC_MAIN, id["subj-inreview"], {
      status: "in-review", approverId: id["mgr-a"], rosterId: rosterInReview,
      feedbackDeadlineAt: D.feedbackDeadline,
    });
    const selfId = await insertSelfReview(pool, CO_QA, CYC_MAIN, id["subj-inreview"], reviewInReview, SELF_SECTIONS_FULL, "submitted", D.submittedAt);
    // 3 submitted peers (≥ floor). peer-multi's row is left state='draft' so the
    // peer FORM (in-progress) renders; the other two are submitted to reach n=3.
    const bundleId = await insertBundle(pool, CO_QA, CYC_MAIN, id["subj-inreview"], reviewInReview, rosterInReview, selfId, 3);
    const draftId = await insertReviewDraft(pool, CO_QA, CYC_MAIN, id["subj-inreview"], reviewInReview, DRAFT_GENERIC, { bundleId });
    await linkDraft(pool, reviewInReview, draftId);
    // peer rows: peer-multi DRAFT (form), + two SUBMITTED to make n=3 for the bundle.
    await insertPeerFeedback(pool, CO_QA, CYC_MAIN, id["subj-inreview"], reviewInReview, rosterInReview, id["peer-multi"],
      { state: "draft", responses: PEER_SEED_DRAFT, deadlineAt: D.peerDraft });
    await insertPeerFeedback(pool, CO_QA, CYC_MAIN, id["subj-inreview"], reviewInReview, rosterInReview, id["subj-selfdone"],
      { state: "submitted", responses: PEER_SUBMITTED, deadlineAt: D.peerDraft, submittedAt: D.submittedAt });
    await insertPeerFeedback(pool, CO_QA, CYC_MAIN, id["subj-inreview"], reviewInReview, rosterInReview, id["subj-approved"],
      { state: "submitted", responses: PEER_SUBMITTED, deadlineAt: D.peerDraft, submittedAt: D.submittedAt });
  }

  // subj-ready: awaiting-acknowledgement, revealed, rating set, draft 4 sections,
  // NO employee_responses, NO lock. -> subject ready/ack-form/flag-form
  //                                  + approver-queue "decided / awaiting-ack".
  // (Review is created BEFORE the self_review because self_reviews.review_id is
  //  NOT NULL.)
  {
    const roster = await insertRosterWithPeers(pool, CO_QA, CYC_MAIN, id["subj-ready"], id["mgr-a"],
      [id["peer-multi"], id["subj-selfdone"], id["subj-approved"], id["subj-selfprog"]]);
    const rev = await insertReview(pool, CO_QA, CYC_MAIN, id["subj-ready"], {
      status: "awaiting-acknowledgement", approverId: id["mgr-a"], rosterId: roster,
      rating: "Exceeds expectations",
      revealedAt: D.revealedReady, ackWindowEndsAt: D.ackEndsReady,
      feedbackDeadlineAt: D.feedbackDeadline,
    });
    const selfId = await insertSelfReview(pool, CO_QA, CYC_MAIN, id["subj-ready"], rev, SELF_SECTIONS_FULL, "submitted", D.submittedAt);
    const bundleId = await insertBundle(pool, CO_QA, CYC_MAIN, id["subj-ready"], rev, roster, selfId, 4);
    const draftId = await insertReviewDraft(pool, CO_QA, CYC_MAIN, id["subj-ready"], rev, DRAFT_GENERIC, { bundleId });
    await linkDraft(pool, rev, draftId);
  }

  // subj-lockedack: locked, employee_responses outcome=acknowledged, snapshot.
  await seedLockedReview(pool, id, {
    subjectKey: "subj-lockedack", rating: "Meets expectations", draft: DRAFT_GENERIC,
    peerCount: 3, outcome: "acknowledged", responseBody: null,
    revealedAt: D.revealedLocked, ackEndsAt: D.ackEndsLocked, lockedAt: D.locked,
  });

  // subj-lockedflag: locked, employee_responses outcome=responded (body set).
  await seedLockedReview(pool, id, {
    subjectKey: "subj-lockedflag", rating: "Meets expectations", draft: DRAFT_GENERIC,
    peerCount: 3, outcome: "responded", responseBody: RV3_RESPONSE,
    revealedAt: D.revealedLocked, ackEndsAt: D.ackEndsLocked, lockedAt: D.locked,
  });

  // subj-noreview: NO reviews row -> getMyReviewStatus() null -> no-review.
  // (nothing to insert.)

  // ════════════════════════════════════════════════════════════════════════
  // APPROVER QUEUE — driven entirely through single-purpose mgr-a (Risk #4)
  //   ready    = subj-inreview (above, in-review, not flagged)
  //   awaiting = subj-ready    (above, awaiting-acknowledgement)
  //   locked   = subj-lockedack (above, locked)
  //   flagged  = a dedicated below-floor review on subj-nomchanges' twin? No —
  //     we use a distinct subject to keep single-status: the flagged below-floor
  //     review goes on `nom-pending`? nom-pending already has nominations only,
  //     no review -> safe to give it the flagged review.
  // ════════════════════════════════════════════════════════════════════════
  // aq-flagged: status=flagged, draft.flagged=true, below_floor bundle (n<3).
  {
    // roster with a SINGLE peer so n can be 1 (<3) -> below floor.
    const roster = await insertRosterWithPeers(pool, CO_QA, CYC_MAIN, id["nom-pending"], id["mgr-a"],
      [id["peer-multi"]]);
    const rev = await insertReview(pool, CO_QA, CYC_MAIN, id["nom-pending"], {
      status: "flagged", approverId: id["mgr-a"], rosterId: roster,
      flaggedInternal: true, flagReason: "below_floor_threshold",
      feedbackDeadlineAt: D.feedbackDeadline,
    });
    const selfId = await insertSelfReview(pool, CO_QA, CYC_MAIN, id["nom-pending"], rev, SELF_SECTIONS_FULL, "submitted", D.submittedAt);
    // below-floor bundle: submitted_peer_count=1, peer excluded, payload null.
    const bundleId = await insertBundle(pool, CO_QA, CYC_MAIN, id["nom-pending"], rev, roster, selfId, 1);
    const draftId = await insertReviewDraft(pool, CO_QA, CYC_MAIN, id["nom-pending"], rev, DRAFT_BELOW_FLOOR,
      { flagged: true, flagReason: "below_floor_threshold", bundleId });
    await linkDraft(pool, rev, draftId);
    // a single submitted peer row consistent with n=1 (kept off any draft surface).
    await insertPeerFeedback(pool, CO_QA, CYC_MAIN, id["nom-pending"], rev, roster, id["peer-multi"],
      { state: "submitted", responses: PEER_SUBMITTED, deadlineAt: D.peerDraft, submittedAt: D.submittedAt });
  }

  // ════════════════════════════════════════════════════════════════════════
  // B.6 — ADMIN-READABLE finished reviews (rv-said / rv-idil / rv-maryan)
  //   readable only via app.admin_read_review for admin-grant.
  //   approver_id = mgr-a (≠ subject), never exposes peer feedback.
  // ════════════════════════════════════════════════════════════════════════
  // rv-said: locked, Meets, acknowledged.
  await seedAdminReadable(pool, id, {
    subjectKey: "rv-said", rating: "Meets expectations", draft: DRAFT_GENERIC,
    self: SELF_SECTIONS_FULL, peerCount: 3, flagged: false, flagReason: null,
    status: "locked", outcome: "acknowledged", responseBody: RV1_RESPONSE,
    revealedAt: D.revealedLocked, ackEndsAt: D.ackEndsLocked, lockedAt: D.locked,
  });
  // rv-idil: awaiting-acknowledgement, Exceeds, no response.
  await seedAdminReadable(pool, id, {
    subjectKey: "rv-idil", rating: "Exceeds expectations", draft: DRAFT_GENERIC,
    self: SELF_SECTIONS_FULL, peerCount: 4, flagged: false, flagReason: null,
    status: "awaiting-acknowledgement", outcome: null, responseBody: null,
    revealedAt: D.revealedAwaiting, ackEndsAt: D.ackEndsAwaiting, lockedAt: null,
  });
  // rv-maryan: locked, Meets, flagged below-floor, responded.
  await seedAdminReadable(pool, id, {
    subjectKey: "rv-maryan", rating: "Meets expectations", draft: DRAFT_BELOW_FLOOR,
    self: SELF_SECTIONS_FULL, peerCount: 1, flagged: true, flagReason: RV_MARYAN_FLAG,
    status: "locked", outcome: "responded", responseBody: RV3_RESPONSE,
    revealedAt: D.revealedLocked, ackEndsAt: D.ackEndsLocked, lockedAt: D.locked,
  });

  // ════════════════════════════════════════════════════════════════════════
  // B.5 — PEER requests for peer-multi (one per state; unique subject each)
  //   form/draft already seeded above (subj-inreview). Add new/submitted/
  //   declined/closed against distinct subjects, each with a roster peer row.
  // ════════════════════════════════════════════════════════════════════════
  // For peer rows we need: the subject has a roster (FK) + peer-multi on it.
  // peer 'new' is intentionally NOT seeded on subj-nompending — a roster there
  // would flip its nominate screen to "approved". The list still shows the
  // submitted/declined/closed states below.
  // submitted -> subj-approved (already has a roster from the approved nomination).
  await seedPeerOnlySubject(pool, id, "subj-approved", "peer-submitted",
    { state: "submitted", deadlineAt: D.peerSubmitted, submittedAt: D.submittedAt, responses: PEER_SUBMITTED });
  // declined -> subj-selfprog (has a review already; needs a roster + peer row).
  await seedPeerOnlySubject(pool, id, "subj-selfprog", "peer-declined",
    { state: "declined", deadlineAt: D.peerDeclined, declinedAt: D.submittedAt, responses: {} });
  // closed -> subj-selfdone (past deadline).
  await seedPeerOnlySubject(pool, id, "subj-selfdone", "peer-closed",
    { state: "closed", deadlineAt: D.peerClosed, responses: {} });
  // unavailable -> NO row for a foreign reviewId (the rig types a stray URL).

  // ════════════════════════════════════════════════════════════════════════
  // B.6 — activation_tokens: one valid, one expired, one used.
  //   valid -> subj-nominate's roster member (activate-valid / set-password).
  // ════════════════════════════════════════════════════════════════════════
  const rmId = async (accountKey) =>
    (await pool.query(`select id from roster_members where cycle_id=$1 and account_id=$2`, [CYC_MAIN, id[accountKey]])).rows[0].id;
  await insertActivationToken(pool, CO_QA, await rmId("subj-nominate"), "valid",
    { expiresAt: "2026-06-20T00:00:00Z" });                       // future, unconsumed
  await insertActivationToken(pool, CO_QA, await rmId("subj-noreview"), "expired",
    { expiresAt: "2026-06-05T00:00:00Z" });                       // past, unconsumed
  await insertActivationToken(pool, CO_QA, await rmId("subj-lockedack"), "used",
    { expiresAt: "2026-06-20T00:00:00Z", consumedAt: "2026-06-04T00:00:00Z" }); // consumed

  // ════════════════════════════════════════════════════════════════════════
  // B.7 — review_content_grants: admin-grant (primary) + admin-empty (empty);
  //       NONE for admin-nogrant.
  // ════════════════════════════════════════════════════════════════════════
  await insertGrant(pool, CO_QA, id["admin-grant"], id["admin-grant"]);
  await insertGrant(pool, CO_EMPTY, emptyId["admin-empty"], emptyId["admin-empty"]);

  // ---- emit fixture-map.json: raw tokens + the dynamic review/employee IDs the
  //      rig manifest needs to build live URLs (reviewIds are gen_random_uuid). --
  const revOf = async (key) =>
    (await pool.query(`select id from reviews where cycle_id=$1 and employee_id=$2`, [CYC_MAIN, id[key]]))
      .rows[0]?.id ?? null;
  const fixtureMap = {
    tenant: { primary: PRIMARY_SLUG, empty: EMPTY_SLUG },
    activationTokens: { valid: "zztest-token-valid", expired: "zztest-token-expired", used: "zztest-token-used" },
    peer: {
      form: await revOf("subj-inreview"),
      submitted: await revOf("subj-approved"),
      declined: await revOf("subj-selfprog"),
      closed: await revOf("subj-selfdone"),
      unavailable: await revOf("subj-nominate"), // peer-multi has no feedback row here
    },
    approver: {
      workspaceReady: await revOf("subj-inreview"),
      workspaceFlagged: await revOf("nom-pending"),
      finalizedAwaiting: await revOf("subj-ready"),
      finalizedLocked: await revOf("subj-lockedack"),
    },
    nominations: { pending: id["nom-pending"], postDecision: id["nom-approved"] },
    accounts: Object.fromEntries([...PRIMARY_ACCOUNTS, ...EMPTY_ACCOUNTS].map((a) => [a.key, a.email])),
  };
  writeFileSync(FIXTURE_MAP_PATH, JSON.stringify(fixtureMap, null, 2));
  console.log(`   wrote fixture-map -> ${FIXTURE_MAP_PATH}`);

  console.log("   seed complete.");
}

// Helper: a locked subject-track review (snapshot via commit_lock, fixed times).
async function seedLockedReview(pool, id, o) {
  const subj = id[o.subjectKey];
  const roster = await insertRosterWithPeers(pool, CO_QA, CYC_MAIN, subj, id["mgr-a"],
    [id["peer-multi"], id["subj-selfdone"], id["subj-approved"]]);
  // create as awaiting-acknowledgement first (commit_lock requires it + rating).
  const rev = await insertReview(pool, CO_QA, CYC_MAIN, subj, {
    status: "awaiting-acknowledgement", approverId: id["mgr-a"], rosterId: roster,
    rating: o.rating, revealedAt: o.revealedAt, ackWindowEndsAt: o.ackEndsAt,
    feedbackDeadlineAt: D.feedbackDeadline,
  });
  const selfId = await insertSelfReview(pool, CO_QA, CYC_MAIN, subj, rev, SELF_SECTIONS_FULL, "submitted", D.submittedAt);
  const bundleId = await insertBundle(pool, CO_QA, CYC_MAIN, subj, rev, roster, selfId, o.peerCount);
  const draftId = await insertReviewDraft(pool, CO_QA, CYC_MAIN, subj, rev, o.draft, { bundleId });
  await linkDraft(pool, rev, draftId);
  // the subject's response is written BEFORE lock (it must exist for commit_lock
  // to record the matching lock_reason); fixed created_at.
  await insertResponseBeforeLock(pool, CO_QA, rev, subj, o.outcome, o.responseBody, o.lockedAt);
  // lock through the real committer, then pin locked_at.
  await lockReviewFixed(pool, rev, o.outcome, o.lockedAt);
  return rev;
}

// Helper: an admin-readable review (may be awaiting-ack OR locked).
async function seedAdminReadable(pool, id, o) {
  const subj = id[o.subjectKey];
  const roster = await insertRosterWithPeers(pool, CO_QA, CYC_MAIN, subj, id["mgr-a"],
    [id["peer-multi"], id["subj-selfdone"], id["subj-approved"]]);
  const rev = await insertReview(pool, CO_QA, CYC_MAIN, subj, {
    status: "awaiting-acknowledgement", approverId: id["mgr-a"], rosterId: roster,
    rating: o.rating, flaggedInternal: o.flagged, flagReason: o.flagReason,
    revealedAt: o.revealedAt, ackWindowEndsAt: o.ackEndsAt, feedbackDeadlineAt: D.feedbackDeadline,
  });
  const selfId = await insertSelfReview(pool, CO_QA, CYC_MAIN, subj, rev, o.self, "submitted", D.submittedAt);
  const bundleId = await insertBundle(pool, CO_QA, CYC_MAIN, subj, rev, roster, selfId, o.peerCount);
  const draftId = await insertReviewDraft(pool, CO_QA, CYC_MAIN, subj, rev, o.draft,
    { flagged: o.flagged, flagReason: o.flagReason, bundleId });
  await linkDraft(pool, rev, draftId);

  if (o.status === "locked") {
    await insertResponseBeforeLock(pool, CO_QA, rev, subj, o.outcome, o.responseBody, o.lockedAt);
    await lockReviewFixed(pool, rev, o.outcome, o.lockedAt);
  }
  // awaiting-acknowledgement variant: leave as revealed (no response, no lock).
  return rev;
}

// Helper: ensure a subject has a roster + review so peer-multi can hold a
// peer_feedback row of a given state against them. Reuses an existing roster if
// the subject already has one; otherwise creates a minimal in-review review.
async function seedPeerOnlySubject(pool, id, subjectKey, label, peerOpts) {
  const subj = id[subjectKey];
  // existing review?
  const r = await pool.query(`select id, roster_id from reviews where cycle_id=$1 and employee_id=$2`, [CYC_MAIN, subj]);
  let reviewId, rosterId;
  if (r.rows.length) {
    reviewId = r.rows[0].id;
    rosterId = r.rows[0].roster_id;
  }
  // existing roster?
  if (!rosterId) {
    const rr = await pool.query(`select id from rosters where cycle_id=$1 and employee_id=$2`, [CYC_MAIN, subj]);
    rosterId = rr.rows[0]?.id ?? null;
  }
  if (!rosterId) {
    rosterId = await insertRosterWithPeers(pool, CO_QA, CYC_MAIN, subj, id["mgr-a"], [id["peer-multi"]]);
  } else {
    // ensure peer-multi is on the roster (idempotent).
    await pool.query(
      `insert into roster_peers (company_id, roster_id, peer_account_id) values ($1,$2,$3)
         on conflict (roster_id, peer_account_id) do nothing`,
      [CO_QA, rosterId, id["peer-multi"]],
    );
  }
  if (!reviewId) {
    reviewId = await insertReview(pool, CO_QA, CYC_MAIN, subj, {
      status: "in-review", approverId: id["mgr-a"], rosterId, feedbackDeadlineAt: D.feedbackDeadline,
    });
  } else if (!r.rows[0].roster_id) {
    await pool.query(`update reviews set roster_id = $2 where id = $1`, [reviewId, rosterId]);
  }
  // the peer_feedback row for peer-multi in the requested state (idempotent on
  // the (cycle, employee, peer) unique key).
  await pool.query(
    `insert into peer_feedback
       (company_id, cycle_id, employee_id, review_id, roster_id, peer_account_id,
        responses, state, deadline_at, submitted_at, declined_at)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
     on conflict (cycle_id, employee_id, peer_account_id) do update
       set state = excluded.state, responses = excluded.responses,
           deadline_at = excluded.deadline_at, submitted_at = excluded.submitted_at,
           declined_at = excluded.declined_at`,
    [CO_QA, CYC_MAIN, subj, reviewId, rosterId, id["peer-multi"],
      JSON.stringify(peerOpts.responses ?? {}), peerOpts.state,
      peerOpts.deadlineAt ?? null, peerOpts.submittedAt ?? null, peerOpts.declinedAt ?? null],
  );
  void label;
}

// ============================================================================
// verification — query the DB back and assert the invariants. PASS/FAIL each.
// ============================================================================
async function verify(pool) {
  console.log("\n== verification checklist (queried back from the DB) ==");
  let allPass = true;
  const check = (name, ok, detail = "") => {
    allPass = allPass && ok;
    console.log(`   [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  };

  // per-status review counts (primary tenant).
  const statusRows = (await pool.query(
    `select r.status, count(*)::int n
       from reviews r join companies c on c.id = r.company_id
      where c.slug = $1 group by r.status order by r.status`,
    [PRIMARY_SLUG],
  )).rows;
  console.log("   review counts by status (zztest-qa):");
  for (const row of statusRows) console.log(`       ${row.status.padEnd(26)} ${row.n}`);

  // account count (both tenants).
  const acctCount = (await pool.query(
    `select count(*)::int n from accounts a join companies c on c.id = a.company_id
      where c.slug = any($1)`,
    [ALL_SLUGS],
  )).rows[0].n;
  console.log(`   total accounts (both tenants): ${acctCount}`);

  // invariant 1: every below_floor bundle has submitted_peer_count < 3, peer
  // excluded, null payload.
  const bf = (await pool.query(
    `select count(*)::int bad from feedback_bundles fb join companies c on c.id = fb.company_id
      where c.slug = any($1) and fb.below_floor
        and (fb.submitted_peer_count >= 3 or fb.peer_included or fb.peer_theme_payload is not null)`,
    [ALL_SLUGS],
  )).rows[0].bad;
  check("below-floor bundles: submitted_peer_count<3, peer excluded, null payload", bf === 0, `${bf} violation(s)`);

  // invariant 2: zero reviews where approver_id = employee_id (SoD).
  const sod = (await pool.query(
    `select count(*)::int bad from reviews r join companies c on c.id = r.company_id
      where c.slug = any($1) and r.approver_id = r.employee_id`,
    [ALL_SLUGS],
  )).rows[0].bad;
  check("SoD: zero rows where approver_id = employee_id", sod === 0, `${sod} violation(s)`);

  // invariant 2b: Amina's approver queue is empty (Risk #4): she approves nobody.
  const aminaQ = (await pool.query(
    `select count(*)::int n from reviews r
       join accounts a on a.id = r.approver_id
       join companies c on c.id = r.company_id
      where c.slug = $1 and a.email = 'amina@zztest-qa.example'`,
    [PRIMARY_SLUG],
  )).rows[0].n;
  check("Amina is approver of zero reviews (queue stays empty)", aminaQ === 0, `${aminaQ} assigned`);

  // invariant 3: every revealed_at < locked_at where both set (reveal-before-lock).
  const order = (await pool.query(
    `select count(*)::int bad from reviews r join companies c on c.id = r.company_id
      where c.slug = any($1) and r.revealed_at is not null and r.locked_at is not null
        and r.revealed_at >= r.locked_at`,
    [ALL_SLUGS],
  )).rows[0].bad;
  check("reveal-before-lock: revealed_at < locked_at where both set", order === 0, `${order} violation(s)`);

  // invariant 3b: every locked review HAS a locked_reviews snapshot.
  const snap = (await pool.query(
    `select count(*)::int bad from reviews r join companies c on c.id = r.company_id
      where c.slug = any($1) and r.status = 'locked'
        and not exists (select 1 from locked_reviews lr where lr.review_id = r.id)`,
    [ALL_SLUGS],
  )).rows[0].bad;
  check("every locked review has a locked_reviews snapshot", snap === 0, `${snap} missing`);

  // invariant 3c: responded responses always have a body (CHECK mirror).
  const body = (await pool.query(
    `select count(*)::int bad from employee_responses er join companies c on c.id = er.company_id
      where c.slug = any($1) and er.outcome = 'responded' and er.body is null`,
    [ALL_SLUGS],
  )).rows[0].bad;
  check("responded employee_responses always have a body", body === 0, `${body} violation(s)`);

  // invariant 4: grant present for admin-grant; absent for admin-nogrant.
  const grantOk = (await pool.query(
    `select exists (
        select 1 from review_content_grants g join accounts a on a.id = g.account_id
        where a.email = 'admin-grant@zztest-qa.example') as has_grant`,
  )).rows[0].has_grant;
  const nogrant = (await pool.query(
    `select exists (
        select 1 from review_content_grants g join accounts a on a.id = g.account_id
        where a.email = 'admin-nogrant@zztest-qa.example') as has_grant`,
  )).rows[0].has_grant;
  check("grant present for admin-grant", grantOk === true);
  check("grant ABSENT for admin-nogrant", nogrant === false);

  // invariant 5: audit chain intact for the primary tenant (commit_lock writes it).
  const broken = (await pool.query(`select app.verify_audit_chain($1) as seq`, [CO_QA])).rows[0].seq;
  check("audit chain intact for zztest-qa (verify_audit_chain = null)", broken === null, broken === null ? "" : `breaks at seq ${broken}`);

  // activation tokens: one of each lifecycle state.
  const tok = (await pool.query(
    `select
        count(*) filter (where consumed_at is null and expires_at > $2)::int valid,
        count(*) filter (where consumed_at is null and expires_at <= $2)::int expired,
        count(*) filter (where consumed_at is not null)::int used
       from activation_tokens t join companies c on c.id = t.company_id
      where c.slug = $1`,
    [PRIMARY_SLUG, TODAY],
  )).rows[0];
  check("activation tokens: ≥1 valid / ≥1 expired / ≥1 used",
    tok.valid >= 1 && tok.expired >= 1 && tok.used >= 1,
    `valid=${tok.valid} expired=${tok.expired} used=${tok.used}`);

  console.log(`\n   OVERALL: ${allPass ? "PASS" : "FAIL"}\n`);
  return allPass;
}

// ============================================================================
// runner
// ============================================================================
async function main() {
  const teardownOnly = process.argv.includes("--teardown");
  assertProdSafe();
  const env = readEnv();

  const pool = new Pool({ connectionString: env.dbUrl, max: 4 });
  const supabase = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Always teardown first (idempotent + safe when nothing exists).
    await teardown(pool, supabase);
    if (teardownOnly) {
      console.log("teardown-only mode: done.");
      return;
    }
    await seed(pool, supabase, env.password);
    const pass = await verify(pool);
    if (!pass) {
      process.exitCode = 1;
      console.error("VERIFICATION FAILED — review the FAIL lines above.");
    }
  } finally {
    await pool.end();
  }
}

// Do nothing on import; only run when invoked directly.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error("\nFATAL:", err.message);
    process.exitCode = 1;
  });
}

export { seed, teardown, verify, main };
