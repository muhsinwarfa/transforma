-- ============================================================================
-- 1200 — ADDITIVE (spine 000100–000400 FROZEN; corrects a policy on top, like
-- 000600/000900/001100). The end-to-end thread (e2e.dbspec) caught a real bug:
-- the 000400 peer_feedback_author_update policy specified ONLY a USING clause
-- (peer_account_id = self AND state in ('new','draft')). For UPDATE, Postgres
-- applies a USING-only policy ALSO as the WITH CHECK on the NEW row — so a peer
-- SUBMITTING their feedback (state 'new'/'draft' → 'submitted') produced a new row
-- whose state failed the implicit check, and RLS rejected it. Prior suites
-- submitted peers via the service role, so the peer's OWN RLS submit path was
-- never exercised; the integration thread is what surfaced it.
--
-- Fix: split the clauses. USING still gates WHICH rows may be updated — only
-- 'new'/'draft', so a 'submitted'/'closed' row stays frozen (no un-submit, no
-- re-edit). WITH CHECK governs the NEW row — still owned by the peer, and allowed
-- to land in new/draft/submitted/declined. It deliberately does NOT permit
-- 'closed' (that transition is the worker's window-close, not a peer action).
-- Re-probe after applying.
-- ============================================================================

drop policy peer_feedback_author_update on peer_feedback;
create policy peer_feedback_author_update on peer_feedback for update to authenticated
  using (company_id = app.current_company_id()
         and peer_account_id = app.current_account_id()
         and state in ('new', 'draft'))
  with check (company_id = app.current_company_id()
              and peer_account_id = app.current_account_id()
              and state in ('new', 'draft', 'submitted', 'declined'));
