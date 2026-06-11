// ============================================================================
// Transforma — REAL tenant provisioning (packages/db/provision-tenant.mjs)
//
// Unlike qa-fixture.mjs (zztest-only, disposable), this provisions PRODUCTION
// tenants, so it has no zztest guard — instead it refuses obviously-wrong input
// (a zztest slug, an existing slug) and requires explicit flags. Reuses the exact
// data-layer patterns from qa-fixture.mjs.
//
// The app does NOT auto-send activation emails. Onboarding is: an account is
// pre-created (status 'invited') + linked to a roster_member + a single-use,
// 7-day activation token is minted; the person opens /activate/<token> and sets
// their password (provisionAccount then activates the account + grants its roster
// roles). This tool performs that minting and prints the per-person links.
//
//   Create a tenant + its first admin (with the review-content grant):
//     node provision-tenant.mjs --create-tenant --name "Warfa Group" \
//       --slug warfa-group --admin muhsin.warfa@gmail.com --admin-name "Muhsin Warfa"
//
//   After the admin imports a roster, mint activation links for everyone not yet
//   provisioned (account_id IS NULL):
//     node provision-tenant.mjs --invite --slug warfa-group
//
// ENV (source repo-root .env): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   SUPABASE_DB_URL, NEXT_PUBLIC_SITE_URL (app base; defaults to the Render URL).
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import crypto from "node:crypto";

const APP_BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://transforma-re46.onrender.com").replace(/\/$/, "");
const ROLE_LABELS = { subject: "Team Member", peer: "Peer", approver: "Manager", admin: "People Ops" };
const DEFAULT_SETTINGS = {
  feedbackDeadlineDays: 14, peerAnonymityThreshold: 3, maxPeerNominations: 5,
  ackWindowDays: 7, retentionDays: 730, adminContentAccessEnabled: true,
};

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
if (!supaUrl || !svcKey || !dbUrl) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL");
  process.exit(1);
}
const supabase = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });

// Create the GoTrue user (email_confirm so password sign-in works immediately).
// If the email already exists, reuse it and (re)set the given password.
async function ensureAuthUser(email, password) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error && data?.user?.id) return data.user.id;
  if (error && /already|registered|exists/i.test(error.message)) {
    let page = 1;
    for (;;) {
      const { data: list, error: le } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (le) throw new Error(`listUsers: ${le.message}`);
      const hit = list.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
      if (hit) { await supabase.auth.admin.updateUserById(hit.id, { password, email_confirm: true }); return hit.id; }
      if (list.users.length < 200) break;
      page++;
    }
  }
  throw new Error(`createUser failed for ${email}: ${error ? error.message : "no id"}`);
}

async function createTenant() {
  const name = val("--name"), slug = val("--slug"), adminEmail = (val("--admin") || "").trim();
  const adminName = val("--admin-name") || "Admin";
  if (!name || !slug || !adminEmail) { console.error("--create-tenant needs --name, --slug, --admin"); process.exit(1); }
  if (/^zztest/i.test(slug)) { console.error("refusing a zztest slug — this tool is for real tenants"); process.exit(1); }
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) { console.error("slug must be lowercase letters/digits/hyphens"); process.exit(1); }
  if ((await pool.query("select 1 from companies where slug=$1", [slug])).rowCount) {
    console.error(`slug '${slug}' already exists — aborting`); process.exit(1);
  }

  // strong, random temp password (URL-safe; mixed classes); the admin rotates it.
  const tempPw = "Tf-" + crypto.randomBytes(12).toString("base64url") + "-7Q!";
  const authId = await ensureAuthUser(adminEmail, tempPw);

  const companyId = crypto.randomUUID();
  try {
    await pool.query(
      `insert into companies (id, name, slug, role_labels, default_settings) values ($1,$2,$3,$4::jsonb,$5::jsonb)`,
      [companyId, name, slug, JSON.stringify(ROLE_LABELS), JSON.stringify(DEFAULT_SETTINGS)],
    );
    const { rows } = await pool.query(
      `insert into accounts (company_id, auth_user_id, email, display_name, status) values ($1,$2,$3,$4,'active') returning id`,
      [companyId, authId, adminEmail, adminName],
    );
    const accountId = rows[0].id;
    await pool.query(`insert into account_roles (account_id, role, company_id) values ($1,'admin',$2)`, [accountId, companyId]);
    // review-content grant (granted_by = self at provisioning). Capability is distinct from the admin role.
    await pool.query(
      `insert into review_content_grants (company_id, account_id, granted_by, granted_at) values ($1,$2,$2, now())`,
      [companyId, accountId],
    );
    console.log("\n=== TENANT PROVISIONED ===");
    console.log(JSON.stringify({
      ok: true, tenant: name, slug, companyId, adminEmail, accountId,
      loginUrl: APP_BASE + "/login", tempPassword: tempPw,
      note: "Sign in with the temp password, then rotate via Forgot-password (or ask to have it reset).",
    }, null, 2));
  } catch (e) {
    console.error("provision failed, cleaning up auth user:", e.message);
    await supabase.auth.admin.deleteUser(authId).catch(() => {});
    process.exit(1);
  }
}

async function inviteRoster() {
  const slug = val("--slug");
  if (!slug) { console.error("--invite needs --slug"); process.exit(1); }
  const co = (await pool.query("select id, name from companies where slug=$1", [slug])).rows[0];
  if (!co) { console.error(`no company '${slug}'`); process.exit(1); }
  const members = (await pool.query(
    `select id, email, display_name, structural_roles
       from roster_members
      where company_id=$1 and account_id is null and withdrawn_at is null
      order by display_name`,
    [co.id],
  )).rows;
  if (!members.length) { console.log("No un-provisioned roster members (everyone already has an account)."); await pool.end(); return; }

  const links = [];
  for (const m of members) {
    const { rows } = await pool.query(
      `insert into accounts (company_id, email, display_name, status) values ($1,$2,$3,'invited') returning id`,
      [co.id, m.email, m.display_name],
    );
    await pool.query(`update roster_members set account_id=$1 where id=$2`, [rows[0].id, m.id]);
    const raw = crypto.randomBytes(24).toString("base64url"); // the secret; only its sha256 is stored
    await pool.query(
      `insert into activation_tokens (company_id, roster_member_id, token_hash, expires_at)
         values ($1,$2, extensions.digest($3,'sha256'), now() + interval '7 days')`,
      [co.id, m.id, raw],
    );
    links.push({ name: m.display_name, email: m.email, roles: m.structural_roles, activationLink: `${APP_BASE}/activate/${raw}` });
  }
  console.log(`\n=== ${links.length} ACTIVATION LINK(S) — ${co.name} (valid 7 days, single-use) ===`);
  console.log(JSON.stringify(links, null, 2));
}

try {
  if (has("--create-tenant")) await createTenant();
  else if (has("--invite")) await inviteRoster();
  else console.error("usage: --create-tenant --name <n> --slug <s> --admin <email> [--admin-name <n>]  |  --invite --slug <s>");
} finally {
  await pool.end().catch(() => {});
}
