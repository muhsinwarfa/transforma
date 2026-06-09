# Transforma — Source-of-Truth Contract Map

> This document is the authority on **how Transforma must behave**. Read it before planning or
> writing any code. It exists so that the BPMN diagrams and the UI designs can never silently
> disagree during the build — when they seem to, this document decides.

---

## 0. How to read this repo

- **`docs/bpmn/*.bpmn`** — the **behavioral specification**. These do **not** run. There is no
  Zeebe, no Camunda, no workflow engine. They describe the happy paths and negative paths each
  process must follow; you implement that behavior as ordinary code (a review state machine plus
  scheduled jobs).
- **`docs/design/`** — the UI specification (screens, components, the Hogaan-based design system).
  Build the frontend from these. The design is **reference for the UI**; where it and this contract
  differ on behavior, this contract wins.
- **`docs/contract-map.md`** (this file) — the bridge and the authority. It also states rules that
  live in neither diagram nor design (server-side enforcement, immutability, confidentiality).

**Precedence when in doubt:** this contract map → BPMN spec → designs. If something is unspecified
everywhere, raise it in the plan rather than guessing.

**What Transforma is, in one paragraph.** A multi-tenant HR performance-review platform. A cycle
collects an employee's self-review and confidential peer feedback; the system **synthesizes that
real feedback into a draft narrative** (never a rating); a manager reviews and edits the narrative
and **sets the rating themselves**; the finished review is **revealed to the employee**, who
acknowledges it or attaches a written response; then it **locks permanently**. Four structural
roles — subject, peer, approver (manager), admin — in one adaptive app, not four portals.

---

## 1. Stack & deployment

**One platform: Render.** Do not introduce a second hosting provider.

| Layer | Choice | Notes |
|---|---|---|
| App (frontend + API) | **Next.js → Render Web Service** | Single web service; frontend built from `docs/design/`. Responsive: subject/peer mobile-first; approver/admin desktop-first. |
| Background work | **Node/TS → Render Background Worker + Cron** | The long-running / scheduled work: feedback deadline, narrative synthesis (Anthropic calls), acknowledgement-window auto-lock. |
| Data | **Supabase (Postgres + RLS)** | System of record; tenant isolation via row-level security on `companyId`. |
| Narrative generation | **Real Anthropic API** | Synthesizes real feedback into a draft **narrative only**. Key via env. **Never labeled "AI" on any user-facing surface.** |

There is no workflow engine. "Processes" are a review **state machine** plus **scheduled jobs**.
Long-running waits (a peer window open for days, a review awaiting acknowledgement) are **states in
Supabase**, advanced by user actions and the scheduler.

---

## 2. The three non-negotiables

A workflow engine would have enforced these for free; in code each is easy to soften. They are
**enforced server-side**, never by UI alone, each with a test proving it fails closed.

1. **Segregation of duties.** A review's approver must not be its subject, and must not be anyone who
   contributed managerial input to it (`inputAuthorId`, when set). Ineligible reviews never appear in
   that approver's queue **and** the server rejects a finalize attempt by an ineligible approver — UI
   hiding alone is insufficient. (Source: `PROC-05`.)
2. **Lock is permanent and immutable; there is no post-lock correction.** Once a review is `locked`
   there is no update path to its content — no edit endpoint, no "issue a correction," no superseding
   version. Factual errors are resolved **before** lock, during the acknowledgement window. Locking
   writes an append-only, tamper-evident audit entry. (Source: `PROC-05`.)
3. **The employee sees the finished review before lock; lock follows acknowledgement.** The employee
   never sees a draft, in-progress content, or the internal flag status. After the manager finalizes,
   the **finished** review is revealed for acknowledgement; the permanent lock fires **after** the
   employee acknowledges/responds, or after the acknowledgement window closes. (Source: `PROC-05`.)

**Core confidentiality rule (sits directly under the three):** **peer anonymity floor.** Peer
feedback is confidential and is used in the visible draft only when the number of submitted peer
responses for the subject is **≥ the anonymity threshold (default 3, admin-settable, hard minimum
3)**. Below the floor, peer content is excluded entirely — never surfaced to the draft or the
approver — and the draft is built from the self-review only and flagged for the manager to
supplement. The synthesis speaks in **general themes only**: never a verbatim peer quote, never a
single identifying incident/project/date, never named-or-implied attribution. A peer never sees the
self-review, other peers' feedback, the draft, or the outcome. (Source: `PROC-03` + `PROC-04`.)

---

## 3. Core domain model

### Canonical variables (same names end-to-end, verbatim)

| Variable | Type | Meaning |
|---|---|---|
| `companyId` | string | Tenant. Scopes every query (RLS). |
| `cycleId` | string | A review cycle. |
| `employeeId` | string | The **subject** of a review. |
| `rosterId` | string | The subject's **approved** peer set for the cycle. |
| `reviewDraftId` | string | The synthesized narrative draft for a review. |
| `rating` | enum/string | The performance rating — **set by the human approver only**; never produced, suggested, or computed by the system. |
| `inputAuthorId` | string\|null | A human who contributed managerial input to a review; excluded from approving it. Null by default. |

Data carried between stages is **by reference (IDs)**, not by value. Bodies (self-reviews, feedback,
drafts, locked content) live in Supabase keyed by `cycleId` + `employeeId`.

**There is no `isOverridden`.** The system never proposes a rating, so there is nothing to override.
The manager owns the rating from the start.

### Structural roles vs. display labels

- **Structural roles (fixed; the system reasons about these):** `subject`, `peer`, `approver`,
  `admin`.
- **Display labels (tenant-configured, set by an admin):** every role *word* a user sees is resolved
  from tenant config — e.g. `approver → "Manager"`, `admin → "People Ops"`. **Never hardcode a role
  word in UI copy or logic.** One person may hold several structural roles; one adaptive app, not
  four portals. Demo tenant: "Riverbend Health."

### Review status lifecycle

```
draft → in-review → awaiting-acknowledgement → locked        (happy path)
              ↘ flagged → (manager rework) → awaiting-acknowledgement → locked
draft|in-review → aborted              (integration failure; never completes as locked)
finalization    → blocked_sod          (no eligible approver; non-terminal; surfaced to admin)
locked = terminal (no legal outbound transition; no post-lock correction)
```

- **draft** — subject writing / narrative being synthesized.
- **in-review** — feedback being collected, or draft with the approver.
- **flagged** — internal only; the draft failed quality/anonymity gates and needs manager rework. The
  subject is **never** told it was flagged (sees "in review").
- **awaiting-acknowledgement** — the finished review has been revealed to the employee, pre-lock.
- **locked** — final, immutable, on the record. Terminal.

---

## 4. Per-process contracts

### PROC-MAIN — Review orchestration (per subject)
**Purpose:** one subject's review lifecycle within a cycle, as a state machine (not an engine).
**Happy path:** review created at cycle start (`status=draft`, eager fan-out, idempotent on
`(cycleId, employeeId)`) → Auth (`PROC-01`) → Peer selection (`PROC-02`) → Feedback (`PROC-03`) →
Synthesis (`PROC-04`) → Finalization (`PROC-05`) → `locked`.
**Negative paths:** an auth/token or synthesis failure aborts that review (`aborted`) and records the
failure; it never silently completes.
**Code rules:** mid-cycle admin actions (`PROC-06`) run alongside the lifecycle, not inside the happy
sequence.

### PROC-01 — Authentication & onboarding (per subject)
**IN** `companyId, cycleId, employeeId` → **OUT** roster population ready.
**Happy path:** validate + atomically consume the single-use activation token → provision/activate
the account + link to the roster member → ingest the roster population (idempotent).
**Negative paths:** `ERR_TOKEN_INVALID` (expired/used/missing) → reject, fail-closed (activation
expired/used screens). CSV validation failure → per-row report; nothing imported until valid.
**Code rules:** tokens are short-lived, single-use, high-entropy, validated-and-consumed atomically.
The roster defines the **population only** — it does not pre-assign peers (see `PROC-02`). All writes
scoped by `companyId` (RLS).

### PROC-02 — Peer selection (per subject)  *(nominate → approve)*
**IN** roster population → **OUT** `rosterId` (the approved peer set).
**Happy path:** the **subject nominates** peer reviewers (up to a configurable max) → the subject's
**manager approves** (or requests changes, returning it to the subject to adjust) → approved nominees
become `rosterId`.
**Code rules:** nomination encourages choosing at least the anonymity floor. The roster CSV never
pre-assigns peers. SoD is unaffected by who is nominated.
**Screens:** Subject "Nominate peers" (states: not-started / pending approval / approved / changes
requested); Approver "Approve peer nominations" (a manager task).

### PROC-03 — Feedback collection (per subject)  *(self + peer in parallel)*
**IN** `companyId, cycleId, employeeId, rosterId` → **OUT** a compiled feedback bundle (persisted).
**Happy path:** the self-review and approved-peer feedback are collected **in parallel** (no "self
before peers" gate) → the window closes on the deadline (a quorum may close it early) → compile the
bundle keyed `(cycleId, employeeId)`, applying the **anonymity floor**.
**Negative paths:** below the floor → peer content excluded entirely, bundle built from the
self-review only, review flagged for the manager. No peers nominated/approved → self-only.
**Code rules (confidentiality — critical):** a peer never sees the self-review, other peers' feedback,
the draft, or the outcome (enforced by RLS, not UI). Each peer submission persists independently. The
deadline is a scheduled job, not a UI timer.
**Screens:** Subject self-review; Peer feedback form + submitted + closed; (optional) peer decline.

### PROC-04 — Narrative synthesis (per subject)  *(no rating)*
**IN** the feedback bundle → **OUT** `reviewDraftId`.
**Happy path:** synthesize the real feedback into a **draft narrative** (themes only; no quotes; no
single-source identifiers; no attribution) → run quality & anonymity gates (formatting,
unsupported-claim, toxicity, policy, and peer-anonymity: reject apparent verbatim quotes or
single-source identifiers) → ready.
**Negative paths:** gates fail → regenerate with the issues, **max 3 attempts**, then **flag** for
manual rework (still returns a `reviewDraftId`). A deterministic generation failure → abort.
**Code rules:** **the system never produces, proposes, suggests, or computes a rating** — narrative
only. **No demographic or disparate-impact math anywhere; no protected attributes are collected.**
Internal layer names are never shown to users. This work runs on the Render worker.
**Screens:** none directly; the `flagged` output surfaces in the approver queue.

### PROC-05 — Finalization (per subject)  *(rating by human; reveal → acknowledge → lock)*
**IN** `companyId, cycleId, employeeId, reviewDraftId` → **OUT** a locked review.
**Happy path:** resolve eligible approver (SoD) → manager **reviews and edits the narrative freely
and sets the rating** (no justification gate, no override concept) → manager finalizes → **reveal the
finished review** to the employee (`awaiting-acknowledgement`; pre-lock) → the employee
**acknowledges** (optionally adding a written response) **or flags an error / disagrees** (a written
response is attached) → on acknowledgement, or when the acknowledgement window closes, **commit the
permanent lock** (insert-only snapshot + tamper-evident audit) → schedule retention on a separate
fixed-duration policy.
**Negative / branch paths:** no eligible approver → `blocked_sod` (non-terminal, surfaced to admin).
A flagged draft is reworked by the manager first. Before lock, the manager/admin may revise at their
**own discretion** — this is not employee-forced, so there is no loop and no round-cap.
**Code rules — owns all three non-negotiables:** SoD enforced server-side (rule 1); lock immutable,
no post-lock correction (rule 2); reveal before lock, lock after acknowledgement/window-close (rule
3). A written response is stored **beside** the locked review and never edits it. **Acknowledging is
not agreeing.** Silence/refusal is documented and the window-close locks the review.
**Screens:** Approver queue (incl. flagged) → review & edit workspace (edit narrative + set rating) →
finalize → (employee) reveal + acknowledge/respond → locked read-only.

### PROC-06 — Mid-cycle admin actions (settings / edge cases)
**Purpose:** admin operations during a live cycle. **Each writes an audit entry.**
**Actions:** (a) **reassign** a review's approver — must re-pass SoD; (b) **extend** a specific
subject's deadline (feedback or acknowledgement) independent of the cycle default; (c) **withdraw** a
departed subject — archive their feedback (never surface it) and remove the review from active counts.
**Screens:** Admin "Settings / cycle management."

---

## 5. Screen ↔ process ↔ data traceability

| Persona / Screen | Process | Key data | Must enforce |
|---|---|---|---|
| Auth: login / activation (valid/expired/used) / set-reset | PROC-01 | activation tokens | single-use, fail-closed |
| Subject: nominate peers | PROC-02 | nominations | up to max; ≥ floor encouraged |
| Approver: approve peer nominations | PROC-02 | nominations → rosterId | manager approves / requests changes |
| Subject: self-review | PROC-03 | self_reviews | parallel with peer feedback |
| Peer: feedback form / submitted / closed | PROC-03 | peer_feedback | confidential; isolated; deadline |
| Subject: my-review status | PROC-05 timing | review.status | **no content before finalize**; flagged shown as "in review" |
| Approver: queue (normal + flagged) | PROC-04/05 | reviews | flagged = needs rework; SoD by absence + access |
| Approver: review & edit workspace | PROC-05 | reviewDraftId, rating | edit freely; **human sets rating**; no gate |
| Subject: review revealed → acknowledge / respond | PROC-05 | finished review | revealed pre-lock; acknowledge or written response; then lock |
| Approver/Subject: locked review | PROC-05 | locked review | permanent + immutable; no correction |
| Admin: cycle setup + roster CSV | PROC-01 | cycles, roster | validate-before-import; eager fan-out |
| Admin: role-label config | label mechanism | company.role_labels | tenant-configured words |
| Admin: cycle monitor | aggregate | review.status counts | aggregate only (no per-person content) |
| Admin: review oversight (gated) | 1800/1900 | review content via `app.admin_read_review` | needs the **review-content capability** + `adminContentAccessEnabled`; **every read audited** (`admin_content_view`); **read-only**; tenant-scoped; **never peer feedback** |
| Admin: settings / cycle management | PROC-06 | settings; reassign/extend/withdraw; review-content grants | company defaults overridable per cycle; all audited |

---

## 6. Settings model

All operational knobs have **company-wide defaults** an admin sets once, each **overridable per
cycle**: feedback deadline, `peerAnonymityThreshold` (default 3, hard minimum 3), max peer
nominations, acknowledgement-window length. No hardcoded values beyond the documented hard minimum.

**Admin content access (company-wide):** `adminContentAccessEnabled` (default **true**) governs whether
admins may read individual review content at all. A read additionally requires a **review-content
capability** granted per-admin (`review_content_grants` — distinct from the `admin` role; holding
`admin` alone grants nothing). The read goes through `app.admin_read_review` (SECURITY DEFINER): it
re-checks the setting + capability + tenant, **writes an `admin_content_view` audit entry on every
successful read**, is **read-only**, and returns only the synthesized narrative / rating / self-review
/ locked snapshot / written response — **never `peer_feedback` or `feedback_bundles`** (the peer
anonymity floor is preserved structurally). Disabling the setting or revoking the grant fails the read
closed (no content, no audit). `1300`'s aggregate-only RLS is unchanged — this is the *only* admin
content path.

---

## 7. Brand & copy rules

- **"AI" never appears on any user-facing surface.** The system is described as **synthesizing real
  feedback** into a draft. Internal layer names are never shown.
- The output is a "draft review" / "your review"; the system never claims to rate, score, or judge.
- **Role words are tenant-configured labels**, resolved at render — never hardcoded.
- Design system is **Hogaan**: compose from its tokens/atoms, extend — don't reinvent. Light mode.
  WCAG AA. **Transforma** is the product brand; the tenant name is workspace context, not the logo.

---

## 8. Out of scope / deferred (do not build unless asked)

- **A system-suggested rating** — the system never proposes, suggests, or computes a rating. Narrative
  only; the human owns the rating.
- **Calibration** (cross-manager rating leveling) — deferred. Keep the `rating` a structured field
  with its audit trail (who set it, when) so calibration is an **additive** future stage, not a
  rebuild. Not built for v1 (target customers are < 100 employees).
- **Cohort fairness / disparate-impact monitoring** — removed from the product. No protected
  attributes are collected anywhere.
- **Post-lock correction / superseding versions / appeals adjudication** — there is none. Errors are
  resolved pre-lock during the acknowledgement window. A written response attaches beside the locked
  review and never edits it.
- **SSO / external identity** — inactive placeholder only.
- **Dark mode**; **white-labeling** beyond role labels + tenant name; **a second hosting provider.**