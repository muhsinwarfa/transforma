import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Red-team of the 1700 Vault-keyed audit chain. The point of the keyed HMAC is
// that an attacker with DB write access STILL cannot forge a valid continuation
// without the key. These prove that property survived the move from a GUC to
// Vault — tamper, forge, break-the-chain are all still caught — and that the
// fail-loud path fires (no silent dev-key fallback) when the key is missing.
// Runs on the ephemeral embedded harness (NOT prod — prod's audit_log is
// append-only/immutable and must not be polluted with forged test rows).

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const seedPath = path.join(repoRoot, "supabase", "seed.sql");
const shimPath = path.join(here, "shim.sql");

const PORT = 54394;
const PASSWORD = "postgres";
const KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"; // matches shim seed
const AUD1 = "c1a00000-0000-0000-0000-000000000001";
const AUD2 = "c1a00000-0000-0000-0000-000000000002";
const AUD3 = "c1a00000-0000-0000-0000-000000000003";

let epg: EmbeddedPostgres;
let client: pg.Client;

const SETUP_SQL = `
insert into companies (id, name, slug) values
  ('${AUD1}','Aud One','aud-one'),('${AUD2}','Aud Two','aud-two'),('${AUD3}','Aud Three','aud-three')
  on conflict (id) do nothing;
`;

const verify = async (company: string): Promise<number | null> => {
  // verify_audit_chain returns bigint, which pg yields as a string — coerce so the
  // break-point seq compares as a number.
  const seq = (await client.query(`select app.verify_audit_chain($1) as seq`, [company])).rows[0].seq;
  return seq === null ? null : Number(seq);
};
const append = (company: string, action = "cycle_settings_changed") =>
  client.query(`select app.append_audit($1,$2,null,null,'{}'::jsonb)`, [company, action]);
const setKey = (val: string | null) =>
  client.query(`update vault.decrypted_secrets set decrypted_secret=$1 where name='audit_chain_key'`, [val]);

beforeAll(async () => {
  epg = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `tf-pg6-${process.pid}-${Date.now()}`),
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

describe("audit chain integrity after the Vault rewrite (1700)", () => {
  it("a legit chain (written with the Vault key) verifies intact", async () => {
    await append(AUD1);
    await append(AUD1);
    await append(AUD1);
    expect(await verify(AUD1)).toBeNull();
  });

  it("a FORGED appended entry is caught — no valid hash without the key", async () => {
    const head = (await client.query(`select last_seq, last_hash from audit_heads where company_id=$1`, [AUD1])).rows[0];
    // an attacker with INSERT access appends a plausible row, but cannot produce a
    // valid keyed-HMAC row_hash → verify recomputes with the real key and detects it.
    await client.query(
      `insert into audit_log (company_id, seq, action, actor_account_id, subject_review_id, target, occurred_at, prev_hash, row_hash)
       values ($1, $2, 'review_locked', null, null, '{"forged":true}'::jsonb, now(), $3, extensions.digest('forged','sha256'))`,
      [AUD1, Number(head.last_seq) + 1, head.last_hash],
    );
    expect(await verify(AUD1)).toBe(Number(head.last_seq) + 1);
  });

  it("the immutability trigger blocks a naive UPDATE; and even bypassing it, a tampered past entry is caught", async () => {
    await append(AUD2);
    await append(AUD2);
    expect(await verify(AUD2)).toBeNull();
    // first line of defense: the trigger forbids UPDATE outright
    await expect(
      client.query(`update audit_log set target='{"x":1}'::jsonb where company_id=$1 and seq=1`, [AUD2]),
    ).rejects.toThrow(/ERR_IMMUTABLE/);
    // bypass it (as a privileged attacker would) and tamper a past entry's content;
    // the keyed HMAC over the (now-changed) content no longer matches → caught.
    await client.query(`alter table audit_log disable trigger audit_log_immutable`);
    await client.query(`update audit_log set target='{"tampered":true}'::jsonb where company_id=$1 and seq=1`, [AUD2]);
    await client.query(`alter table audit_log enable trigger audit_log_immutable`);
    expect(await verify(AUD2)).toBe(1);
  });

  it("the chain is bound to THE key: a different key fails to verify a legit chain (keyed, not just hashed)", async () => {
    await append(AUD3);
    await append(AUD3);
    expect(await verify(AUD3)).toBeNull(); // intact under the real key
    await setKey("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"); // attacker's different key
    expect(await verify(AUD3)).toBe(1); // every entry now fails — they were HMAC'd with the real key
    await setKey(KEY); // restore
    expect(await verify(AUD3)).toBeNull(); // intact again under the real key
  });
});

describe("fail-loud: never operate under an insecure/missing key", () => {
  it("a missing Vault key makes append_audit RAISE (no silent dev-key fallback)", async () => {
    await setKey(null);
    await expect(append(AUD1)).rejects.toThrow(/ERR_AUDIT_KEY_MISSING/);
    await setKey(KEY);
  });

  it("a too-short key is also refused (length floor), then a restored key works again", async () => {
    await setKey("short");
    await expect(append(AUD2)).rejects.toThrow(/ERR_AUDIT_KEY_MISSING/);
    await expect(client.query(`select app.verify_audit_chain($1)`, [AUD1])).rejects.toThrow(/ERR_AUDIT_KEY_MISSING/);
    await setKey(KEY);
    await expect(append(AUD2)).resolves.toBeDefined(); // back to normal
  });

  it("the worker startup gate's exact query refuses when the key is missing, passes when present", async () => {
    // mirrors apps/worker/src/audit/guard.ts assertAuditKeyConfigured()
    const gate = "select (length(app.audit_key()) >= 32) as ok";
    await setKey(null);
    await expect(client.query(gate)).rejects.toThrow(/ERR_AUDIT_KEY_MISSING/); // worker would refuse to boot
    await setKey(KEY);
    expect((await client.query(gate)).rows[0].ok).toBe(true); // worker boots
  });
});
