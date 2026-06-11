import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { Client } = pg;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const seedPath = path.join(repoRoot, "supabase", "seed.sql");
const shimPath = path.join(here, "shim.sql");

const PORT = 54398;
const PASSWORD = "postgres";

// seed company + cycle (Riverbend); effective_threshold(CY)=3, feedbackDeadlineDays=14
const C = "11111111-1111-1111-1111-111111111111";
const CY = "22222222-2222-2222-2222-222222222222";

const APPR = "a1000000-0000-0000-0000-000000000001"; // the manager/approver for both subjects
const SUBJ_A = "a1000000-0000-0000-0000-0000000000aa"; // above-floor subject (3 peers)
const SUBJ_B = "a1000000-0000-0000-0000-0000000000bb"; // below-floor subject (2 peers)
const STRANGER = "a1000000-0000-0000-0000-0000000000ff"; // neither approver nor manager
const PA1 = "a1000000-0000-0000-0000-0000000000a1";
const PA2 = "a1000000-0000-0000-0000-0000000000a2";
const PA3 = "a1000000-0000-0000-0000-0000000000a3";
const PB1 = "a1000000-0000-0000-0000-0000000000b1";
const PB2 = "a1000000-0000-0000-0000-0000000000b2";
const U_SUBJ_A = "e1000000-0000-0000-0000-0000000000aa"; // auth user for the subject edit-lock test
const U_STRANGER = "e1000000-0000-0000-0000-0000000000ff"; // auth user for the injection test
const REV_A = "c1000000-0000-0000-0000-0000000000aa";
const REV_B = "c1000000-0000-0000-0000-0000000000bb";
// imported-roster GAP regression: a subject whose review has approver_id NULL
// (nomination phase) + a manager that is itself a roster member.
const SG = "a1000000-0000-0000-0000-0000000000a7";
const MG = "a1000000-0000-0000-0000-0000000000a8";
const GP1 = "a1000000-0000-0000-0000-0000000000a9";
const GP2 = "a1000000-0000-0000-0000-0000000000b9";
const U_SG = "e1000000-0000-0000-0000-0000000000a7";
const REV_G = "c1000000-0000-0000-0000-0000000000a7";
// request-changes ↔ resubmit loop: subject SC + approver APC (each with an auth
// user so the RLS write/read paths run end to end), pending nominations, no roster.
const SC = "a1000000-0000-0000-0000-0000000000c1";
const APC = "a1000000-0000-0000-0000-0000000000c2";
const U_SC = "e1000000-0000-0000-0000-0000000000c1";
const U_APC = "e1000000-0000-0000-0000-0000000000c2";
const RC = "c1000000-0000-0000-0000-0000000000c1";
const CHANGE_NOTE = "please add someone from outside Clinical Ops";
// completion-trigger (PROC-04) + meter (cycle_progress) fixtures: subject ST with an
// APPROVED roster (RST) of 3 peers, a submitted self-review, 3 'new' peer requests,
// and an admin ADM. Trigger/meter tests mutate these inside rolled-back transactions.
const ST = "a1000000-0000-0000-0000-0000000000d1";
const APT = "a1000000-0000-0000-0000-0000000000d2";
const TP1 = "a1000000-0000-0000-0000-0000000000d3";
const TP2 = "a1000000-0000-0000-0000-0000000000d4";
const TP3 = "a1000000-0000-0000-0000-0000000000d5";
const RT = "c1000000-0000-0000-0000-0000000000d1";
const RST = "d1000000-0000-0000-0000-0000000000d1";
const ADM = "a1000000-0000-0000-0000-0000000000da";
const U_ADM = "e1000000-0000-0000-0000-0000000000da";

let epg: EmbeddedPostgres;
let client: pg.Client;

const SETUP_SQL = `
insert into auth.users (id,email) values
  ('${U_SUBJ_A}','sa@riverbend.test'), ('${U_STRANGER}','str@riverbend.test') on conflict do nothing;

insert into accounts (id, company_id, email, display_name, status, auth_user_id) values
  ('${APPR}','${C}','mgr@riverbend.test','Manager M','active', null),
  ('${SUBJ_A}','${C}','sa@riverbend.test','Subject A','active','${U_SUBJ_A}'),
  ('${SUBJ_B}','${C}','sb@riverbend.test','Subject B','active', null),
  ('${STRANGER}','${C}','str@riverbend.test','Stranger S','active','${U_STRANGER}'),
  ('${PA1}','${C}','pa1@riverbend.test','Peer A1','active', null),
  ('${PA2}','${C}','pa2@riverbend.test','Peer A2','active', null),
  ('${PA3}','${C}','pa3@riverbend.test','Peer A3','active', null),
  ('${PB1}','${C}','pb1@riverbend.test','Peer B1','active', null),
  ('${PB2}','${C}','pb2@riverbend.test','Peer B2','active', null)
  on conflict do nothing;

insert into account_roles (account_id, role, company_id) values ('${SUBJ_A}','subject','${C}') on conflict do nothing;

insert into roster_members (company_id, cycle_id, account_id, email, display_name) values
  ('${C}','${CY}','${SUBJ_A}','sa@riverbend.test','Subject A'),
  ('${C}','${CY}','${SUBJ_B}','sb@riverbend.test','Subject B'),
  ('${C}','${CY}','${PA1}','pa1@riverbend.test','Peer A1'),
  ('${C}','${CY}','${PA2}','pa2@riverbend.test','Peer A2'),
  ('${C}','${CY}','${PA3}','pa3@riverbend.test','Peer A3'),
  ('${C}','${CY}','${PB1}','pb1@riverbend.test','Peer B1'),
  ('${C}','${CY}','${PB2}','pb2@riverbend.test','Peer B2')
  on conflict do nothing;

-- reviews created at fan-out in 'draft'; approver assigned (authorizes approval).
insert into reviews (id,company_id,cycle_id,employee_id,approver_id,status) values
  ('${REV_A}','${C}','${CY}','${SUBJ_A}','${APPR}','draft'),
  ('${REV_B}','${C}','${CY}','${SUBJ_B}','${APPR}','draft')
  on conflict do nothing;

-- self-reviews submitted in parallel (the bundle's self_review_id resolves to these).
insert into self_reviews (company_id,cycle_id,employee_id,review_id,sections,state) values
  ('${C}','${CY}','${SUBJ_A}','${REV_A}','{"q1":"a"}'::jsonb,'submitted'),
  ('${C}','${CY}','${SUBJ_B}','${REV_B}','{"q1":"b"}'::jsonb,'submitted')
  on conflict do nothing;

-- pending nominations: A nominates 3 peers, B nominates 2.
insert into nominations (company_id,cycle_id,employee_id,nominee_account_id,status) values
  ('${C}','${CY}','${SUBJ_A}','${PA1}','pending'),
  ('${C}','${CY}','${SUBJ_A}','${PA2}','pending'),
  ('${C}','${CY}','${SUBJ_A}','${PA3}','pending'),
  ('${C}','${CY}','${SUBJ_B}','${PB1}','pending'),
  ('${C}','${CY}','${SUBJ_B}','${PB2}','pending')
  on conflict do nothing;

-- imported-roster GAP fixtures: subject SG with a review whose approver_id is NULL
-- (the nomination-phase condition that broke nomination_candidates), and a manager
-- MG that is itself a roster member (so the decision-3 exclusion is non-vacuous).
insert into auth.users (id,email) values ('${U_SG}','sg@riverbend.test') on conflict do nothing;
insert into accounts (id, company_id, email, display_name, status, auth_user_id) values
  ('${SG}','${C}','sg@riverbend.test','Subject G','active','${U_SG}'),
  ('${MG}','${C}','mg2@riverbend.test','Manager G','active', null),
  ('${GP1}','${C}','gp1@riverbend.test','Peer G1','active', null),
  ('${GP2}','${C}','gp2@riverbend.test','Peer G2','active', null)
  on conflict do nothing;
insert into account_roles (account_id, role, company_id) values ('${SG}','subject','${C}') on conflict do nothing;
insert into roster_members (company_id, cycle_id, account_id, email, display_name, manager_account_id) values
  ('${C}','${CY}','${SG}','sg@riverbend.test','Subject G','${MG}'),
  ('${C}','${CY}','${MG}','mg2@riverbend.test','Manager G', null),
  ('${C}','${CY}','${GP1}','gp1@riverbend.test','Peer G1','${MG}'),
  ('${C}','${CY}','${GP2}','gp2@riverbend.test','Peer G2','${MG}')
  on conflict do nothing;
insert into reviews (id,company_id,cycle_id,employee_id,approver_id,status) values
  ('${REV_G}','${C}','${CY}','${SG}', null, 'draft')
  on conflict do nothing;

-- request-changes ↔ resubmit loop fixtures: subject SC, approver APC (RC.approver_id
-- = APC so is_approver_of(SC,CY) holds), pending nominations, and NO roster (so the
-- subject's edit-lock has not engaged and they can still resubmit).
insert into auth.users (id,email) values
  ('${U_SC}','sc@riverbend.test'), ('${U_APC}','apc@riverbend.test') on conflict do nothing;
insert into accounts (id, company_id, email, display_name, status, auth_user_id) values
  ('${SC}','${C}','sc@riverbend.test','Subject C','active','${U_SC}'),
  ('${APC}','${C}','apc@riverbend.test','Manager C','active','${U_APC}')
  on conflict do nothing;
insert into account_roles (account_id, role, company_id) values
  ('${SC}','subject','${C}'), ('${APC}','approver','${C}') on conflict do nothing;
insert into roster_members (company_id, cycle_id, account_id, email, display_name, manager_account_id) values
  ('${C}','${CY}','${SC}','sc@riverbend.test','Subject C','${APC}')
  on conflict do nothing;
insert into reviews (id,company_id,cycle_id,employee_id,approver_id,status) values
  ('${RC}','${C}','${CY}','${SC}','${APC}','draft')
  on conflict do nothing;
insert into nominations (company_id,cycle_id,employee_id,nominee_account_id,status) values
  ('${C}','${CY}','${SC}','${PA1}','pending'),
  ('${C}','${CY}','${SC}','${PA2}','pending')
  on conflict do nothing;

-- completion-trigger + meter fixtures: subject ST with an APPROVED roster (RST) of 3
-- peers, a submitted self-review, 3 'new' peer requests; admin ADM for cycle_progress.
insert into auth.users (id,email) values ('${U_ADM}','adm@riverbend.test') on conflict do nothing;
insert into accounts (id, company_id, email, display_name, status, auth_user_id) values
  ('${ST}','${C}','st@riverbend.test','Subject T','active', null),
  ('${APT}','${C}','apt@riverbend.test','Manager T','active', null),
  ('${TP1}','${C}','tp1@riverbend.test','Peer T1','active', null),
  ('${TP2}','${C}','tp2@riverbend.test','Peer T2','active', null),
  ('${TP3}','${C}','tp3@riverbend.test','Peer T3','active', null),
  ('${ADM}','${C}','adm@riverbend.test','Admin A','active','${U_ADM}')
  on conflict do nothing;
insert into account_roles (account_id, role, company_id) values
  ('${ST}','subject','${C}'), ('${ADM}','admin','${C}') on conflict do nothing;
insert into rosters (id, company_id, cycle_id, employee_id, approved_by, approved_at) values
  ('${RST}','${C}','${CY}','${ST}','${APT}', now())
  on conflict do nothing;
insert into roster_peers (company_id, roster_id, peer_account_id) values
  ('${C}','${RST}','${TP1}'), ('${C}','${RST}','${TP2}'), ('${C}','${RST}','${TP3}')
  on conflict do nothing;
insert into reviews (id,company_id,cycle_id,employee_id,approver_id,roster_id,status,feedback_deadline_at) values
  ('${RT}','${C}','${CY}','${ST}','${APT}','${RST}','draft', now() + interval '10 days')
  on conflict do nothing;
insert into self_reviews (company_id,cycle_id,employee_id,review_id,sections,state,submitted_at) values
  ('${C}','${CY}','${ST}','${RT}','{"q1":"t"}'::jsonb,'submitted', now())
  on conflict do nothing;
insert into peer_feedback (company_id,cycle_id,employee_id,review_id,roster_id,peer_account_id,state,deadline_at) values
  ('${C}','${CY}','${ST}','${RT}','${RST}','${TP1}','new', now() + interval '10 days'),
  ('${C}','${CY}','${ST}','${RT}','${RST}','${TP2}','new', now() + interval '10 days'),
  ('${C}','${CY}','${ST}','${RT}','${RST}','${TP3}','new', now() + interval '10 days')
  on conflict do nothing;
`;

async function asAuthenticated<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub })]);
    await client.query("set local role authenticated");
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

const auditCount = async (action: string): Promise<number> =>
  (await client.query(`select count(*)::int as n from audit_log where company_id=$1 and action=$2`, [C, action])).rows[0]
    .n;

beforeAll(async () => {
  epg = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `tf-pg2-${process.pid}-${Date.now()}`),
    user: "postgres",
    password: PASSWORD,
    port: PORT,
    persistent: false,
  });
  await epg.initialise();
  await epg.start();

  const admin = new Client({ host: "localhost", port: PORT, user: "postgres", password: PASSWORD, database: "postgres" });
  await admin.connect();
  await admin.query("create database transforma_test with encoding 'UTF8' template template0");
  await admin.end();

  client = new Client({ host: "localhost", port: PORT, user: "postgres", password: PASSWORD, database: "transforma_test" });
  await client.connect();
  await client.query("set client_encoding to 'UTF8'");

  await client.query(readFileSync(shimPath, "utf8"));
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  await client.query(readFileSync(seedPath, "utf8"));
  await client.query(SETUP_SQL);
}, 240_000);

afterAll(async () => {
  if (client) await client.end();
  if (epg) await epg.stop();
});

// ── PROC-02 nomination approval (the atomic write path) ─────────────────────
describe("PROC-02 approve_nominations", () => {
  it("an actor who is neither the approver nor the manager is REJECTED (ERR_FORBIDDEN)", async () => {
    await expect(client.query(`select app.approve_nominations($1,$2,$3)`, [CY, SUBJ_A, STRANGER])).rejects.toThrow(
      /ERR_FORBIDDEN/,
    );
  });

  it("a subject CANNOT nominate THEMSELVES — blocked at the table (nominee_not_self CHECK, red-team H1)", async () => {
    await expect(
      client.query(
        `insert into nominations (company_id,cycle_id,employee_id,nominee_account_id,status)
         values ($1,$2,$3,$3,'pending')`,
        [C, CY, SUBJ_A],
      ),
    ).rejects.toThrow(/nominee_not_self/);
  });

  it("approving creates the roster + roster_peers + attaches roster_id + seeds peer_feedback + flips nominations", async () => {
    const { rows } = await client.query(`select app.approve_nominations($1,$2,$3) as roster`, [CY, SUBJ_A, APPR]);
    const rosterId = rows[0].roster as string;
    expect(rosterId).toBeTruthy();

    const roster = (await client.query(`select approved_by from rosters where id=$1`, [rosterId])).rows[0];
    expect(roster.approved_by).toBe(APPR);

    const peers = (
      await client.query(`select peer_account_id from roster_peers where roster_id=$1 order by peer_account_id`, [rosterId])
    ).rows.map((r) => r.peer_account_id);
    expect(peers).toEqual([PA1, PA2, PA3]);

    const review = (await client.query(`select roster_id, feedback_deadline_at from reviews where id=$1`, [REV_A]))
      .rows[0];
    expect(review.roster_id).toBe(rosterId);
    expect(review.feedback_deadline_at).not.toBeNull(); // window opened

    const noms = (await client.query(`select distinct status from nominations where employee_id=$1`, [SUBJ_A])).rows;
    expect(noms).toEqual([{ status: "approved" }]); // whole set uniform

    const seeded = (
      await client.query(`select peer_account_id, state from peer_feedback where review_id=$1 order by peer_account_id`, [
        REV_A,
      ])
    ).rows;
    expect(seeded.map((r) => r.peer_account_id)).toEqual([PA1, PA2, PA3]);
    expect(seeded.every((r) => r.state === "new")).toBe(true); // one private request per peer

    // 2026-06-11 — an approved peer is granted the 'peer' role on approval, so a
    // subject-only nominee can reach the peer-feedback flow (and pass the /peer
    // route guard). Granted by trg_grant_peer_role_on_approval on roster_peers.
    const granted = (
      await client.query(`select account_id from account_roles where role='peer' and account_id = any($1::uuid[])`, [[PA1, PA2, PA3]])
    ).rows.map((r) => r.account_id).sort();
    expect(granted).toEqual([PA1, PA2, PA3].sort());
  });

  it("a non-roster account CANNOT inject a peer_feedback row (red-team FLOOR-2 root; RLS insert is roster-bound)", async () => {
    const rosterId = (await client.query(`select id from rosters where cycle_id=$1 and employee_id=$2`, [CY, SUBJ_A]))
      .rows[0].id;
    // Stranger is authenticated but NOT an approved roster peer of Subject A → the
    // 0900 insert policy rejects the row, so they cannot inject a 'submitted' vote.
    await expect(
      asAuthenticated(U_STRANGER, () =>
        client.query(
          `insert into peer_feedback (company_id,cycle_id,employee_id,review_id,roster_id,peer_account_id,state,submitted_at)
           values ($1,$2,$3,$4,$5,$6,'submitted',now())`,
          [C, CY, SUBJ_A, REV_A, rosterId, STRANGER],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it("approving is idempotent — re-running does not duplicate roster_peers or peer_feedback", async () => {
    await client.query(`select app.approve_nominations($1,$2,$3)`, [CY, SUBJ_A, APPR]);
    const peers = (await client.query(`select count(*)::int as n from roster_peers rp join rosters r on r.id=rp.roster_id where r.employee_id=$1`, [SUBJ_A])).rows[0].n;
    const reqs = (await client.query(`select count(*)::int as n from peer_feedback where review_id=$1`, [REV_A])).rows[0].n;
    expect(peers).toBe(3);
    expect(reqs).toBe(3);
  });

  it("once approved, the subject can no longer edit nominations (RLS edit-lock engages)", async () => {
    await expect(
      asAuthenticated(U_SUBJ_A, () =>
        client.query(
          `insert into nominations (company_id,cycle_id,employee_id,nominee_account_id,status)
           values ($1,$2,$3,$4,'pending')`,
          [C, CY, SUBJ_A, PB1],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it("approves subject B's smaller set (2 peers) for the below-floor close test", async () => {
    const { rows } = await client.query(`select app.approve_nominations($1,$2,$3) as roster`, [CY, SUBJ_B, APPR]);
    expect(rows[0].roster).toBeTruthy();
    const reqs = (await client.query(`select count(*)::int as n from peer_feedback where review_id=$1`, [REV_B])).rows[0].n;
    expect(reqs).toBe(2);
  });

  it("approval never seeds the subject as their OWN peer (red-team H1 defense-in-depth)", async () => {
    const selfA = (
      await client.query(`select count(*)::int as n from peer_feedback where review_id=$1 and peer_account_id=$2`, [
        REV_A,
        SUBJ_A,
      ])
    ).rows[0].n;
    const selfB = (
      await client.query(`select count(*)::int as n from peer_feedback where review_id=$1 and peer_account_id=$2`, [
        REV_B,
        SUBJ_B,
      ])
    ).rows[0].n;
    expect(selfA).toBe(0);
    expect(selfB).toBe(0);
  });
});

// ── PROC-03 feedback-close: the anonymity floor on REAL submitted data ──────
describe("PROC-03 close_feedback (floor at the compile path)", () => {
  it("AT/ABOVE floor: 3 submitted peers → peer included, bundle compiled, synthesis enqueued once", async () => {
    await client.query(`update peer_feedback set state='submitted', submitted_at=now() where review_id=$1`, [REV_A]);

    const belowBefore = await auditCount("bundle_below_floor_flagged");
    const outcome = (await client.query(`select app.close_feedback($1) as o`, [REV_A])).rows[0].o;
    expect(outcome).toBe("compiled");

    const b = (
      await client.query(
        `select submitted_peer_count, anonymity_threshold, at_or_above_floor, below_floor, peer_included, self_only, peer_theme_payload
           from feedback_bundles where review_id=$1`,
        [REV_A],
      )
    ).rows[0];
    expect(b.submitted_peer_count).toBe(3);
    expect(b.anonymity_threshold).toBe(3);
    expect(b.at_or_above_floor).toBe(true);
    expect(b.below_floor).toBe(false);
    expect(b.peer_included).toBe(true);
    expect(b.self_only).toBe(false);
    expect(b.peer_theme_payload).toBeNull(); // raw peer NEVER persisted; themes extracted in synthesis

    const jobs = (await client.query(`select state from synthesis_jobs where review_id=$1`, [REV_A])).rows;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].state).toBe("queued");

    const status = (await client.query(`select status from reviews where id=$1`, [REV_A])).rows[0].status;
    expect(status).toBe("in-review"); // draft -> in-review (the synthesis gate edge)

    // above floor must NOT raise the below-floor flag
    expect(await auditCount("bundle_below_floor_flagged")).toBe(belowBefore);
  });

  it("close is idempotent — re-running compiles nothing twice and enqueues no second job", async () => {
    const outcome = (await client.query(`select app.close_feedback($1) as o`, [REV_A])).rows[0].o;
    expect(outcome).toBe("skipped");
    const n = (await client.query(`select count(*)::int as n from synthesis_jobs where review_id=$1`, [REV_A])).rows[0].n;
    expect(n).toBe(1);
  });

  it("BELOW floor: 2 submitted peers (< 3) → peer EXCLUDED, self-only, payload NULL, below-floor flagged, still enqueued", async () => {
    // Inject a non-roster 'submitted' row directly (superuser bypasses RLS —
    // simulating a service-role/hypothetical write the 0900 insert policy now
    // blocks for authenticated users). The roster-scoped count MUST ignore it so a
    // genuinely below-floor review cannot be inflated past the floor (FLOOR-2).
    const rosterB = (await client.query(`select id from rosters where cycle_id=$1 and employee_id=$2`, [CY, SUBJ_B]))
      .rows[0].id;
    await client.query(
      `insert into peer_feedback (company_id,cycle_id,employee_id,review_id,roster_id,peer_account_id,state,submitted_at)
       values ($1,$2,$3,$4,$5,$6,'submitted',now())
       on conflict (cycle_id,employee_id,peer_account_id) do nothing`,
      [C, CY, SUBJ_B, REV_B, rosterB, STRANGER],
    );
    await client.query(`update peer_feedback set state='submitted', submitted_at=now() where review_id=$1`, [REV_B]);
    // raw 'submitted' rows for REV_B = 3, but only 2 are approved roster peers.

    const outcome = (await client.query(`select app.close_feedback($1) as o`, [REV_B])).rows[0].o;
    expect(outcome).toBe("below_floor"); // the injected non-roster row did NOT inflate n past the floor

    const b = (
      await client.query(
        `select submitted_peer_count, at_or_above_floor, below_floor, peer_included, self_only, peer_theme_payload
           from feedback_bundles where review_id=$1`,
        [REV_B],
      )
    ).rows[0];
    expect(b.submitted_peer_count).toBe(2);
    expect(b.below_floor).toBe(true);
    expect(b.at_or_above_floor).toBe(false);
    expect(b.peer_included).toBe(false); // peer content excluded ENTIRELY
    expect(b.self_only).toBe(true); // draft drawn from the self-review only
    expect(b.peer_theme_payload).toBeNull();

    const jobs = (await client.query(`select count(*)::int as n from synthesis_jobs where review_id=$1`, [REV_B])).rows[0].n;
    expect(jobs).toBe(1); // still synthesized (self-only)

    expect(await auditCount("bundle_below_floor_flagged")).toBe(1); // exactly REV_B
  });

  it("the DB structurally forbids peer leakage below floor (CHECK backstop, not just code)", async () => {
    // below_floor with peer_included → rejected
    await expect(
      client.query(
        `insert into feedback_bundles
           (company_id, cycle_id, employee_id, review_id, submitted_peer_count, anonymity_threshold,
            at_or_above_floor, below_floor, peer_included, self_only, peer_theme_payload)
         values ($1,$2,$3,$4,0,3,false,true,true,true,null)`,
        [C, CY, STRANGER, REV_A],
      ),
    ).rejects.toThrow(/below_floor_excludes_peer/);
    // below_floor with a non-null theme payload → rejected
    await expect(
      client.query(
        `insert into feedback_bundles
           (company_id, cycle_id, employee_id, review_id, submitted_peer_count, anonymity_threshold,
            at_or_above_floor, below_floor, peer_included, self_only, peer_theme_payload)
         values ($1,$2,$3,$4,0,3,false,true,false,true,'{"theme":"x"}'::jsonb)`,
        [C, CY, STRANGER, REV_A],
      ),
    ).rejects.toThrow(/below_floor_no_payload/);
  });
});

// ── nomination_candidates — imported-roster gap (the empty-pool launch bug) ──
// Regression for: reviews.approver_id is NULL during the nomination phase, and the
// decision-3 filter `<> approver_id` made `x <> NULL` → NULL → the pool rendered
// EMPTY for every subject. The fix excludes the SUBJECT'S MANAGER via IS DISTINCT
// FROM (NULL-safe). This proves the pool is non-empty and the manager is excluded.
describe("nomination_candidates returns a non-empty pool when approver_id is NULL", () => {
  it("subject sees (roster minus self minus manager) > 0 even with an unresolved approver", async () => {
    const rows = (
      await asAuthenticated(U_SG, () =>
        client.query<{ candidate_account_id: string }>("select candidate_account_id from nomination_candidates"),
      )
    ).rows.map((r) => r.candidate_account_id);
    expect(rows.length).toBeGreaterThan(0); // the exact gap: never an empty pool
    expect(rows).not.toContain(SG); // never self
    expect(rows).not.toContain(MG); // never the subject's manager (decision #3)
    expect(rows).toContain(GP1); // the manager IS a roster member, so its exclusion is real
    expect(rows).toContain(GP2);
  });
});

// ── PROC-02 send-back loop: request-changes → subject edits → resubmit → back in queue ──
// Regression for the live-pilot "request-changes dead-ends" report. The send-back must
// reach the SUBJECT: their nominations flip to changes_requested WITH the manager's note
// (the editable-form state getNominationData renders), the subject can still resubmit
// (no roster → edit-lock open), and the fresh set returns to the manager's queue as
// pending. Exercised under the real RLS policies, switching the acting account mid-
// transaction; the whole thing is rolled back so the shared fixture is untouched.
describe("PROC-02 request-changes → resubmit loop (the subject's edit-and-return path)", () => {
  it("manager send-back reaches the subject (changes_requested + note), who resubmits back into the queue", async () => {
    await client.query("begin");
    try {
      await client.query("set local role authenticated");
      const act = (sub: string) =>
        client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub })]);

      // 1) manager sends the set back with a note (requestNominationChanges write path)
      await act(U_APC);
      const upd = await client.query(
        "update nominations set status='changes_requested', manager_note=$1 where cycle_id=$2 and employee_id=$3",
        [CHANGE_NOTE, CY, SC],
      );
      expect(upd.rowCount).toBe(2); // the approver-RLS update actually flips the whole set

      // 2) the SUBJECT sees the changes-requested EDIT state: every row changes_requested,
      //    the note round-trips, and there is no roster (so the form stays editable)
      await act(U_SC);
      const seen = (await client.query("select status, manager_note from nominations where cycle_id=$1", [CY])).rows;
      expect(seen.length).toBe(2);
      expect(seen.every((r) => r.status === "changes_requested")).toBe(true);
      expect(seen.every((r) => r.manager_note === CHANGE_NOTE)).toBe(true); // note displays on the edit form
      const roster = await client.query("select id from rosters where cycle_id=$1", [CY]);
      expect(roster.rowCount).toBe(0); // edit-lock has NOT engaged → resubmit is allowed

      // 3) the subject resubmits a fresh set (submitNominations: delete then insert pending)
      await client.query("delete from nominations where cycle_id=$1 and employee_id=$2", [CY, SC]);
      await client.query(
        `insert into nominations (company_id,cycle_id,employee_id,nominee_account_id,status)
         values ($1,$2,$3,$4,'pending'),($1,$2,$3,$5,'pending')`,
        [C, CY, SC, PA1, PA3],
      );

      // 4) the manager's queue gets it back: nomination_sets is pending again, note gone
      await act(U_APC);
      const setRow = (
        await client.query("select set_status, nominee_count from nomination_sets where employee_id=$1", [SC])
      ).rows[0];
      expect(setRow.set_status).toBe("pending"); // returned to the queue, awaiting approval
      expect(setRow.nominee_count).toBe(2);
      const notes = (await client.query("select distinct manager_note from nominations where employee_id=$1", [SC])).rows;
      expect(notes).toEqual([{ manager_note: null }]); // the prior note doesn't cling to the new set
    } finally {
      await client.query("rollback");
    }
  });
});

// ── PROC-04 completion trigger — fire when inputs are complete, not only at deadline ──
// RULING: synthesis fires as soon as the self-review is submitted AND every APPROVED
// peer has RESOLVED (submitted OR declined; a closed request never blocks). The
// deadline cron stays the FALLBACK sweep. Below floor still fires (self-only). Each
// scenario mutates ST's fixtures inside a rolled-back transaction (isolation).
describe("PROC-04 completion trigger (maybe_close_on_completion)", () => {
  const inTx = async (fn: () => Promise<void>) => {
    await client.query("begin");
    try {
      await fn();
    } finally {
      await client.query("rollback");
    }
  };
  const trigger = async () => (await client.query("select app.maybe_close_on_completion($1) as o", [RT])).rows[0].o;
  const bundles = async () => (await client.query("select count(*)::int as n from feedback_bundles where review_id=$1", [RT])).rows[0].n;
  const jobs = async () => (await client.query("select state from synthesis_jobs where review_id=$1", [RT])).rows;
  const status = async () => (await client.query("select status from reviews where id=$1", [RT])).rows[0].status;

  it("PENDING peer request → does NOT fire (waiting_peers); no bundle, no job", async () => {
    await inTx(async () => {
      // fixtures: 3 peers all 'new' (unresolved), self submitted
      expect(await trigger()).toBe("waiting_peers");
      expect(await bundles()).toBe(0);
      expect((await jobs()).length).toBe(0);
    });
  });

  it("a peer still in 'draft' (autosaving, in progress) blocks completion (waiting_peers)", async () => {
    await inTx(async () => {
      await client.query("update peer_feedback set state='submitted', submitted_at=now() where review_id=$1 and peer_account_id = any($2::uuid[])", [RT, [TP1, TP2]]);
      await client.query("update peer_feedback set state='draft' where review_id=$1 and peer_account_id=$2", [RT, TP3]);
      expect(await trigger()).toBe("waiting_peers"); // 'draft' is unresolved, not terminal
      expect(await bundles()).toBe(0);
    });
  });

  it("self-review NOT submitted → does NOT fire (waiting_self), even with every peer resolved", async () => {
    await inTx(async () => {
      await client.query("update self_reviews set state='draft', submitted_at=null where review_id=$1", [RT]);
      await client.query("update peer_feedback set state='submitted', submitted_at=now() where review_id=$1", [RT]);
      expect(await trigger()).toBe("waiting_self");
      expect(await bundles()).toBe(0);
    });
  });

  it("ALL approved peers resolved WITH A DECLINE → FIRES synthesis (declines count as resolved)", async () => {
    await inTx(async () => {
      await client.query("update peer_feedback set state='submitted', submitted_at=now() where review_id=$1 and peer_account_id = any($2::uuid[])", [RT, [TP1, TP2]]);
      await client.query("update peer_feedback set state='declined', declined_at=now() where review_id=$1 and peer_account_id=$2", [RT, TP3]);
      // 2 submitted < floor(3) → self-only path, but it FIRES (all 3 resolved)
      expect(await trigger()).toBe("below_floor");
      expect(await bundles()).toBe(1);
      const j = await jobs();
      expect(j.length).toBe(1);
      expect(j[0].state).toBe("queued");
      expect(await status()).toBe("in-review"); // draft → in-review on close
    });
  });

  it("all peers SUBMITTED (>= floor) → FIRES synthesis (compiled, at/above floor)", async () => {
    await inTx(async () => {
      await client.query("update peer_feedback set state='submitted', submitted_at=now() where review_id=$1", [RT]);
      expect(await trigger()).toBe("compiled"); // 3 submitted >= threshold 3
      expect(await bundles()).toBe(1);
      expect((await jobs())[0].state).toBe("queued");
    });
  });

  it("a CLOSED request never blocks completion (counts as resolved)", async () => {
    await inTx(async () => {
      await client.query("update peer_feedback set state='submitted', submitted_at=now() where review_id=$1 and peer_account_id=$2", [RT, TP1]);
      await client.query("update peer_feedback set state='declined', declined_at=now() where review_id=$1 and peer_account_id=$2", [RT, TP2]);
      await client.query("update peer_feedback set state='closed' where review_id=$1 and peer_account_id=$2", [RT, TP3]);
      expect(await trigger()).toBe("below_floor"); // 1 submitted, all resolved → fires
      expect(await bundles()).toBe(1);
    });
  });

  it("deadline sweep covers the rest: an UNRESOLVED peer past deadline still closes via close_feedback", async () => {
    await inTx(async () => {
      // one peer submitted, two still 'new' → completion does NOT fire
      await client.query("update peer_feedback set state='submitted', submitted_at=now() where review_id=$1 and peer_account_id=$2", [RT, TP1]);
      expect(await trigger()).toBe("waiting_peers");
      // the deadline cron calls close_feedback directly, compiling with whatever exists
      const swept = (await client.query("select app.close_feedback($1) as o", [RT])).rows[0].o;
      expect(swept).toBe("below_floor"); // 1 submitted < floor → self-only
      expect(await bundles()).toBe(1);
      // the still-'new' requests are CLOSED by the sweep (can't change the floor later)
      const states = (
        await client.query("select state from peer_feedback where review_id=$1 and peer_account_id = any($2::uuid[])", [RT, [TP2, TP3]])
      ).rows.map((r) => r.state);
      expect(states.every((s) => s === "closed")).toBe(true);
    });
  });
});

// ── admin monitor meters pinned to REAL submission counts (cycle_progress view) ──
// Regression for the "Self-reviews 0/5, Peer feedback 0/5 despite real input" bug:
// the meters were derived from review STATUS (past 'draft'), so submitted inputs on a
// still-draft review read 0. cycle_progress counts submission STATE instead. Delta
// asserts prove a DRAFT review's submitted self-review + submitted peer response are
// counted — independent of review.status. Rolled back for isolation.
describe("admin monitor meters pinned to real submission counts (cycle_progress)", () => {
  it("counts submitted self-reviews + submitted peer responses even when the review is still DRAFT", async () => {
    await client.query("begin");
    try {
      const asAdmin = async () => {
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U_ADM })]);
      };
      const prog = async () => {
        await asAdmin();
        return (
          await client.query("select self_submitted, peer_responded from cycle_progress where cycle_id=$1", [CY])
        ).rows[0];
      };

      // ST's review is DRAFT; its self-review is 'submitted'; its peers are 'new'.
      const stStatusBefore = (await client.query("select status from reviews where id=$1", [RT])).rows[0].status;
      expect(stStatusBefore).toBe("draft");

      const base = await prog();

      // (self) un-submitting ST's self-review drops self_submitted by exactly 1 — the
      // meter reflects self_reviews.state, NOT review.status (ST stays 'draft').
      await client.query("reset role");
      await client.query("update self_reviews set state='draft' where review_id=$1", [RT]);
      expect((await prog()).self_submitted).toBe(base.self_submitted - 1);

      // (peer) submitting one of ST's peer requests raises peer_responded by exactly 1 —
      // a submitted peer response counts though ST's review is still 'draft'.
      await client.query("reset role");
      await client.query("update peer_feedback set state='submitted', submitted_at=now() where review_id=$1 and peer_account_id=$2", [RT, TP1]);
      expect((await prog()).peer_responded).toBe(base.peer_responded + 1);

      // ST's review never left 'draft' — proving the meters are submission-based.
      await client.query("reset role");
      expect((await client.query("select status from reviews where id=$1", [RT])).rows[0].status).toBe("draft");
    } finally {
      await client.query("rollback");
    }
  });
});
