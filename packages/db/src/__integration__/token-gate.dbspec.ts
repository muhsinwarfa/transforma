import { createHash } from "node:crypto";
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

// tenant 1 (Riverbend, seeded)
const C = "11111111-1111-1111-1111-111111111111";
const CY = "22222222-2222-2222-2222-222222222222";
const HODAN_ACC = "a0000000-0000-0000-0000-000000000002";
const MARYAN_ACC = "a0000000-0000-0000-0000-000000000003";
const AMINA = "a0000000-0000-0000-0000-000000000001";
const LIBAN = "a0000000-0000-0000-0000-000000000004";
const HODAN_RM = "b0000000-0000-0000-0000-000000000002"; // seeded roster_member
const MARYAN_RM = "b0000000-0000-0000-0000-000000000003";
const U_HODAN = "e0000000-0000-0000-0000-000000000002"; // the auth user the token activates
const R_H = "c1000000-0000-0000-0000-000000000001"; // Hodan's review
const R_M = "c1000000-0000-0000-0000-000000000002"; // another subject's review (same tenant)

// tenant 2 (a different company — must be invisible to Hodan)
const C2 = "cc000000-0000-0000-0000-000000000001";
const CY2 = "cc000000-0000-0000-0000-000000000002";
const ACC2 = "cc000000-0000-0000-0000-000000000003";
const R2T = "cc000000-0000-0000-0000-000000000004";

const validHash = createHash("sha256").update("tok-valid").digest();
const expiredHash = createHash("sha256").update("tok-expired").digest();

let epg: EmbeddedPostgres;
let client: pg.Client;

const SETUP_SQL = `
insert into reviews (id,company_id,cycle_id,employee_id,approver_id,status) values
  ('${R_H}','${C}','${CY}','${HODAN_ACC}','${AMINA}','in-review'),
  ('${R_M}','${C}','${CY}','${MARYAN_ACC}','${LIBAN}','in-review')
  on conflict do nothing;

-- a second tenant, entirely separate
insert into companies (id,name,slug) values ('${C2}','Other Health','other-health') on conflict do nothing;
insert into cycles (id,company_id,name,status) values ('${CY2}','${C2}','Cycle 2','open') on conflict do nothing;
insert into accounts (id,company_id,email,display_name,status)
  values ('${ACC2}','${C2}','x@other.com','Other Subject','active') on conflict do nothing;
insert into reviews (id,company_id,cycle_id,employee_id,status)
  values ('${R2T}','${C2}','${CY2}','${ACC2}','in-review') on conflict do nothing;
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
    databaseDir: path.join(os.tmpdir(), `tf-pg-tok-${process.pid}-${Date.now()}`),
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

  // the auth user the activation flow creates before linking the account
  await client.query(`insert into auth.users (id,email) values ($1,$2) on conflict do nothing`, [
    U_HODAN,
    "h.abdi@workmail.com",
  ]);

  // issue a valid token for Hodan and an expired one for Maryan (real bytea hashes)
  await client.query(
    `insert into activation_tokens (company_id, roster_member_id, token_hash, expires_at)
     values ($1,$2,$3, now() + interval '1 day')`,
    [C, HODAN_RM, validHash],
  );
  await client.query(
    `insert into activation_tokens (company_id, roster_member_id, token_hash, expires_at)
     values ($1,$2,$3, now() - interval '1 day')`,
    [C, MARYAN_RM, expiredHash],
  );
}, 240_000);

afterAll(async () => {
  if (client) await client.end();
  if (epg) await epg.stop();
});

// PROC-01 — the front door, exercised hardest.
describe("Activation token gate", () => {
  it("consumes a valid token ONCE (bytea round-trips) and rejects an immediate replay", async () => {
    const first = await client.query(`select * from app.consume_activation_token($1::bytea, $2::uuid)`, [
      validHash,
      U_HODAN,
    ]);
    expect(first.rows.length).toBe(1);
    expect(first.rows[0].roster_member_id).toBe(HODAN_RM);
    expect(first.rows[0].company_id).toBe(C);

    // immediate replay of the same token → fails closed (consumed_at is set)
    await expect(
      client.query(`select * from app.consume_activation_token($1::bytea, $2::uuid)`, [validHash, U_HODAN]),
    ).rejects.toThrow(/ERR_TOKEN_INVALID/);
  });

  it("rejects an expired token (fails closed)", async () => {
    await expect(
      client.query(`select * from app.consume_activation_token($1::bytea, $2::uuid)`, [expiredHash, U_HODAN]),
    ).rejects.toThrow(/ERR_TOKEN_INVALID/);
  });

  it("rejects a missing/unknown token (fails closed)", async () => {
    const bogus = createHash("sha256").update("never-issued").digest();
    await expect(
      client.query(`select * from app.consume_activation_token($1::bytea, $2::uuid)`, [bogus, U_HODAN]),
    ).rejects.toThrow(/ERR_TOKEN_INVALID/);
  });

  it("binds the activated session to EXACTLY the right account + tenant — and nothing wider", async () => {
    // provision: link the consumed account to the auth user (what activation does)
    await client.query(`update accounts set auth_user_id=$1, status='active' where id=$2`, [U_HODAN, HODAN_ACC]);

    // own status: visible
    const own = await asAuthenticated(U_HODAN, async () =>
      (await client.query(`select review_id from subject_review_status`)).rows,
    );
    expect(own.map((r) => r.review_id)).toEqual([R_H]); // exactly Hodan's review, not Maryan's

    // another subject's review in the SAME tenant: denied
    const otherSubject = await asAuthenticated(U_HODAN, async () =>
      (await client.query(`select count(*)::int as n from reviews where id=$1`, [R_M])).rows[0].n,
    );
    expect(otherSubject).toBe(0);

    // another TENANT's data: denied (company + review)
    const otherCompany = await asAuthenticated(U_HODAN, async () =>
      (await client.query(`select count(*)::int as n from companies where id=$1`, [C2])).rows[0].n,
    );
    expect(otherCompany).toBe(0);
    const otherTenantReview = await asAuthenticated(U_HODAN, async () =>
      (await client.query(`select count(*)::int as n from reviews where id=$1`, [R2T])).rows[0].n,
    );
    expect(otherTenantReview).toBe(0);
  });
});
