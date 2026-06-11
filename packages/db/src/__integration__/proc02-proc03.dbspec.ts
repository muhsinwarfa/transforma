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
