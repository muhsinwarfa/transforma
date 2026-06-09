-- ============================================================================
-- 1900 — ADDITIVE (spine 000100–000400 FROZEN; layered like every correction
-- since 000500). Gated, fully-audited admin content read.
--
-- Product decision REVERSING 1300's aggregate-only admin stance — but NARROWLY,
-- not a blanket re-open. 1300's SELECT policies stay UNTOUCHED: the admin role
-- keeps NO direct base-table read of review content. The only new path is the
-- SECURITY DEFINER function below, gated on BOTH a per-account capability AND a
-- company setting, read-only, tenant-scoped, and structurally peer-blind.
--
--   req1  a 'review-content-admin' capability DISTINCT from plain admin
--         (review_content_grants). Holding `admin` alone grants nothing.
--   req2  company setting adminContentAccessEnabled (default true, in
--         companies.default_settings). A read needs the setting ON *and* the
--         capability.
--   req4  every SUCCESSFUL content read writes an admin_content_view audit entry
--         (actor + review) through the tamper-evident chain. Non-bypassable:
--         the only read path is this function, and the append is inside it.
--   req5  tenant isolation is absolute — a review in another company is never
--         read, in any setting state.
--   req6  read-only — the sole write is the audit append; no edit/approve/
--         finalize/influence rides in.
--   req7  peer anonymity preserved STRUCTURALLY — the function reads ONLY
--         self_reviews, review_drafts (the synthesized narrative the approver
--         sees), reviews, locked_reviews, employee_responses. It NEVER queries
--         peer_feedback or feedback_bundles — no raw peer responses, no peer
--         authorship, no sub-floor peer content. 1300/1100 keep the admin's
--         *direct* peer_feedback read at 0 regardless.
-- ============================================================================

-- ── req1: the capability — a per-(company,account) grant, distinct from admin ──
create table review_content_grants (
  company_id uuid not null references companies(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  granted_by uuid references accounts(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (company_id, account_id)
);
alter table review_content_grants enable row level security;
-- admins MANAGE + SEE grants for their OWN company only (tenant-scoped both ways).
create policy review_content_grants_admin on review_content_grants for all to authenticated
  using (company_id = app.current_company_id() and app.has_role(company_id, 'admin'))
  with check (company_id = app.current_company_id() and app.has_role(company_id, 'admin'));
grant select, insert, delete on review_content_grants to authenticated;

-- ── the single gate: admin role AND capability AND setting on (default true) ──
create or replace function app.can_read_review_content(p_company uuid) returns boolean
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
  select app.has_role(p_company, 'admin')
     and exists (
       select 1 from review_content_grants g
       join accounts a on a.id = g.account_id
       where a.auth_user_id = auth.uid() and g.company_id = p_company
     )
     -- default ON: absent key / unparseable → true; explicit false → off.
     and coalesce(
       (select (default_settings ->> 'adminContentAccessEnabled')::boolean
          from companies where id = p_company),
       true);
$$;
revoke all on function app.can_read_review_content(uuid) from public, anon;
grant execute on function app.can_read_review_content(uuid) to authenticated;

-- ── req4/5/6/7: the audited, tenant-scoped, peer-blind content read ───────────
-- VOLATILE (not stable): it writes the audit entry. Self-authorizing — returns
-- NULL for any unauthorized caller (so PUBLIC execute would be safe; we still
-- least-privilege it to authenticated). Unlike the privileged fns 1500 revoked,
-- this one has INTERNAL auth and leaks nothing on the denied path.
create or replace function app.admin_read_review(p_review_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_company uuid;
  v_caller_company uuid := app.current_company_id();
  v_actor uuid := app.current_account_id();
  v_result jsonb;
begin
  select company_id into v_company from reviews where id = p_review_id;
  if v_company is null then
    return null;                                   -- unknown review
  end if;
  -- req5: never read across tenants, in any setting state. (can_read_review_content
  -- would also fail cross-tenant via has_role; this is the explicit first gate.)
  if v_caller_company is null or v_company <> v_caller_company then
    return null;
  end if;
  -- req1 + req2: needs the capability AND the setting on. A plain admin (no grant)
  -- or the setting off gets NOTHING — and NO audit entry on a denied read.
  if not app.can_read_review_content(v_company) then
    return null;
  end if;
  -- req4: every successful content read is audited (actor + review), tamper-evident.
  perform app.append_audit(v_company, 'admin_content_view', v_actor, p_review_id, '{}'::jsonb);
  -- req7: compose the de-identified review the approver sees + the subject's own
  -- input/response — NEVER peer_feedback or feedback_bundles.
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

-- ── navigation: the per-review list the admin clicks into (metadata only) ─────
-- Gated by the SAME capability+setting+tenant as the content read, so a plain
-- admin / setting-off / cross-tenant caller gets 0 rows. NOT audited per-row —
-- the per-review content read (admin_read_review) is the audited event.
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
    and r.status <> 'aborted'
    and app.can_read_review_content(r.company_id)
  order by emp.display_name;
$$;
revoke all on function app.admin_review_list() from public, anon;
grant execute on function app.admin_review_list() to authenticated;
