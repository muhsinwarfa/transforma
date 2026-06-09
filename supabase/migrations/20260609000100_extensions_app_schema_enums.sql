-- ============================================================================
-- Transforma — 0100: extensions, `app` schema, enums
-- Authority: docs/contract-map.md. Canonical names verbatim; status lifecycle
-- per §3. Physical columns are snake_case (verbatim camelCase lives at TS/API).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Privileged helper namespace. Functions here are SECURITY DEFINER with a
-- pinned search_path so they may read identity/role tables without tripping
-- the very RLS policies they support (avoids recursive policy evaluation).
create schema if not exists app;

-- ── Enums ───────────────────────────────────────────────────────────────────

-- Structural roles (fixed). Display WORDS are tenant-configured labels resolved
-- at render — never hardcoded, never persisted here.
create type app_role as enum ('subject', 'peer', 'approver', 'admin');

-- Review status lifecycle (contract §3 spelling). The prototype's `awaiting-ack`
-- is a UI display key only and is never persisted.
--   draft → in-review → awaiting-acknowledgement → locked   (happy)
--           ↘ flagged → (rework) → awaiting-acknowledgement → locked
--   {draft|in-review} → aborted        (integration failure; never locks)
--   finalization      → blocked_sod    (no eligible approver; non-terminal)
--   locked = terminal (no legal outbound edge; no post-lock correction)
create type review_status as enum (
  'draft',
  'in-review',
  'awaiting-acknowledgement',
  'locked',
  'flagged',
  'aborted',
  'blocked_sod'
);

create type nomination_status as enum ('pending', 'approved', 'changes_requested');

create type peer_feedback_state as enum ('new', 'draft', 'submitted', 'declined', 'closed');

-- "Acknowledging is not agreeing." window_closed = silence, documented.
create type ack_outcome as enum ('acknowledged', 'responded', 'window_closed');

create type cycle_status as enum ('draft', 'open', 'closed', 'archived');

create type account_status as enum ('invited', 'active', 'withdrawn');

create type synthesis_state as enum ('queued', 'running', 'done', 'flagged', 'aborted');

create type retention_state as enum ('scheduled', 'purged');

-- Every audited action (PROC-01..06 + lock + retention). The target jsonb on
-- audit_log carries IDs + outcome flags ONLY — never peer content, narrative,
-- or self-review text.
create type audit_action as enum (
  'token_issued',
  'token_consumed',
  'token_invalid',
  'account_provisioned',
  'roster_imported',
  'review_created',
  'nomination_submitted',
  'nomination_approved',
  'nomination_changes_requested',
  'self_review_submitted',
  'peer_feedback_submitted',
  'peer_feedback_declined',
  'feedback_window_closed',
  'bundle_compiled',
  'bundle_below_floor_flagged',
  'draft_synthesized',
  'draft_flagged',
  'draft_aborted',
  'approver_resolved',
  'finalize_blocked_sod',
  'narrative_edited',
  'rating_set',
  'review_finalized',
  'review_revealed',
  'status_transition',
  'employee_acknowledged',
  'employee_responded',
  'ack_window_closed',
  'review_locked',
  'retention_scheduled',
  'retention_purged',
  'approver_reassigned',
  'deadline_extended',
  'subject_withdrawn',
  'cycle_settings_changed',
  'role_labels_changed'
);
