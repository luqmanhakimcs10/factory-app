-- Company Admin — Part A: schema migration and retrofits.
--
-- This migration is the whole of Part A. It does three things, in order:
--
--   1. Replaces the `approved boolean` on expenses and loans with a three-state
--      `approval_status`, because "not approved yet" and "refused, for this
--      reason" are different facts and a boolean cannot hold both.
--   2. Extends `clients` in place with the business terms Company Admin owns,
--      and adds the four master-data tables (employees, finishing_partners,
--      suppliers, bonus_slabs) that until now lived as hardcoded arrays.
--   3. Teaches `submit_order` to copy the client's billing terms onto the order.
--
-- Written to be re-runnable: every step checks for its own prior application.

-- ---------------------------------------------------------------------------
-- A1. Expense / loan approval: boolean -> three-state enum
-- ---------------------------------------------------------------------------

do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type reject_reason as enum (
    'insufficient_proof', 'amount_not_justified', 'not_company_policy', 'duplicate_or_error'
  );
exception when duplicate_object then null;
end $$;

alter table expenses add column if not exists status approval_status not null default 'pending';
alter table expenses add column if not exists reject_reason reject_reason;
alter table expenses add column if not exists reviewed_by uuid references profiles(id);
alter table expenses add column if not exists reviewed_at timestamptz;

alter table loans add column if not exists status approval_status not null default 'pending';
alter table loans add column if not exists reject_reason reject_reason;
alter table loans add column if not exists reviewed_by uuid references profiles(id);
alter table loans add column if not exists reviewed_at timestamptz;

-- Backfill from the boolean, then drop it. Guarded so a re-run does not wipe
-- decisions made through the RPCs after the first run.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'approved'
  ) then
    update expenses
    set status = (case when approved then 'approved' else 'pending' end)::approval_status,
        -- `approved_at` predates this migration and stays: dropping it would
        -- break nothing today but loses history for no gain. `reviewed_at` is
        -- the column the new flow writes, so seed it from what we already know.
        reviewed_at = coalesce(reviewed_at, approved_at);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'loans' and column_name = 'approved'
  ) then
    update loans
    set status = (case when approved then 'approved' else 'pending' end)::approval_status;
  end if;
end $$;

-- The insert policy from 0009 reads `approved`, so it has to go before the
-- column can be dropped. Recreated against `status` immediately below.
drop policy if exists expenses_insert_accountant on expenses;

drop index if exists expenses_factory_id_approved_idx;

alter table expenses drop column if exists approved;
alter table loans drop column if exists approved;

create index if not exists expenses_factory_id_status_idx on expenses (factory_id, status);
create index if not exists loans_factory_id_status_idx on loans (factory_id, status);

create policy expenses_insert_accountant on expenses
  for insert to authenticated
  with check (
    factory_id = auth_factory_id()
    and auth_user_role() = 'accountant'
    -- Raised pending, always. Approval is company_admin's write, and it only
    -- happens through the RPCs further down this file.
    and status = 'pending'
    and submitted_by = auth.uid()
  );

-- `pay_salary` picked this period's installment off an "approved" loan. Same
-- rule, new spelling.
create or replace function pay_salary(
  p_salary_record_id uuid,
  p_photo_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
  v_loan_id uuid;
  v_installment numeric;
  v_balance numeric;
  v_period text;
begin
  if auth_user_role() <> 'accountant' then
    raise exception 'Only an accountant can pay a salary';
  end if;

  select person_id, period into v_person, v_period
  from salary_records
  where id = p_salary_record_id and factory_id = auth_factory_id();

  if v_person is null then
    raise exception 'No such salary record in this factory';
  end if;

  update salary_records
  set paid = true,
      paid_at = now(),
      paid_by = auth.uid(),
      paid_photo_url = p_photo_url
  where id = p_salary_record_id;

  -- One approved loan with a balance left, if any: take this period's
  -- installment, capped at whatever is still owed.
  select l.id,
         l.installment,
         l.principal - coalesce((select sum(h.amount) from loan_history h where h.loan_id = l.id), 0)
  into v_loan_id, v_installment, v_balance
  from loans l
  where l.worker_id = v_person
    and l.factory_id = auth_factory_id()
    and l.status = 'approved'
    and l.principal - coalesce((select sum(h.amount) from loan_history h where h.loan_id = l.id), 0) > 0
  order by l.recorded_at
  limit 1;

  if v_loan_id is not null then
    insert into loan_history (loan_id, period, amount)
    values (v_loan_id, v_period, least(v_installment, v_balance));
  end if;
end;
$$;

revoke execute on function pay_salary(uuid, text) from public;
grant execute on function pay_salary(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A2. Extend `clients` in place
--
-- Deliberately NOT a second table. Order Taker's `clients` (0001) is the same
-- roster Company Admin curates; forking it would give the factory two client
-- lists that disagree.
--
-- Every business term is nullable because Order Taker's on-the-fly client
-- creation (Prompt 2) still only captures name/phone/photo. The terms arrive
-- later, from Company Admin's Clients screen.
-- ---------------------------------------------------------------------------

alter table clients add column if not exists address text;
alter table clients add column if not exists billing_type text
  check (billing_type in ('repeat', 'stitch'));
alter table clients add column if not exists rate numeric;
alter table clients add column if not exists payment_cycle text
  check (payment_cycle in ('weekly', 'biweekly', 'monthly'));
alter table clients add column if not exists status text not null default 'active'
  check (status in ('active', 'inactive'));

-- ---------------------------------------------------------------------------
-- A3. Master data
--
-- `employees` is an HR/payroll roster. `profiles` is who can sign in. They are
-- deliberately unlinked in this pass: nothing in the spec ties one to the
-- other, and inventing a foreign key here would bake in a guess. See the open
-- question in the prompt's §C6.
-- ---------------------------------------------------------------------------

do $$ begin
  create type employee_role as enum (
    'inspection_manager', 'floor_manager', 'store_manager', 'machine_worker',
    'admin', 'accountant', 'delivery'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type salary_basis as enum ('fixed', 'per_day', 'per_stitch');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type responsibility as enum (
    'order_taking', 'order_returns', 'order_delivery',
    'inventory_procurement', 'finishing_partner_sheets'
  );
exception when duplicate_object then null;
end $$;

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  name text not null,
  role employee_role not null,
  salary_basis salary_basis not null default 'fixed',
  salary_amount numeric,
  contact text,
  address text,
  cnic text,
  cnic_photo_url text,
  employee_photo_url text,
  reference_name text,
  responsibilities responsibility[],       -- only meaningful when role = 'delivery'
  join_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  -- Per-day and per-stitch pay only mean something for someone paid by output.
  -- Enforced here as well as in the form so a bad write cannot arrive by API.
  constraint salary_basis_matches_role check (role = 'machine_worker' or salary_basis = 'fixed')
);
create index if not exists employees_factory_id_status_idx on employees (factory_id, status);

do $$ begin
  create type finishing_stage as enum ('clipping', 'piko', 'press');
exception when duplicate_object then null;
end $$;

-- One value today. Kept as an enum rather than a check constraint so a second
-- basis can be added later without rewriting the column.
do $$ begin
  create type partner_rate_basis as enum ('per_repeat');
exception when duplicate_object then null;
end $$;

create table if not exists finishing_partners (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  name text not null,
  stage_type finishing_stage not null,
  rate_basis partner_rate_basis not null default 'per_repeat',
  rate numeric not null,
  contact text,
  address text,
  cnic text,
  cnic_photo_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
create index if not exists finishing_partners_factory_id_status_idx
  on finishing_partners (factory_id, status);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  name text not null,
  contact text,
  address text,
  -- `stock_type` comes from 0008 (Store Manager). Reused, not redefined, so the
  -- roster and the stock ledger cannot drift apart.
  inventory_type stock_type not null,
  payment_cycle text not null check (payment_cycle in ('weekly', 'biweekly', 'monthly')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
create index if not exists suppliers_factory_id_status_idx on suppliers (factory_id, status);

create table if not exists bonus_slabs (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  threshold numeric not null,
  bonus_amount numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists bonus_slabs_factory_id_idx on bonus_slabs (factory_id);

-- ---------------------------------------------------------------------------
-- A4. RLS
--
-- Reads are factory-wide on all four rosters: the Accountant's salary flow and
-- Store Manager's future PO flow both need to see them, and none of it is
-- sensitive within a tenant. Writes are company_admin only.
-- ---------------------------------------------------------------------------

alter table employees          enable row level security;
alter table finishing_partners enable row level security;
alter table suppliers          enable row level security;
alter table bonus_slabs        enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['employees', 'finishing_partners', 'suppliers', 'bonus_slabs'] loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format(
      'create policy %I on %I for select to authenticated using (factory_id = auth_factory_id())',
      t || '_select', t
    );

    execute format('drop policy if exists %I on %I', t || '_write_admin', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (factory_id = auth_factory_id() and auth_user_role() = ''company_admin'')
         with check (factory_id = auth_factory_id() and auth_user_role() = ''company_admin'')',
      t || '_write_admin', t
    );
  end loop;
end $$;

-- Clients: company_admin edits the roster alongside order_taker's existing
-- insert/update rights, which are left exactly as 0002 set them.
--
-- Note on scope: §A4 of the spec lists only the master-data columns, but §B11's
-- Clients edit form also edits Name, Contact and Address. Postgres RLS gates
-- rows, not columns, and Supabase grants table-wide UPDATE to `authenticated`,
-- so a column-level restriction here would have to be a trigger. Resolved in
-- favour of §B11: company_admin owns the whole client row.
drop policy if exists clients_update_company_admin on clients;
create policy clients_update_company_admin on clients
  for update to authenticated
  using (factory_id = auth_factory_id() and auth_user_role() = 'company_admin')
  with check (factory_id = auth_factory_id() and auth_user_role() = 'company_admin');

-- expenses / loans stay select-only for company_admin — 0009's factory-wide
-- select policies already cover the read. There is deliberately no update
-- policy for either table: the only way to move `status` is the four RPCs
-- below, which run security definer and check the caller's role themselves.

-- ---------------------------------------------------------------------------
-- A4 (cont). Approval RPCs
--
-- Four typed functions rather than one that takes a table name: a dynamic
-- version would have to build SQL from a caller-supplied string, and there is
-- nothing to gain from that when there are exactly two tables. The client wraps
-- them behind one dispatcher (`lib/approvalMutations.ts`) so screens still call
-- a single function.
-- ---------------------------------------------------------------------------

create or replace function assert_company_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth_user_role() <> 'company_admin' then
    raise exception 'Only a company admin can review this record';
  end if;
end;
$$;

revoke execute on function assert_company_admin() from public;
grant execute on function assert_company_admin() to authenticated;

create or replace function approve_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_company_admin();

  update expenses
  set status = 'approved',
      reject_reason = null,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      -- Kept in step with `reviewed_at` so the pre-existing column does not
      -- quietly go stale for anything still reading it.
      approved_at = now()
  where id = p_expense_id and factory_id = auth_factory_id();

  if not found then
    raise exception 'No such expense in this factory';
  end if;
end;
$$;

create or replace function reject_expense(p_expense_id uuid, p_reason reject_reason)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_company_admin();

  if p_reason is null then
    raise exception 'A rejection needs a reason';
  end if;

  update expenses
  set status = 'rejected',
      reject_reason = p_reason,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      approved_at = null
  where id = p_expense_id and factory_id = auth_factory_id();

  if not found then
    raise exception 'No such expense in this factory';
  end if;
end;
$$;

create or replace function approve_loan(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_company_admin();

  update loans
  set status = 'approved',
      reject_reason = null,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_loan_id and factory_id = auth_factory_id();

  if not found then
    raise exception 'No such loan in this factory';
  end if;
end;
$$;

create or replace function reject_loan(p_loan_id uuid, p_reason reject_reason)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_company_admin();

  if p_reason is null then
    raise exception 'A rejection needs a reason';
  end if;

  update loans
  set status = 'rejected',
      reject_reason = p_reason,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_loan_id and factory_id = auth_factory_id();

  if not found then
    raise exception 'No such loan in this factory';
  end if;
end;
$$;

revoke execute on function approve_expense(uuid) from public;
revoke execute on function reject_expense(uuid, reject_reason) from public;
revoke execute on function approve_loan(uuid) from public;
revoke execute on function reject_loan(uuid, reject_reason) from public;
grant execute on function approve_expense(uuid) to authenticated;
grant execute on function reject_expense(uuid, reject_reason) to authenticated;
grant execute on function approve_loan(uuid) to authenticated;
grant execute on function reject_loan(uuid, reject_reason) to authenticated;

-- ---------------------------------------------------------------------------
-- A3 (cont). Storage: employee and finishing-partner documents
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('employee-docs', 'employee-docs', false)
on conflict (id) do nothing;

drop policy if exists employee_docs_select on storage.objects;
create policy employee_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'employee-docs'
    and (storage.foldername(name))[1] = auth_factory_id()::text
  );

drop policy if exists employee_docs_write on storage.objects;
create policy employee_docs_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'employee-docs'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and auth_user_role() = 'company_admin'
  );

drop policy if exists employee_docs_delete on storage.objects;
create policy employee_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'employee-docs'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and auth_user_role() = 'company_admin'
  );

-- ---------------------------------------------------------------------------
-- A5. Order Taker retrofit: stamp billing terms onto the order at submit
--
-- DECISION, inferred rather than specified: the client's *current* terms are
-- copied onto `orders.billing` when the order is submitted, and never re-read
-- afterwards. An in-flight order therefore keeps the price it was taken at even
-- if the client's rate changes next week.
--
-- Done here, inside the existing transaction, rather than on the device: the
-- copy is then atomic with the order insert and cannot be forged by a client
-- sending its own billing blob.
--
-- Only ever fills a NULL. A resumed draft keeps the terms it was first
-- submitted under, and nothing downstream that edits `billing` later can be
-- clobbered by a re-submit.
-- ---------------------------------------------------------------------------

create or replace function client_billing(p_client_id uuid)
returns jsonb
language sql
stable
as $$
  select case
    when c.billing_type is null or c.rate is null then null
    when c.billing_type = 'repeat'
      then jsonb_build_object('mode', 'repeat', 'repeat_price', c.rate)
    else jsonb_build_object('mode', 'stitch', 'stitch_rate_per_1000', c.rate)
  end
  from clients c
  where c.id = p_client_id;
$$;

revoke execute on function client_billing(uuid) from public;
grant execute on function client_billing(uuid) to authenticated;

create or replace function submit_order(
  p_order_id uuid,
  p_client_id uuid,
  p_new_client jsonb,
  p_proof_photo_url text,
  p_design_sheet_photo_url text,
  p_sheets jsonb
)
returns table (order_id uuid, order_code text)
language plpgsql
as $$
declare
  v_factory_id uuid := auth_factory_id();
  v_client_id uuid := p_client_id;
  v_code text;
  v_existing_code text;
  v_billing jsonb;
begin
  if v_factory_id is null then
    raise exception 'No profile for the calling user';
  end if;

  if jsonb_array_length(coalesce(p_sheets, '[]'::jsonb)) = 0 then
    raise exception 'An order needs at least one sheet';
  end if;

  if p_new_client is not null then
    v_client_id := (p_new_client ->> 'id')::uuid;

    insert into clients (id, factory_id, name, phone, photo_url, shop_photo_taken)
    values (
      v_client_id,
      v_factory_id,
      p_new_client ->> 'name',
      p_new_client ->> 'phone',
      p_new_client ->> 'photo_url',
      coalesce((p_new_client ->> 'shop_photo_taken')::boolean, false)
    );
  end if;

  -- Null for a brand-new client, which has no terms yet — that is the expected
  -- case, not a failure. Company Admin fills them in later.
  v_billing := client_billing(v_client_id);

  -- A resumed draft already has a row and a code; keep both so the code the
  -- client was told at intake stays the code on the order.
  select code into v_existing_code from orders where id = p_order_id;

  if v_existing_code is null then
    v_code := next_order_code(v_factory_id);

    insert into orders (
      id, factory_id, code, client_id, status, stage,
      proof_photo_url, design_sheet_photo_url, billing, created_by
    )
    values (
      p_order_id, v_factory_id, v_code, v_client_id, 'in_progress', 'inspection',
      p_proof_photo_url, p_design_sheet_photo_url, v_billing, auth.uid()
    );
  else
    v_code := v_existing_code;

    update orders
    set client_id = v_client_id,
        status = 'in_progress',
        stage = 'inspection',
        proof_photo_url = p_proof_photo_url,
        design_sheet_photo_url = p_design_sheet_photo_url,
        billing = coalesce(orders.billing, v_billing)
    where id = p_order_id;

    -- Sheets are replaced wholesale rather than diffed: the cascade drops the
    -- draft's inspection_units and the fan-out trigger regenerates them, so the
    -- unit rows always match the sheets that were actually submitted.
    delete from order_sheets where order_sheets.order_id = p_order_id;
  end if;

  insert into order_sheets (order_id, color_id, custom_hex, repeats)
  select
    p_order_id,
    sheet ->> 'color_id',
    sheet ->> 'custom_hex',
    (sheet ->> 'repeats')::int
  from jsonb_array_elements(p_sheets) as sheet;

  return query select p_order_id, v_code;
end;
$$;

revoke execute on function submit_order(uuid, uuid, jsonb, text, text, jsonb) from public;
grant execute on function submit_order(uuid, uuid, jsonb, text, text, jsonb) to authenticated;
