-- ============================================================================
-- 0900 — ADDITIVE red-team hardening (spine 000100–000400 stays FROZEN; this
-- layers corrected constraints/policies on top, exactly as 000600 did for the
-- SoD null-widening). Two confirmed holes from the PROC-02/03 adversarial review:
--   H1     — a subject could nominate THEMSELVES and become their own confidential
--            peer, seeding self-authored words into the anonymity count.
--   FLOOR-2 — any authenticated account could INSERT a 'submitted' peer_feedback
--            row for any review (the 000400 insert policy bound only company+self,
--            not roster membership), inflating n past the anonymity floor and
--            injecting content into someone else's review.
-- Re-probe after applying.
-- ============================================================================

-- H1: a subject must never be their own peer. Enforce at the table level so it
-- holds on EVERY insert path (RLS or service-role), not just one policy.
alter table nominations
  add constraint nominee_not_self check (nominee_account_id <> employee_id);

-- FLOOR-2: a peer_feedback row may only be AUTHORED by an APPROVED roster peer of
-- that subject. The peers are seeded by app.approve_nominations (SECURITY DEFINER,
-- RLS-off) and thereafter only UPDATED by the peer — the authenticated role has no
-- legitimate reason to INSERT one. Re-bind the insert policy to roster membership
-- so a non-roster account (a removed nominee, a curious insider, a stranger with a
-- review UUID) cannot inject a 'submitted' row to cross the floor or inject content.
drop policy peer_feedback_author_insert on peer_feedback;
create policy peer_feedback_author_insert on peer_feedback for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and peer_account_id = app.current_account_id()
    and exists (
      select 1
      from rosters r
      join roster_peers rp on rp.roster_id = r.id
      where r.cycle_id = peer_feedback.cycle_id
        and r.employee_id = peer_feedback.employee_id
        and rp.peer_account_id = peer_feedback.peer_account_id
    )
  );
