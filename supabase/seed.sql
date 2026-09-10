-- Deterministic synthetic development fixtures only.
-- These identities and values are reserved for local Dev/Staging validation.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'owner@otr.invalid',
    '',
    '2026-01-01 00:00:00+00',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00',
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'member@otr.invalid',
    '',
    '2026-01-01 00:00:00+00',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00',
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'guest@otr.invalid',
    '',
    '2026-01-01 00:00:00+00',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00',
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'admin@otr.invalid',
    '',
    '2026-01-01 00:00:00+00',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00',
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

insert into public.profiles (id, display_name, account_role, preferred_language)
values
  ('00000000-0000-4000-8000-000000000001', 'Synthetic Owner', 'free_user', 'en'),
  ('00000000-0000-4000-8000-000000000002', 'Synthetic Member', 'free_user', 'en'),
  ('00000000-0000-4000-8000-000000000003', 'Synthetic Guest', 'free_user', 'en'),
  ('00000000-0000-4000-8000-000000000004', 'Synthetic Admin', 'admin', 'en')
on conflict (id) do nothing;

insert into public.trips (
  id,
  name,
  destination,
  start_date,
  end_date,
  created_by
)
values (
  '10000000-0000-4000-8000-000000000001',
  'Synthetic Baseline Journey',
  'Test Destination',
  '2026-01-10',
  '2026-01-12',
  '00000000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

insert into public.trip_members (id, trip_id, user_id, role)
values (
  '11000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'member'
)
on conflict (trip_id, user_id) do nothing;

insert into public.journey_members (
  id,
  trip_id,
  user_id,
  display_name,
  role,
  status,
  linked_at
)
values
  (
    '12000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'Synthetic Member',
    'group_member',
    'linked',
    '2026-01-01 00:00:00+00'
  ),
  (
    '12000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'Synthetic Guest',
    'guest',
    'linked',
    '2026-01-01 00:00:00+00'
  )
on conflict (trip_id, user_id) do nothing;

insert into public.capture_intent_rules (
  id,
  intent_key,
  display_name,
  description,
  sort_order,
  metadata
)
values (
  '20000000-0000-4000-8000-000000000001',
  'synthetic_note',
  'Synthetic note',
  'Local-only fixture for authorization tests.',
  1,
  '{"synthetic":true}'
)
on conflict (intent_key) do nothing;

insert into public.capture_prompt_templates (
  id,
  template_key,
  display_name,
  prompt,
  metadata
)
values (
  '20000000-0000-4000-8000-000000000002',
  'synthetic_router',
  'Synthetic router',
  'Return a deterministic local test result.',
  '{"synthetic":true}'
)
on conflict (template_key) do nothing;

insert into public.capture_routing_config (id, metadata)
values ('default', '{"synthetic":true}')
on conflict (id) do nothing;

insert into public.parser_rules (
  id,
  journey_id,
  scope,
  source,
  intent,
  pattern_type,
  pattern,
  status,
  created_by
)
values (
  '20000000-0000-4000-8000-000000000003',
  null,
  'global',
  'synthetic',
  'note',
  'keyword',
  'synthetic',
  'enabled',
  '00000000-0000-4000-8000-000000000004'
)
on conflict (id) do nothing;

insert into public.itinerary_item_ratings (
  id,
  trip_id,
  item_type,
  item_id,
  user_id,
  rating
)
values (
  '20000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  'event',
  '21000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  4.5
)
on conflict (id) do nothing;

insert into public.memory_entries (
  id,
  trip_id,
  user_id,
  type,
  content,
  captured_at
)
values (
  '20000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'text',
  'Synthetic memory used only for local authorization tests.',
  '2026-01-01 00:00:00+00'
)
on conflict (id) do nothing;
