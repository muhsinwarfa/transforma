# Build state — Transforma

Snapshot for whoever picks this up next (possibly a fresh instance). Read
`CLAUDE.md` and `docs/contract-map.md` for the spec; this file is **where the build
actually is right now**. Authority precedence is unchanged: `contract-map.md` →
`docs/bpmn` → `docs/design`.

## TL;DR

The **data layer is complete, red-teamed, and LIVE on the production Supabase
project** (`transforma-prod`, ref `xzlqigxxtrrqgaajpyhz`), schema-only and empty.
The **only remaining gate before real users is the live-stack checklist**
(`docs/deferred-live-supabase-checks.md`) — the things proven against SQL but not
yet against the real runtime (GoTrue, PostgREST, browser, live Anthropic). That
checklist is a **deliberate, human-watched session** — do not run it unattended.

## What is live on prod

- **All 19 migrations applied** (`000100`–`001900`), in order, **schema-only — no
  seed** (no demo tenant; prod starts empty). RLS enabled on every sensitive table.
- The systemic auth fix (1500) **confirmed on prod**: privileged `app.*` functions
  PUBLIC-executable = 0.
- The **audit-chain key is in Supabase Vault** as `audit_chain_key` (see below).
- **Admin content access (1800/1900) applied + verified on prod:** the
  `admin_content_view` enum value, `review_content_grants` (RLS on), and the three
  functions all present; `admin_read_review`/`admin_review_list`/`can_read_review_content`
  are EXECUTE-granted to `authenticated` only (anon denied); `admin_read_review` fails
  closed (returns null) with no auth context.
- Connection works; the DB password contains an `@` and parses correctly.

## The audit-chain key (READ BEFORE TOUCHING)

- The keyed-HMAC audit chain reads its key from **Supabase Vault** via
  `app.audit_key()` — **not** a Postgres GUC. (The delegated `postgres` role on
  Supabase is **not** a superuser and cannot set a persistent GUC: `ALTER DATABASE`
  and `ALTER ROLE ... SET` both return `42501`. Vault is the home that works.)
- **No dev fallback exists anymore.** Migration `001700` removed the old
  `coalesce(current_setting(...), 'dev-insecure-...')`. `app.audit_key()` **RAISES
  `ERR_AUDIT_KEY_MISSING`** if the Vault key is absent/short, so `append_audit` /
  `verify_audit_chain` refuse to operate under an insecure key. The worker also
  **refuses to boot** without it (`apps/worker/src/audit/guard.ts`).
- **The key is PERMANENT — never rotate it.** Rotating breaks verification of every
  prior audit entry. It is superuser-recoverable from Vault. A future instance must
  not "helpfully" rotate or "clean up" this secret.

## Security findings found + closed (all via red-team as a least-privileged, cross-tenant caller — every one was invisible to superuser-only probes)

Three were authorization holes in the **frozen 0400 baseline**; two were cross-tenant
residuals; plus the integration thread caught real spine bugs. All fixed
**additively** (the spine `000100`–`000400` was never edited) and re-probed:

| Finding | What it was | Fix migration |
|---|---|---|
| **FLOOR-2** (critical) | Any authenticated user could `INSERT` a `submitted` peer_feedback row for any review → inflate the anonymity floor + inject content | `000900` (roster-bound peer insert + `nominee_not_self`) + `000800` (roster-scoped close count) |
| **ADM-1** (high) | Admin role had direct read of individual review content across 5 tables (self-review, draft, rating/flags, locked narrative, written response) | `001300` (admin disjunct dropped from all 5 SELECT policies; oversight is aggregate `cycle_monitor` only). **Later reversed *narrowly* by `1800/1900`** as a deliberate product decision — admin content read returns through a gated, audited `app.admin_read_review` (capability + setting + tenant, read-only, peer-blind); `1300`'s RLS is unchanged (still no *direct* admin table read). See "Admin content access" below. |
| **AUTH-1** (critical, systemic) | Every privileged `app.*` function kept Postgres's default PUBLIC EXECUTE (the `grant ... to service_role` was additive, never restrictive) → any authenticated user could call `commit_lock`, `append_audit`, `worker_submitted_peer_responses`, etc., several cross-tenant | `001500` (REVOKE PUBLIC on the 14 privileged fns) |
| **XT-1 / XT-2** (low, cross-tenant) | `effective_setting`/`effective_threshold` + `is_subject_withdrawn` leaked another tenant's settings/withdrawn-boolean (SECURITY DEFINER, no tenant check) | `001600` (tenant-guard; bites only an authenticated cross-tenant caller) |
| peer-submit RLS bug | `peer_feedback_author_update` had only `USING` → its implicit `WITH CHECK` rejected a peer SUBMITTING (caught by the e2e thread on the real RLS path) | `001200` |
| withdraw-archive vacuous | the 1100 archive guard's `not exists (roster_members)` was itself RLS-filtered → vacuously true | `001100` (`is_subject_withdrawn` is `SECURITY DEFINER`) |
| SoD CHECK null-widening | NULL/NULL approver/input-author from eager fan-out | `000600` |
| revise-after-reveal | revealed rating/narrative were mutable pre-lock → could lock the subject into a version they never saw | `001500` (freeze triggers; a revise must re-reveal) |

## Migration map

`000100`–`000400` = **FROZEN spine** (extensions/enums; core tables + CHECKs;
functions/triggers incl. `commit_lock`/`append_audit`/transition+immutability
guards; RLS/grants/views). `000500`–`001900` = **additive** (PROC features +
red-team hardening + the Vault audit-key move + the gated admin content read).
Never edit the frozen four; layer corrections in a new migration and re-probe
(the established pattern).

## Admin content access (1800 / 1900) — gated, audited read

A deliberate product reversal of `1300`'s aggregate-only stance, kept narrow:

- **`1800`** adds the `admin_content_view` audit action (its own migration — PG
  forbids *using* a new enum value in the txn that adds it; the first
  `ALTER TYPE ADD VALUE` in the repo).
- **`1900`** adds `review_content_grants` (the per-`(company, account)` capability,
  distinct from the `admin` role; admin-managed via RLS), `app.can_read_review_content`
  (the gate: `admin` role **AND** a grant **AND** `adminContentAccessEnabled`,
  default on), `app.admin_read_review(review)` (SECURITY DEFINER, **volatile** — it
  writes the audit; returns the synthesized narrative / rating / self-review / locked
  snapshot / response, **never `peer_feedback`/`feedback_bundles`**; cross-tenant ⇒
  null), and `app.admin_review_list()` (navigation metadata, same gate, not audited
  per-row). The read path is the **only** admin content path — `1300`'s RLS is
  untouched, so a *direct* admin table read is still 0.
- **Why a function, not a re-added RLS SELECT:** RLS can't audit-per-read (a direct
  PostgREST read would be silent) and can't strip raw peer from a composite view. The
  definer function makes the audit non-bypassable and peer-blindness structural.
- **Web:** `apps/web/src/lib/admin/content.ts` (RLS-client reads), three actions in
  `admin/actions.ts` (`readReviewContent` / `saveAdminContentAccess` / grant+revoke),
  the `/admin/reviews` screen (list → click → audited content), and a **Review access**
  tab in `SettingsPanel` (toggle + per-admin grant list).
- **Status:** built, **embedded-green** (`admincontent.dbspec.ts`, red-teamed),
  typecheck/contract-lint clean, **and applied + verified on live prod** (enum value,
  table+RLS, 3 functions present; read fns granted to `authenticated` only / anon
  denied; fails closed with no auth context). Prod stays schema-only (no seed). The
  live-stack boxes in `deferred-live-supabase-checks.md` (real GoTrue/PostgREST/browser
  verification of the audited read, the toggle, cross-tenant deny, peer-blindness)
  remain to be ticked in the human-watched session.

## How it's verified (no Docker)

- **95 DB probes across 8 `*.dbspec.ts` suites** on **embedded Postgres** (`pg` +
  `embedded-postgres`, real PG via a Supabase-mimicking `shim.sql`): `probes`,
  `token-gate`, `proc02-proc03`, `e2e` (full lifecycle on real rows), `cron`,
  `xtenant`, `audit-integrity` (the keyed-HMAC red-team + fail-loud), and
  `admincontent` (the 1800/1900 gated-read fail-closed + red-team: capability,
  setting, tenant, peer-blindness, audited-per-view, read-only, chain-intact).
- Run: `pnpm --filter @transforma/db test:db` · `pnpm -r typecheck` ·
  `pnpm --filter @transforma/web lint:contract` · `pnpm --filter @transforma/review-core test`.
- The `e2e` suite drives one review **fan-out → nominate → approve → self+peer →
  close → synth(sim) → resolve → queue → finalize/reveal → acknowledge → lock** on
  real rows. Live synthesis (Anthropic) is deferred to the live session.

## Remaining gate — the live-stack checklist (run in THIS blast-radius order, adversarially)

See `docs/deferred-live-supabase-checks.md` (the literal gate). Order:
1. **PostgREST `app`-schema exposure** (highest blast radius — the app calls
   `supabase.schema("app").rpc(...)` everywhere; confirm `app` is in
   `PGRST_DB_SCHEMAS` and the 1500 revokes hold over PostgREST).
2. GoTrue session/cookie path (activation → sign-in → `auth.uid()` binds RLS).
3. The real two-connection lock race (manual ack vs window-close cron).
4. Browser wire-capture for the reveal + queue + peer + admin boundaries.
5. Live synthesis against a real `ANTHROPIC_API_KEY`.
Run each least-privileged / cross-tenant / negative-path first. Expect it to surface
something — better there than in front of a user.

## Ops / env notes

- **Not a git repository yet.** `.gitignore` is in place (ignores `.env`/`.env.*`,
  keeps `.env.example`). `.env.example` is sanitized to placeholders. Real secrets
  live only in `.env` (gitignored) and are OneDrive-synced (accepted pre-launch; no
  rotation). Before any `git init`, re-confirm `.env.example` has no real values.
- The repo lives under OneDrive — secrets are cloud-synced; treat accordingly.
- Stack is **Render-only** by design (one Next.js web service + one Node worker/cron;
  Supabase as system of record). No second host.
