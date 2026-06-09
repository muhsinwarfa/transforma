-- ============================================================================
-- Transforma — seed: demo tenant "Riverbend Health"
-- Structural data only (no auth.users linkage — accounts.auth_user_id stays null
-- until activation). Role WORDS come from companies.role_labels, resolved at
-- render — never hardcoded. Idempotent.
-- ============================================================================

insert into companies (id, name, slug, role_labels, default_settings)
values (
  '11111111-1111-1111-1111-111111111111',
  'Riverbend Health',
  'riverbend-health',
  '{"subject":"Team Member","peer":"Peer","approver":"Manager","admin":"People Ops"}'::jsonb,
  '{"feedbackDeadlineDays":14,"peerAnonymityThreshold":3,"maxPeerNominations":5,"ackWindowDays":7,"retentionDays":730}'::jsonb
)
on conflict (id) do nothing;

insert into cycles (id, company_id, name, opens_at, closes_at, status, settings)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'H1 2026 Review',
  '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', 'open', '{}'::jsonb
)
on conflict (id) do nothing;

-- accounts (invited; not yet activated)
insert into accounts (id, company_id, email, display_name, status) values
  ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','amina.yusuf@workmail.com','Amina Yusuf','active'),
  ('a0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','h.abdi@workmail.com','Hodan Abdi','active'),
  ('a0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','m.noor@workmail.com','Maryan Noor','active'),
  ('a0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','l.farah@workmail.com','Liban Farah','active'),
  ('a0000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','d.osman@workmail.com','Deqa Osman','active')
on conflict (id) do nothing;

-- structural roles (Amina holds all four — the fullest adaptive-shell case)
insert into account_roles (account_id, role, company_id) values
  ('a0000000-0000-0000-0000-000000000001','subject', '11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000001','peer',    '11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000001','approver','11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000001','admin',   '11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000002','subject', '11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000003','subject', '11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000004','approver','11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000004','subject', '11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000005','peer',    '11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000005','subject', '11111111-1111-1111-1111-111111111111')
on conflict (account_id, role) do nothing;

-- roster population (manager links resolved to accounts)
insert into roster_members
  (id, company_id, cycle_id, account_id, email, display_name, department, manager_account_id, structural_roles) values
  ('b0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000002','h.abdi@workmail.com','Hodan Abdi','Clinical Ops','a0000000-0000-0000-0000-000000000001', array['subject']::app_role[]),
  ('b0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000003','m.noor@workmail.com','Maryan Noor','Nursing','a0000000-0000-0000-0000-000000000004', array['subject']::app_role[]),
  ('b0000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000005','d.osman@workmail.com','Deqa Osman','Clinical Ops','a0000000-0000-0000-0000-000000000001', array['subject']::app_role[])
on conflict (id) do nothing;
