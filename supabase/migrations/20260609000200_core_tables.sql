-- ============================================================================
-- Transforma — 0200: core tables
-- snake_case columns (verbatim camelCase lives at the TS/API boundary).
-- RLS, grants, functions and triggers are added in 0300/0400 — this file is
-- structure only, but it already encodes the contract's STRUCTURAL guarantees
-- (SoD CHECK on reviews; locked_reviews PK = no double-lock; below-floor CHECK).
-- ============================================================================

-- ── companies ───────────────────────────────────────────────────────────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  -- structural role -> tenant display word (resolved at render; never hardcoded)
  role_labels jsonb not null default
    '{"subject":"Team Member","peer":"Peer","approver":"Manager","admin":"People Ops"}'::jsonb,
  -- company-wide defaults, each overridable per cycle. retentionDays default 730
  -- (~24 months) is a PRODUCT PLACEHOLDER pending the tenant's data-protection
  -- obligations (Kenya DPA / GDPR) — a compliance decision, never a hard constant.
  default_settings jsonb not null default
    '{"feedbackDeadlineDays":14,"peerAnonymityThreshold":3,"maxPeerNominations":5,"ackWindowDays":7,"retentionDays":730}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- hard minimum 3 on the anonymity threshold (contract core confidentiality rule)
  constraint anonymity_threshold_min check
    (coalesce((default_settings->>'peerAnonymityThreshold')::int, 3) >= 3)
);

-- ── accounts ────────────────────────────────────────────────────────────────
create table accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  display_name text not null,
  status account_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index accounts_company_email_uk on accounts (company_id, lower(email));

-- ── account_roles (many-to-many: one person holds several structural roles) ──
create table account_roles (
  account_id uuid not null references accounts(id) on delete cascade,
  role app_role not null,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, role)
);

-- ── cycles ──────────────────────────────────────────────────────────────────
create table cycles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  opens_at timestamptz,
  closes_at timestamptz,
  status cycle_status not null default 'draft',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a per-cycle override of the anonymity threshold may not soften below 3
  constraint cycle_anonymity_threshold_min check
    (coalesce((settings->>'peerAnonymityThreshold')::int, 3) >= 3)
);

-- ── roster_members — POPULATION ONLY (never pre-assigns peers; see PROC-02) ──
create table roster_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,   -- null until activation links
  email text not null,
  display_name text not null,
  department text,
  manager_ref text,                                              -- raw CSV value
  manager_account_id uuid references accounts(id) on delete set null,  -- resolved manager
  structural_roles app_role[] not null default array['subject']::app_role[],
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index roster_members_cycle_email_uk on roster_members (cycle_id, lower(email));

-- ── activation_tokens — single-use, short-lived, high-entropy, atomic ────────
create table activation_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  roster_member_id uuid not null references roster_members(id) on delete cascade,
  token_hash bytea not null unique,                              -- sha-256 of secret; raw never stored
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_auth_user uuid,
  created_at timestamptz not null default now()
);
-- at most one ACTIVE (unconsumed) token per roster member; re-issue invalidates prior
create unique index activation_tokens_active_uk
  on activation_tokens (roster_member_id) where consumed_at is null;

-- ── nominations — PROC-02 nominate → approve ─────────────────────────────────
create table nominations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  employee_id uuid not null references accounts(id) on delete cascade,   -- the subject
  nominee_account_id uuid not null references accounts(id) on delete cascade,
  status nomination_status not null default 'pending',
  manager_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, employee_id, nominee_account_id)
);

-- ── rosters (the APPROVED peer set => rosterId) + roster_peers ───────────────
create table rosters (
  id uuid primary key default gen_random_uuid(),                 -- rosterId
  company_id uuid not null references companies(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  employee_id uuid not null references accounts(id) on delete cascade,
  approved_by uuid references accounts(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cycle_id, employee_id)
);
create table roster_peers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  roster_id uuid not null references rosters(id) on delete cascade,
  peer_account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (roster_id, peer_account_id)
);

-- ── self_reviews ─────────────────────────────────────────────────────────────
create table self_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  employee_id uuid not null references accounts(id) on delete cascade,
  review_id uuid not null,                                       -- FK added at end of file
  sections jsonb not null default '{}'::jsonb,
  state peer_feedback_state not null default 'draft',            -- draft | submitted
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, employee_id)
);

-- ── peer_feedback — CONFIDENTIAL, isolated per peer ──────────────────────────
create table peer_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  employee_id uuid not null references accounts(id) on delete cascade,   -- the subject
  review_id uuid not null,                                       -- FK added at end of file
  roster_id uuid not null references rosters(id) on delete cascade,
  peer_account_id uuid not null references accounts(id) on delete cascade,  -- the author
  responses jsonb not null default '{}'::jsonb,
  state peer_feedback_state not null default 'new',
  deadline_at timestamptz,
  submitted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, employee_id, peer_account_id)
);

-- ── feedback_bundles — compiled per (cycleId, employeeId); floor applied ─────
create table feedback_bundles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  employee_id uuid not null references accounts(id) on delete cascade,
  review_id uuid not null,                                       -- FK added at end of file
  roster_id uuid references rosters(id) on delete set null,
  self_review_id uuid references self_reviews(id) on delete set null,
  submitted_peer_count int not null default 0,
  anonymity_threshold int not null,
  at_or_above_floor boolean not null,
  below_floor boolean not null,
  peer_included boolean not null,
  self_only boolean not null,
  -- de-identified THEMES only; NULL when below floor. Raw peer verbatim text is
  -- NEVER persisted here (it lives only in peer_feedback, single-author SELECT).
  peer_theme_payload jsonb,
  compiled_at timestamptz not null default now(),
  unique (cycle_id, employee_id),
  constraint below_floor_excludes_peer check (not (below_floor and peer_included)),
  constraint below_floor_no_payload check (not (below_floor and peer_theme_payload is not null))
);

-- ── review_drafts (reviewDraftId; narrative ONLY — no rating column) ─────────
create table review_drafts (
  id uuid primary key default gen_random_uuid(),                 -- reviewDraftId
  company_id uuid not null references companies(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  employee_id uuid not null references accounts(id) on delete cascade,
  review_id uuid not null,                                       -- FK added at end of file
  bundle_id uuid references feedback_bundles(id) on delete set null,
  -- Summary / Strengths / Areas to grow / Focus for next cycle. NO rating field —
  -- the system never produces, proposes, suggests, or computes a rating.
  sections jsonb not null default '{}'::jsonb,
  flagged boolean not null default false,
  flag_reason text,                                              -- internal; NEVER shown to subject
  attempt_count int not null default 0,
  generated_by_model text,                                       -- internal; never user-facing
  edited_by_approver boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, employee_id),
  constraint attempts_max_3 check (attempt_count between 0 and 3)
);

-- ── reviews — the spine (status, rating, inputAuthorId, approverId) ──────────
create table reviews (
  id uuid primary key default gen_random_uuid(),                 -- reviewId
  company_id uuid not null references companies(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  employee_id uuid not null references accounts(id) on delete cascade,
  roster_id uuid references rosters(id) on delete set null,
  review_draft_id uuid references review_drafts(id) on delete set null,
  approver_id uuid references accounts(id) on delete set null,   -- null when blocked_sod
  input_author_id uuid references accounts(id) on delete set null,  -- null default
  rating text,                                                   -- human-set only; null until set
  status review_status not null default 'draft',
  flagged_internal boolean not null default false,               -- internal flag, masked from subject
  flag_reason text,
  revealed_at timestamptz,
  ack_window_ends_at timestamptz,
  feedback_deadline_at timestamptz,
  locked_at timestamptz,
  retention_due_at timestamptz,
  aborted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, employee_id),                                -- idempotent eager fan-out
  -- SoD (non-negotiable #1), DB layer: approver is never the subject or an input author
  constraint sod_approver_not_subject check (approver_id is distinct from employee_id),
  constraint sod_approver_not_input_author check (approver_id is distinct from input_author_id),
  -- rating is human-set from the fixed option set, or null
  constraint rating_in_options check (
    rating is null or rating in (
      'Exceeds expectations', 'Meets expectations',
      'Partially meets expectations', 'Below expectations'
    )
  )
);

-- ── review_contributors — the plural inputAuthorId exclusion set (SoD) ───────
create table review_contributors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  review_id uuid not null references reviews(id) on delete cascade,
  contributor_account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (review_id, contributor_account_id)
);

-- ── audit chain head (per-tenant monotonic seq) ─────────────────────────────
create table audit_heads (
  company_id uuid primary key references companies(id) on delete cascade,
  last_seq bigint not null default 0,
  last_hash bytea
);

-- ── audit_log — append-only, tamper-evident hash chain ──────────────────────
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  seq bigint not null,
  action audit_action not null,
  actor_account_id uuid references accounts(id) on delete set null,  -- null = system
  subject_review_id uuid references reviews(id) on delete set null,
  -- IDs + outcome flags ONLY — never peer content, narrative, or self-review text
  target jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  prev_hash bytea,
  row_hash bytea not null,
  unique (company_id, seq)
);

-- ── locked_reviews — insert-only immutable snapshot (no double-lock via PK) ──
create table locked_reviews (
  review_id uuid primary key references reviews(id) on delete restrict,
  company_id uuid not null references companies(id) on delete cascade,
  cycle_id uuid not null references cycles(id),
  employee_id uuid not null references accounts(id),
  approver_id uuid not null references accounts(id),
  rating text not null,
  narrative jsonb not null,
  locked_at timestamptz not null default now(),
  lock_reason ack_outcome not null,
  content_hash bytea not null,
  audit_entry_id uuid references audit_log(id)
);

-- ── employee_responses — stored BESIDE the locked review; never edits it ────
create table employee_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  review_id uuid not null references reviews(id) on delete cascade,
  locked_review_id uuid references locked_reviews(review_id) on delete set null,
  employee_id uuid not null references accounts(id) on delete cascade,
  outcome ack_outcome not null,
  body text,
  created_at timestamptz not null default now(),
  unique (review_id),
  constraint response_body_when_responded check (outcome <> 'responded' or body is not null)
);

-- ── synthesis_jobs — durable worker queue (exactly one live per review) ─────
create table synthesis_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  review_id uuid not null references reviews(id) on delete cascade,
  bundle_id uuid references feedback_bundles(id) on delete set null,
  state synthesis_state not null default 'queued',
  attempts int not null default 0,
  locked_by text,
  locked_at timestamptz,
  last_error text,
  idempotency_key uuid not null unique,                          -- = review_id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── retention_jobs — fixed-duration policy; purges SOURCE BODIES only ───────
create table retention_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  review_id uuid not null references reviews(id) on delete cascade,
  locked_review_id uuid references locked_reviews(review_id) on delete cascade,
  purge_after timestamptz not null,
  state retention_state not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id)
);

-- ── back-FKs: the `review_id` columns -> reviews(id) (resolves the cycle) ────
alter table self_reviews
  add constraint self_reviews_review_fk foreign key (review_id) references reviews(id) on delete cascade;
alter table peer_feedback
  add constraint peer_feedback_review_fk foreign key (review_id) references reviews(id) on delete cascade;
alter table feedback_bundles
  add constraint feedback_bundles_review_fk foreign key (review_id) references reviews(id) on delete cascade;
alter table review_drafts
  add constraint review_drafts_review_fk foreign key (review_id) references reviews(id) on delete cascade;

-- ── indexes the jobs / queues / RLS lookups need ────────────────────────────
create index reviews_close_idx on reviews (status, feedback_deadline_at);
create index reviews_acklock_idx on reviews (status, ack_window_ends_at);
create index reviews_retention_idx on reviews (status, retention_due_at);
create index reviews_approver_idx on reviews (company_id, approver_id);
create index reviews_employee_idx on reviews (company_id, employee_id);
create index synthesis_jobs_claim_idx on synthesis_jobs (state, locked_at);
create index peer_feedback_review_idx on peer_feedback (review_id, state);
create index peer_feedback_author_idx on peer_feedback (company_id, peer_account_id);
create index account_roles_company_idx on account_roles (company_id, role);
create index audit_log_review_idx on audit_log (subject_review_id);
