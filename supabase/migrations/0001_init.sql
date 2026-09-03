-- FactoryERP — core schema.
--
-- Every business table carries factory_id, or reaches one through a foreign
-- key, because this is a multi-tenant system: tenant scoping is enforced by
-- the RLS policies in 0002_rls.sql, never by client-side filtering.

-- ---------------------------------------------------------------------------
-- Tenancy & auth
-- ---------------------------------------------------------------------------

create table if not exists factories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- All 11 ERP roles are declared now even though only order_taker and
-- qa_person have screens — adding an enum value later would force a migration
-- on every policy that references the type.
do $$ begin
  create type user_role as enum (
    'super_admin', 'company_admin', 'accountant', 'floor_manager', 'store_manager',
    'order_taker', 'qa_person', 'procurement', 'delivery_person', 'worker', 'finishing_partner'
  );
exception when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  factory_id uuid not null references factories(id),
  role user_role not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Order Taker + Inspection
-- ---------------------------------------------------------------------------

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  name text not null,
  phone text not null,
  photo_url text,
  shop_photo_taken boolean not null default false,
  created_at timestamptz not null default now()
);

do $$ begin
  create type order_status as enum ('draft', 'in_progress', 'completed');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type order_stage as enum ('inspection', 'coding', 'jobcard', 'production', 'finishing', 'delivery');
exception when duplicate_object then null;
end $$;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  code text not null unique,
  client_id uuid not null references clients(id),
  status order_status not null default 'draft',
  stage order_stage,
  design_sheet_photo_url text,
  alert_text text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists order_sheets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  color_id text not null,           -- key into the SWATCHES palette, or 'custom'
  custom_hex text,
  repeats int not null check (repeats > 0),
  proof_photo_url text,
  created_at timestamptz not null default now()
);

do $$ begin
  create type unit_status as enum ('pending', 'passed', 'returned');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type defect_type as enum ('thread', 'hole', 'stain', 'wrongcolor', 'misalign', 'other');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type defect_scope as enum ('repeat', 'sheet');
exception when duplicate_object then null;
end $$;

create table if not exists inspection_units (
  id uuid primary key default gen_random_uuid(),
  order_sheet_id uuid not null references order_sheets(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  repeat_index_in_sheet int not null,
  color_id text not null,
  status unit_status not null default 'pending',
  passed_code text,
  defect_type defect_type,
  defect_photo_url text,
  defect_scope defect_scope,
  inspected_by uuid references profiles(id),
  inspected_at timestamptz
);

create index if not exists clients_factory_id_idx on clients (factory_id);
create index if not exists orders_factory_id_idx on orders (factory_id);
create index if not exists inspection_units_order_id_idx on inspection_units (order_id);
create index if not exists inspection_units_status_idx on inspection_units (status);

-- Policies join order_sheets -> orders and inspection_units -> order_sheets on
-- every row access, so both foreign keys need an index of their own.
create index if not exists order_sheets_order_id_idx on order_sheets (order_id);
create index if not exists inspection_units_order_sheet_id_idx on inspection_units (order_sheet_id);

-- ---------------------------------------------------------------------------
-- Fan-out: order_sheets -> inspection_units
-- ---------------------------------------------------------------------------

-- A sheet is a colour plus a repeat *count*; a unit is one physical repeat.
-- The units are generated here, on insert, rather than by the client, so the
-- two can never disagree — the order taker submits counts and the QA queue is
-- populated in the same transaction.
create or replace function fan_out_inspection_units()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into inspection_units (order_sheet_id, order_id, repeat_index_in_sheet, color_id, status)
  select new.id, new.order_id, i, new.color_id, 'pending'
  from generate_series(1, new.repeats) as i;

  return new;
end;
$$;

drop trigger if exists order_sheets_fan_out on order_sheets;
create trigger order_sheets_fan_out
after insert on order_sheets
for each row
execute function fan_out_inspection_units();
