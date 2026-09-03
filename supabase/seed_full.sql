-- Full-coverage seed: one row visible in every tab of every module.
--
-- WHY THIS EXISTS
-- Most screens in this app are gated on a specific record state — QA's
-- "Inspected Today" needs units decided today, Floor Manager's "Ready" needs
-- every sheet at `ready`, Accountant's Receivables needs an invoiceable order.
-- With sparse data almost everything renders empty, and an empty screen that is
-- working correctly looks exactly like a broken one. This file removes that
-- ambiguity.
--
-- FACTORY B IS DELIBERATELY ABSENT
-- The second tenant was removed from this project, so nothing here writes to
-- any factory but Al-Rehman. Cross-tenant isolation is still covered by
-- `supabase/tests/rls_smoke.sql`, which creates a second factory inside a
-- transaction and rolls it back — the boundary gets tested without a second
-- factory sitting in the database permanently. That script needs psql; it is
-- not exercised by a `db push`.
--
-- RELATIONSHIP TO seed.sql
-- This file owns only its own UUID ranges and never touches rows created by
-- `seed.sql` or by the app. Both can be loaded; they do not overlap.
--
-- IDEMPOTENT
-- Section 0 deletes everything this file owns, in foreign-key-safe order, then
-- the rest re-inserts, so running it twice leaves the same rows behind.
--
-- CAVEAT, observed on this project: `supabase db push --include-seed` executes
-- a seed file the first time it sees it and prints "Seeding data from ...".
-- On every later push it prints "Updating seed hash to ..." and records the new
-- hash WITHOUT running the file, even when the contents have changed. Editing
-- this file and pushing again therefore does not update a hosted database. To
-- actually re-apply it, use `supabase db reset` (local), or run the file
-- directly against the database with psql.
--
-- TRIGGERS DO REAL WORK HERE
-- Inserting an `order_sheets` row fans out one `inspection_units` row per
-- repeat (0001). Updating a unit's status to passed/returned fires
-- `on_inspection_unit_decided` (0006), which advances `orders.stage` to
-- 'coding' once nothing is pending and writes `alert_text` on a return.
-- Updating `orders.floor_status` fires `sync_stage_from_floor_status` (0007).
-- So this file drives orders through the same transitions the app does rather
-- than hand-writing end states, and the resulting rows are genuinely reachable.
--
-- `crypt`/`gen_salt` are not used here, but pgcrypto lives in `extensions` on
-- hosted Supabase and the search path is set for consistency with seed.sql.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 0. Teardown — everything this file owns, children before parents
-- ---------------------------------------------------------------------------

delete from invoice_payments where id::text like '84000000-%';
delete from po_payments       where id::text like '83000000-%';
delete from po_items          where id::text like '82000000-%';
delete from purchase_orders   where id::text like '81000000-%';
delete from audit_line_items  where id::text like '8a000000-%';
delete from audit_records     where id::text like '89000000-%';
delete from loan_history      where id::text like '87000000-%';
delete from loans             where id::text like '86000000-%';
delete from salary_records    where id::text like '88000000-%';
delete from expenses          where id::text like '85000000-%';
delete from monthly_history   where id::text like '8b000000-%';
delete from subscription_payments where id::text like '8c000000-%';

-- inspection_units and order_sheets cascade from orders, but are cleared
-- explicitly so a partially-applied previous run cannot leave orphans.
delete from inspection_units where order_id::text like 'd0000000-%';
delete from order_sheets     where order_id::text like 'd0000000-%';
delete from orders           where id::text like 'd0000000-%';

delete from stock_items        where id::text like '71000000-%';
delete from machines           where id::text like '61000000-%';
delete from bonus_slabs        where id::text like 'b1000000-%';
delete from finishing_partners where id::text like 'f1000000-%';
delete from suppliers          where id::text like '51000000-%';
delete from employees          where id::text like 'e2000000-%';
delete from clients            where id::text like 'c2000000-%';

-- ---------------------------------------------------------------------------
-- 1. Profiles
--
-- The auth users themselves must be created in the Supabase dashboard
-- (Authentication -> Add user, "Auto Confirm User" ticked). A raw INSERT into
-- `auth.users` leaves GoTrue unable to read the row on hosted Supabase — that
-- lesson is written up in `supabase/maintenance/fix_auth_users.sql`.
--
-- The UUIDs below are NOT guesses. They are the live ids of the eight accounts
-- currently in this project, read back by signing in as each one. If the auth
-- users are ever deleted and recreated the ids change; in that case run
-- `supabase/maintenance/link_profiles_by_email.sql`, which re-derives every id
-- by email and needs no manual editing.
--
--   taker.a@example.com     aaaaaaa1-0000-4000-8000-000000000001  order_taker
--   qa.a@example.com        aaaaaaa1-0000-4000-8000-000000000002  qa_person
--   floor.a@example.com     aaaaaaa1-0000-4000-8000-000000000003  floor_manager
--   store.a@example.com     aaaaaaa1-0000-4000-8000-000000000004  store_manager
--   accounts.a@example.com  aaaaaaa1-0000-4000-8000-000000000005  accountant
--   worker.a@example.com    aaaaaaa1-0000-4000-8000-000000000006  worker
--   admin.a@example.com     aaaaaaa1-0000-4000-8000-000000000007  company_admin
--   super.a@example.com     aaaaaaa1-0000-4000-8000-000000000008  platform admin
--
-- Re-asserted rather than inserted: seed.sql already creates them, and this
-- keeps role drift from a hand-edit out of the data set.
update profiles set role = 'order_taker',   full_name = 'Order Taker A'    where id = 'aaaaaaa1-0000-4000-8000-000000000001';
update profiles set role = 'qa_person',     full_name = 'QA A'             where id = 'aaaaaaa1-0000-4000-8000-000000000002';
update profiles set role = 'floor_manager', full_name = 'Floor Manager A'  where id = 'aaaaaaa1-0000-4000-8000-000000000003';
update profiles set role = 'store_manager', full_name = 'Store Manager A'  where id = 'aaaaaaa1-0000-4000-8000-000000000004';
update profiles set role = 'accountant',    full_name = 'Accountant A'     where id = 'aaaaaaa1-0000-4000-8000-000000000005';
update profiles set role = 'worker',        full_name = 'Imran Ali'        where id = 'aaaaaaa1-0000-4000-8000-000000000006';
update profiles set role = 'company_admin', full_name = 'Company Admin A'  where id = 'aaaaaaa1-0000-4000-8000-000000000007';
update profiles set is_platform_admin = true                               where id = 'aaaaaaa1-0000-4000-8000-000000000008';

-- ---------------------------------------------------------------------------
-- 2. Master data
-- ---------------------------------------------------------------------------

-- Clients: one per billing mode, plus one with no terms at all — the shape
-- Order Taker's on-the-fly creation produces before Company Admin fills it in.
-- Orders taken against that third client get a null `orders.billing`, which is
-- the correct behaviour, not a gap.
insert into clients (id, factory_id, name, phone, address, billing_type, rate, payment_cycle, status) values
  ('c2000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Noor Textiles', '03005551001', 'Gulberg III, Lahore', 'repeat', 500, 'monthly', 'active'),
  ('c2000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Shahzad Fabrics', '03005551002', 'Anarkali, Lahore', 'stitch', 15, 'weekly', 'active'),
  ('c2000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   '03211234567', '03211234567', null, null, null, null, 'active');

-- Suppliers: one per inventory type, mixed payment cycles, one inactive so the
-- Inactive section on the roster screen has something to render.
insert into suppliers (id, factory_id, name, contact, address, inventory_type, payment_cycle, status) values
  ('51000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Thread House', '03007771001', 'Shahalam Market, Lahore', 'thread', 'weekly', 'active'),
  ('51000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Tilla Traders', '03007771002', 'Rang Mahal, Lahore', 'tilla', 'biweekly', 'active'),
  ('51000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Sequin Supply Co', '03007771003', 'Azam Cloth Market, Lahore', 'sequin', 'monthly', 'active'),
  ('51000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Bobbin Depot', '03007771004', 'Badami Bagh, Lahore', 'bobbin', 'monthly', 'inactive');

-- Employees: every `employee_role` value represented.
--
-- The `salary_basis_matches_role` check (0010) allows a non-fixed basis only
-- for `machine_worker`, so every other role below is 'fixed' by necessity, not
-- by choice. Two machine workers carry the other two bases so Salary maths has
-- real variety to work against.
insert into employees (id, factory_id, name, role, salary_basis, salary_amount, contact, address, cnic, reference_name, responsibilities, join_date, status) values
  ('e2000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Nadia Perveen', 'inspection_manager', 'fixed', 55000, '03009991001', 'Township, Lahore', '35201-1000001-1', 'Rehman Sahib', null, current_date - 400, 'active'),
  ('e2000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Asif Mehmood', 'floor_manager', 'fixed', 70000, '03009991002', 'Johar Town, Lahore', '35201-1000002-2', 'Rehman Sahib', null, current_date - 380, 'active'),
  ('e2000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Kamran Butt', 'store_manager', 'fixed', 52000, '03009991003', 'Samanabad, Lahore', '35201-1000003-3', null, null, current_date - 300, 'active'),
  ('e2000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Imran Ali', 'machine_worker', 'per_day', 1800, '03009991004', 'Shahdara, Lahore', '35201-1000004-4', 'Asif Mehmood', null, current_date - 240, 'active'),
  ('e2000000-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111',
   'Zubair Hussain', 'machine_worker', 'per_stitch', 0.02, '03009991005', 'Misri Shah, Lahore', '35201-1000005-5', 'Asif Mehmood', null, current_date - 190, 'active'),
  ('e2000000-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111',
   'Bilal Ahmed', 'machine_worker', 'fixed', 38000, '03009991006', 'Ravi Road, Lahore', '35201-1000006-6', null, null, current_date - 150, 'active'),
  ('e2000000-0000-4000-8000-000000000007', '11111111-1111-1111-1111-111111111111',
   'Sadia Iqbal', 'accountant', 'fixed', 60000, '03009991007', 'Model Town, Lahore', '35201-1000007-7', null, null, current_date - 120, 'active'),
  ('e2000000-0000-4000-8000-000000000008', '11111111-1111-1111-1111-111111111111',
   'Rehman Sahib', 'admin', 'fixed', 90000, '03009991008', 'DHA Phase 5, Lahore', '35201-1000008-8', null, null, current_date - 700, 'active'),
  -- The only role for which `responsibilities` means anything.
  ('e2000000-0000-4000-8000-000000000009', '11111111-1111-1111-1111-111111111111',
   'Faisal Riaz', 'delivery', 'fixed', 34000, '03009991009', 'Bund Road, Lahore', '35201-1000009-9', 'Kamran Butt',
   array['order_delivery', 'order_returns', 'finishing_partner_sheets']::responsibility[], current_date - 95, 'active'),
  -- One inactive, so the roster's Inactive section renders.
  ('e2000000-0000-4000-8000-000000000010', '11111111-1111-1111-1111-111111111111',
   'Tariq Javed', 'machine_worker', 'fixed', 36000, '03009991010', 'Chah Miran, Lahore', '35201-1000010-0', null, null, current_date - 500, 'inactive');

-- Finishing partners: one per stage. `rate_basis` has a single value today and
-- the edit screen renders it read-only, so every row carries 'per_repeat'.
insert into finishing_partners (id, factory_id, name, stage_type, rate_basis, rate, contact, address, cnic, status) values
  ('f1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Yasin Clipping Works', 'clipping', 'per_repeat', 18, '03004441001', 'Misri Shah, Lahore', '35202-2000001-1', 'active'),
  ('f1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Piko Masters', 'piko', 'per_repeat', 25, '03004441002', 'Shad Bagh, Lahore', '35202-2000002-2', 'active'),
  ('f1000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Al-Noor Press House', 'press', 'per_repeat', 12, '03004441003', 'Bilal Ganj, Lahore', '35202-2000003-3', 'inactive');

-- Bonus slabs, deliberately inserted out of order. The screen is specified to
-- sort ascending by threshold; inserting 15000 first is what proves it does
-- rather than just echoing insertion order.
insert into bonus_slabs (id, factory_id, threshold, bonus_amount) values
  ('b1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 15000, 2000),
  ('b1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 5000, 500),
  ('b1000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 10000, 1200);

-- Machines: two idle (one with a previous job, one that has never run) and two
-- running with a live job, so every branch of the machine card renders.
insert into machines (id, factory_id, label, status, current_job, last_job) values
  ('61000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Machine 1', 'idle', null,
   '{"order_id":"d0000000-0000-4000-8000-000000000010","code":"ALR-1010","client":"Noor Textiles","needles":[{"color_id":"red","needle":1,"stitches":4200}]}'::jsonb),
  ('61000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Machine 2', 'idle', null, null),
  ('61000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Machine 3', 'running',
   '{"order_id":"d0000000-0000-4000-8000-000000000009","code":"ALR-1009","client":"Shahzad Fabrics","design_code":"DSN-1009","needles":[{"color_id":"royal","needle":1,"stitches":5100},{"color_id":"yellow","needle":2,"stitches":3300}]}'::jsonb,
   null),
  ('61000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Machine 4', 'running',
   '{"order_id":"d0000000-0000-4000-8000-000000000008","code":"ALR-1008","client":"Noor Textiles","design_code":"DSN-1008","needles":[{"color_id":"green","needle":1,"stitches":2800}]}'::jsonb,
   '{"order_id":"d0000000-0000-4000-8000-000000000011","code":"ALR-1011","client":"Noor Textiles","needles":[{"color_id":"black","needle":1,"stitches":3900}]}'::jsonb);

-- Stock: three rows per type, one of each below its threshold so the Low Stock
-- pill renders in every sub-tab. `isLowStock` reads `roll_count` for sequin and
-- `quantity_grams` for everything else, so the thresholds differ accordingly.
-- The sequin rows carry size and cut because their label is compound
-- ("Silver · 3mm · Cup").
insert into stock_items (id, factory_id, type, code, label, color_id, custom_hex, quantity_grams, size_mm, cut_type, roll_count, low_stock_threshold) values
  ('71000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'thread', '101', 'Red Thread',    'red',    null, 4200, null, null, null, 1000),
  ('71000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'thread', '102', 'Royal Thread',  'royal',  null, 2600, null, null, null, 1000),
  ('71000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'thread', '103', 'Black Thread',  'black',  null,  350, null, null, null, 1000),
  ('71000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'tilla',  '201', 'Gold Tilla',    'yellow', null, 1800, null, null, null,  600),
  ('71000000-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111', 'tilla',  '202', 'Silver Tilla',  'grey',   null,  920, null, null, null,  600),
  ('71000000-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111', 'tilla',  '203', 'Copper Tilla',  'orange', null,  240, null, null, null,  600),
  ('71000000-0000-4000-8000-000000000007', '11111111-1111-1111-1111-111111111111', 'sequin', '301', 'Silver Sequin', 'grey',   null, null,    3, 'Cup',   40, 10),
  ('71000000-0000-4000-8000-000000000008', '11111111-1111-1111-1111-111111111111', 'sequin', '302', 'Gold Sequin',   'yellow', null, null,    4, 'Flat',  22, 10),
  ('71000000-0000-4000-8000-000000000009', '11111111-1111-1111-1111-111111111111', 'sequin', '303', 'Pink Sequin',   'pink',   null, null,    3, 'Cut',    4, 10),
  ('71000000-0000-4000-8000-000000000010', '11111111-1111-1111-1111-111111111111', 'bobbin', '401', 'White Bobbin',  'white',  null, 3100, null, null, null,  800),
  ('71000000-0000-4000-8000-000000000011', '11111111-1111-1111-1111-111111111111', 'bobbin', '402', 'Black Bobbin',  'black',  null, 1450, null, null, null,  800),
  ('71000000-0000-4000-8000-000000000012', '11111111-1111-1111-1111-111111111111', 'bobbin', '403', 'Custom Bobbin', 'custom', '#7A5C3E', 610, null, null, null, 800);

-- ---------------------------------------------------------------------------
-- 3. Orders — one per lifecycle state
--
-- Codes ALR-1001..ALR-1012 sit far above the app's own sequence (which counts
-- existing orders and pads to four digits), so live order-taking will not
-- collide with them for a very long time.
-- ---------------------------------------------------------------------------

-- 1. Draft. Deliberately has NO sheets: the wizard was abandoned before the
-- sheet step. That also keeps it out of QA's queue, which lists any order that
-- has units regardless of stage — a draft with sheets would wrongly appear
-- there.
insert into orders (id, factory_id, code, client_id, status, stage, proof_photo_url, created_by, created_at) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'ALR-1001',
   'c2000000-0000-4000-8000-000000000001', 'draft', null, 'seed/placeholder.jpg',
   'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '9 days');

-- 2-12. Submitted orders. Sheets are inserted after, which fans out the units.
insert into orders (id, factory_id, code, client_id, status, stage, proof_photo_url, design_sheet_photo_url, created_by, created_at) values
  ('d0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'ALR-1002', 'c2000000-0000-4000-8000-000000000002', 'in_progress', 'inspection', 'seed/placeholder.jpg', null,                    'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '8 days'),
  ('d0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'ALR-1003', 'c2000000-0000-4000-8000-000000000003', 'in_progress', 'inspection', 'seed/placeholder.jpg', null,                    'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '7 days'),
  ('d0000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'ALR-1004', 'c2000000-0000-4000-8000-000000000001', 'in_progress', 'inspection', 'seed/placeholder.jpg', 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111', 'ALR-1005', 'c2000000-0000-4000-8000-000000000002', 'in_progress', 'inspection', 'seed/placeholder.jpg', null,                    'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111', 'ALR-1006', 'c2000000-0000-4000-8000-000000000001', 'in_progress', 'inspection', 'seed/placeholder.jpg', 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '5 days'),
  ('d0000000-0000-4000-8000-000000000007', '11111111-1111-1111-1111-111111111111', 'ALR-1007', 'c2000000-0000-4000-8000-000000000001', 'in_progress', 'inspection', 'seed/placeholder.jpg', null,                    'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '5 days'),
  ('d0000000-0000-4000-8000-000000000008', '11111111-1111-1111-1111-111111111111', 'ALR-1008', 'c2000000-0000-4000-8000-000000000001', 'in_progress', 'inspection', 'seed/placeholder.jpg', null,                    'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '4 days'),
  ('d0000000-0000-4000-8000-000000000009', '11111111-1111-1111-1111-111111111111', 'ALR-1009', 'c2000000-0000-4000-8000-000000000002', 'in_progress', 'inspection', 'seed/placeholder.jpg', null,                    'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-000000000010', '11111111-1111-1111-1111-111111111111', 'ALR-1010', 'c2000000-0000-4000-8000-000000000001', 'in_progress', 'inspection', 'seed/placeholder.jpg', null,                    'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-000000000011', '11111111-1111-1111-1111-111111111111', 'ALR-1011', 'c2000000-0000-4000-8000-000000000001', 'in_progress', 'inspection', 'seed/placeholder.jpg', null,                    'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '2 days'),
  -- Sits in machineAssigning so the Assign Machines tab is not empty. Order 8
  -- alone cannot cover both that tab and productionAwaiting at once.
  ('d0000000-0000-4000-8000-000000000012', '11111111-1111-1111-1111-111111111111', 'ALR-1012', 'c2000000-0000-4000-8000-000000000002', 'in_progress', 'inspection', 'seed/placeholder.jpg', null,                    'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '4 days');

-- Sheets. Each insert fans out `repeats` pending inspection units.
insert into order_sheets (id, order_id, color_id, custom_hex, repeats) values
  ('d1000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000002', 'red',    null, 3),
  ('d1000000-0000-4000-8000-000000000202', 'd0000000-0000-4000-8000-000000000002', 'royal',  null, 2),
  ('d1000000-0000-4000-8000-000000000301', 'd0000000-0000-4000-8000-000000000003', 'green',  null, 4),
  ('d1000000-0000-4000-8000-000000000401', 'd0000000-0000-4000-8000-000000000004', 'yellow', null, 3),
  ('d1000000-0000-4000-8000-000000000501', 'd0000000-0000-4000-8000-000000000005', 'black',  null, 2),
  ('d1000000-0000-4000-8000-000000000502', 'd0000000-0000-4000-8000-000000000005', 'white',  null, 2),
  ('d1000000-0000-4000-8000-000000000601', 'd0000000-0000-4000-8000-000000000006', 'red',    null, 3),
  ('d1000000-0000-4000-8000-000000000701', 'd0000000-0000-4000-8000-000000000007', 'orange', null, 3),
  ('d1000000-0000-4000-8000-000000000801', 'd0000000-0000-4000-8000-000000000008', 'green',  null, 2),
  ('d1000000-0000-4000-8000-000000000901', 'd0000000-0000-4000-8000-000000000009', 'royal',  null, 2),
  ('d1000000-0000-4000-8000-000000000902', 'd0000000-0000-4000-8000-000000000009', 'yellow', null, 2),
  ('d1000000-0000-4000-8000-000000000903', 'd0000000-0000-4000-8000-000000000009', 'purple', null, 1),
  ('d1000000-0000-4000-8000-000000000904', 'd0000000-0000-4000-8000-000000000009', 'pink',   null, 1),
  ('d1000000-0000-4000-8000-000000001001', 'd0000000-0000-4000-8000-000000000010', 'red',    null, 3),
  ('d1000000-0000-4000-8000-000000001002', 'd0000000-0000-4000-8000-000000000010', 'black',  null, 2),
  ('d1000000-0000-4000-8000-000000001101', 'd0000000-0000-4000-8000-000000000011', 'black',  null, 4),
  ('d1000000-0000-4000-8000-000000001201', 'd0000000-0000-4000-8000-000000000012', 'grey',   null, 3);

-- --- Inspection outcomes ---------------------------------------------------
--
-- Written as UPDATEs so `on_inspection_unit_decided` actually fires: it is what
-- moves `stage` to 'coding' once nothing is pending, and what composes
-- `alert_text` on a return. Hand-writing those columns would produce rows the
-- app could never have created.

-- Order 2 stays wholly pending — QA's queue, nothing inspected.

-- Order 3: two of four passed, two still pending. Partial progress, stays in
-- the pending section, and Inspect resumes mid-flow.
update inspection_units
set status = 'passed', passed_code = 'ALR-1003-R' || repeat_index_in_sheet,
    inspected_by = 'aaaaaaa1-0000-4000-8000-000000000002', inspected_at = now() - interval '2 hours'
where order_id = 'd0000000-0000-4000-8000-000000000003' and repeat_index_in_sheet <= 2;

-- Order 4: one returned, the rest passed. Completing the order fires the
-- trigger, which sets stage='coding' and writes the alert the Order Taker sees.
-- `inspected_at` is now() so it lands in QA's "Inspected Today".
update inspection_units
set status = 'passed', passed_code = 'ALR-1004-R' || repeat_index_in_sheet,
    inspected_by = 'aaaaaaa1-0000-4000-8000-000000000002', inspected_at = now()
where order_id = 'd0000000-0000-4000-8000-000000000004' and repeat_index_in_sheet <= 2;

update inspection_units
set status = 'returned', defect_type = 'thread', defect_scope = 'repeat',
    defect_photo_url = 'seed/placeholder.jpg',
    inspected_by = 'aaaaaaa1-0000-4000-8000-000000000002', inspected_at = now()
where order_id = 'd0000000-0000-4000-8000-000000000004' and repeat_index_in_sheet = 3;

-- Orders 5-12: every unit passed, so each reaches stage='coding'.
update inspection_units
set status = 'passed', passed_code = 'SEED-R' || repeat_index_in_sheet,
    inspected_by = 'aaaaaaa1-0000-4000-8000-000000000002', inspected_at = now() - interval '1 day'
where order_id in (
  'd0000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000006',
  'd0000000-0000-4000-8000-000000000007','d0000000-0000-4000-8000-000000000008',
  'd0000000-0000-4000-8000-000000000009','d0000000-0000-4000-8000-000000000010',
  'd0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000012'
);

-- --- Job cards and floor progress ------------------------------------------
--
-- Order 5 is left alone: stage='coding' with a null floor_status is exactly the
-- Job Cards tab filter, so it is the order waiting for a job card.

-- Orders 6-12 have a job card. `billing` is copied from each client's terms,
-- matching what `submit_order` now does at intake (0010). ALR-1003's client has
-- no terms, which is why that order is not in this list.
update orders set
  design_code = 'DSN-' || right(code, 4),
  job_card_code = 'JC-' || right(code, 4),
  threads = '[{"color_id":"red","stitches":4200}]'::jsonb,
  needles = '[{"color_id":"red","needle":1,"stitches":4200}]'::jsonb,
  materials = '[{"color_id":"red","qty_grams":180}]'::jsonb,
  stages = '{"clipping":true,"piko":true,"press":false}'::jsonb,
  damaged_repeats_price = 0,
  billing = client_billing(client_id)
where id in (
  'd0000000-0000-4000-8000-000000000006','d0000000-0000-4000-8000-000000000007',
  'd0000000-0000-4000-8000-000000000008','d0000000-0000-4000-8000-000000000009',
  'd0000000-0000-4000-8000-000000000010','d0000000-0000-4000-8000-000000000011',
  'd0000000-0000-4000-8000-000000000012'
);

-- Each of these fires `sync_stage_from_floor_status`. materialRequested,
-- readyToCollect and machineAssigning keep stage='coding' by design; the two
-- production statuses move it to 'production'.
update orders set floor_status = 'materialRequested'  where id = 'd0000000-0000-4000-8000-000000000006';

update orders set floor_status = 'readyToCollect',
                  issued_by = 'aaaaaaa1-0000-4000-8000-000000000004',
                  issued_date = now() - interval '2 days'
where id = 'd0000000-0000-4000-8000-000000000007';

update orders set floor_status = 'machineAssigning'   where id = 'd0000000-0000-4000-8000-000000000012';
update orders set floor_status = 'productionAwaiting' where id = 'd0000000-0000-4000-8000-000000000008';
update orders set floor_status = 'inProduction'       where id in (
  'd0000000-0000-4000-8000-000000000009','d0000000-0000-4000-8000-000000000010',
  'd0000000-0000-4000-8000-000000000011');

-- --- Per-sheet production stages -------------------------------------------
--
-- Order 9 carries one sheet at each of the four non-final stages, so Production
-- Detail shows every action button variant at once. Orders 10 and 11 are wholly
-- 'ready', which is what makes them invoiceable and puts them on the Ready tab.
update order_sheets set stage = 'producing',     stage_index = 0, stage_records = '[]'::jsonb                                                              where id = 'd1000000-0000-4000-8000-000000000901';
update order_sheets set stage = 'readyForStage', stage_index = 0, stage_records = '[]'::jsonb                                                              where id = 'd1000000-0000-4000-8000-000000000902';
update order_sheets set stage = 'stageFormDone', stage_index = 1, stage_records = '[{"key":"clipping","delivery_person":"Faisal Riaz","worker_name":"Yasin Clipping Works"}]'::jsonb where id = 'd1000000-0000-4000-8000-000000000903';
update order_sheets set stage = 'readyForFinal', stage_index = 2, stage_records = '[{"key":"clipping","delivery_person":"Faisal Riaz","worker_name":"Yasin Clipping Works"},{"key":"piko","delivery_person":"Faisal Riaz","worker_name":"Piko Masters"}]'::jsonb where id = 'd1000000-0000-4000-8000-000000000904';

update order_sheets set stage = 'ready', stage_index = 2,
  stage_records = '[{"key":"clipping","delivery_person":"Faisal Riaz","worker_name":"Yasin Clipping Works"},{"key":"piko","delivery_person":"Faisal Riaz","worker_name":"Piko Masters"}]'::jsonb
where order_id in ('d0000000-0000-4000-8000-000000000010','d0000000-0000-4000-8000-000000000011');

-- Sheets on the earlier floor states are 'producing' so nothing reads as ready
-- before it has run.
update order_sheets set stage = 'producing', stage_index = 0
where order_id in (
  'd0000000-0000-4000-8000-000000000006','d0000000-0000-4000-8000-000000000007',
  'd0000000-0000-4000-8000-000000000008','d0000000-0000-4000-8000-000000000012'
);

-- 13. Delivered and closed. The only order at status='completed' and
-- stage='delivery', so Order Taker's Completed filter and the far end of the
-- lifecycle timeline both have something to show. `floor_status` is null
-- because the floor is done with it — that also keeps it off Floor Manager's
-- Ready tab, which is for work still on the floor.
insert into orders (id, factory_id, code, client_id, status, stage, proof_photo_url, created_by, created_at) values
  ('d0000000-0000-4000-8000-000000000013', '11111111-1111-1111-1111-111111111111', 'ALR-1013',
   'c2000000-0000-4000-8000-000000000001', 'in_progress', 'inspection', 'seed/placeholder.jpg',
   'aaaaaaa1-0000-4000-8000-000000000001', now() - interval '20 days');

insert into order_sheets (id, order_id, color_id, custom_hex, repeats) values
  ('d1000000-0000-4000-8000-000000001301', 'd0000000-0000-4000-8000-000000000013', 'purple', null, 2);

update inspection_units
set status = 'passed', passed_code = 'ALR-1013-R' || repeat_index_in_sheet,
    inspected_by = 'aaaaaaa1-0000-4000-8000-000000000002', inspected_at = now() - interval '18 days'
where order_id = 'd0000000-0000-4000-8000-000000000013';

update order_sheets set stage = 'ready', stage_index = 2,
  stage_records = '[{"key":"clipping","delivery_person":"Faisal Riaz","worker_name":"Yasin Clipping Works"},{"key":"piko","delivery_person":"Faisal Riaz","worker_name":"Piko Masters"}]'::jsonb
where order_id = 'd0000000-0000-4000-8000-000000000013';

-- Set last: `stage` is written directly here rather than through a
-- `floor_status` change, because no built screen performs the delivery
-- transition and `sync_stage_from_floor_status` has no mapping for it.
update orders set
  design_code = 'DSN-1013', job_card_code = 'JC-1013',
  threads = '[{"color_id":"purple","stitches":3600}]'::jsonb,
  needles = '[{"color_id":"purple","needle":1,"stitches":3600}]'::jsonb,
  materials = '[{"color_id":"purple","qty_grams":150}]'::jsonb,
  stages = '{"clipping":true,"piko":true,"press":false}'::jsonb,
  damaged_repeats_price = 0,
  billing = client_billing(client_id),
  status = 'completed', stage = 'delivery'
where id = 'd0000000-0000-4000-8000-000000000013';

-- ---------------------------------------------------------------------------
-- 4. Financial records
-- ---------------------------------------------------------------------------

-- Invoice payments. Order 10 is part paid (Receivables "Partially Paid"),
-- order 11 is settled in full ("Paid").
--
-- Both clients bill per repeat at 500: order 10 has 5 repeats (2500) and order
-- 11 has 4 (2000). The amounts below are chosen against those totals, so the
-- remaining balance the app computes is real rather than coincidental.
insert into invoice_payments (id, order_id, amount, photo_url, recorded_by, paid_at) values
  ('84000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000010', 1000, 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '2 days'),
  ('84000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000011', 1200, 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '2 days'),
  ('84000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000011',  800, 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '1 day'),
  ('84000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000013', 1000, 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '15 days');

-- Purchase orders: every `po_status` value present. Only 'confirmed' should
-- reach Accountant's Payables — with all four statuses in the data, that filter
-- is actually being tested rather than assumed.
insert into purchase_orders (id, factory_id, po_number, status, source, supplier_name, date) values
  ('81000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'PO-1001', 'awaitingProcurement',  'system_generated', null,                now() - interval '10 days'),
  ('81000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'PO-1002', 'awaitingConfirmation', 'manual',           'Thread House',      now() - interval '9 days'),
  ('81000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'PO-1003', 'confirmed',            'manual',           'Tilla Traders',     now() - interval '8 days'),
  ('81000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'PO-1004', 'confirmed',            'manual',           'Sequin Supply Co',  now() - interval '7 days'),
  ('81000000-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111', 'PO-1005', 'received',             'manual',           'Bobbin Depot',      now() - interval '6 days');

insert into po_items (id, purchase_order_id, stock_item_id, qty, price) values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000003', 2000, 4000),
  ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 1500, 3000),
  ('82000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000006', 1200, 6000),
  ('82000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000009',   30, 4500),
  ('82000000-0000-4000-8000-000000000005', '81000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000010',  900, 1800);

-- PO-1003 part paid (6000 billed, 2500 paid); PO-1004 settled in full.
insert into po_payments (id, purchase_order_id, amount, photo_url, recorded_by, paid_at) values
  ('83000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', 2500, 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '3 days'),
  ('83000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000004', 4500, 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '2 days');

-- Expenses: one per `approval_status`, plus an 'other' category (which the
-- `other_name_required` check forces to carry a name) and a recurring one.
insert into expenses (id, factory_id, category, other_name, amount, description, recurring_type, photo_url, status, reject_reason, submitted_by, submitted_at, reviewed_by, reviewed_at, approved_at) values
  ('85000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'electric', null, 22000, 'Grid bill, current month', 'monthly', 'seed/placeholder.jpg', 'approved', null, 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '12 days', 'aaaaaaa1-0000-4000-8000-000000000007', now() - interval '11 days', now() - interval '11 days'),
  ('85000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'machine_repair', null, 8500, 'Head replacement on Machine 3', 'none', 'seed/placeholder.jpg', 'pending', null, 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '2 days', null, null, null),
  ('85000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'other', 'Generator diesel', 6400, 'Two drums', 'weekly', 'seed/placeholder.jpg', 'rejected', 'insufficient_proof', 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '5 days', 'aaaaaaa1-0000-4000-8000-000000000007', now() - interval '4 days', null),
  ('85000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'food', null, 3200, 'Staff lunch, Friday', 'weekly', 'seed/placeholder.jpg', 'approved', null, 'aaaaaaa1-0000-4000-8000-000000000005', now() - interval '3 days', 'aaaaaaa1-0000-4000-8000-000000000007', now() - interval '2 days', now() - interval '2 days');

-- Loans: one per `approval_status`. No screen anywhere creates these yet — that
-- gap is flagged in Prompt 9 §E1 — so SQL is the only way in, which is expected
-- for seed data. `worker_id` references `profiles`, not `employees`: those two
-- tables are deliberately unlinked (Prompt 9 §C6), so payroll keys off the
-- signed-in-user table.
insert into loans (id, factory_id, worker_id, principal, installment, status, reject_reason, recorded_by, recorded_at, reviewed_by, reviewed_at) values
  ('86000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-0000-4000-8000-000000000006', 24000, 3000, 'approved', null, 'aaaaaaa1-0000-4000-8000-000000000003', now() - interval '60 days', 'aaaaaaa1-0000-4000-8000-000000000007', now() - interval '58 days'),
  ('86000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-0000-4000-8000-000000000006',  9000, 1500, 'pending',  null, 'aaaaaaa1-0000-4000-8000-000000000003', now() - interval '4 days', null, null),
  ('86000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-0000-4000-8000-000000000003', 15000, 2500, 'rejected', 'amount_not_justified', 'aaaaaaa1-0000-4000-8000-000000000003', now() - interval '20 days', 'aaaaaaa1-0000-4000-8000-000000000007', now() - interval '18 days');

-- Two instalments already repaid, so the approved loan has a live balance of
-- 18000 and Salary Detail's deduction has something real to reconcile against.
insert into loan_history (id, loan_id, period, amount, paid_at) values
  ('87000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', to_char(now() - interval '2 months', 'YYYY-MM'), 3000, now() - interval '60 days'),
  ('87000000-0000-4000-8000-000000000002', '86000000-0000-4000-8000-000000000001', to_char(now() - interval '1 month',  'YYYY-MM'), 3000, now() - interval '30 days');

-- Salary: two people, two periods, paid and unpaid in each. Imran Ali carries
-- the approved loan above, so his unpaid record is the one that exercises the
-- instalment deduction.
insert into salary_records (id, factory_id, person_id, period, base_pay, bonus, damage_deduction, damage_stage, leave_deduction, leave_approved_by, paid, paid_at, paid_photo_url, paid_by) values
  ('88000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-0000-4000-8000-000000000006', to_char(now() - interval '1 month', 'YYYY-MM'), 45000, 2000,  500, 'Clipping', 1000, 'aaaaaaa1-0000-4000-8000-000000000003', true,  now() - interval '28 days', 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000005'),
  ('88000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-0000-4000-8000-000000000006', to_char(now(), 'YYYY-MM'),                       45000, 2500,    0, null,        0, null,                                   false, null, null, null),
  ('88000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-0000-4000-8000-000000000003', to_char(now() - interval '1 month', 'YYYY-MM'), 70000,    0,    0, null,     2000, 'aaaaaaa1-0000-4000-8000-000000000007', true,  now() - interval '28 days', 'seed/placeholder.jpg', 'aaaaaaa1-0000-4000-8000-000000000005'),
  ('88000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-0000-4000-8000-000000000003', to_char(now(), 'YYYY-MM'),                       70000, 1000,    0, null,        0, null,                                   false, null, null, null);

-- Audit with a real variance, so the "Items With Variance" card renders in both
-- Store Manager's Audit tab and Company Admin's Leakage report. `variance` is a
-- generated column — actual minus expected — so it is never written directly.
insert into audit_records (id, factory_id, date, items_checked, items_matched, variance_count) values
  ('89000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', now() - interval '3 days', 4, 2, 2);

insert into audit_line_items (id, audit_record_id, stock_item_id, expected_qty, actual_qty) values
  ('8a000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 4400, 4200),  -- short 200
  ('8a000000-0000-4000-8000-000000000002', '89000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', 1750, 1800),  -- over 50
  ('8a000000-0000-4000-8000-000000000003', '89000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000007',   40,   40),
  ('8a000000-0000-4000-8000-000000000004', '89000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000010', 3100, 3100);

-- Closed months. Nothing populates this table for real — the month-close job
-- was deliberately never invented (Prompt 7) — so the Stats and P&L charts need
-- seeded history to render anything beyond the current month.
insert into monthly_history (id, factory_id, month_label, income, payables, salary, expenses_by_category) values
  ('8b000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', to_char(now() - interval '3 months', 'Mon YYYY'), 310000, 96000, 148000, '{"electric":21000,"food":8000,"maintenance":6500}'::jsonb),
  ('8b000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', to_char(now() - interval '2 months', 'Mon YYYY'), 285000, 74000, 151000, '{"electric":19500,"internet":4000,"machine_repair":12000}'::jsonb),
  ('8b000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', to_char(now() - interval '1 month',  'Mon YYYY'), 342000, 88000, 155000, '{"electric":23000,"food":9500,"marketing":15000}'::jsonb);

-- ---------------------------------------------------------------------------
-- 5. Platform level (Super Admin)
-- ---------------------------------------------------------------------------

-- One settled and one outstanding invoice, so Past Dues on the console
-- dashboard is a real figure and Factory Detail's payment list shows both
-- status pills and both left-border colours.
insert into subscription_payments (id, factory_id, amount, description, due_date, paid_date, status) values
  ('8c000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 25000, 'Subscription — last month',    current_date - 35, current_date - 33, 'paid'),
  ('8c000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 25000, 'Subscription — current month', current_date - 4,  null,              'pending');

-- Every module on for Al-Rehman: nothing should read as gated off during
-- general testing. Enforcement is not wired into any RLS policy yet — that is
-- the deliberate follow-up in Prompt 10 §7 — so these rows are currently read
-- only by the console's own toggles.
insert into factory_modules (factory_id, module_id, enabled)
select '11111111-1111-1111-1111-111111111111', id, true from modules
on conflict (factory_id, module_id) do update set enabled = true;

-- Subscription fields on the tenant itself, so the console's factory card is
-- fully populated. Existing values win — this never overwrites real edits.
update factories set
  location = coalesce(location, 'Faisalabad, Punjab'),
  responsible_person = coalesce(responsible_person, 'Rehman Sahib'),
  cnic_number = coalesce(cnic_number, '33100-1234567-1'),
  phone_number = coalesce(phone_number, '03001112222'),
  employees_count = coalesce(employees_count, 12),
  subscription_fee = coalesce(subscription_fee, 25000),
  starting_date = coalesce(starting_date, current_date - 90),
  due_date = coalesce(due_date, current_date + 275)
where id = '11111111-1111-1111-1111-111111111111';
