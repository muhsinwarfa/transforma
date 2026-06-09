import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Tenant-isolation regression for the SECURITY DEFINER helpers left executable to
// authenticated (1500 kept them; 1600 tenant-scoped them). Two companies: A (the
// Riverbend seed) and B. An authenticated A user must not read B's settings or a
// B subject's withdrawn status; same-tenant reads + the service-role/internal path
// must still work.

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const seedPath = path.join(repoRoot, "supabase", "seed.sql");
const shimPath = path.join(here, "shim.sql");

const PORT = 54395;
const PASSWORD = "postgres";

const A = "11111111-1111-1111-1111-111111111111"; // company A (seed: Riverbend)
const A_CY = "22222222-2222-2222-2222-222222222222"; // cycle A (seed; threshold 3)
const B = "88888888-8888-8888-8888-888888888888"; // company B
const B_CY = "8a000000-0000-0000-0000-0000000000b1"; // cycle B (inherits B defaults)
const AX = "a8000000-0000-0000-0000-0000000000a1"; // an A account (authenticated caller)
const U_AX = "e8000000-0000-0000-0000-0000000000a1";
const AW = "a8000000-0000-0000-0000-0000000000a2"; // an A subject, withdrawn
const BW = "b8000000-0000-0000-0000-0000000000b2"; // a B subject, withdrawn

let epg: EmbeddedPostgres;
let client: pg.Client;

const SETUP_SQL = `
insert into companies (id, name, slug, role_labels, default_settings) values
  ('${B}','Other Co','other-co',
   '{"subject":"Reviewee X","peer":"Peer","approver":"Lead","admin":"Ops"}'::jsonb,
   '{"feedbackDeadlineDays":21,"peerAnonymityThreshold":5,"maxPeerNominations":11,"ackWindowDays":10,"retentionDays":999}'::jsonb)
  on conflict (id) do nothing;
insert into cycles (id, company_id, name, status, settings)
  values ('${B_CY}','${B}','B H1 2026','open','{}'::jsonb) on conflict (id) do nothing;

insert into auth.users (id,email) values ('${U_AX}','ax@a.test') on conflict do nothing;
insert into accounts (id, company_id, email, display_name, status, auth_user_id) values
  ('${AX}','${A}','ax@a.test','A Caller','active','${U_AX}'),
  ('${AW}','${A}','aw@a.test','A Withdrawn','active', null),
  ('${BW}','${B}','bw@b.test','B Withdrawn','active', null)
  on conflict do nothing;

insert into roster_members (company_id, cycle_id, account_id, email, display_name, withdrawn_at) values
  ('${A}','${A_CY}','${AW}','aw@a.test','A Withdrawn', now()),
  ('${B}','${B_CY}','${BW}','bw@b.test','B Withdrawn', now())
  on conflict do nothing;
`;

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

beforeAll(async () => {
  epg = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `tf-pg5-${process.pid}-${Date.now()}`),
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

describe("tenant isolation on the executable SECURITY DEFINER helpers (1600)", () => {
  it("an authenticated A user CANNOT read company B's settings via effective_setting/threshold (XT-1)", async () => {
    await expect(
      asAuth(U_AX, () => client.query(`select app.effective_setting($1,'retentionDays')`, [B_CY])),
    ).rejects.toThrow(/ERR_CROSS_TENANT/);
    await expect(asAuth(U_AX, () => client.query(`select app.effective_threshold($1)`, [B_CY]))).rejects.toThrow(
      /ERR_CROSS_TENANT/,
    );
  });

  it("an authenticated A user CANNOT probe a B subject's withdrawn status via is_subject_withdrawn (XT-2)", async () => {
    const v = await asAuth(U_AX, async () =>
      (await client.query(`select app.is_subject_withdrawn($1,$2) as w`, [B_CY, BW])).rows[0].w,
    );
    expect(v).toBe(false); // no oracle on B's roster — even though BW IS withdrawn in B
  });

  it("same-tenant reads still work for the authenticated A user", async () => {
    const setting = await asAuth(U_AX, async () =>
      (await client.query(`select app.effective_setting($1,'peerAnonymityThreshold') as s`, [A_CY])).rows[0].s,
    );
    expect(setting).toBe("3"); // A's own cycle
    const threshold = await asAuth(U_AX, async () =>
      (await client.query(`select app.effective_threshold($1) as t`, [A_CY])).rows[0].t,
    );
    expect(threshold).toBe(3);
    const withdrawn = await asAuth(U_AX, async () =>
      (await client.query(`select app.is_subject_withdrawn($1,$2) as w`, [A_CY, AW])).rows[0].w,
    );
    expect(withdrawn).toBe(true); // A's own withdrawn subject — real signal
  });

  it("the service-role / internal path (no company context) is unaffected — both tenants readable", async () => {
    // commit_lock / close_feedback / the worker call these with a NULL company
    // context; they must keep working for every tenant. (superuser ≈ that path.)
    const b = (await client.query(`select app.effective_setting($1,'retentionDays') as s`, [B_CY])).rows[0].s;
    const a = (await client.query(`select app.effective_setting($1,'retentionDays') as s`, [A_CY])).rows[0].s;
    expect(b).toBe("999");
    expect(a).toBe("730");
  });
});
