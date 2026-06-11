import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Fail-closed regression for the 1800/1900 gated, audited admin content read.
// The product decision reverses 1300's aggregate-only stance, so the security
// surface MUST be proven: only an admin who (a) holds the review-content grant
// AND (b) is in the review's own tenant AND (c) has the company setting ON may
// read content — and every such read is audited. Everything else returns
// nothing and writes no audit. Raw peer feedback is never reachable in any
// state. Red-teamed as the least-privileged, cross-tenant caller (the
// established discipline) on the ephemeral embedded harness.

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const seedPath = path.join(repoRoot, "supabase", "seed.sql");
const shimPath = path.join(here, "shim.sql");

const PORT = 54396;
const PASSWORD = "postgres";

// Company CA (the access company) + CB (cross-tenant).
const CA = "ca000000-0000-0000-0000-0000000000a0";
const CB = "cb000000-0000-0000-0000-0000000000b0";
const CY = "ca000000-0000-0000-0000-0000000000c1"; // a CA cycle
// CA accounts (+ their auth users).
const ADMG = "ca000000-0000-0000-0000-00000000ad01"; // admin WITH the grant
const U_ADMG = "ca000000-0000-0000-0000-00000000ad11";
const ADMN = "ca000000-0000-0000-0000-00000000ad02"; // admin WITHOUT the grant
const U_ADMN = "ca000000-0000-0000-0000-00000000ad22";
const SUBJ = "ca000000-0000-0000-0000-00000000e501"; // the subject under review
const PEER = "ca000000-0000-0000-0000-00000000fe01"; // a peer author (confidential)
const U_PEER = "ca000000-0000-0000-0000-00000000fe11";
// CB account (a CB admin WITH a CB grant — used to probe across tenants).
const BADM = "cb000000-0000-0000-0000-00000000ad01";
const U_BADM = "cb000000-0000-0000-0000-00000000ad11";
// review + dependent rows in CA.
const REV = "ca000000-0000-0000-0000-0000000005e7";
const REV2 = "ca000000-0000-0000-0000-0000000005e8"; // ADMG's OWN review (admin who is also a subject)
const REV_DRAFT = "ca000000-0000-0000-0000-0000000005e9"; // pre-reveal (draft) — never listed/readable
const REV_INREV = "ca000000-0000-0000-0000-0000000005ea"; // pre-reveal (in-review) — never listed/readable
const SUBJD = "ca000000-0000-0000-0000-00000000e502"; // subject of REV_DRAFT
const SUBJI = "ca000000-0000-0000-0000-00000000e503"; // subject of REV_INREV
const ROST = "ca000000-0000-0000-0000-00000000a071";

let epg: EmbeddedPostgres;
let client: pg.Client;

const SETUP_SQL = `
insert into companies (id, name, slug) values
  ('${CA}','Access Co','access-co'),
  ('${CB}','Other Co','other-co-19')
  on conflict (id) do nothing;
insert into cycles (id, company_id, name, status, settings)
  values ('${CY}','${CA}','CA H1','open','{}'::jsonb) on conflict (id) do nothing;

insert into auth.users (id,email) values
  ('${U_ADMG}','admg@ca.test'),('${U_ADMN}','admn@ca.test'),
  ('${U_PEER}','peer@ca.test'),('${U_BADM}','badm@cb.test')
  on conflict do nothing;

insert into accounts (id, company_id, email, display_name, status, auth_user_id) values
  ('${ADMG}','${CA}','admg@ca.test','CA Admin (granted)','active','${U_ADMG}'),
  ('${ADMN}','${CA}','admn@ca.test','CA Admin (plain)','active','${U_ADMN}'),
  ('${SUBJ}','${CA}','subj@ca.test','CA Subject','active', null),
  ('${PEER}','${CA}','peer@ca.test','CA Peer','active','${U_PEER}'),
  ('${BADM}','${CB}','badm@cb.test','CB Admin (granted)','active','${U_BADM}')
  on conflict do nothing;

insert into account_roles (account_id, role, company_id) values
  ('${ADMG}','admin','${CA}'),
  ('${ADMN}','admin','${CA}'),
  ('${BADM}','admin','${CB}')
  on conflict do nothing;

-- the review-content capability: ADMG in CA, BADM in CB (NOT ADMN).
insert into review_content_grants (company_id, account_id, granted_by) values
  ('${CA}','${ADMG}','${ADMG}'),
  ('${CB}','${BADM}','${BADM}')
  on conflict do nothing;

-- a review with real content: reviews row + draft narrative + self-review.
insert into reviews (id, company_id, cycle_id, employee_id, status, rating, flagged_internal, revealed_at)
  values ('${REV}','${CA}','${CY}','${SUBJ}','awaiting-acknowledgement','Meets expectations', false, now())
  on conflict (id) do nothing;
insert into review_drafts (id, company_id, cycle_id, employee_id, review_id, sections)
  values (gen_random_uuid(),'${CA}','${CY}','${SUBJ}','${REV}',
          '{"summary":"Synthesized narrative — themes only.","strengths":"Collaboration."}'::jsonb)
  on conflict do nothing;
insert into self_reviews (id, company_id, cycle_id, employee_id, review_id, sections, state)
  values (gen_random_uuid(),'${CA}','${CY}','${SUBJ}','${REV}',
          '{"highlights":"Shipped the Q1 launch."}'::jsonb,'submitted')
  on conflict do nothing;

-- decision #1: a finished review whose SUBJECT is the granted admin (ADMG). The
-- sealed list must HIDE it from ADMG (they read it as a subject post-reveal).
insert into reviews (id, company_id, cycle_id, employee_id, status, rating, flagged_internal)
  values ('${REV2}','${CA}','${CY}','${ADMG}','locked','Exceeds expectations', false)
  on conflict (id) do nothing;

-- pre-reveal reviews (draft + in-review) for distinct subjects — the reveal gate
-- must exclude these from BOTH the list and the by-id read.
insert into accounts (id, company_id, email, display_name, status, auth_user_id) values
  ('${SUBJD}','${CA}','subjd@ca.test','CA Subject D','active', null),
  ('${SUBJI}','${CA}','subji@ca.test','CA Subject I','active', null)
  on conflict do nothing;
insert into reviews (id, company_id, cycle_id, employee_id, status, rating, flagged_internal) values
  ('${REV_DRAFT}','${CA}','${CY}','${SUBJD}','draft', null, false),
  ('${REV_INREV}','${CA}','${CY}','${SUBJI}','in-review', null, false)
  on conflict (id) do nothing;

-- a CONFIDENTIAL raw peer row (+ its roster) — must NEVER surface to the admin.
insert into rosters (id, company_id, cycle_id, employee_id)
  values ('${ROST}','${CA}','${CY}','${SUBJ}') on conflict (id) do nothing;
insert into peer_feedback (id, company_id, cycle_id, employee_id, review_id, roster_id, peer_account_id, responses, state)
  values (gen_random_uuid(),'${CA}','${CY}','${SUBJ}','${REV}','${ROST}','${PEER}',
          '{"verbatim":"A single identifying incident the admin must never read."}'::jsonb,'submitted')
  on conflict do nothing;
insert into feedback_bundles (id, company_id, cycle_id, employee_id, review_id, roster_id,
                              submitted_peer_count, anonymity_threshold, at_or_above_floor,
                              below_floor, peer_included, self_only, peer_theme_payload)
  values (gen_random_uuid(),'${CA}','${CY}','${SUBJ}','${REV}','${ROST}',
          3, 3, true, false, true, false, '{"themes":["communication"]}'::jsonb)
  on conflict do nothing;
`;

// rolls back — for read-only assertions on the RETURN value (no side effect kept).
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

// commits — so an audit entry written inside the function PERSISTS and can be
// counted outside. The local role + jwt claims reset at transaction end anyway.
async function asAuthCommit<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub })]);
    await client.query("set local role authenticated");
    const out = await fn();
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

const readReview = (id: string) =>
  client.query<{ r: Record<string, unknown> | null }>(`select app.admin_read_review($1) as r`, [id]).then((x) => x.rows[0]?.r ?? null);
const listReviewIds = (sub: string) =>
  asAuth(sub, () => client.query<{ review_id: string }>(`select review_id from app.admin_review_list()`).then((x) => x.rows.map((r) => r.review_id)));
const viewCount = async (): Promise<number> =>
  Number(
    (
      await client.query(`select count(*)::int as n from audit_log where company_id=$1 and action='admin_content_view'`, [CA])
    ).rows[0].n,
  );

beforeAll(async () => {
  epg = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `tf-pg7-${process.pid}-${Date.now()}`),
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

const setAccess = (enabled: boolean | null) =>
  client.query(
    `update companies set default_settings =
       case when $2::boolean is null
            then default_settings - 'adminContentAccessEnabled'
            else jsonb_set(default_settings,'{adminContentAccessEnabled}', to_jsonb($2::boolean)) end
     where id=$1`,
    [CA, enabled],
  );

describe("gated admin content read — the authorized path (1900)", () => {
  it("setting ON + admin + grant → returns the synthesized review and writes exactly one audit entry per read", async () => {
    const before = await viewCount();
    const r = await asAuthCommit(U_ADMG, () => readReview(REV));
    expect(r).not.toBeNull();
    expect((r as any).rating).toBe("Meets expectations");
    expect((r as any).narrative).toMatchObject({ summary: expect.any(String) });
    expect((r as any).selfReview).toMatchObject({ highlights: expect.any(String) });
    expect(await viewCount()).toBe(before + 1); // req4: audited
    await asAuthCommit(U_ADMG, () => readReview(REV));
    expect(await viewCount()).toBe(before + 2); // one entry PER read
  });

  it("the returned payload NEVER carries peer content, and the admin's direct peer reads are 0 in this state (req7)", async () => {
    const r = (await asAuth(U_ADMG, () => readReview(REV))) as any;
    expect(JSON.stringify(r)).not.toContain("identifying incident"); // the verbatim peer text
    expect(Object.keys(r)).not.toContain("peer");
    // even with a real peer row present, the base tables stay closed to the admin:
    // peer_feedback is author-only RLS → 0 rows; feedback_bundles isn't even
    // granted to authenticated → a direct read is denied outright.
    const peerRows = await asAuth(U_ADMG, async () =>
      (await client.query(`select count(*)::int as n from peer_feedback where review_id=$1`, [REV])).rows[0].n,
    );
    expect(Number(peerRows)).toBe(0);
    await expect(
      asAuth(U_ADMG, () => client.query(`select 1 from feedback_bundles where review_id=$1`, [REV])),
    ).rejects.toThrow(/permission denied/);
  });

  it("admin_review_list shows the review to the granted admin", async () => {
    const rows = await asAuth(U_ADMG, async () => (await client.query(`select * from app.admin_review_list()`)).rows);
    expect(rows.map((x) => x.review_id)).toContain(REV);
    expect(rows.find((x) => x.review_id === REV)?.subject_name).toBe("CA Subject");
  });

  it("an admin who is ALSO a subject sees every finished review EXCEPT their own (decision #1)", async () => {
    const ids = await listReviewIds(U_ADMG);
    expect(ids).toContain(REV); // the CA Subject's review — listed
    expect(ids).not.toContain(REV2); // ADMG's OWN review — excluded from the sealed list
  });

  it("reveal gate: drafts / in-review are NEVER listed or readable — reading opens at reveal", async () => {
    const ids = await listReviewIds(U_ADMG);
    expect(ids).toContain(REV); // awaiting-acknowledgement → listed
    expect(ids).not.toContain(REV_DRAFT); // draft → never
    expect(ids).not.toContain(REV_INREV); // in-review → never
    // the by-id read is gated the SAME way (not just the list), writing no audit on denial
    expect(await asAuth(U_ADMG, () => readReview(REV_DRAFT))).toBeNull();
    expect(await asAuth(U_ADMG, () => readReview(REV_INREV))).toBeNull();
  });
});

describe("fail-closed — every unauthorized path returns nothing and writes no audit", () => {
  it("a PLAIN admin without the grant → null, no audit (req1)", async () => {
    const before = await viewCount();
    expect(await asAuthCommit(U_ADMN, () => readReview(REV))).toBeNull();
    expect(await viewCount()).toBe(before); // denied reads are NOT audited
    const rows = await asAuth(U_ADMN, async () => (await client.query(`select * from app.admin_review_list()`)).rows);
    expect(rows).toHaveLength(0);
  });

  it("setting OFF (admin + grant) → null, no audit; list empty (req2)", async () => {
    await setAccess(false);
    try {
      const before = await viewCount();
      expect(await asAuthCommit(U_ADMG, () => readReview(REV))).toBeNull();
      expect(await viewCount()).toBe(before);
      const rows = await asAuth(U_ADMG, async () => (await client.query(`select * from app.admin_review_list()`)).rows);
      expect(rows).toHaveLength(0);
    } finally {
      await setAccess(null); // restore default (absent ⇒ ON)
    }
  });

  it("a cross-tenant admin (CB, granted in CB) → null on a CA review, in BOTH setting states (req5)", async () => {
    const before = await viewCount();
    expect(await asAuthCommit(U_BADM, () => readReview(REV))).toBeNull();
    await setAccess(false);
    try {
      expect(await asAuthCommit(U_BADM, () => readReview(REV))).toBeNull();
    } finally {
      await setAccess(null);
    }
    expect(await viewCount()).toBe(before); // no audit written in CA by a CB caller
    const rows = await asAuth(U_BADM, async () => (await client.query(`select * from app.admin_review_list()`)).rows);
    expect(rows.map((x) => x.review_id)).not.toContain(REV);
  });

  it("an unknown review id → null, no audit", async () => {
    const before = await viewCount();
    expect(await asAuthCommit(U_ADMG, () => readReview("ca000000-0000-0000-0000-0000deadbeef"))).toBeNull();
    expect(await viewCount()).toBe(before);
  });
});

describe("read-only + audit integrity (req6, req8)", () => {
  it("a content read mutates no review content — only the audit append", async () => {
    const snap = async () =>
      (
        await client.query(
          `select r.rating, r.status, d.sections as draft, s.sections as self
             from reviews r
             left join review_drafts d on d.review_id=r.id
             left join self_reviews s on s.review_id=r.id
            where r.id=$1`,
          [REV],
        )
      ).rows[0];
    const before = await snap();
    await asAuthCommit(U_ADMG, () => readReview(REV));
    expect(await snap()).toEqual(before); // content unchanged
    // the only actions ever written for this review are the content-view entries.
    const actions = (
      await client.query(`select distinct action from audit_log where subject_review_id=$1`, [REV])
    ).rows.map((x) => x.action);
    expect(actions).toEqual(["admin_content_view"]);
  });

  it("the audit chain still verifies clean after the admin reads (entries are in the Vault-keyed chain)", async () => {
    const seq = (await client.query(`select app.verify_audit_chain($1) as seq`, [CA])).rows[0].seq;
    expect(seq).toBeNull(); // null ⇒ intact end to end
  });
});
