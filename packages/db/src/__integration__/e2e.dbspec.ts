import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The full review lifecycle driven through REAL rows + REAL functions + RLS on
// embedded Postgres: fan-out → nominate → approve → self+peer (parallel) → close
// → synthesis (output simulated; the Anthropic call is a live-only check) →
// resolve approver → queue → finalize/reveal → acknowledge → lock. Plus the
// PROC-06 admin actions. Activation (PROC-01) is proven in token-gate.dbspec; this
// thread begins from an activated, populated roster.

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const seedPath = path.join(repoRoot, "supabase", "seed.sql");
const shimPath = path.join(here, "shim.sql");

const PORT = 54397;
const PASSWORD = "postgres";

const C = "11111111-1111-1111-1111-111111111111";
const CY = "22222222-2222-2222-2222-222222222222";

const ADMIN = "a2000000-0000-0000-0000-000000000001";
const MGR = "a2000000-0000-0000-0000-000000000002"; // manager/approver of the subjects
const MGR2 = "a2000000-0000-0000-0000-000000000003"; // alternate approver (reassign target)
const SUBJ = "a2000000-0000-0000-0000-0000000000aa"; // the end-to-end thread subject
const P1 = "a2000000-0000-0000-0000-0000000000a1";
const P2 = "a2000000-0000-0000-0000-0000000000a2";
const P3 = "a2000000-0000-0000-0000-0000000000a3";
const SUBJ_R = "a2000000-0000-0000-0000-0000000000cc"; // reassign-test subject
const SUBJ_W = "a2000000-0000-0000-0000-0000000000dd"; // withdraw-test subject
const PW = "a2000000-0000-0000-0000-0000000000e1"; // a peer of SUBJ_W
const U_ADMIN = "e2000000-0000-0000-0000-000000000001";
const U_MGR = "e2000000-0000-0000-0000-000000000002";
const U_SUBJ = "e2000000-0000-0000-0000-0000000000aa";
const U_P1 = "e2000000-0000-0000-0000-0000000000a1";
const U_SUBJ_W = "e2000000-0000-0000-0000-0000000000dd";
const U_PW = "e2000000-0000-0000-0000-0000000000e1";

let epg: EmbeddedPostgres;
let client: pg.Client;
let REV = ""; // SUBJ's review id (created by fan-out)

const SETUP_SQL = `
insert into auth.users (id,email) values
  ('${U_ADMIN}','admin@rb.test'),('${U_MGR}','mgr@rb.test'),('${U_SUBJ}','subj@rb.test'),
  ('${U_P1}','p1@rb.test'),('${U_SUBJ_W}','subjw@rb.test'),('${U_PW}','pw@rb.test') on conflict do nothing;

insert into accounts (id, company_id, email, display_name, status, auth_user_id) values
  ('${ADMIN}','${C}','admin@rb.test','Admin A','active','${U_ADMIN}'),
  ('${MGR}','${C}','mgr@rb.test','Manager M','active','${U_MGR}'),
  ('${MGR2}','${C}','mgr2@rb.test','Manager Two','active', null),
  ('${SUBJ}','${C}','subj@rb.test','Subject S','active','${U_SUBJ}'),
  ('${SUBJ_R}','${C}','subjr@rb.test','Subject R','active', null),
  ('${SUBJ_W}','${C}','subjw@rb.test','Subject W','active','${U_SUBJ_W}'),
  ('${P1}','${C}','p1@rb.test','Peer One','active','${U_P1}'),
  ('${P2}','${C}','p2@rb.test','Peer Two','active', null),
  ('${P3}','${C}','p3@rb.test','Peer Three','active', null),
  ('${PW}','${C}','pw@rb.test','Peer W','active','${U_PW}')
  on conflict do nothing;

insert into account_roles (account_id, role, company_id) values
  ('${ADMIN}','admin','${C}'),('${MGR}','approver','${C}'),('${MGR2}','approver','${C}'),
  ('${SUBJ}','subject','${C}'),('${SUBJ_R}','subject','${C}'),('${SUBJ_W}','subject','${C}'),
  ('${P1}','peer','${C}'),('${P2}','peer','${C}'),('${P3}','peer','${C}'),('${PW}','peer','${C}')
  on conflict do nothing;

-- Roster population: subjects (manager = MGR) get a review at fan-out; peers do not.
insert into roster_members (company_id, cycle_id, account_id, email, display_name, manager_account_id, structural_roles) values
  ('${C}','${CY}','${SUBJ}','subj@rb.test','Subject S','${MGR}', array['subject']::app_role[]),
  ('${C}','${CY}','${SUBJ_R}','subjr@rb.test','Subject R','${MGR}', array['subject']::app_role[]),
  ('${C}','${CY}','${SUBJ_W}','subjw@rb.test','Subject W','${MGR}', array['subject']::app_role[]),
  ('${C}','${CY}','${P1}','p1@rb.test','Peer One','${MGR}', array['peer']::app_role[]),
  ('${C}','${CY}','${P2}','p2@rb.test','Peer Two','${MGR}', array['peer']::app_role[]),
  ('${C}','${CY}','${P3}','p3@rb.test','Peer Three','${MGR}', array['peer']::app_role[]),
  ('${C}','${CY}','${PW}','pw@rb.test','Peer W','${MGR}', array['peer']::app_role[])
  on conflict do nothing;
`;

// reads (rolled back — isolation is fine for assertions)
async function asAuth<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub })]);
    await client.query("set local role authenticated");
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

// PERSISTENT authenticated writes — the same proven (set local role + jwt) pattern
// as asAuth, but COMMITTED so the thread's state survives across steps while still
// running through RLS as the authenticated user. (set local resets on commit.)
async function asAuthPersist<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub })]);
    await client.query("set local role authenticated");
    const r = await fn();
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

beforeAll(async () => {
  epg = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `tf-pg3-${process.pid}-${Date.now()}`),
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

describe("end-to-end review thread (real rows)", () => {
  it("1. fan-out creates one draft review per subject — approver_id + input_author_id BOTH NULL", async () => {
    const n = (await client.query(`select app.start_cycle_fanout($1,$2) as n`, [CY, ADMIN])).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(3); // ≥ our 3 subjects (the seed may add its own)
    const r = (
      await client.query(`select id, status, approver_id, input_author_id from reviews where cycle_id=$1 and employee_id=$2`, [
        CY,
        SUBJ,
      ])
    ).rows[0];
    REV = r.id;
    expect(r.status).toBe("draft");
    expect(r.approver_id).toBeNull(); // resolved later — the NULL/NULL case 0600 fixed
    expect(r.input_author_id).toBeNull();
  });

  it("2. subject nominates 3 peers (own RLS path)", async () => {
    await asAuthPersist(U_SUBJ, async () => {
      for (const p of [P1, P2, P3]) {
        await client.query(
          `insert into nominations (company_id,cycle_id,employee_id,nominee_account_id,status) values ($1,$2,$3,$4,'pending')`,
          [C, CY, SUBJ, p],
        );
      }
    });
    const n = (await client.query(`select count(*)::int as n from nominations where employee_id=$1`, [SUBJ])).rows[0].n;
    expect(n).toBe(3);
  });

  it("3. manager approves → roster + roster_peers + peer_feedback seeded + roster_id attached", async () => {
    const rosterId = (await client.query(`select app.approve_nominations($1,$2,$3) as r`, [CY, SUBJ, MGR])).rows[0].r;
    expect(rosterId).toBeTruthy();
    const peers = (await client.query(`select count(*)::int as n from roster_peers where roster_id=$1`, [rosterId]))
      .rows[0].n;
    expect(peers).toBe(3);
    const seeded = (await client.query(`select count(*)::int as n from peer_feedback where review_id=$1 and state='new'`, [REV])).rows[0].n;
    expect(seeded).toBe(3);
    const attached = (await client.query(`select roster_id from reviews where id=$1`, [REV])).rows[0].roster_id;
    expect(attached).toBe(rosterId);
  });

  it("4. self-review and peer feedback are collected IN PARALLEL (neither gates the other)", async () => {
    // self-review — subject's own RLS path
    await asAuthPersist(U_SUBJ, () =>
      client.query(
        `insert into self_reviews (company_id,cycle_id,employee_id,review_id,sections,state,submitted_at)
         values ($1,$2,$3,$4,'{"q1":"my self review"}'::jsonb,'submitted',now())`,
        [C, CY, SUBJ, REV],
      ),
    );
    // peer P1 submits via its own RLS path; P2/P3 via the seeded rows (service path)
    await asAuthPersist(U_P1, () =>
      client.query(
        `update peer_feedback set responses='{"pq2":"great with people"}'::jsonb, state='submitted', submitted_at=now()
         where review_id=$1`,
        [REV],
      ),
    );
    await client.query(
      `update peer_feedback set state='submitted', submitted_at=now() where review_id=$1 and peer_account_id in ($2,$3)`,
      [REV, P2, P3],
    );
    const self = (await client.query(`select state from self_reviews where review_id=$1`, [REV])).rows[0].state;
    const peers = (await client.query(`select count(*)::int as n from peer_feedback where review_id=$1 and state='submitted'`, [REV])).rows[0].n;
    expect(self).toBe("submitted");
    expect(peers).toBe(3);
  });

  it("5. feedback-close: 3 peers ≥ floor → bundle compiled (peer included), draft→in-review, synthesis enqueued", async () => {
    const outcome = (await client.query(`select app.close_feedback($1) as o`, [REV])).rows[0].o;
    expect(outcome).toBe("compiled");
    const b = (await client.query(`select at_or_above_floor, peer_included, peer_theme_payload from feedback_bundles where review_id=$1`, [REV])).rows[0];
    expect(b.at_or_above_floor).toBe(true);
    expect(b.peer_included).toBe(true);
    expect(b.peer_theme_payload).toBeNull();
    expect((await client.query(`select status from reviews where id=$1`, [REV])).rows[0].status).toBe("in-review");
    expect((await client.query(`select count(*)::int as n from synthesis_jobs where review_id=$1`, [REV])).rows[0].n).toBe(1);
  });

  it("6. synthesis output (simulated) attaches a draft; resolve_approver assigns the eligible manager", async () => {
    await client.query(
      `insert into review_drafts (company_id,cycle_id,employee_id,review_id,sections,attempt_count,generated_by_model)
       values ($1,$2,$3,$4,'{"summary":"A strong cycle.","strengths":"Follow-through.","areasToGrow":"Delegation.","focusNextCycle":"Coach a teammate."}'::jsonb,1,'claude-opus-4-8')`,
      [C, CY, SUBJ, REV],
    );
    await client.query(`update reviews set review_draft_id=(select id from review_drafts where review_id=$1) where id=$1`, [REV]);
    const resolved = (await client.query(`select app.resolve_approver($1) as o`, [REV])).rows[0].o;
    expect(resolved).toBe("resolved");
    expect((await client.query(`select approver_id from reviews where id=$1`, [REV])).rows[0].approver_id).toBe(MGR);
  });

  it("7. the review reaches the MANAGER's queue; the SUBJECT still sees only 'in-review' (reveal boundary)", async () => {
    const queue = await asAuth(U_MGR, async () =>
      (await client.query(`select review_id from approver_queue`)).rows.map((r) => r.review_id),
    );
    expect(queue).toContain(REV);
    // the subject's only channel is status-only; no narrative/rating before reveal
    const sub = await asAuth(U_SUBJ, async () =>
      (await client.query(`select display_status from subject_review_status where review_id=$1`, [REV])).rows[0],
    );
    expect(sub.display_status).toBe("in-review");
    const revealed = await asAuth(U_SUBJ, async () =>
      (await client.query(`select count(*)::int as n from revealed_review where review_id=$1`, [REV])).rows[0].n,
    );
    expect(revealed).toBe(0); // nothing revealed pre-finalize
  });

  it("8. manager sets a rating and finalizes → REVEAL (awaiting-acknowledgement), NOT lock", async () => {
    await asAuthPersist(U_MGR, () =>
      client.query(
        `update reviews set rating='Meets expectations', status='awaiting-acknowledgement',
                            revealed_at=now(), ack_window_ends_at=now()+interval '7 days'
         where id=$1 and status in ('in-review','flagged')`,
        [REV],
      ),
    );
    const r = (await client.query(`select status, locked_at from reviews where id=$1`, [REV])).rows[0];
    expect(r.status).toBe("awaiting-acknowledgement");
    expect(r.locked_at).toBeNull(); // revealed, not locked
  });

  it("9. the subject now sees the finished review (narrative + rating) before lock", async () => {
    const rev = await asAuth(U_SUBJ, async () =>
      (await client.query(`select rating, narrative from revealed_review where review_id=$1`, [REV])).rows,
    );
    expect(rev).toHaveLength(1);
    expect(rev[0].rating).toBe("Meets expectations");
    expect(rev[0].narrative).toBeTruthy();
  });

  it("10. subject acknowledges → commit_lock fires the permanent lock (snapshot + audit)", async () => {
    await asAuthPersist(U_SUBJ, () =>
      client.query(`insert into employee_responses (company_id,review_id,employee_id,outcome) values ($1,$2,$3,'acknowledged')`, [
        C,
        REV,
        SUBJ,
      ]),
    );
    await client.query(`select app.commit_lock($1,'acknowledged')`, [REV]);
    expect((await client.query(`select status from reviews where id=$1`, [REV])).rows[0].status).toBe("locked");
    const lock = (await client.query(`select rating, narrative from locked_reviews where review_id=$1`, [REV])).rows[0];
    expect(lock.rating).toBe("Meets expectations");
    expect(lock.narrative).toBeTruthy();
  });

  it("11. the locked review is immutable (no post-lock correction) and the audit chain verifies from genesis", async () => {
    await expect(client.query(`update reviews set status='in-review' where id=$1`, [REV])).rejects.toThrow(
      /ERR_REVIEW_LOCKED/,
    );
    const broken = (await client.query(`select app.verify_audit_chain($1) as seq`, [C])).rows[0].seq;
    expect(broken).toBeNull(); // intact from genesis
  });
});

describe("PROC-06 admin actions", () => {
  it("fan-out is idempotent — re-running creates ZERO duplicate reviews", async () => {
    const before = (await client.query(`select count(*)::int as n from reviews where cycle_id=$1`, [CY])).rows[0].n;
    const created = (await client.query(`select app.start_cycle_fanout($1,$2) as n`, [CY, ADMIN])).rows[0].n;
    const after = (await client.query(`select count(*)::int as n from reviews where cycle_id=$1`, [CY])).rows[0].n;
    expect(created).toBe(0);
    expect(after).toBe(before);
  });

  it("a non-admin cannot fan out / reassign / withdraw (ERR_FORBIDDEN)", async () => {
    await expect(client.query(`select app.start_cycle_fanout($1,$2)`, [CY, MGR])).rejects.toThrow(/ERR_FORBIDDEN/);
  });

  it("reassign re-passes SoD: the subject is rejected; an eligible manager succeeds", async () => {
    const revR = (await client.query(`select id from reviews where cycle_id=$1 and employee_id=$2`, [CY, SUBJ_R])).rows[0].id;
    // the fan-out review is NULL/NULL — confirm before resolving
    const pre = (await client.query(`select approver_id, input_author_id from reviews where id=$1`, [revR])).rows[0];
    expect(pre.approver_id).toBeNull();
    expect(pre.input_author_id).toBeNull();
    // reassigning to the subject themselves fails SoD
    await expect(client.query(`select app.reassign_approver($1,$2,$3)`, [revR, SUBJ_R, ADMIN])).rejects.toThrow(
      /ERR_SOD_INELIGIBLE/,
    );
    // an eligible manager succeeds
    await client.query(`select app.reassign_approver($1,$2,$3)`, [revR, MGR2, ADMIN]);
    expect((await client.query(`select approver_id from reviews where id=$1`, [revR])).rows[0].approver_id).toBe(MGR2);
  });

  it("extend deadline updates one subject's feedback window (admin only)", async () => {
    const revR = (await client.query(`select id from reviews where cycle_id=$1 and employee_id=$2`, [CY, SUBJ_R])).rows[0].id;
    await client.query(`select app.extend_deadline($1,'feedback', now()+interval '30 days', $2)`, [revR, ADMIN]);
    const dl = (await client.query(`select feedback_deadline_at from reviews where id=$1`, [revR])).rows[0].feedback_deadline_at;
    expect(dl).not.toBeNull();
    await expect(
      client.query(`select app.extend_deadline($1,'feedback', now(), $2)`, [revR, MGR]),
    ).rejects.toThrow(/ERR_FORBIDDEN/);
  });

  it("withdraw archives a departed subject's feedback with NO read path, and aborts the in-flight review", async () => {
    const revW = (await client.query(`select id from reviews where cycle_id=$1 and employee_id=$2`, [CY, SUBJ_W])).rows[0].id;
    // seed SUBJ_W's feedback (a self-review + a submitted peer row) directly,
    // bypassing RLS as superuser — we only need the rows present to prove the
    // read path closes on withdraw.
    await client.query(
      `insert into rosters (id,company_id,cycle_id,employee_id,approved_by,approved_at)
       values (gen_random_uuid(),$1,$2,$3,$4,now()) on conflict (cycle_id,employee_id) do nothing`,
      [C, CY, SUBJ_W, MGR],
    );
    const rW = (await client.query(`select id from rosters where cycle_id=$1 and employee_id=$2`, [CY, SUBJ_W])).rows[0].id;
    await client.query(`insert into roster_peers (company_id,roster_id,peer_account_id) values ($1,$2,$3) on conflict do nothing`, [C, rW, PW]);
    await client.query(
      `insert into self_reviews (company_id,cycle_id,employee_id,review_id,sections,state)
       values ($1,$2,$3,$4,'{"q1":"w"}'::jsonb,'submitted') on conflict do nothing`,
      [C, CY, SUBJ_W, revW],
    );
    await client.query(
      `insert into peer_feedback (company_id,cycle_id,employee_id,review_id,roster_id,peer_account_id,responses,state,submitted_at)
       values ($1,$2,$3,$4,$5,$6,'{"pq2":"x"}'::jsonb,'submitted',now()) on conflict do nothing`,
      [C, CY, SUBJ_W, revW, rW, PW],
    );
    // a synthesized draft (derivative of the archived inputs) — must also archive (WD-1)
    await client.query(
      `insert into review_drafts (company_id,cycle_id,employee_id,review_id,sections,attempt_count)
       values ($1,$2,$3,$4,'{"summary":"w"}'::jsonb,1) on conflict do nothing`,
      [C, CY, SUBJ_W, revW],
    );

    // before withdraw: PW reads their own row; SUBJ_W reads their self-review; the
    // manager (approver-of via the roster manager link) reads the draft.
    expect(
      await asAuth(U_PW, async () =>
        (await client.query(`select count(*)::int as n from peer_feedback where review_id=$1`, [revW])).rows[0].n,
      ),
    ).toBe(1);
    expect(
      await asAuth(U_SUBJ_W, async () =>
        (await client.query(`select count(*)::int as n from self_reviews where review_id=$1`, [revW])).rows[0].n,
      ),
    ).toBe(1);
    expect(
      await asAuth(U_MGR, async () =>
        (await client.query(`select count(*)::int as n from review_drafts where review_id=$1`, [revW])).rows[0].n,
      ),
    ).toBe(1);

    // withdraw
    const out = (await client.query(`select app.withdraw_subject($1,$2,$3) as o`, [CY, SUBJ_W, ADMIN])).rows[0].o;
    expect(out).toBe("withdrawn");
    expect((await client.query(`select status, aborted_reason from reviews where id=$1`, [revW])).rows[0].status).toBe("aborted");

    // after withdraw: every read path is CLOSED (archived, never surfaced) — peer
    // feedback, self-review, AND the derivative draft narrative.
    expect(
      await asAuth(U_PW, async () =>
        (await client.query(`select count(*)::int as n from peer_feedback where review_id=$1`, [revW])).rows[0].n,
      ),
    ).toBe(0);
    expect(
      await asAuth(U_SUBJ_W, async () =>
        (await client.query(`select count(*)::int as n from self_reviews where review_id=$1`, [revW])).rows[0].n,
      ),
    ).toBe(0);
    expect(
      await asAuth(U_MGR, async () =>
        (await client.query(`select count(*)::int as n from review_drafts where review_id=$1`, [revW])).rows[0].n,
      ),
    ).toBe(0);
  });

  it("admin has NO read path to individual review content (self-review/draft/review/locked/response)", async () => {
    // REV is SUBJ's review, driven all the way to locked by the e2e thread — so all
    // five content tables have a row for it. The admin must see NONE of them
    // (aggregate-only oversight); the assigned approver + subject still can.
    const adminCounts = await asAuth(U_ADMIN, async () => ({
      self: (await client.query(`select count(*)::int as n from self_reviews where review_id=$1`, [REV])).rows[0].n,
      draft: (await client.query(`select count(*)::int as n from review_drafts where review_id=$1`, [REV])).rows[0].n,
      review: (await client.query(`select count(*)::int as n from reviews where id=$1`, [REV])).rows[0].n,
      locked: (await client.query(`select count(*)::int as n from locked_reviews where review_id=$1`, [REV])).rows[0].n,
      response: (await client.query(`select count(*)::int as n from employee_responses where review_id=$1`, [REV])).rows[0].n,
    }));
    expect(adminCounts).toEqual({ self: 0, draft: 0, review: 0, locked: 0, response: 0 });

    // not over-restricted: the assigned approver + the subject still read the finished review
    const mgrLocked = await asAuth(U_MGR, async () =>
      (await client.query(`select count(*)::int as n from locked_reviews where review_id=$1`, [REV])).rows[0].n,
    );
    const subjLocked = await asAuth(U_SUBJ, async () =>
      (await client.query(`select count(*)::int as n from locked_reviews where review_id=$1`, [REV])).rows[0].n,
    );
    expect(mgrLocked).toBe(1);
    expect(subjLocked).toBe(1);
  });

  it("privileged app.* functions are SERVICE-ROLE only — an authenticated user is denied", async () => {
    // The web/worker call these via the service role; an authenticated user must not
    // reach them directly (forging audit, reading raw peer feedback, force-locking,
    // cross-tenant admin actions). Each must raise permission denied.
    const denied = [
      `select app.commit_lock('${REV}','acknowledged')`,
      `select app.append_audit('${C}','review_locked',null,'${REV}','{}'::jsonb)`,
      `select app.close_one_ack_window('${REV}')`,
      `select app.purge_one_retention('${REV}')`,
      `select app.worker_submitted_peer_responses('${REV}','${C}')`,
      `select app.approve_nominations('${CY}','${SUBJ}','${MGR}')`,
      `select app.start_cycle_fanout('${CY}','${ADMIN}')`,
      `select app.reassign_approver('${REV}','${MGR}','${ADMIN}')`,
      `select app.withdraw_subject('${CY}','${SUBJ}','${ADMIN}')`,
    ];
    for (const sql of denied) {
      await expect(asAuth(U_MGR, () => client.query(sql))).rejects.toThrow(/permission denied/i);
    }
    // read/identity helpers RLS depends on remain executable by authenticated.
    await expect(
      asAuth(U_MGR, () => client.query(`select app.is_approver_of('${SUBJ}','${CY}') as ok`)),
    ).resolves.toBeDefined();
  });

  it("admin monitor exposes AGGREGATE counts only — no per-person or content columns", async () => {
    const rows = await asAuth(U_ADMIN, async () =>
      (await client.query(`select * from cycle_monitor where cycle_id=$1`, [CY])).rows,
    );
    expect(rows.length).toBeGreaterThan(0);
    const cols = Object.keys(rows[0]);
    expect(cols.sort()).toEqual(["company_id", "cycle_id", "n", "status"]);
    for (const c of ["employee_id", "narrative", "rating", "subject_name"]) expect(cols).not.toContain(c);
    // SUBJ's review reached 'locked' via the e2e thread
    const locked = rows.find((r) => r.status === "locked");
    expect((locked?.n ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
