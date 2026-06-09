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

const PORT = 54399;
const PASSWORD = "postgres";

// ── fixed UUIDs ──────────────────────────────────────────────────────────────
const C = "11111111-1111-1111-1111-111111111111"; // company (seed)
const CY = "22222222-2222-2222-2222-222222222222"; // cycle (seed)
const HODAN = "a0000000-0000-0000-0000-000000000002";
const DEQA = "a0000000-0000-0000-0000-000000000005";
const MARYAN = "a0000000-0000-0000-0000-000000000003";
const AMINA = "a0000000-0000-0000-0000-000000000001";
const LIBAN = "a0000000-0000-0000-0000-000000000004";
const U_HODAN = "e0000000-0000-0000-0000-000000000002";
const U_DEQA = "e0000000-0000-0000-0000-000000000005";
const U_MARYAN = "e0000000-0000-0000-0000-000000000003";
const U_AMINA = "e0000000-0000-0000-0000-000000000001"; // R's assigned approver
const U_LIBAN = "e0000000-0000-0000-0000-000000000004"; // an approver NOT assigned to R
const R = "c0000000-0000-0000-0000-000000000001"; // in-review (confidentiality)
const D = "d0000000-0000-0000-0000-000000000001";
const RO = "f0000000-0000-0000-0000-000000000001";
const RO_M = "f0000000-0000-0000-0000-000000000002"; // Maryan's APPROVED peer set
const R2 = "c0000000-0000-0000-0000-000000000002"; // → locked (immutability)
const D2 = "d0000000-0000-0000-0000-000000000002";
const R3 = "c0000000-0000-0000-0000-000000000003"; // draft (illegal transition)
const WRONG_COMPANY = "99999999-9999-9999-9999-999999999999";

let epg: EmbeddedPostgres;
let client: pg.Client;

const SETUP_SQL = `
insert into auth.users (id,email) values
  ('${U_HODAN}','h.abdi@workmail.com'),('${U_DEQA}','d.osman@workmail.com'),('${U_MARYAN}','m.noor@workmail.com'),
  ('${U_AMINA}','amina.yusuf@workmail.com'),('${U_LIBAN}','l.farah@workmail.com')
  on conflict do nothing;
update accounts set auth_user_id='${U_HODAN}' where id='${HODAN}';
update accounts set auth_user_id='${U_DEQA}' where id='${DEQA}';
update accounts set auth_user_id='${U_MARYAN}' where id='${MARYAN}';
update accounts set auth_user_id='${U_AMINA}' where id='${AMINA}';
update accounts set auth_user_id='${U_LIBAN}' where id='${LIBAN}';

insert into rosters (id,company_id,cycle_id,employee_id,approved_by,approved_at)
  values ('${RO}','${C}','${CY}','${HODAN}','${AMINA}', now()) on conflict do nothing;
insert into roster_peers (company_id,roster_id,peer_account_id)
  values ('${C}','${RO}','${DEQA}'),('${C}','${RO}','${MARYAN}') on conflict do nothing;

insert into reviews (id,company_id,cycle_id,employee_id,roster_id,approver_id,status,flagged_internal)
  values ('${R}','${C}','${CY}','${HODAN}','${RO}','${AMINA}','flagged', true) on conflict do nothing;
insert into review_drafts (id,company_id,cycle_id,employee_id,review_id,sections,attempt_count)
  values ('${D}','${C}','${CY}','${HODAN}','${R}', '{"summary":"x","strengths":"x","areasToGrow":"x","focusNextCycle":"x"}'::jsonb, 1) on conflict do nothing;
update reviews set review_draft_id='${D}' where id='${R}';
insert into self_reviews (company_id,cycle_id,employee_id,review_id,sections,state)
  values ('${C}','${CY}','${HODAN}','${R}','{}'::jsonb,'submitted') on conflict do nothing;
insert into peer_feedback (company_id,cycle_id,employee_id,review_id,roster_id,peer_account_id,responses,state,submitted_at) values
  ('${C}','${CY}','${HODAN}','${R}','${RO}','${DEQA}','{"pq2":"great"}'::jsonb,'submitted',now()),
  ('${C}','${CY}','${HODAN}','${R}','${RO}','${MARYAN}','{"pq2":"good"}'::jsonb,'submitted',now())
  on conflict do nothing;

insert into reviews (id,company_id,cycle_id,employee_id,approver_id,status,rating)
  values ('${R2}','${C}','${CY}','${MARYAN}','${LIBAN}','in-review','Meets expectations') on conflict do nothing;
insert into review_drafts (id,company_id,cycle_id,employee_id,review_id,sections,attempt_count)
  values ('${D2}','${C}','${CY}','${MARYAN}','${R2}','{"summary":"s","strengths":"s","areasToGrow":"s","focusNextCycle":"s"}'::jsonb, 1) on conflict do nothing;
update reviews set review_draft_id='${D2}' where id='${R2}';
update reviews set status='awaiting-acknowledgement', revealed_at=now(), ack_window_ends_at=now()+interval '7 days' where id='${R2}';
select app.commit_lock('${R2}','acknowledged');

insert into reviews (id,company_id,cycle_id,employee_id,approver_id,status)
  values ('${R3}','${C}','${CY}','${DEQA}','${LIBAN}','draft') on conflict do nothing;

-- Maryan's nominations are APPROVED (a roster exists) → her nominations are closed.
insert into rosters (id,company_id,cycle_id,employee_id,approved_by,approved_at)
  values ('${RO_M}','${C}','${CY}','${MARYAN}','${LIBAN}', now()) on conflict do nothing;
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

beforeAll(async () => {
  epg = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `tf-pg-${process.pid}-${Date.now()}`),
    user: "postgres",
    password: PASSWORD,
    port: PORT,
    persistent: false,
  });
  await epg.initialise();
  await epg.start();

  // The initdb cluster inherits the Windows locale (WIN1252); create the test DB
  // explicitly as UTF8 so the migrations' UTF-8 comment headers store cleanly.
  const admin = new Client({ host: "localhost", port: PORT, user: "postgres", password: PASSWORD, database: "postgres" });
  await admin.connect();
  await admin.query("create database transforma_test with encoding 'UTF8' template template0");
  await admin.end();

  client = new Client({ host: "localhost", port: PORT, user: "postgres", password: PASSWORD, database: "transforma_test" });
  await client.connect();
  await client.query("set client_encoding to 'UTF8'");

  // shim → migrations (sorted) → seed → probe data
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

// ── the DB-level proofs (the other half of the non-negotiables) ─────────────
describe("DB negative probes", () => {
  it("RLS is enabled on the sensitive tables", async () => {
    const res = await client.query(
      `select relname, relrowsecurity from pg_class
       where relname in ('peer_feedback','review_drafts','reviews','locked_reviews','audit_log')
         and relkind='r'`,
    );
    expect(res.rows.length).toBe(5);
    for (const row of res.rows) expect(row.relrowsecurity).toBe(true);
  });

  it("subject CANNOT read peer_feedback about themselves", async () => {
    const n = await asAuthenticated(U_HODAN, async () =>
      (await client.query(`select count(*)::int as n from peer_feedback where review_id=$1`, [R])).rows[0].n,
    );
    expect(n).toBe(0);
  });

  it("subject CANNOT read their own review_drafts (no grant pre-finalize)", async () => {
    const n = await asAuthenticated(U_HODAN, async () =>
      (await client.query(`select count(*)::int as n from review_drafts where review_id=$1`, [R])).rows[0].n,
    );
    expect(n).toBe(0);
  });

  it("a co-peer reads ONLY their own peer_feedback row, never another peer's", async () => {
    const rows = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select peer_account_id from peer_feedback where review_id=$1`, [R])).rows,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].peer_account_id).toBe(DEQA);
  });

  it("worker confidential reader RAISES on a tenant mismatch; returns themes for the right tenant", async () => {
    await expect(
      client.query(`select app.worker_submitted_peer_responses($1,$2)`, [R, WRONG_COMPANY]),
    ).rejects.toThrow(/ERR_TENANT_MISMATCH/);
    const res = await client.query(`select app.worker_submitted_peer_responses($1,$2) as payload`, [R, C]);
    expect(Array.isArray(res.rows[0].payload)).toBe(true);
    expect(res.rows[0].payload.length).toBe(2);
  });

  it("raw UPDATE/DELETE on locked_reviews and audit_log is rejected by the trigger", async () => {
    await expect(
      client.query(`update locked_reviews set rating='Below expectations' where review_id=$1`, [R2]),
    ).rejects.toThrow(/ERR_IMMUTABLE/);
    await expect(
      client.query(`update audit_log set action='token_issued' where company_id=$1`, [C]),
    ).rejects.toThrow(/ERR_IMMUTABLE/);
    await expect(client.query(`delete from audit_log where company_id=$1`, [C])).rejects.toThrow(/ERR_IMMUTABLE/);
  });

  it("a locked review cannot be mutated out of 'locked' (no post-lock correction)", async () => {
    await expect(
      client.query(`update reviews set status='in-review' where id=$1`, [R2]),
    ).rejects.toThrow(/ERR_REVIEW_LOCKED/);
  });

  it("the SoD DB CHECK still rejects approver = input-author and approver = subject (both set)", async () => {
    // The case the null-widening (migration 0600) must NOT weaken: an approver who
    // IS a set input author — rejected at the DB CHECK, not just the app predicate.
    await expect(
      client.query(
        `insert into reviews (company_id,cycle_id,employee_id,approver_id,input_author_id,status)
         values ($1,$2,$3,$4,$4,'in-review')`,
        [C, CY, AMINA, LIBAN],
      ),
    ).rejects.toThrow(/sod_approver_not_input_author/);
    // approver equal to the subject
    await expect(
      client.query(
        `insert into reviews (company_id,cycle_id,employee_id,approver_id,status)
         values ($1,$2,$3,$3,'in-review')`,
        [C, CY, AMINA],
      ),
    ).rejects.toThrow(/sod_approver_not_subject/);
  });

  it("illegal status transitions are rejected by the transition guard", async () => {
    await expect(
      client.query(`update reviews set status='locked' where id=$1`, [R3]),
    ).rejects.toThrow(/ERR_ILLEGAL_TRANSITION|ERR_LOCK_PATH/);
    await expect(
      client.query(`update reviews set status='awaiting-acknowledgement' where id=$1`, [R3]),
    ).rejects.toThrow(/ERR_ILLEGAL_TRANSITION|ERR_REVEAL_INCOMPLETE/);
  });

  it("the audit hash-chain verifies intact after the lock", async () => {
    const broken = (await client.query(`select app.verify_audit_chain($1) as seq`, [C])).rows[0].seq;
    expect(broken).toBeNull();
  });

  // ── reveal boundary at the subject's data source (the rendered-screen fetch) ──
  it("subject status channel masks flagged → 'in-review' and exposes NO content columns", async () => {
    const row = await asAuthenticated(U_HODAN, async () =>
      (await client.query(`select * from subject_review_status where review_id=$1`, [R])).rows[0],
    );
    expect(row.display_status).toBe("in-review"); // flagged is masked
    const cols = Object.keys(row);
    expect(cols).not.toContain("narrative");
    expect(cols).not.toContain("rating");
    expect(cols).not.toContain("flagged_internal");
  });

  it("revealed_review returns ZERO rows for the subject before reveal (flagged)", async () => {
    const n = await asAuthenticated(U_HODAN, async () =>
      (await client.query(`select count(*)::int as n from revealed_review where review_id=$1`, [R])).rows[0].n,
    );
    expect(n).toBe(0);
  });

  it("after lock, the subject sees 'locked' and revealed_review returns the finished review", async () => {
    const status = await asAuthenticated(U_MARYAN, async () =>
      (await client.query(`select display_status from subject_review_status where review_id=$1`, [R2])).rows[0]
        .display_status,
    );
    expect(status).toBe("locked");
    const rev = await asAuthenticated(U_MARYAN, async () =>
      (await client.query(`select rating, narrative from revealed_review where review_id=$1`, [R2])).rows,
    );
    expect(rev.length).toBe(1);
    expect(rev[0].rating).toBe("Meets expectations");
    expect(rev[0].narrative).toBeTruthy();
  });

  // ── PROC-02 / PROC-03 write-side guards ─────────────────────────────────────
  it("a subject with no approved roster can submit a nomination", async () => {
    await expect(
      asAuthenticated(U_DEQA, () =>
        client.query(
          `insert into nominations (company_id,cycle_id,employee_id,nominee_account_id,status)
           values ($1,$2,$3,$4,'pending')`,
          [C, CY, DEQA, HODAN],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it("an APPROVED roster cannot be silently re-edited — subject nomination is blocked by RLS", async () => {
    await expect(
      asAuthenticated(U_MARYAN, () =>
        client.query(
          `insert into nominations (company_id,cycle_id,employee_id,nominee_account_id,status)
           values ($1,$2,$3,$4,'pending')`,
          [C, CY, MARYAN, HODAN],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it("a peer has NO read path to the subject's self-review", async () => {
    const n = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select count(*)::int as n from self_reviews where review_id=$1`, [R])).rows[0].n,
    );
    expect(n).toBe(0);
  });

  it("the self-review update policy stays NARROW — a submitted self-review can't be re-edited", async () => {
    // Hodan's self_review is in state 'submitted' (setup). The corrected policy's
    // USING (state <> 'submitted') must still block the edit → zero rows affected.
    const rowCount = await asAuthenticated(U_HODAN, async () =>
      (await client.query(`update self_reviews set sections='{"q1":"tampered"}'::jsonb where review_id=$1`, [R]))
        .rowCount,
    );
    expect(rowCount).toBe(0);
  });

  it("approver workspace: assigned approver sees the review+draft; a non-assigned approver gets NOTHING (absence at the data layer)", async () => {
    // R is Hodan's review; approver_id = Amina. Liban is an approver but NOT assigned to R.
    const aminaReviews = await asAuthenticated(U_AMINA, async () =>
      (await client.query(`select count(*)::int as n from reviews where id=$1`, [R])).rows[0].n,
    );
    const aminaDrafts = await asAuthenticated(U_AMINA, async () =>
      (await client.query(`select count(*)::int as n from review_drafts where review_id=$1`, [R])).rows[0].n,
    );
    expect(aminaReviews).toBe(1);
    expect(aminaDrafts).toBe(1);

    const libanReviews = await asAuthenticated(U_LIBAN, async () =>
      (await client.query(`select count(*)::int as n from reviews where id=$1`, [R])).rows[0].n,
    );
    const libanDrafts = await asAuthenticated(U_LIBAN, async () =>
      (await client.query(`select count(*)::int as n from review_drafts where review_id=$1`, [R])).rows[0].n,
    );
    expect(libanReviews).toBe(0); // hand-typing the URL yields nothing, not a hidden-in-UI row
    expect(libanDrafts).toBe(0);
  });

  it("approver queue includes the assigned review and excludes it for a non-assigned approver", async () => {
    const aminaQueue = await asAuthenticated(U_AMINA, async () =>
      (await client.query(`select review_id from approver_queue`)).rows.map((r) => r.review_id),
    );
    expect(aminaQueue).toContain(R);
    const libanQueue = await asAuthenticated(U_LIBAN, async () =>
      (await client.query(`select review_id from approver_queue`)).rows.map((r) => r.review_id),
    );
    expect(libanQueue).not.toContain(R);
  });

  it("nomination candidates exclude self", async () => {
    const rows = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select candidate_account_id from nomination_candidates`)).rows,
    );
    expect(rows.map((r) => r.candidate_account_id)).not.toContain(DEQA);
  });
});

// ── Approver FINALIZE at the wire (the second watch item) ───────────────────
// R is Hodan's review, status 'flagged', assigned approver = Amina (U_AMINA).
// Each probe runs inside a rolled-back transaction, so no state leaks between
// them. These prove the finalize SEMANTICS at the DB, not just the UI: finalize
// REVEALS (→ awaiting-acknowledgement) and never locks; the lock stays gated
// behind commit_lock; a SoD-barred approver cannot write the row at all.
describe("approver finalize (wire-level)", () => {
  it("finalize as the assigned approver REVEALS (flagged → awaiting-acknowledgement) and does NOT lock", async () => {
    const row = await asAuthenticated(U_AMINA, async () => {
      const upd = await client.query(
        `update reviews
            set status='awaiting-acknowledgement', rating='Meets expectations',
                revealed_at=now(), ack_window_ends_at=now()+interval '7 days'
          where id=$1 and status in ('in-review','flagged')`,
        [R],
      );
      expect(upd.rowCount).toBe(1);
      return (await client.query(`select status, locked_at, revealed_at from reviews where id=$1`, [R])).rows[0];
    });
    expect(row.status).toBe("awaiting-acknowledgement"); // revealed
    expect(row.locked_at).toBeNull(); // NOT locked — lock follows acknowledgement
    expect(row.revealed_at).not.toBeNull();
  });

  it("a reveal WITHOUT the reveal markers is rejected (ERR_REVEAL_INCOMPLETE) — no half-reveal", async () => {
    await expect(
      asAuthenticated(U_AMINA, () =>
        client.query(`update reviews set status='awaiting-acknowledgement' where id=$1`, [R]),
      ),
    ).rejects.toThrow(/ERR_REVEAL_INCOMPLETE/);
  });

  it("finalize cannot ALSO lock — a direct UPDATE to 'locked' is rejected (ERR_LOCK_PATH; only commit_lock locks)", async () => {
    await expect(
      asAuthenticated(U_AMINA, async () => {
        await client.query(
          `update reviews set status='awaiting-acknowledgement', rating='Meets expectations',
                              revealed_at=now(), ack_window_ends_at=now()+interval '7 days'
            where id=$1`,
          [R],
        );
        // the approver is not commit_lock; the trigger must refuse the lock edge
        await client.query(`update reviews set status='locked' where id=$1`, [R]);
      }),
    ).rejects.toThrow(/ERR_LOCK_PATH/);
  });

  it("a SoD-barred / non-assigned approver's finalize write affects ZERO rows (write-side absence, not just hidden)", async () => {
    // Liban is an approver but NOT assigned to R. RLS USING on reviews_approver_update
    // fails for him, so the UPDATE silently matches nothing — he cannot reveal,
    // rate, or lock a review that isn't his, the same wire-not-pixels standard as read.
    const rowCount = await asAuthenticated(U_LIBAN, async () =>
      (
        await client.query(
          `update reviews set status='awaiting-acknowledgement', rating='Below expectations',
                              revealed_at=now(), ack_window_ends_at=now()+interval '7 days'
            where id=$1`,
          [R],
        )
      ).rowCount,
    );
    expect(rowCount).toBe(0);
  });
});

// ── PEER confidentiality at the wire (PROC-03 watch item) ───────────────────
// DEQA + MARYAN are SUBMITTED peers on R (Hodan's review); RO is Hodan's roster.
// A peer must never reach the self-review, the draft, the outcome, another peer's
// row, or the co-peer roster — proven at the DATA layer, not the screen.
describe("peer confidentiality (wire-level)", () => {
  it("a peer CANNOT read the subject's self-review", async () => {
    const n = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select count(*)::int as n from self_reviews where review_id=$1`, [R])).rows[0].n,
    );
    expect(n).toBe(0);
  });

  it("a peer CANNOT read the draft narrative", async () => {
    const n = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select count(*)::int as n from review_drafts where review_id=$1`, [R])).rows[0].n,
    );
    expect(n).toBe(0);
  });

  it("a peer CANNOT read the review row (rating / status / outcome)", async () => {
    const reviewN = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select count(*)::int as n from reviews where id=$1`, [R])).rows[0].n,
    );
    const lockedN = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select count(*)::int as n from locked_reviews where review_id=$1`, [R2])).rows[0].n,
    );
    expect(reviewN).toBe(0);
    expect(lockedN).toBe(0); // also cannot read a locked outcome of someone else
  });

  it("a peer CANNOT enumerate co-peers (roster_peers / rosters absent)", async () => {
    const peersN = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select count(*)::int as n from roster_peers where roster_id=$1`, [RO])).rows[0].n,
    );
    const rostersN = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select count(*)::int as n from rosters where id=$1`, [RO])).rows[0].n,
    );
    expect(peersN).toBe(0);
    expect(rostersN).toBe(0);
  });

  it("each peer reads ONLY their own row, both ways (Deqa sees Deqa, Maryan sees Maryan)", async () => {
    const deqaRows = await asAuthenticated(U_DEQA, async () =>
      (await client.query(`select peer_account_id from peer_feedback where review_id=$1`, [R])).rows,
    );
    const maryanRows = await asAuthenticated(U_MARYAN, async () =>
      (await client.query(`select peer_account_id from peer_feedback where review_id=$1`, [R])).rows,
    );
    expect(deqaRows.map((r) => r.peer_account_id)).toEqual([DEQA]);
    expect(maryanRows.map((r) => r.peer_account_id)).toEqual([MARYAN]);
  });

  it("a peer CANNOT write another peer's row, and a submitted row is frozen", async () => {
    // Deqa attempting to edit Maryan's row → RLS scopes to peer_account_id=current,
    // so the WHERE matches nothing → 0 rows (cannot tamper with a co-peer's input).
    const otherRows = await asAuthenticated(U_DEQA, async () =>
      (
        await client.query(`update peer_feedback set responses='{"pq2":"x"}'::jsonb where peer_account_id=$1 and review_id=$2`, [
          MARYAN,
          R,
        ])
      ).rowCount,
    );
    expect(otherRows).toBe(0);
    // Deqa's OWN row is 'submitted' — the update policy (state in new/draft) freezes it.
    const ownRows = await asAuthenticated(U_DEQA, async () =>
      (
        await client.query(`update peer_feedback set responses='{"pq2":"changed"}'::jsonb where peer_account_id=$1 and review_id=$2`, [
          DEQA,
          R,
        ])
      ).rowCount,
    );
    expect(ownRows).toBe(0); // no un-submit / re-edit after submission
  });
});
