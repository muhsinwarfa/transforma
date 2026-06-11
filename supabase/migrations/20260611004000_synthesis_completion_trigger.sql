-- ============================================================================
-- 2026-06-11 — ADDITIVE (spine 000100–000400 FROZEN). PROC-04 RULING: synthesis
-- fires as soon as a review's INPUTS ARE COMPLETE, not only at the feedback
-- deadline. Inputs complete = the self-review is submitted AND every APPROVED
-- nominated peer has RESOLVED their request. "Resolved" = submitted OR declined
-- (declines count); a closed request never blocks (never wait on it). Below the
-- floor it still fires — close_feedback compiles the self-only bundle and enqueues
-- synthesis exactly as before. The feedback-deadline cron (runFeedbackClose) stays
-- the FALLBACK sweep for reviews still carrying unresolved requests at deadline.
--
-- This is a thin completion CHECK in front of the existing app.close_feedback:
-- when (and only when) inputs are complete, it delegates to close_feedback, which
-- already does the whole atomic, idempotent close (bundle + window-close + status
-- advance + enqueue + audit). Called from the response/decline/self-submit events
-- via the service role; RLS cannot see the other peers' rows, so the check must
-- run in a SECURITY DEFINER function (row_security off), mirroring close_feedback.
-- ============================================================================

create or replace function app.maybe_close_on_completion(p_review_id uuid) returns text
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_review record;
  v_self_submitted boolean;
  v_unresolved int;
begin
  select r.id, r.cycle_id, r.employee_id, r.roster_id, r.status
    into v_review
  from reviews r where r.id = p_review_id
  for update;                                   -- serialize concurrent events per review
  if not found then
    return 'skipped';
  end if;

  -- Completion fires only PRE-close. Once a review is past 'draft' a bundle exists
  -- (or synthesis is underway); close_feedback would self-skip anyway.
  if v_review.status <> 'draft' then
    return 'skipped';
  end if;
  -- Need an APPROVED roster: completion is "self submitted AND every approved peer
  -- resolved". Before approval there are no approved peers to resolve — wait.
  if v_review.roster_id is null then
    return 'waiting_roster';
  end if;

  -- (1) self-review submitted?
  select exists (
    select 1 from self_reviews sr
    where sr.cycle_id = v_review.cycle_id
      and sr.employee_id = v_review.employee_id
      and sr.state = 'submitted'
  ) into v_self_submitted;
  if not v_self_submitted then
    return 'waiting_self';
  end if;

  -- (2) every APPROVED peer (roster_peers) RESOLVED? A peer is unresolved until
  -- their request reaches a terminal state — submitted, declined, or closed.
  -- Declines count as resolved; a closed request never blocks. 'new'/'draft'
  -- (or a missing row) means we are still waiting on that peer. Anchored on the
  -- roster set so a stray non-roster peer_feedback row cannot affect completion.
  select count(*)::int into v_unresolved
  from roster_peers rp
  where rp.roster_id = v_review.roster_id
    and not exists (
      select 1 from peer_feedback pf
      where pf.review_id = p_review_id
        and pf.peer_account_id = rp.peer_account_id
        and pf.state in ('submitted', 'declined', 'closed')
    );
  if v_unresolved > 0 then
    return 'waiting_peers';
  end if;

  -- Inputs complete → compile the bundle (anonymity floor applied on REAL submitted
  -- data) and enqueue synthesis — atomic + idempotent inside app.close_feedback.
  -- Below floor, close_feedback builds the self-only bundle (peers excluded).
  return app.close_feedback(p_review_id);
end
$$;

-- Privileged, audited path — service role / worker only (same posture as close_feedback).
revoke all on function app.maybe_close_on_completion(uuid) from public, anon, authenticated;
grant execute on function app.maybe_close_on_completion(uuid) to service_role;
