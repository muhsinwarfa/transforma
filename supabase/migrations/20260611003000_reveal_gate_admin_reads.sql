-- ============================================================================
-- 2026-06-11 — PRIVACY FIX: the sealed-record reading window opens at REVEAL.
--
-- Since 1900, admin_review_list filtered only `status <> 'aborted'`, so DRAFT and
-- in-review reviews appeared in the admin list (with Open CTAs) and admin_read_review
-- had NO status gate at all — HR could open a review before the person it is about
-- had ever seen it. RULING (Muhsin): the list AND the by-id read return ONLY reviews
-- in 'awaiting-acknowledgement' or 'locked' status. No flag-based exclusion — a
-- disputed (subject-flagged) review is locked and readable WITH the response. The
-- caller's OWN review stays excluded (decision #1 — HR read it as the subject does).
-- Additive create-or-replace; the capability+setting+tenant gates are unchanged.
-- ============================================================================

-- ── the navigation list — reveal-gated + own-excluded ──
create or replace function app.admin_review_list() returns table(
  review_id uuid,
  subject_name text,
  department text,
  status review_status,
  flagged_internal boolean
)
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
  select r.id, emp.display_name, rm.department, r.status, r.flagged_internal
  from reviews r
  join accounts emp on emp.id = r.employee_id
  left join roster_members rm on rm.cycle_id = r.cycle_id and rm.account_id = r.employee_id
  where r.company_id = app.current_company_id()
    and r.status in ('awaiting-acknowledgement', 'locked')   -- reveal-gated: never draft / in-review / flagged
    and r.employee_id <> app.current_account_id()            -- never the caller's own review
    and app.can_read_review_content(r.company_id)
  order by emp.display_name;
$$;
revoke all on function app.admin_review_list() from public, anon;
grant execute on function app.admin_review_list() to authenticated;

-- ── the by-id content read — SAME reveal gate + own-exclusion, before the audit ──
create or replace function app.admin_read_review(p_review_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_company uuid;
  v_status review_status;
  v_employee uuid;
  v_caller_company uuid := app.current_company_id();
  v_actor uuid := app.current_account_id();
  v_result jsonb;
begin
  select company_id, status, employee_id into v_company, v_status, v_employee
    from reviews where id = p_review_id;
  if v_company is null then
    return null;                                   -- unknown review
  end if;
  -- req5: never read across tenants, in any setting state.
  if v_caller_company is null or v_company <> v_caller_company then
    return null;
  end if;
  -- reveal gate: never before the subject can see it; never the caller's own review.
  -- (No audit entry is written on any denied path.)
  if v_status not in ('awaiting-acknowledgement', 'locked') then
    return null;
  end if;
  if v_employee = v_actor then
    return null;
  end if;
  -- req1 + req2: needs the capability AND the setting on.
  if not app.can_read_review_content(v_company) then
    return null;
  end if;
  -- req4: every successful content read is audited (actor + review), tamper-evident.
  perform app.append_audit(v_company, 'admin_content_view', v_actor, p_review_id, '{}'::jsonb);
  -- req7: the de-identified review the approver sees + the subject's own input/response —
  -- NEVER peer_feedback or feedback_bundles.
  select jsonb_build_object(
    'reviewId',        r.id,
    'status',          r.status,
    'rating',          r.rating,
    'flaggedInternal', r.flagged_internal,
    'flagReason',      r.flag_reason,
    'revealedAt',      r.revealed_at,
    'lockedAt',        r.locked_at,
    'narrative',       (select d.sections from review_drafts d where d.review_id = r.id),
    'selfReview',      (select s.sections from self_reviews s where s.review_id = r.id),
    'locked',          (select jsonb_build_object(
                          'narrative',  lr.narrative,
                          'rating',     lr.rating,
                          'lockReason', lr.lock_reason,
                          'lockedAt',   lr.locked_at)
                        from locked_reviews lr where lr.review_id = r.id),
    'response',        (select jsonb_build_object('outcome', er.outcome, 'body', er.body)
                        from employee_responses er where er.review_id = r.id)
  )
  into v_result
  from reviews r where r.id = p_review_id;
  return v_result;
end
$$;
revoke all on function app.admin_read_review(uuid) from public, anon;
grant execute on function app.admin_read_review(uuid) to authenticated;
