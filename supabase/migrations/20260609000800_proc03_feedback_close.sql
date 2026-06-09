-- ============================================================================
-- 0800 — ADDITIVE (spine 000100–000400 FROZEN). PROC-03 feedback-close: compile
-- the feedback bundle, apply the anonymity floor on REAL submitted data, advance
-- the lifecycle, and enqueue synthesis — atomically, per subject. Re-probe after.
--
-- Why SQL (not just TS in the worker): the whole close is a multi-row write
-- (bundle + window-close + status transition + job enqueue + audit) that MUST be
-- atomic and idempotent under at-least-once cron. One SECURITY DEFINER function
-- gives one transaction, makes the FLOOR provable in the actual compile path
-- (a DB probe calls this directly), and enforces the floor at the DB layer too —
-- not only in review-core's applyFloor (which the synthesis runner mirrors).
-- ============================================================================

create or replace function app.close_feedback(p_review_id uuid) returns text
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_review record;
  v_threshold int;
  v_count int;
  v_below boolean;
  v_self uuid;
  v_bundle uuid;
begin
  select r.id, r.company_id, r.cycle_id, r.employee_id, r.roster_id, r.status
    into v_review
  from reviews r where r.id = p_review_id
  for update;                                  -- serialize concurrent closes per review
  if not found then
    return 'skipped';
  end if;

  -- Only close reviews still collecting feedback. Idempotent: if a bundle already
  -- exists for this subject, a re-run of the cron must NOT double-compile/enqueue.
  if v_review.status not in ('draft', 'in-review') then
    return 'skipped';
  end if;
  if exists (
    select 1 from feedback_bundles fb
    where fb.cycle_id = v_review.cycle_id and fb.employee_id = v_review.employee_id
  ) then
    return 'skipped';
  end if;

  -- The anonymity floor on REAL data: count SUBMITTED peers ONLY (declines,
  -- never-submitted, and drafts do NOT count toward n), against the clamped
  -- threshold (effective_threshold is hard-min 3). This is the same rule
  -- review-core applyFloor() applies; here it runs in the live compile path.
  --
  -- Roster-scoped (defense-in-depth, red-team FLOOR-2): n counts ONLY authors who
  -- are in the subject's APPROVED roster — never a stray peer_feedback row whose
  -- author isn't an approved peer (the 0900 insert policy blocks such inserts; this
  -- count would ignore one even if a service-role/future path created it). A review
  -- with no roster yet counts zero peers (correctly below floor → self-only).
  select count(*)::int into v_count
  from peer_feedback pf
  where pf.review_id = p_review_id
    and pf.state = 'submitted'
    and exists (
      select 1 from roster_peers rp
      where rp.roster_id = v_review.roster_id
        and rp.peer_account_id = pf.peer_account_id
    );

  v_threshold := app.effective_threshold(v_review.cycle_id);
  v_below := v_count < v_threshold;

  select sr.id into v_self from self_reviews sr
  where sr.cycle_id = v_review.cycle_id and sr.employee_id = v_review.employee_id;

  -- Compile the bundle. BELOW floor: peer feedback is EXCLUDED ENTIRELY —
  -- peer_included=false, self_only=true, peer_theme_payload NULL (the DB CHECKs
  -- below_floor_excludes_peer + below_floor_no_payload enforce this; the insert
  -- would fail otherwise). AT/ABOVE floor: peers included. Theme extraction
  -- itself happens in synthesis (PROC-04, ratified §3/§7.4) reading peer_feedback
  -- transactionally — so peer_theme_payload stays NULL here and RAW peer verbatim
  -- text is NEVER persisted into the bundle, at any floor.
  insert into feedback_bundles
    (company_id, cycle_id, employee_id, review_id, roster_id, self_review_id,
     submitted_peer_count, anonymity_threshold, at_or_above_floor, below_floor,
     peer_included, self_only, peer_theme_payload)
  values
    (v_review.company_id, v_review.cycle_id, v_review.employee_id, p_review_id, v_review.roster_id, v_self,
     v_count, v_threshold, not v_below, v_below, not v_below, v_below, null)
  on conflict (cycle_id, employee_id) do nothing
  returning id into v_bundle;

  -- Close the window: un-acted requests can no longer be submitted, so a late
  -- submission cannot change the compiled floor. Submitted/declined stay as-is.
  update peer_feedback set state = 'closed'
  where review_id = p_review_id and state in ('new', 'draft');

  -- Advance the lifecycle: draft -> in-review (the edge the synthesis runner
  -- gates on). If already in-review, this is a no-op.
  update reviews set status = 'in-review' where id = p_review_id and status = 'draft';

  -- Enqueue synthesis exactly once (idempotency_key = review_id UNIQUE). BOTH
  -- below- and at/above-floor reviews are synthesized; below floor PROC-04 builds
  -- from the self-review only.
  insert into synthesis_jobs (company_id, review_id, bundle_id, state, idempotency_key)
  values (v_review.company_id, p_review_id, v_bundle, 'queued', p_review_id)
  on conflict (idempotency_key) do nothing;

  perform app.append_audit(v_review.company_id, 'feedback_window_closed', null, p_review_id, '{}'::jsonb);
  perform app.append_audit(v_review.company_id, 'bundle_compiled', null, p_review_id,
    jsonb_build_object('belowFloor', v_below, 'submittedPeerCount', v_count, 'threshold', v_threshold));
  if v_below then
    perform app.append_audit(v_review.company_id, 'bundle_below_floor_flagged', null, p_review_id,
      jsonb_build_object('submittedPeerCount', v_count, 'threshold', v_threshold));
  end if;

  return case when v_below then 'below_floor' else 'compiled' end;
end
$$;

-- Privileged, audited path — service role / worker only.
grant execute on function app.close_feedback(uuid) to service_role;
