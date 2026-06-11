-- ============================================================================
-- 2026-06-11 — ADDITIVE: grant the 'peer' role on nomination approval.
--
-- approve_nominations (000700) seeds the peer_feedback REQUESTS but never grants
-- the nominee the 'peer' role. A subject-only nominee therefore could not reach
-- the peer-feedback flow (no peer nav, and the (app)/peer route guard hard-bounces
-- a caller without the peer role). This trigger closes that gap: the moment an
-- approved peer is written to roster_peers, they are granted 'peer' — encoding
-- "an approved peer is a peer for the cycle". Idempotent. The role only gates
-- access to /peer; the requests themselves remain RLS-scoped (peer_account_id)
-- per cycle. Spine 000100–000400 frozen; this adds a new function + trigger only.
-- ============================================================================
create or replace function app.grant_peer_role_on_approval() returns trigger
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
begin
  insert into account_roles (account_id, role, company_id)
  values (new.peer_account_id, 'peer', new.company_id)
  on conflict (account_id, role) do nothing;
  return new;
end
$$;
revoke all on function app.grant_peer_role_on_approval() from public, anon;

drop trigger if exists trg_grant_peer_role_on_approval on roster_peers;
create trigger trg_grant_peer_role_on_approval
  after insert on roster_peers
  for each row execute function app.grant_peer_role_on_approval();
