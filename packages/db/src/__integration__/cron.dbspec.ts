import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// PROC-05 ack-window auto-lock + retention sweep, on real rows. A review is seeded
// at 'awaiting-acknowledgement' with a revealed draft + rating and an ELAPSED ack
// window and NO subject response (silence) — the case the auto-lock cron closes.

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const seedPath = path.join(repoRoot, "supabase", "seed.sql");
const shimPath = path.join(here, "shim.sql");

const PORT = 54396;
const PASSWORD = "postgres";
const C = "11111111-1111-1111-1111-111111111111";
const CY = "22222222-2222-2222-2222-222222222222";

const SUBJ = "a3000000-0000-0000-0000-0000000000aa";
const MGR = "a3000000-0000-0000-0000-000000000002";
const PC1 = "a3000000-0000-0000-0000-0000000000a1";
const PC2 = "a3000000-0000-0000-0000-0000000000a2";
const REV = "c3000000-0000-0000-0000-0000000000aa";
const DR = "d3000000-0000-0000-0000-0000000000aa";
const SR = "57000000-0000-0000-0000-0000000000aa";
const RO = "f3000000-0000-0000-0000-0000000000aa";
// REV2: in-review, NO draft (reveal-requires-narrative). REV3: revealed with a real
// 'responded' subject response + elapsed window (lock-reason fidelity).
const SUBJ2 = "a3000000-0000-0000-0000-0000000000b2";
const SUBJ3 = "a3000000-0000-0000-0000-0000000000b3";
const REV2 = "c3000000-0000-0000-0000-0000000000b2";
const REV3 = "c3000000-0000-0000-0000-0000000000b3";
const DR3 = "d3000000-0000-0000-0000-0000000000b3";

const NARRATIVE = `{"summary":"A steady cycle.","strengths":"Calm under pressure.","areasToGrow":"Delegation.","focusNextCycle":"Coach a teammate."}`;

let epg: EmbeddedPostgres;
let client: pg.Client;

const SETUP_SQL = `
insert into accounts (id, company_id, email, display_name, status) values
  ('${SUBJ}','${C}','subjc@rb.test','Subject C','active'),
  ('${MGR}','${C}','mgrc@rb.test','Manager C','active'),
  ('${PC1}','${C}','pc1@rb.test','Peer C1','active'),
  ('${PC2}','${C}','pc2@rb.test','Peer C2','active'),
  ('${SUBJ2}','${C}','subjc2@rb.test','Subject C2','active'),
  ('${SUBJ3}','${C}','subjc3@rb.test','Subject C3','active')
  on conflict do nothing;

insert into rosters (id, company_id, cycle_id, employee_id, approved_by, approved_at)
  values ('${RO}','${C}','${CY}','${SUBJ}','${MGR}', now()) on conflict do nothing;
insert into roster_peers (company_id, roster_id, peer_account_id) values
  ('${C}','${RO}','${PC1}'),('${C}','${RO}','${PC2}') on conflict do nothing;

-- attach the draft while in-review (the reveal-freeze trigger forbids attaching it
-- after reveal), THEN reveal with an already-ELAPSED window and no response (silence).
insert into reviews (id, company_id, cycle_id, employee_id, roster_id, approver_id, rating, status)
  values ('${REV}','${C}','${CY}','${SUBJ}','${RO}','${MGR}','Meets expectations','in-review') on conflict do nothing;
insert into review_drafts (id, company_id, cycle_id, employee_id, review_id, sections, attempt_count)
  values ('${DR}','${C}','${CY}','${SUBJ}','${REV}','${NARRATIVE}'::jsonb, 1) on conflict do nothing;
update reviews set review_draft_id='${DR}' where id='${REV}';
update reviews set status='awaiting-acknowledgement', revealed_at=now() - interval '8 days',
                   ack_window_ends_at=now() - interval '1 day' where id='${REV}';

insert into self_reviews (id, company_id, cycle_id, employee_id, review_id, sections, state, submitted_at)
  values ('${SR}','${C}','${CY}','${SUBJ}','${REV}','{"q1":"my self review body"}'::jsonb,'submitted', now()) on conflict do nothing;

insert into peer_feedback (company_id, cycle_id, employee_id, review_id, roster_id, peer_account_id, responses, state, submitted_at) values
  ('${C}','${CY}','${SUBJ}','${REV}','${RO}','${PC1}','{"pq2":"great teammate"}'::jsonb,'submitted', now()),
  ('${C}','${CY}','${SUBJ}','${REV}','${RO}','${PC2}','{"pq2":"dependable"}'::jsonb,'submitted', now())
  on conflict do nothing;

-- a compiled bundle with a (non-null) theme payload, to prove retention nulls it.
insert into feedback_bundles (company_id, cycle_id, employee_id, review_id, roster_id, self_review_id,
                              submitted_peer_count, anonymity_threshold, at_or_above_floor, below_floor, peer_included, self_only, peer_theme_payload)
  values ('${C}','${CY}','${SUBJ}','${REV}','${RO}','${SR}', 3, 3, true, false, true, false, '{"theme":"reliable"}'::jsonb)
  on conflict do nothing;

-- REV2: in-review, rating set, NO draft attached (reveal must be rejected).
insert into reviews (id, company_id, cycle_id, employee_id, approver_id, rating, status)
  values ('${REV2}','${C}','${CY}','${SUBJ2}','${MGR}','Meets expectations','in-review') on conflict do nothing;

-- REV3: revealed (draft attached while in-review, then revealed), elapsed window,
-- AND a real 'responded' subject response committed beside it.
insert into reviews (id, company_id, cycle_id, employee_id, approver_id, rating, status)
  values ('${REV3}','${C}','${CY}','${SUBJ3}','${MGR}','Meets expectations','in-review') on conflict do nothing;
insert into review_drafts (id, company_id, cycle_id, employee_id, review_id, sections, attempt_count)
  values ('${DR3}','${C}','${CY}','${SUBJ3}','${REV3}','${NARRATIVE}'::jsonb, 1) on conflict do nothing;
update reviews set review_draft_id='${DR3}' where id='${REV3}';
update reviews set status='awaiting-acknowledgement', revealed_at=now() - interval '8 days',
                   ack_window_ends_at=now() - interval '1 day' where id='${REV3}';
insert into employee_responses (company_id, review_id, employee_id, outcome, body)
  values ('${C}','${REV3}','${SUBJ3}','responded','I disagree with the areas to grow.') on conflict do nothing;
`;

const auditCount = async (action: string): Promise<number> =>
  (await client.query(`select count(*)::int as n from audit_log where subject_review_id=$1 and action=$2`, [REV, action]))
    .rows[0].n;

beforeAll(async () => {
  epg = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `tf-pg4-${process.pid}-${Date.now()}`),
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

// Runs FIRST, while REV is still revealed (not yet locked) — the freeze + reveal
// guards from the cron-tail red-team (revise-after-reveal integrity).
describe("revealed content is frozen between reveal and lock", () => {
  it("the revealed RATING cannot be changed while awaiting-acknowledgement (ERR_REVEALED_FROZEN)", async () => {
    await expect(
      client.query(`update reviews set rating='Below expectations' where id=$1`, [REV]),
    ).rejects.toThrow(/ERR_REVEALED_FROZEN/);
  });

  it("the revealed DRAFT narrative cannot be edited while revealed (ERR_DRAFT_FROZEN)", async () => {
    await expect(
      client.query(`update review_drafts set sections='{"summary":"changed"}'::jsonb where review_id=$1`, [REV]),
    ).rejects.toThrow(/ERR_DRAFT_FROZEN/);
  });

  it("a review with NO narrative cannot be revealed (ERR_REVEAL_NO_NARRATIVE)", async () => {
    await expect(
      client.query(
        `update reviews set status='awaiting-acknowledgement', revealed_at=now(), ack_window_ends_at=now()+interval '7 days'
          where id=$1`,
        [REV2],
      ),
    ).rejects.toThrow(/ERR_REVEAL_NO_NARRATIVE/);
  });
});

describe("PROC-05 ack-window auto-lock", () => {
  it("a window-close on a review the subject DID respond to records the real outcome, not window_closed", async () => {
    // audit fidelity (race): REV3 has a 'responded' row; close must lock with that
    // outcome, never overwrite the subject's recorded intent with 'window_closed'.
    const outcome = (await client.query(`select app.close_one_ack_window($1) as o`, [REV3])).rows[0].o;
    expect(outcome).toBe("locked");
    const reason = (await client.query(`select lock_reason from locked_reviews where review_id=$1`, [REV3])).rows[0].lock_reason;
    expect(reason).toBe("responded"); // not 'window_closed' — the subject actually responded
  });

  it("an elapsed ack window with no response locks via commit_lock with the window_closed outcome", async () => {
    const outcome = (await client.query(`select app.close_one_ack_window($1) as o`, [REV])).rows[0].o;
    expect(outcome).toBe("locked");
    const r = (await client.query(`select status from reviews where id=$1`, [REV])).rows[0];
    expect(r.status).toBe("locked");
    const lr = (await client.query(`select lock_reason from locked_reviews where review_id=$1`, [REV])).rows[0];
    expect(lr.lock_reason).toBe("window_closed");
    const er = (await client.query(`select outcome from employee_responses where review_id=$1`, [REV])).rows[0];
    expect(er.outcome).toBe("window_closed"); // the silence is documented beside the review
  });

  it("the locked snapshot BYTE-EQUALS the revealed version (silence didn't change content)", async () => {
    const row = (
      await client.query(
        `select (lr.narrative = rd.sections) as narrative_eq, (lr.rating = r.rating) as rating_eq
           from locked_reviews lr
           join review_drafts rd on rd.review_id = lr.review_id
           join reviews r on r.id = lr.review_id
          where lr.review_id = $1`,
        [REV],
      )
    ).rows[0];
    expect(row.narrative_eq).toBe(true); // the revealed narrative, frozen unchanged
    expect(row.rating_eq).toBe(true);
  });

  it("single committer: a racing manual-acknowledge no-ops — exactly ONE locked row + ONE audit", async () => {
    // the loser of the race calls commit_lock too; it must be an idempotent no-op
    const second = (await client.query(`select app.commit_lock($1,'acknowledged') as id`, [REV])).rows[0].id;
    expect(second).toBe(REV); // returns the id, no-op
    const lockedRows = (await client.query(`select count(*)::int as n from locked_reviews where review_id=$1`, [REV])).rows[0].n;
    expect(lockedRows).toBe(1);
    expect(await auditCount("review_locked")).toBe(1);
    // lock_reason stays the window_closed of the actual winner — not overwritten
    const reason = (await client.query(`select lock_reason from locked_reviews where review_id=$1`, [REV])).rows[0].lock_reason;
    expect(reason).toBe("window_closed");
    // the locked_reviews PK is the structural backstop against a second snapshot
    await expect(
      client.query(
        `insert into locked_reviews (review_id, company_id, cycle_id, employee_id, approver_id, rating, narrative, lock_reason, content_hash)
         values ($1,$2,$3,$4,$5,'Meets expectations','{}'::jsonb,'acknowledged','\\x00')`,
        [REV, C, CY, SUBJ, MGR],
      ),
    ).rejects.toThrow(/duplicate key|locked_reviews_pkey|ERR_IMMUTABLE/);
  });

  it("auto-lock is idempotent — re-running on a locked review is a no-op", async () => {
    const outcome = (await client.query(`select app.close_one_ack_window($1) as o`, [REV])).rows[0].o;
    expect(outcome).toBe("skipped");
    expect((await client.query(`select count(*)::int as n from locked_reviews where review_id=$1`, [REV])).rows[0].n).toBe(1);
  });
});

describe("retention sweep", () => {
  it("purges ONLY source bodies; the locked snapshot + audit chain are untouched and the chain still verifies", async () => {
    // commit_lock scheduled a retention job; fast-forward it to due.
    await client.query(`update retention_jobs set purge_after = now() - interval '1 day' where review_id=$1`, [REV]);

    // before: source bodies present; locked snapshot present; chain intact
    expect((await client.query(`select sections::text <> '{}' as has from self_reviews where review_id=$1`, [REV])).rows[0].has).toBe(true);
    expect((await client.query(`select count(*)::int as n from peer_feedback where review_id=$1 and responses::text <> '{}'`, [REV])).rows[0].n).toBe(2);
    expect((await client.query(`select peer_theme_payload is not null as has from feedback_bundles where review_id=$1`, [REV])).rows[0].has).toBe(true);
    const narrativeBefore = (await client.query(`select narrative from locked_reviews where review_id=$1`, [REV])).rows[0].narrative;

    const outcome = (await client.query(`select app.purge_one_retention($1) as o`, [REV])).rows[0].o;
    expect(outcome).toBe("purged");

    // after: source bodies redacted to empty
    expect((await client.query(`select sections::text from self_reviews where review_id=$1`, [REV])).rows[0].sections).toBe("{}");
    expect((await client.query(`select count(*)::int as n from peer_feedback where review_id=$1 and responses::text <> '{}'`, [REV])).rows[0].n).toBe(0);
    expect((await client.query(`select peer_theme_payload from feedback_bundles where review_id=$1`, [REV])).rows[0].peer_theme_payload).toBeNull();

    // the PERMANENT record is untouched: locked narrative+rating intact, chain verifies from genesis
    const lr = (await client.query(`select narrative, rating from locked_reviews where review_id=$1`, [REV])).rows[0];
    expect(lr.narrative).toEqual(narrativeBefore);
    expect(lr.rating).toBe("Meets expectations");
    expect((await client.query(`select app.verify_audit_chain($1) as seq`, [C])).rows[0].seq).toBeNull();
    expect((await client.query(`select state from retention_jobs where review_id=$1`, [REV])).rows[0].state).toBe("purged");
  });

  it("retention is idempotent — re-running on a purged job is a no-op", async () => {
    const outcome = (await client.query(`select app.purge_one_retention($1) as o`, [REV])).rows[0].o;
    expect(outcome).toBe("already");
    // still verifies from genesis (no spurious second purge audit broke the chain)
    expect((await client.query(`select app.verify_audit_chain($1) as seq`, [C])).rows[0].seq).toBeNull();
  });
});
