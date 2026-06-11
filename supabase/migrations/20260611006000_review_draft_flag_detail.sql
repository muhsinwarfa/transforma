-- ============================================================================
-- 2026-06-11 — ADDITIVE (spine 000100–000400 FROZEN; this ALTERs the spine table
-- review_drafts via a new migration, which is allowed — the spine FILES are frozen,
-- not the schema). Persist the synthesis OBJECTION LOG so a manager always knows WHY
-- a draft was flagged: a flag with no reason trains people to ignore flags. The
-- worker writes the per-attempt gate + judge issues here on a flagged synthesis.
--
-- Confidentiality: this holds NO peer content. The Sonnet judge sees only the
-- (already de-identified) draft + a peer COUNT — never peer text — so its objections
-- reference the draft, which the approver sees anyway. It is approver-only context
-- (read through the approver's RLS-scoped workspace); the subject never sees flag
-- state (non-negotiable #3). The deterministic anonymity gate is unchanged.
-- ============================================================================

alter table review_drafts add column if not exists flag_detail jsonb;
