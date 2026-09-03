-- Store Manager module.
--
-- Owns the stock room: what is on the shelf, what has been ordered from
-- suppliers, and what has been counted. Its one job outside those tables is the
-- `materialRequested -> readyToCollect` flip on an order, which is the handoff
-- the Floor Manager module was built to wait for.

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------

do $$ begin
  create type stock_type as enum ('thread', 'tilla', 'sequin', 'bobbin');
exception when duplicate_object then null;
end $$;

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  type stock_type not null,
  code text not null,                                        -- "101" thread, "201" tilla, sequential per type
  label text not null,
  color_id text,                                             -- ties into the shared SWATCHES palette where it can
  custom_hex text,
  quantity_grams numeric,                                    -- thread / tilla
  size_mm numeric,                                           -- sequin only
  cut_type text check (cut_type in ('Cut', 'Flat', 'Cup')),  -- sequin only
  roll_count numeric,                                        -- sequin only, counted in "CDs"
  -- Never entered by hand: piece count is roll_count x a size/cut conversion
  -- factor. That conversion table is not available yet, so this stays null and
  -- renders read-only until someone supplies it. Do not guess a formula.
  piece_count numeric,
  low_stock_threshold numeric,
  created_at timestamptz not null default now()
);
create index if not exists stock_items_factory_id_type_idx on stock_items (factory_id, type);

-- "Low stock" is deliberately not a stored or generated column: thread and
-- tilla measure grams, sequin measures rolls, and the thresholds differ by
-- type. It is computed per item type at query time instead.

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------

-- 'confirmed' and 'received' are inferred — the source screenshots only show
-- the first two states. The real progression, and when stock actually gets
-- credited on receipt, still needs confirming.
do $$ begin
  create type po_status as enum (
    'awaitingProcurement', 'awaitingConfirmation', 'confirmed', 'received'
  );
exception when duplicate_object then null;
end $$;
do $$ begin
  create type po_source as enum ('manual', 'system_generated');
exception when duplicate_object then null;
end $$;

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  po_number text not null unique,
  status po_status not null default 'awaitingProcurement',
  source po_source not null,
  supplier_name text,                                        -- null until assigned, for manual POs
  date timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists purchase_orders_factory_id_status_idx on purchase_orders (factory_id, status);

create table if not exists po_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id),
  qty numeric not null
);
create index if not exists po_items_purchase_order_id_idx on po_items (purchase_order_id);

-- ---------------------------------------------------------------------------
-- Audits
-- ---------------------------------------------------------------------------

create table if not exists audit_records (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  date timestamptz not null default now(),
  items_checked int not null,
  items_matched int not null,
  variance_count int not null,
  created_at timestamptz not null default now()
);
create index if not exists audit_records_factory_id_date_idx on audit_records (factory_id, date desc);

-- Line detail for the variance drill-in. The table is cheap to add now; the
-- screen that reads it is out of scope for this pass.
create table if not exists audit_line_items (
  id uuid primary key default gen_random_uuid(),
  audit_record_id uuid not null references audit_records(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id),
  expected_qty numeric not null,
  actual_qty numeric not null,
  variance numeric generated always as (actual_qty - expected_qty) stored
);
create index if not exists audit_line_items_audit_record_id_idx on audit_line_items (audit_record_id);

-- ---------------------------------------------------------------------------
-- The issue handoff
-- ---------------------------------------------------------------------------

alter table orders add column if not exists issued_by uuid references profiles(id);
alter table orders add column if not exists issued_date timestamptz;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table stock_items      enable row level security;
alter table purchase_orders  enable row level security;
alter table po_items         enable row level security;
alter table audit_records    enable row level security;
alter table audit_line_items enable row level security;

-- Factory-scoped tables the store manager owns outright.
do $$
declare t text;
begin
  foreach t in array array['stock_items', 'purchase_orders', 'audit_records'] loop
    execute format($f$
      create policy %1$s_select_same_factory on %1$I
        for select to authenticated
        using (factory_id = auth_factory_id());

      create policy %1$s_write_store_manager on %1$I
        for all to authenticated
        using (factory_id = auth_factory_id() and auth_user_role() = 'store_manager')
        with check (factory_id = auth_factory_id() and auth_user_role() = 'store_manager');
    $f$, t);
  end loop;
end $$;

-- Child tables carry no factory_id; tenancy joins through the parent.
drop policy if exists po_items_select_same_factory on po_items;
create policy po_items_select_same_factory on po_items
  for select to authenticated
  using (
    exists (
      select 1 from purchase_orders po
      where po.id = po_items.purchase_order_id and po.factory_id = auth_factory_id()
    )
  );

drop policy if exists po_items_write_store_manager on po_items;
create policy po_items_write_store_manager on po_items
  for all to authenticated
  using (
    auth_user_role() = 'store_manager'
    and exists (
      select 1 from purchase_orders po
      where po.id = po_items.purchase_order_id and po.factory_id = auth_factory_id()
    )
  )
  with check (
    auth_user_role() = 'store_manager'
    and exists (
      select 1 from purchase_orders po
      where po.id = po_items.purchase_order_id and po.factory_id = auth_factory_id()
    )
  );

drop policy if exists audit_line_items_select_same_factory on audit_line_items;
create policy audit_line_items_select_same_factory on audit_line_items
  for select to authenticated
  using (
    exists (
      select 1 from audit_records a
      where a.id = audit_line_items.audit_record_id and a.factory_id = auth_factory_id()
    )
  );

drop policy if exists audit_line_items_write_store_manager on audit_line_items;
create policy audit_line_items_write_store_manager on audit_line_items
  for all to authenticated
  using (
    auth_user_role() = 'store_manager'
    and exists (
      select 1 from audit_records a
      where a.id = audit_line_items.audit_record_id and a.factory_id = auth_factory_id()
    )
  )
  with check (
    auth_user_role() = 'store_manager'
    and exists (
      select 1 from audit_records a
      where a.id = audit_line_items.audit_record_id and a.factory_id = auth_factory_id()
    )
  );

-- Orders: the store manager sees only what its own tab is about.
--
-- RESTRICTIVE, because `orders_select_same_factory` in 0002 already grants
-- every role in the factory a permissive read and permissive policies OR
-- together — a narrower permissive policy would widen nothing and restrict
-- nothing. This one ANDs with it, and is a no-op for every other role.
drop policy if exists orders_store_manager_scope on orders;
create policy orders_store_manager_scope on orders
  as restrictive
  for select to authenticated
  using (
    auth_user_role() <> 'store_manager'
    or floor_status in ('materialRequested', 'readyToCollect')
  );

/**
 * Issue an order's materials to the floor.
 *
 * A function rather than an `orders` update grant: the store manager may make
 * exactly this one transition, on an order that is actually waiting for it, and
 * nothing else. SECURITY DEFINER because that role deliberately has no update
 * policy on `orders` at all.
 */
create or replace function issue_order_materials(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := auth_factory_id();
  v_status floor_status;
begin
  if auth_user_role() <> 'store_manager' then
    raise exception 'Only a store manager can issue materials';
  end if;

  select floor_status into v_status
  from orders
  where id = p_order_id and factory_id = v_factory;

  if not found then
    raise exception 'Order not found in your factory';
  end if;

  if v_status is distinct from 'materialRequested' then
    raise exception 'Order is not awaiting materials (status: %)', coalesce(v_status::text, 'none');
  end if;

  update orders
  set floor_status = 'readyToCollect',
      issued_by = auth.uid(),
      issued_date = now()
  where id = p_order_id;
end;
$$;

revoke execute on function issue_order_materials(uuid) from public;
grant execute on function issue_order_materials(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: proof photo for the issuing side of the handoff
--
-- Its own bucket rather than `job-card-photos`, whose write policy is scoped to
-- floor_manager.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('issue-photos', 'issue-photos', false)
on conflict (id) do nothing;

drop policy if exists issue_photos_select on storage.objects;
create policy issue_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'issue-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
  );

drop policy if exists issue_photos_write on storage.objects;
create policy issue_photos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'issue-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and auth_user_role() = 'store_manager'
  );
