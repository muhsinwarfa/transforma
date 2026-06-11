-- ============================================================================
-- 2026-06-11 — ADDITIVE (spine 000100–000400 FROZEN). BUG FIX: the admin monitor
-- meters ("Self-reviews x/N", "Peer feedback x/N") were derived from review STATUS
-- (reviews past 'draft'), but a review stays 'draft' until synthesis fires — so a
-- submitted self-review and submitted peer responses did NOT move the meters until
-- the feedback window closed. The meters read 0/5 mid-cycle even with real input in.
--
-- Fix: a new admin-gated, owner-run, AGGREGATE-ONLY view that counts REAL submission
-- state — submitted self_reviews and subjects with >=1 submitted peer response —
-- never any content. Same confidentiality posture as cycle_monitor: owner-run
-- (security_invoker = false), gated to admins of the tenant, and it exposes only
-- integers. No per-person rows, no peer count per subject, no bodies ever leave the
-- DB — so the anonymity floor is untouched (this is operational progress, not peer
-- content). "Manager decisions" stays status-derived in the app (awaiting-ack/locked).
-- ============================================================================

create or replace view cycle_progress
  with (security_invoker = false) as
select
  r.company_id,
  r.cycle_id,
  -- submitted self-reviews (real submission state, independent of review.status)
  count(distinct sr.employee_id) filter (where sr.state = 'submitted')::int as self_submitted,
  -- subjects with at least one SUBMITTED peer response — a count of distinct
  -- subjects only; never reveals who/what or a per-subject peer count
  count(distinct pf.employee_id) filter (where pf.state = 'submitted')::int as peer_responded
from reviews r
left join self_reviews sr on sr.review_id = r.id
left join peer_feedback pf on pf.review_id = r.id
where r.company_id = app.current_company_id()
  and app.has_role(r.company_id, 'admin')
  -- Exclude withdrawn/aborted subjects: withdraw_subject aborts the review but leaves
  -- the archived self/peer rows in place, and the meter denominator (getCycleMonitor's
  -- `total`) already drops withdrawn roster members — so without this the numerator
  -- could exceed the denominator (e.g. "Self-reviews 5/4"). Mirrors the old status
  -- proxy, which excluded aborted.
  and r.status <> 'aborted'
group by r.company_id, r.cycle_id;

grant select on cycle_progress to authenticated;
