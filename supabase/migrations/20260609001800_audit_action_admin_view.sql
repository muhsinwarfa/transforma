-- ============================================================================
-- 1800 — ADDITIVE (spine 000100–000400 FROZEN). Adds the 'admin_content_view'
-- audit action consumed by 1900's gated admin content-read.
--
-- Isolated in its OWN migration on purpose: Postgres forbids *using* a newly
-- added enum value in the same transaction that ADDs it ("unsafe use of new
-- value"). The apply runs each migration file in its own transaction, so by the
-- time 1900 references 'admin_content_view' (in a function body) the value is
-- committed and usable. This is the first ALTER TYPE ADD VALUE in the repo —
-- it is additive and applies identically to the embedded harness and prod.
-- ============================================================================

alter type audit_action add value if not exists 'admin_content_view';
