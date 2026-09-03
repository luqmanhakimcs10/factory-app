-- Local development seed: one factory, Al-Rehman Embroidery.
--
-- The second factory used to live here so cross-tenant leaks would show up
-- during ordinary use. It now exists only inside supabase/tests/rls_smoke.sql,
-- which creates it in a transaction and rolls back — so the isolation check
-- still runs, without a second factory or a second set of logins sitting in
-- the database.
--
-- Applied automatically by `supabase db reset`, or by
-- `supabase db push --include-seed`. Never run against production.
--
-- `crypt`/`gen_salt` come from pgcrypto, which Supabase installs into the
-- `extensions` schema rather than `public`. Without this the password hashing
-- below fails with "function gen_salt(unknown) does not exist".
set search_path = public, extensions;

insert into factories (
  id, name, location, responsible_person, cnic_number, phone_number,
  employees_count, subscription_fee, starting_date, due_date, status
) values
  ('11111111-1111-1111-1111-111111111111', 'Al-Rehman Embroidery',
   'Faisalabad, Punjab', 'Rehman Sahib', '33100-1234567-1', '03001112222',
   12, 25000, current_date - 90, current_date + 275, 'active')
on conflict (id) do update
set location = coalesce(factories.location, excluded.location),
    responsible_person = coalesce(factories.responsible_person, excluded.responsible_person),
    cnic_number = coalesce(factories.cnic_number, excluded.cnic_number),
    phone_number = coalesce(factories.phone_number, excluded.phone_number),
    employees_count = coalesce(factories.employees_count, excluded.employees_count),
    subscription_fee = coalesce(factories.subscription_fee, excluded.subscription_fee),
    starting_date = coalesce(factories.starting_date, excluded.starting_date),
    due_date = coalesce(factories.due_date, excluded.due_date);

-- The platform operator's own tenant.
--
-- `profiles.factory_id` is NOT NULL and every factory-scoped policy compares
-- against it, so a platform admin cannot simply have none. Pointing them at a
-- tenant that owns no orders, clients or stock means `auth_factory_id()`
-- resolves to an empty factory: their real reach comes from
-- `is_platform_admin`, and a factory-scoped policy can never hand them another
-- tenant's rows by accident.
insert into factories (id, name, status) values
  ('99999999-9999-4999-8999-999999999999', 'Platform Operations', 'active')
on conflict (id) do nothing;

-- Every module switched on for the live tenant, so the console's toggles start
-- from a real state rather than an empty join table.
insert into factory_modules (factory_id, module_id)
select '11111111-1111-1111-1111-111111111111', id from modules
on conflict (factory_id, module_id) do nothing;

-- One settled invoice and one outstanding, so the dashboard's Monthly Revenue
-- and Past Dues cards both have something to add up.
insert into subscription_payments (id, factory_id, amount, description, due_date, paid_date, status) values
  ('a5000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   25000, 'Subscription — opening month', current_date - 60, current_date - 58, 'paid'),
  ('a5000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   25000, 'Subscription — current month', current_date - 5, null, 'pending')
on conflict (id) do nothing;

-- Auth users. Inserting straight into auth.users is a local-only shortcut; in
-- a real environment these come from the sign-up flow.
-- Password for all three: `password123`.
--
-- The empty-string token columns are not decoration: GoTrue reads them into Go
-- `string` fields, which cannot hold NULL, and a raw insert that leaves them
-- NULL produces "Database error querying schema" on every sign-in attempt.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('aaaaaaa1-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'taker.a@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('aaaaaaa1-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa.a@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('aaaaaaa1-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'floor.a@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('aaaaaaa1-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'store.a@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('aaaaaaa1-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'accounts.a@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('aaaaaaa1-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'worker.a@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('aaaaaaa1-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin.a@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('aaaaaaa1-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'super.a@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
on conflict (id) do nothing;

-- GoTrue expects every password user to have an identity row; a raw insert into
-- auth.users does not create one.
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', now(), now(), now()
from auth.users u
where u.id in (
  'aaaaaaa1-0000-4000-8000-000000000001',
  'aaaaaaa1-0000-4000-8000-000000000002',
  'aaaaaaa1-0000-4000-8000-000000000003',
  'aaaaaaa1-0000-4000-8000-000000000004',
  'aaaaaaa1-0000-4000-8000-000000000005',
  'aaaaaaa1-0000-4000-8000-000000000006',
  'aaaaaaa1-0000-4000-8000-000000000007',
  'aaaaaaa1-0000-4000-8000-000000000008'
)
and not exists (
  select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
);

insert into profiles (id, factory_id, role, full_name) values
  ('aaaaaaa1-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'order_taker',   'Order Taker A'),
  ('aaaaaaa1-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'qa_person',     'QA A'),
  ('aaaaaaa1-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'floor_manager', 'Floor Manager A'),
  ('aaaaaaa1-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'store_manager', 'Store Manager A'),
  ('aaaaaaa1-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111', 'accountant',    'Accountant A'),
  -- A payroll subject. Workers do not sign in yet, but salary and loans key on
  -- a profile row.
  ('aaaaaaa1-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111', 'worker',        'Imran Ali'),
  ('aaaaaaa1-0000-4000-8000-000000000007', '11111111-1111-1111-1111-111111111111', 'company_admin', 'Company Admin A')
on conflict (id) do nothing;

-- The platform operator. Routing keys off `is_platform_admin`, never off this
-- role value — `super_admin` has no entry in RootNavigator's role map, so a
-- profile with the flag cleared falls through to the unavailable-role screen
-- rather than into somebody's factory.
insert into profiles (id, factory_id, role, full_name, is_platform_admin) values
  ('aaaaaaa1-0000-4000-8000-000000000008', '99999999-9999-4999-8999-999999999999',
   'super_admin', 'Platform Operator', true)
on conflict (id) do update set is_platform_admin = true;

-- Billing terms are set here so a submitted order has something to copy onto
-- `orders.billing`. A client created through Order Taker's on-the-fly flow has
-- none of these until Company Admin fills them in.
insert into clients (id, factory_id, name, phone, address, billing_type, rate, payment_cycle) values
  ('c1111111-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Bilal Fabrics', '03001234567', 'Shop 14, Azam Cloth Market, Lahore', 'repeat', 450, 'monthly')
on conflict (id) do update
set address = excluded.address,
    billing_type = coalesce(clients.billing_type, excluded.billing_type),
    rate = coalesce(clients.rate, excluded.rate),
    payment_cycle = coalesce(clients.payment_cycle, excluded.payment_cycle);

insert into orders (id, factory_id, code, client_id, status, stage, created_by) values
  ('01111111-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'ARE-0001', 'c1111111-0000-4000-8000-000000000001', 'in_progress', 'inspection',
   'aaaaaaa1-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- The fan-out trigger turns these into 3 + 2 pending inspection_units.
insert into order_sheets (id, order_id, color_id, repeats) values
  ('51111111-0000-4000-8000-000000000001', '01111111-0000-4000-8000-000000000001', 'red',   3),
  ('51111111-0000-4000-8000-000000000002', '01111111-0000-4000-8000-000000000001', 'royal', 2)
on conflict (id) do nothing;

-- Machines. There is no screen for registering machines yet, so the Floor
-- Manager module needs some to exist before it can assign anything.
insert into machines (id, factory_id, label) values
  ('91111111-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Machine 1'),
  ('91111111-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'Machine 2'),
  ('91111111-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'Machine 3')
on conflict (id) do nothing;

-- Billing rates. Nothing in the app sets these — see the Floor Manager open
-- questions — so the Invoice card needs them seeded to render at all.
-- Scoped to the seeded order, not every order with a null `billing`.
--
-- This predates Prompt 9's A5 change, when nothing populated the column and a
-- blanket default was the only way to give the invoice screens something to
-- read. `submit_order` now copies each client's own terms at intake, so a
-- factory-wide UPDATE here would overwrite real orders with a made-up rate —
-- including the ones that are legitimately null because their client has no
-- terms set yet.
update orders
set billing = '{"mode":"stitch","stitch_rate_per_1000":12,"repeat_price":450}'::jsonb
where id = '01111111-0000-4000-8000-000000000001'
  and billing is null;

-- ---------------------------------------------------------------------------
-- Store Manager: stock, purchase orders, one audit
--
-- No screen creates stock items yet, so the four Stock sub-tabs need seeded
-- rows to show anything at all.
-- ---------------------------------------------------------------------------

insert into stock_items (
  id, factory_id, type, code, label, color_id, custom_hex,
  quantity_grams, size_mm, cut_type, roll_count, piece_count, low_stock_threshold
) values
  -- Thread, keyed to the shared SWATCHES palette.
  ('d1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'thread', '101', 'Red',    'red',    null, 1200, null, null, null, null, 500),
  ('d1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'thread', '102', 'Royal',  'royal',  null,  340, null, null, null, null, 500),
  ('d1000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'thread', '103', 'Green',  'green',  null,  900, null, null, null, null, 500),
  -- Tilla, keyed to TILLA_SWATCHES rather than the embroidery palette.
  ('d2000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'tilla',  '201', 'Gold',   'gold',   null,  800, null, null, null, null, 300),
  ('d2000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'tilla',  '202', 'Silver', 'silver', null,  120, null, null, null, null, 300),
  -- Sequin: piece_count stays null until the conversion table exists.
  ('d3000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'sequin', '301', 'Red',    'red',    null, null,    3, 'Cut',  14, null, 5),
  ('d3000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'sequin', '302', 'Gold',   null, '#C9A227', null,  4, 'Cup',   2, null, 5),
  -- Bobbin: layout unconfirmed, seeded like thread.
  ('d4000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'bobbin', '401', 'White',  'white',  null, 2500, null, null, null, null, 800)
on conflict (id) do nothing;

insert into purchase_orders (id, factory_id, po_number, status, source, supplier_name, date) values
  ('e1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'PO-3320', 'awaitingProcurement',  'manual',           null,            now()),
  ('e1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'PO-3321', 'awaitingConfirmation', 'system_generated', 'Ittehad Threads', now())
on conflict (id) do nothing;

insert into po_items (id, purchase_order_id, stock_item_id, qty) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 2000),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 1000)
on conflict (id) do nothing;

insert into audit_records (id, factory_id, date, items_checked, items_matched, variance_count) values
  ('f1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', now(), 8, 7, 1)
on conflict (id) do nothing;

insert into audit_line_items (id, audit_record_id, stock_item_id, expected_qty, actual_qty) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 400, 340)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Accountant: payroll, a loan, an expense
--
-- Nothing in the app creates salary records or loans — both belong to roles
-- that are not built — so the Salary and Loans tabs need seeded rows.
-- ---------------------------------------------------------------------------

insert into salary_records (
  id, factory_id, person_id, period, base_pay, bonus,
  damage_deduction, damage_stage, leave_deduction, leave_approved_by
) values
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaa1-0000-4000-8000-000000000006', to_char(now(), 'YYYY-MM'),
   45000, 2000, 500, 'Clipping', 1000, 'aaaaaaa1-0000-4000-8000-000000000003')
on conflict (id) do nothing;

-- Approved and part repaid, so Salary Detail shows a real installment and
-- pay_salary has something to append to.
insert into loans (id, factory_id, worker_id, principal, installment, status, recorded_by) values
  ('a2000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaa1-0000-4000-8000-000000000006', 20000, 2500, 'approved',
   'aaaaaaa1-0000-4000-8000-000000000003'),
  -- Pending, so Company Admin's Approvals Inbox has a loan to decide on.
  ('a2000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaa1-0000-4000-8000-000000000006', 8000, 1000, 'pending',
   'aaaaaaa1-0000-4000-8000-000000000003')
on conflict (id) do nothing;

insert into loan_history (id, loan_id, period, amount) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', '2026-07', 2500)
on conflict (id) do nothing;

insert into expenses (
  id, factory_id, category, other_name, amount, description,
  recurring_type, photo_url, status, submitted_by
) values
  ('a4000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'electric', null, 18500, 'Monthly grid bill', 'monthly',
   'seed/placeholder.jpg', 'approved', 'aaaaaaa1-0000-4000-8000-000000000005'),
  ('a4000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'other', 'Generator diesel', 6000, null, 'none',
   'seed/placeholder.jpg', 'pending', 'aaaaaaa1-0000-4000-8000-000000000005')
on conflict (id) do nothing;

-- Purchase-order line prices, so Payables has a total to work against. Nothing
-- in the app sets these yet either.
update po_items set price = qty * 0.9 where price = 0;

-- One PO moved to 'confirmed', since only confirmed POs are payable and no
-- built screen performs that transition.
update purchase_orders
set status = 'confirmed'
where id = 'e1000000-0000-4000-8000-000000000002';
