# Deferred-to-live-Supabase checks — the E2E gate

These checks **cannot** run in the current no-Docker / embedded-Postgres environment because
they need the full Supabase stack (GoTrue auth, PostgREST, real session cookies) and/or a running
Next.js server with a browser. Everything *up to* the layer where these take over is already proven
against embedded Postgres (RLS, triggers, the token-consume gate, the reveal-boundary data source).

**This list is the e2e gate.** When the stack is stood up, every box below must be ticked before the
corresponding slice is considered fully verified. Do not let an item silently lapse because it was
deferred across slices — add to this list as new slices defer checks; never remove an unticked item.

> How to run, once the stack is up: `supabase start` (or a hosted project), set `.env` from
> `.env.example`, `pnpm db:reset` (applies all migrations + seed), `pnpm dev` + `pnpm dev:worker`.

## Bring-up order — run the gate in THIS sequence, adversarially

Everything below is proven at the data layer (95 DB probes, embedded Postgres). The
live stack is a different surface — the things proven against SQL but not yet
against the real runtime. **Three foundation-level breaches were found in exactly
this kind of gap (superuser-probe vs real caller); expect the live gate to surface
something too.** Run each step as the **least-privileged, cross-tenant, negative
path** first — not happy-path. Ordered by blast radius (a failure early invalidates
everything after it):

1. **PostgREST `app`-schema exposure (HIGHEST blast radius).** The whole app calls
   `supabase.schema("app").rpc(...)` for `effective_setting`, `commit_lock`,
   `append_audit`, `approve_nominations`, `close_feedback`, etc. Hosted Supabase
   exposes only `public`/`graphql_public` by default — confirm `app` is in
   `PGRST_DB_SCHEMAS` (Settings → API → Exposed schemas) **before anything else**.
   If it isn't, every privileged RPC 404s and most of the app is dead. Also confirm
   the 1500 revokes hold over PostgREST: an authenticated JWT calling a revoked
   `app.*` function gets `permission denied`, not a result.
2. **GoTrue session / cookie path (PROC-01 + every authenticated read).** Real
   activation-token consume → provision → sign-in → the `@supabase/ssr` cookie
   round-trips and `auth.uid()` resolves so RLS binds the right `companyId`. This is
   the load-bearing assumption under every wire-not-pixels claim. Adversarial:
   replay a consumed token, an expired token, a cross-tenant session.
3. **The real two-connection lock race (PROC-05).** A genuine simultaneous manual
   acknowledge + window-close cron on the same review → exactly one locked row, one
   audit entry, loser no-ops. (Deterministic no-op + PK backstop proven; this is the
   true race the embedded harness can't stage.)
4. **Browser wire-capture for the reveal + queue boundaries (PROC-05/Approver,
   Subject; PROC-02/03 Peer; Admin).** At the network layer (RSC payload / fetch),
   confirm no narrative/rating/flag/peer-content/self-review bytes cross the wire to
   a party who shouldn't have them — the data never reaches the client, not merely
   "the UI doesn't paint it." Cover the SoD-barred approver absence, the peer
   confidentiality surfaces, the admin aggregate-only screens.
5. **Live synthesis against a real `ANTHROPIC_API_KEY` (PROC-04, LOWEST blast
   radius — isolated to the worker).** Real writer (`claude-opus-4-8`) + judge
   (`claude-sonnet-4-6`) calls; the deterministic gate behaviour; below-floor
   self-only; the judge catching a semantic evasion the gate passes.

The per-process detail for each is below.

## Operational notes (do not break these)

- **Audit-chain key is PERMANENT — never rotate.** It lives in Supabase Vault as
  `audit_chain_key`, read by `app.audit_key()` (migration `001700`). Rotating it
  breaks verification of every prior audit entry. There is **no dev fallback** —
  `append_audit`/`verify_audit_chain` raise `ERR_AUDIT_KEY_MISSING` and the worker
  refuses to boot if it's absent. A future instance must not rotate or "clean up"
  this secret. (Superuser-recoverable from Vault if ever needed.)
- The delegated `postgres` role on Supabase is **not** a superuser: persistent GUCs
  (`ALTER DATABASE`/`ALTER ROLE ... SET`) are denied (`42501`). Use Vault for
  DB-accessible secrets, not GUCs.
- Spine `000100`–`000400` is frozen; corrections are additive migrations + re-probe.

## PROC-01 — Activation / auth (front door)
- [ ] **Live activation end-to-end:** click a valid activation link → GoTrue creates the auth user →
      `consumeActivationToken` consumes it → `provisionAccount` links the account + grants roster roles
      → user is signed in. (The DB-level consume / replay / expired / missing / **bytea** / session-binding
      are already green in `token-gate.dbspec.ts` — this verifies the GoTrue + provisioning half.)
- [ ] **Replay against live stack:** re-using a consumed activation link fails closed in the real flow
      (not just at the SQL function).
- [ ] **Expired link** shows the expired screen and offers re-request; **used link** redirects to sign-in.
- [ ] **`provisionAccount`** correctly links `auth_user_id`, sets `status=active`, and grants exactly the
      roster member's `structural_roles` (no wider).
- [ ] **Live sign-in / sign-out** round-trips the session cookie via `@supabase/ssr`.
- [ ] **Retry-after-rollback works end-to-end:** when activation fails *after* the GoTrue user is
      created (e.g. the token turns out invalid in the partial-failure window), the orphaned auth user is
      deleted and **a second attempt with the same still-unconsumed token succeeds** — no leftover
      account / `account_roles` row blocks the retry, no half-provisioned state. (GoTrue createUser +
      token-consume are not one atomic op; this is the one window the embedded harness can't exercise.)

## PROC-05 / Subject — reveal boundary (WIRE check, not pixels)
- [ ] **Subject-session reveal wire capture:** a logged-in subject mid-cycle (review `in-review`) opens
      `/review`; confirm at the **network layer** (RSC payload / fetch responses in the network tab) that
      **no narrative/rating bytes cross the wire** — proving the data never reaches the client, not merely
      that the UI doesn't paint it. (Data source + dispatch already proven in `probes.dbspec.ts` +
      `view.spec.ts`.)
- [ ] After finalize (`awaiting-acknowledgement`), the finished narrative + rating **do** arrive on the
      wire; after acknowledge/respond, the locked snapshot renders and the response is stored beside.

## PROC-02 / PROC-03 — nomination approval, peer feedback, feedback-close (live stack)
- [ ] **Approve → seed → roster (live):** an approver approves a subject's nominations; confirm a
      `rosters` row + `roster_peers` are created, `reviews.roster_id` is attached, one `peer_feedback`
      row (state `new`) is seeded per peer, and the subject's nomination edit-lock engages (their
      nominate screen goes read-only). Request-changes returns the editable form with the note.
- [ ] **Peer confidentiality at the wire (network capture):** signed in as a peer, confirm the RSC
      payload for `/peer` and `/peer/<id>` carries **no** self-review, draft, rating, outcome, or any
      other peer's content — only the subject's name/department + the peer's own answers. (DB-layer
      absence + the roster-bound insert policy already green in `probes.dbspec.ts` +
      `proc02-proc03.dbspec.ts`.)
- [ ] **Floor at close on live data:** drive a real subject to below-floor (< 3 submitted peers) and
      another to at/above; run the close cron; confirm the below-floor bundle is self-only
      (`peer_included=false`, `peer_theme_payload` NULL) and the at/above bundle includes peers, and
      both enqueue exactly one synthesis job. (Floor + roster-scoped count + idempotency already green
      in `proc02-proc03.dbspec.ts`.)
- [ ] **Theme extraction lives in synthesis, not close:** confirm `peer_theme_payload` stays NULL at
      compile and PROC-04 reads `peer_feedback` transactionally to extract de-identified themes — the
      ratified design (§3/§7.4). (Flagged so a reviewer doesn't mistake the NULL payload for a bug.)

## PROC-MAIN / PROC-06 / Admin — fan-out, oversight, mid-cycle (live stack)
- [ ] **Full thread in the running app:** drive ONE subject end-to-end through the live UI —
      activate → nominate → approve → self + peer (parallel) → feedback-close → synthesis (real
      Anthropic) → manager edits + sets rating → finalize/reveal → acknowledge → lock — and confirm
      each handoff on real rows. (The DATA-layer thread is already green in `e2e.dbspec.ts`; this is
      the live-GoTrue/PostgREST/browser version.)
- [ ] **Admin cycle/monitor stays aggregate (live):** signed in as an admin, confirm at the network
      layer that the cycle + monitor screens carry only aggregate counts — no self-review, draft,
      rating, locked narrative, or written response bytes. (DB-layer absence on all five content
      tables green in `e2e.dbspec.ts`; `cycle_monitor` is aggregate-only.)
- [ ] **Gated admin content read writes an audit entry (live, 1800/1900):** an admin who holds the
      review-content capability with `adminContentAccessEnabled` on opens `/admin/reviews` → a review →
      confirm the synthesized content arrives on the wire **and** a fresh `admin_content_view` audit
      row (actor + that review) is written per open. (Fail-closed paths + per-view audit already green
      in `admincontent.dbspec.ts`; this is the live GoTrue/PostgREST version.)
- [ ] **Plain admin / setting off → nothing (live):** an admin **without** the grant, and any admin
      when the toggle is off, gets an empty `/admin/reviews` and `app.admin_read_review` returns null
      with **no** audit written. The **Review access** settings tab flips the toggle and grants/revokes
      per-admin, both audited.
- [ ] **Cross-tenant denied (live):** an admin in company A (granted) cannot open a company-B review —
      `app.admin_read_review` returns null in every setting state; nothing on the wire, no audit in A.
- [ ] **Raw peer never reachable (live, network capture):** across every state, confirm the
      `/admin/reviews` RSC payload carries **no** `peer_feedback` responses, peer authorship, or
      sub-floor peer content — the gated read returns only the de-identified narrative the approver
      sees + the subject's own input/response. (Structural in `app.admin_read_review`; `peer_feedback`
      stays author-only RLS and `feedback_bundles` ungranted — both 0 to the admin in `admincontent.dbspec.ts`.)
- [ ] **Role-label denylist (live/UI):** an admin cannot save a role label containing a brand/model
      term — `saveRoleLabels` rejects it at the write chokepoint (it's data, not source the build lint
      can scan). Confirm the rejection surfaces and that a saved label re-renders app-wide.
- [ ] **Defaults merge (live):** saving company defaults preserves `retentionDays` (and any key the
      form doesn't edit); `peerAnonymityThreshold` cannot be saved below 3 (action clamp + DB CHECK).
- [ ] **Withdraw archive (live):** after an admin withdraws a departed subject, confirm at the network
      layer that the subject's self-review, the peer feedback about them, and the derivative draft are
      no longer fetchable by anyone (subject, peer author, approver, admin). (DB-layer no-read-path
      green in `e2e.dbspec.ts`.)

## PROC-05 / Approver — finalize at the wire (live stack)
- [ ] **Queue absence end-to-end:** a signed-in approver who is SoD-barred from review R (its subject,
      or a `review_contributors` entry) hand-types `/approvals/<R>`; confirm at the **network layer**
      that the RSC payload carries **no review/draft bytes** and the page renders the "not available"
      state — not a row hidden in the client. (DB read- and write-side absence already green in
      `probes.dbspec.ts`: Liban gets 0 rows on `reviews`/`review_drafts`/`approver_queue`, and his
      finalize UPDATE affects 0 rows.)
- [ ] **Finalize REVEALS, never locks (live):** the assigned approver sets a rating and finalizes →
      review goes to `awaiting-acknowledgement` with `revealed_at`/`ack_window_ends_at` set and
      `locked_at` still NULL; the subject's `/review` now receives the finished narrative + rating on
      the wire. The permanent lock fires only on the **subject's** acknowledge/respond (commit_lock) or
      the window-close cron — never at finalize. (DB-level reveal-not-lock, reveal-incomplete rejection,
      and the ERR_LOCK_PATH guard already green in `probes.dbspec.ts`.)
- [ ] **Rating-required at finalize (live):** finalizing with no rating set is rejected
      (`ERR_RATING_REQUIRED`) and the review stays editable — no reveal, no lock. (App-layer gate proven
      in `sod.spec.ts`; the DB intentionally allows `rating` NULL until set, so this gate lives in the
      finalize action.)
- [ ] **Pre-lock revision is discretionary (PROC-05):** confirm the manager/admin *may* still revise the
      narrative before lock (no employee-forced loop, no round-cap) — the current workspace goes
      read-only after finalize, so surfacing a re-open path is a deferred capability, not a softened one.
      **Invariant for that path when built:** a revise after reveal must **re-reveal the revised
      version** — reset/refresh `revealed_at` (and re-open the ack window) so the employee never
      acknowledges version A and is then silently locked into version B. A change must not slip in
      behind an acknowledgement already given; if the employee has already acknowledged, the review is
      locking/locked and no revision is possible at all. Prove: revise after reveal → reveal markers
      refreshed + any prior un-acted ack state cleared; revise after acknowledge → rejected.

## PROC-05 cron tails — ack-window auto-lock + retention (Render Cron + DB)
- [ ] **Cron actually fires on schedule:** Render Cron invokes `ackWindowAutoLock` (`*/5 * * * *`) and
      `retentionSweep` (daily) — confirm both run on their schedule against the live DB. (The DB
      functions + worker loops are green in `cron.dbspec.ts`; this is the scheduler wiring.)
- [ ] **Auto-lock concurrency in the live stack:** a real race — a subject acknowledges at the same
      moment the window-close cron fires the same review — yields exactly one locked row + one
      `review_locked` audit; the loser no-ops. (Deterministic no-op + the locked_reviews PK backstop
      are green in `cron.dbspec.ts`; this exercises a genuine two-connection race.)
- [ ] **Retention over real time:** once a locked review's `purge_after` actually elapses, the sweep
      purges only the source bodies and the locked snapshot + audit chain remain intact and verifiable.
      (Scope + chain-verify + idempotency green in `cron.dbspec.ts` with `purge_after` fast-forwarded.)

## Synthesis (PROC-04) — needs a live ANTHROPIC_API_KEY + DB
- [ ] **Real writer call** (`claude-opus-4-8`, adaptive thinking, `output_config.{effort,format}`, no
      temperature/prefill) returns the 4-section narrative; **judge call** (`claude-sonnet-4-6`) returns
      a structured verdict. (Request shape already verified against live docs; gate orchestration +
      adversarial behaviour already proven in `synthesis.spec.ts`.)
- [ ] **Runner end-to-end against the DB:** an in-review review with a compiled bundle → ready attaches
      the draft and stays `in-review`; a gate-exhausted draft drives `in-review → flagged`; a
      deterministic API failure drives `in-review → aborted`. Feedback bodies are read transactionally
      (via `app.worker_submitted_peer_responses`) and never persisted into `review_drafts`.
- [ ] **Below-floor live:** a review with < threshold submitted peers → the writer receives self-review
      only (peers omitted) and the draft carries no peer-attributable content.
- [ ] **Judge catches a real model's semantic evasion** (implied rating / jargon brand-synonym /
      unknown identifier / paraphrased quote) that the deterministic gate passes — the half the
      red-team showed is irreducibly semantic.

_Last updated: gated admin content read (1800/1900) — `admin_content_view` audit action + `review_content_grants` capability + `adminContentAccessEnabled` setting + `app.admin_read_review`/`admin_review_list`; fail-closed + red-team green in `admincontent.dbspec.ts`; live boxes added under PROC-MAIN/PROC-06/Admin. Prior: 1500 red-team pass — completeness + freeze-bypass clean; tenant-scoped the two executable SECURITY DEFINER helpers (effective_setting/threshold, is_subject_withdrawn) in 1600 + xtenant.dbspec regression. On top of PROC-05 cron tails (1400) + cron-tail red-team hardening 1500 (privileged functions revoked from PUBLIC/authenticated → service-role only; revealed rating/narrative frozen between reveal and lock; reveal-requires-narrative), on top of PROC-MAIN fan-out + PROC-06 admin (red-team hardening 1000–1300). DATA-layer end-to-end thread + both cron tails green in `e2e.dbspec.ts` / `cron.dbspec.ts`; live-browser/live-cron versions are the boxes above. Append new deferred checks here as slices add them._
