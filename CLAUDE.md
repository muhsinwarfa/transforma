# CLAUDE.md — Transforma

Orientation for every session. Read this first, then **`docs/contract-map.md`** before planning or
writing code. Keep both in context; they are the spec.

> **Current status — read `docs/build-state.md` before any prod/live work.** The data layer is
> complete, red-teamed, and **live on the production Supabase project** (schema-only, empty). Three
> foundation-level auth breaches + two cross-tenant residuals were found and closed additively (the
> spine `000100`–`000400` stays frozen). The audit-chain key now lives in **Supabase Vault** and is
> **permanent — never rotate it** (rotating breaks verification of all prior entries). The only
> remaining gate is the **live-stack checklist** (`docs/deferred-live-supabase-checks.md`), a
> deliberate human-watched session.
>
> **Admin content access (1800/1900):** admins/HR can now read individual review content, but only
> through a **gated, fully-audited** path — a per-admin **review-content capability**
> (`review_content_grants`, distinct from the `admin` role) **and** a company setting
> (`adminContentAccessEnabled`, default on). Reads go through `app.admin_read_review` (SECURITY
> DEFINER, read-only, tenant-scoped), which audits every view (`admin_content_view`) and **never
> returns peer feedback** — the anonymity floor is preserved structurally. This reverses `1300`'s
> aggregate-only stance narrowly; `1300`'s RLS is unchanged (no direct admin table read).

---

## What Transforma is

A multi-tenant HR performance-review platform. A cycle collects an employee's self-review and
confidential peer feedback. The system **synthesizes that real feedback into a draft narrative — it
never produces a rating.** A manager reviews and edits the narrative and **sets the rating
themselves**. The finished review is **revealed to the employee**, who acknowledges it or attaches a
written response; then it **locks permanently**. Four structural roles — **subject, peer, approver
(manager), admin** — in one adaptive app, not four portals.

## Stack — Render only

- **Next.js → one Render Web Service** (frontend + API). Frontend built from `docs/design/`.
- **Node/TS → Render Background Worker + Cron** for the long-running / scheduled work: the feedback
  deadline, narrative synthesis (Anthropic calls), and the acknowledgement-window auto-lock.
- **Supabase (Postgres + RLS)** is the system of record; tenant isolation on `companyId`.
- **Real Anthropic API** synthesizes the narrative. Key from env.

Do **not** add a second hosting provider (no Vercel). Do not split frontend and backend across hosts.

## The reframe: BPMN is spec, not an engine

`docs/bpmn/*.bpmn` are a **behavioral specification**, not something that runs. There is no Zeebe, no
Camunda, no workflow engine. Implement the happy and negative paths they describe as ordinary code: a
review **state machine** plus **scheduled jobs**. Long-running waits (a peer window open for days, a
review awaiting acknowledgement) are **states in Supabase**, advanced by user actions and the
scheduler. The six files: PROC-MAIN, PROC-01-AUTH, PROC-02-PEER-SELECTION, PROC-03-FEEDBACK,
PROC-04-SYNTHESIS, PROC-05-FINALIZATION, plus PROC-06-ADMIN-ACTIONS.

## The three non-negotiables (enforce server-side, never UI-only)

An engine would have guaranteed these for free; in code they are easy to soften. Do not. Each needs a
test that proves it fails closed.

1. **Segregation of duties.** A review's approver is never its subject, and never anyone who
   contributed managerial input to it (`inputAuthorId`, when set). Ineligible reviews are hidden from
   that approver's queue **and** the server rejects an ineligible finalize — hiding alone is not
   enough.
2. **Lock is permanent and immutable; no post-lock correction.** Once locked there is no update path
   to the content — no edit endpoint, no correction, no superseding version. Errors are fixed
   **before** lock, in the acknowledgement window. Locking writes an append-only, tamper-evident
   audit entry.
3. **The employee sees the finished review before lock; lock follows acknowledgement.** The employee
   never sees a draft, in-progress content, or the internal flag status. After the manager finalizes,
   the finished review is revealed; the permanent lock fires **after** the employee
   acknowledges/responds (or the window closes).

**Core confidentiality rule (just beneath the three): peer anonymity floor.** Peer feedback is used
in the visible draft only when submitted peer responses ≥ the threshold (**default 3, hard minimum
3**). Below the floor, peer content is excluded entirely (never surfaced to draft or approver) and the
draft is built from the self-review only and flagged. Synthesis uses **general themes only** — never a
verbatim quote, a single identifying incident, or named/implied attribution. A peer never sees the
self-review, other peers, the draft, or the outcome.

These three (plus the floor) are the review checkpoint for any plan you produce. If a plan softens
one, stop and flag it.

## What the system does and does not do

- **Does:** synthesize real self + peer feedback into a draft **narrative**.
- **Does NOT:** propose, suggest, or compute a **rating** — ever. The human approver owns the rating.
  There is **no `isOverridden`** and no override/justification gate (nothing to override).
- **Does NOT:** collect protected attributes or do any demographic / disparate-impact math anywhere.

## Brand & copy (hard rules)

- **"AI" never appears on any user-facing surface.** Describe the system as synthesizing real
  feedback. Internal layer names are never shown.
- **Role words are tenant-configured labels**, resolved at render — never hardcoded (`approver →
  "Manager"`, `admin → "People Ops"`). Demo tenant: "Riverbend Health."
- Design system is **Hogaan**: compose from its tokens/atoms, extend — don't reinvent. Light mode.
  WCAG AA. **Transforma** is the product brand; the tenant name is workspace context, not the logo.

## Authority & precedence

When sources disagree: **`docs/contract-map.md` → BPMN spec → designs.** If something is unspecified
everywhere, raise it in the plan instead of guessing. `contract-map.md` carries the canonical
variable names (`companyId, cycleId, employeeId, rosterId, reviewDraftId, rating, inputAuthorId`), the
per-process contracts, the status lifecycle (`draft → in-review → awaiting-acknowledgement →
locked`, plus `flagged`, `aborted`, `blocked_sod`), and the screen↔process↔data table. Use those
names verbatim.

## Settings & out of scope

Operational knobs are **company defaults, overridable per cycle** (feedback deadline,
`peerAnonymityThreshold` min 3, max peer nominations, acknowledgement-window length).

Don't build unless asked: a **system-suggested rating** (never); **calibration** (deferred — keep the
rating a structured, audited field so it's additive later); **cohort fairness** (removed; no protected
attributes); **post-lock correction / appeals adjudication** (none); SSO (placeholder); dark mode;
white-labeling beyond role labels + tenant name; any second host.

## Working mode

Plan first (Plan mode); the approval gate is where leakage gets caught. Build order:
**Foundation → Subject → Peer → Approver → Admin**, each slice honoring its part of the contract,
server and UI.