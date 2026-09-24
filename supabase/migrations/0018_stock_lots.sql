-- Store Manager rebuild: lot-based FIFO inventory.
--
-- Until now a stock code held one stored number (`stock_items.quantity_grams`
-- or `roll_count`) and nothing could say whose stock it was. From here on a
-- code's quantity is only ever the sum of its lots, one lot per
-- (code, party, yards-per-unit), and every outgoing movement drains the oldest
-- lot first and records exactly which lots it took from.
--
-- Shapes worth stating once:
--
--   * **`stock_moves` is the one ledger.** Every credit and debit against a lot
--     lands there with a reference to what caused it (PO, sale, exchange line,
--     issue line, return). It replaces the per-feature `sale_lot_draws` the spec
--     proposed, and `exchange_lines.stock_lot_id`: a FIFO draw can split across
--     several lots, which a single lot id on the line cannot express, and the
--     item history screen needs every movement kind in one ordered list.
--   * **Every write is an RPC.** Draining has to lock lots and decrement them
--     atomically with the record that explains the draw; a table-write grant
--     would let a client do half of that. No role gets write policies on the
--     new tables.
--   * **Thread is counted in cones.** Lots carry `unit_yards` (yards per cone /
--     per sequin CD) because it varies lot to lot even within one code. Tilla
--     stays grams, sequin CDs, bobbin pieces.
--   * **An audit never moves stock.** `submit_audit` reads lots and writes only
--     `audit_records` / `audit_line_items`.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------------
-- 1. Parties and factory settings
-- ---------------------------------------------------------------------------

-- A lot's party can be an ordinary supplier or another factory an exchange
-- happened with. One roster, not two.
alter table suppliers add column if not exists kind text not null default 'supplier';
do $$ begin
  alter table suppliers add constraint suppliers_kind_check check (kind in ('supplier', 'factory'));
exception when duplicate_object then null;
end $$;

-- Bobbins required = ceil(thread cones x ratio). Owned by the factory, not typed
-- on the issuing screen. There is no Factory Settings screen yet to edit it.
alter table factories add column if not exists bobbin_ratio numeric not null default 0.25;
do $$ begin
  alter table factories add constraint factories_bobbin_ratio_check check (bobbin_ratio >= 0);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Lots
-- ---------------------------------------------------------------------------

create table if not exists stock_lots (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  stock_item_id uuid not null references stock_items(id),
  party_id uuid not null references suppliers(id),
  qty numeric not null check (qty >= 0),
  -- Yards per unit for THIS lot (thread cone, sequin CD). Null for tilla/bobbin.
  unit_yards numeric,
  -- Total invoiced value credited into this lot, not a unit price.
  price numeric,
  received_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists stock_lots_factory_item_idx on stock_lots (factory_id, stock_item_id);

-- `stock_items` is now a code registry. The stored quantities are kept, unread
-- and unwritten, so this migration loses nothing and can be rolled back.
comment on column stock_items.quantity_grams is
  'VESTIGIAL since 0018. Quantity is sum(stock_lots.qty). Do not read or write.';
comment on column stock_items.roll_count is
  'VESTIGIAL since 0018. Quantity is sum(stock_lots.qty). Do not read or write.';
comment on column stock_items.piece_count is
  'VESTIGIAL since 0018. Never populated; sequin pieces are computed by lib/sequinMath.';

-- ---------------------------------------------------------------------------
-- 3. Outgoing and incoming documents
-- ---------------------------------------------------------------------------

-- Stock sold to an outside buyer. Plain-text customer: lighter than Company
-- Admin's order-billing Client roster, and deliberately not forced into it.
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  code text not null,
  customer_name text not null,
  stock_item_id uuid not null references stock_items(id),
  qty numeric not null check (qty > 0),
  value numeric not null check (value >= 0),
  sold_at date not null default current_date,
  paid boolean not null default false,
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (factory_id, code)
);

-- A purchase paid for in goods. The value difference is informational only.
create table if not exists exchanges (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  code text not null,
  party_id uuid not null references suppliers(id),
  photo_url text not null,
  exchanged_at date not null default current_date,
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (factory_id, code)
);

create table if not exists exchange_lines (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges(id) on delete cascade,
  direction text not null check (direction in ('gave', 'got')),
  stock_item_id uuid not null references stock_items(id),
  qty numeric not null check (qty > 0),
  unit_yards numeric,
  value numeric not null check (value >= 0)
);
create index if not exists exchange_lines_exchange_id_idx on exchange_lines (exchange_id);

-- Leftover material coming back from a floor job into the store. NOT the same
-- thing as a client ReturnRequest (damaged goods going back to a client).
create table if not exists stock_returns (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  code text not null,
  order_id uuid references orders(id),
  stock_item_id uuid not null references stock_items(id),
  party_id uuid not null references suppliers(id),
  qty numeric not null check (qty > 0),
  returned_at date not null default current_date,
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (factory_id, code)
);

-- What was handed to the floor for one job, line by line. `issued_qty` is what
-- physically moved; `required_qty` is what the job needed, kept so the gap is
-- recorded rather than blocking. Thread's requirement arrives in grams from
-- `orders.materials` and has no cone conversion, so for thread `required_qty`
-- is null and `requested_grams` carries the original figure.
create table if not exists issue_lines (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  order_id uuid not null references orders(id),
  stock_item_id uuid not null references stock_items(id),
  requested_grams numeric,
  required_qty numeric,
  issued_qty numeric not null check (issued_qty >= 0),
  is_bobbin boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists issue_lines_order_id_idx on issue_lines (order_id);

-- The ledger. Positive qty credits a lot, negative debits it.
create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  stock_lot_id uuid not null references stock_lots(id),
  qty numeric not null check (qty <> 0),
  kind text not null check (kind in (
    'opening', 'po', 'exchange_in', 'exchange_out', 'sale', 'issue', 'return'
  )),
  purchase_order_id uuid references purchase_orders(id),
  sale_id uuid references sales(id),
  exchange_line_id uuid references exchange_lines(id),
  issue_line_id uuid references issue_lines(id),
  stock_return_id uuid references stock_returns(id),
  moved_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists stock_moves_lot_idx on stock_moves (stock_lot_id);
create index if not exists stock_moves_factory_idx on stock_moves (factory_id, moved_at desc);

-- ---------------------------------------------------------------------------
-- 4. Purchase orders: yards asked vs. received, one status for "received"
-- ---------------------------------------------------------------------------

alter table po_items add column if not exists ask_yards numeric;
alter table po_items add column if not exists got_yards numeric;

-- Confirming is receiving now, so 'received' has nothing left to mean. Existing
-- rows fold into 'confirmed' (which is also what puts them on the Accountant's
-- Payables tab — a received PO was invisible there before). The enum label
-- stays because Postgres cannot drop one; nothing writes it any more.
update purchase_orders
set status = 'confirmed', confirmed_at = coalesce(confirmed_at, date)
where status = 'received';

-- ---------------------------------------------------------------------------
-- 5. Opening balances
--
-- One lot per item that had stock, against an inactive "Opening Balance" party
-- per (factory, type), dated the item's creation so FIFO drains it first.
-- Thread is skipped: its stored figure is grams and lots count cones, and there
-- is no factor to convert one into the other. Thread thresholds were grams too
-- and are cleared for the same reason.
-- ---------------------------------------------------------------------------

insert into suppliers (factory_id, name, inventory_type, payment_cycle, status, kind)
select distinct i.factory_id, 'Opening Balance', i.type, 'monthly', 'inactive', 'supplier'
from stock_items i
where i.type <> 'thread'
  and coalesce(case when i.type = 'sequin' then i.roll_count else i.quantity_grams end, 0) > 0
  and not exists (
    select 1 from suppliers s
    where s.factory_id = i.factory_id and s.name = 'Opening Balance' and s.inventory_type = i.type
  );

with opened as (
  insert into stock_lots (factory_id, stock_item_id, party_id, qty, received_at)
  select i.factory_id, i.id, s.id,
         case when i.type = 'sequin' then i.roll_count else i.quantity_grams end,
         i.created_at::date
  from stock_items i
  join suppliers s
    on s.factory_id = i.factory_id and s.name = 'Opening Balance' and s.inventory_type = i.type
  where i.type <> 'thread'
    and coalesce(case when i.type = 'sequin' then i.roll_count else i.quantity_grams end, 0) > 0
    and not exists (select 1 from stock_lots l where l.stock_item_id = i.id)
  returning id, factory_id, qty, received_at
)
insert into stock_moves (factory_id, stock_lot_id, qty, kind, moved_at)
select factory_id, id, qty, 'opening', received_at from opened;

update stock_items set low_stock_threshold = null where type = 'thread';

-- ---------------------------------------------------------------------------
-- 6. RLS — factory-wide reads, no direct writes
-- ---------------------------------------------------------------------------

alter table stock_lots     enable row level security;
alter table stock_moves    enable row level security;
alter table sales          enable row level security;
alter table exchanges      enable row level security;
alter table exchange_lines enable row level security;
alter table stock_returns  enable row level security;
alter table issue_lines    enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'stock_lots', 'stock_moves', 'sales', 'exchanges', 'stock_returns', 'issue_lines'
  ] loop
    execute format('drop policy if exists %1$s_select_same_factory on %1$I', t);
    execute format($f$
      create policy %1$s_select_same_factory on %1$I
        for select to authenticated
        using (factory_id = auth_factory_id())
    $f$, t);
  end loop;
end $$;

drop policy if exists exchange_lines_select_same_factory on exchange_lines;
create policy exchange_lines_select_same_factory on exchange_lines
  for select to authenticated
  using (
    exists (
      select 1 from exchanges x
      where x.id = exchange_lines.exchange_id and x.factory_id = auth_factory_id()
    )
  );

-- The store manager also needs to see orders it has already issued to — a
-- return names the order the material came back from, and by then the order
-- has moved well past `readyToCollect`.
drop policy if exists orders_store_manager_scope on orders;
create policy orders_store_manager_scope on orders
  as restrictive
  for select to authenticated
  using (
    auth_user_role() <> 'store_manager'
    or floor_status in ('materialRequested', 'readyToCollect')
    or issued_date is not null
  );

-- ---------------------------------------------------------------------------
-- 7. Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Next "PREFIX-000N" on a table's code column. Scoped to the factory unless the
-- column is globally unique (purchase_orders.po_number is).
create or replace function next_doc_code(
  p_factory_id uuid, p_table text, p_column text, p_prefix text, p_width int, p_global boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
begin
  perform pg_advisory_xact_lock(hashtext(p_table || ':' || p_prefix || ':' ||
    case when p_global then '' else p_factory_id::text end));

  execute format(
    'select coalesce(max(substring(%1$I from ''(\d+)$'')::int), 0) from %2$I
     where %1$I like $1 and ($2 or factory_id = $3)',
    p_column, p_table
  ) into v_max using p_prefix || '-%', p_global, p_factory_id;

  return p_prefix || '-' || lpad((v_max + 1)::text, p_width, '0');
end;
$$;

-- Take p_qty of an item, oldest lot first. Locks the lots it reads, decrements
-- them, and returns the plan: which lot, whose, how much. Refuses to overdraw.
create or replace function drain_stock(p_factory_id uuid, p_stock_item_id uuid, p_qty numeric)
returns table (stock_lot_id uuid, party_id uuid, qty_taken numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left numeric := p_qty;
  v_lot record;
  v_take numeric;
  v_on_hand numeric;
begin
  if p_qty is null or p_qty <= 0 then
    return;
  end if;

  select coalesce(sum(l.qty), 0) into v_on_hand
  from stock_lots l
  where l.factory_id = p_factory_id and l.stock_item_id = p_stock_item_id and l.qty > 0;

  if v_on_hand < p_qty then
    raise exception 'Only % on hand for code %, cannot take %',
      v_on_hand, (select code from stock_items where id = p_stock_item_id), p_qty;
  end if;

  for v_lot in
    select l.id, l.party_id, l.qty
    from stock_lots l
    where l.factory_id = p_factory_id and l.stock_item_id = p_stock_item_id and l.qty > 0
    order by l.received_at, l.created_at, l.id
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_lot.qty, v_left);
    update stock_lots set qty = qty - v_take where id = v_lot.id;
    v_left := v_left - v_take;
    stock_lot_id := v_lot.id;
    party_id := v_lot.party_id;
    qty_taken := v_take;
    return next;
  end loop;
end;
$$;

-- Add to the lot keyed by (item, party, yards-per-unit), creating it if needed.
-- A different unit length is a different lot: the yards figure is a property of
-- the lot, and averaging two suppliers' cones would make both wrong.
create or replace function credit_lot(
  p_factory_id uuid, p_stock_item_id uuid, p_party_id uuid,
  p_qty numeric, p_unit_yards numeric, p_price numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot uuid;
begin
  select id into v_lot
  from stock_lots
  where factory_id = p_factory_id
    and stock_item_id = p_stock_item_id
    and party_id = p_party_id
    and unit_yards is not distinct from p_unit_yards
  order by received_at desc
  limit 1
  for update;

  if v_lot is null then
    insert into stock_lots (factory_id, stock_item_id, party_id, qty, unit_yards, price)
    values (p_factory_id, p_stock_item_id, p_party_id, p_qty, p_unit_yards, p_price)
    returning id into v_lot;
  else
    update stock_lots
    set qty = qty + p_qty,
        price = case when p_price is null then price else coalesce(price, 0) + p_price end
    where id = v_lot;
  end if;

  return v_lot;
end;
$$;

-- An additional PO line describes itself by type/colour/size/cut and has no
-- code. Find the code that matches, or register the next one for that type.
create or replace function resolve_stock_item(
  p_factory_id uuid, p_type stock_type, p_color_id text, p_size_mm numeric, p_cut_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_base int := case p_type when 'thread' then 100 when 'tilla' then 200
                            when 'sequin' then 300 else 400 end;
  v_code int;
begin
  select id into v_id
  from stock_items
  where factory_id = p_factory_id and type = p_type
    and color_id is not distinct from p_color_id
    and (p_type <> 'sequin' or (size_mm is not distinct from p_size_mm
                                and cut_type is not distinct from p_cut_type))
  order by code
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('stock_items:' || p_factory_id::text || ':' || p_type::text));

  select greatest(coalesce(max(code::int), v_base), v_base) + 1 into v_code
  from stock_items
  where factory_id = p_factory_id and type = p_type and code ~ '^\d+$';

  insert into stock_items (factory_id, type, code, label, color_id, size_mm, cut_type)
  values (
    p_factory_id, p_type, v_code::text,
    case when p_type = 'bobbin' then 'Bobbin'
         else initcap(replace(coalesce(p_color_id, 'unspecified'), '_', ' ')) || ' ' || initcap(p_type::text)
    end,
    p_color_id, p_size_mm, p_cut_type
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function next_doc_code(uuid, text, text, text, int, boolean) from public;
revoke execute on function drain_stock(uuid, uuid, numeric) from public;
revoke execute on function credit_lot(uuid, uuid, uuid, numeric, numeric, numeric) from public;
revoke execute on function resolve_stock_item(uuid, stock_type, text, numeric, text) from public;

create or replace function assert_store_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth_user_role() is distinct from 'store_manager' then
    raise exception 'Only a store manager can do this';
  end if;
  return auth_factory_id();
end;
$$;
revoke execute on function assert_store_manager() from public;

-- ---------------------------------------------------------------------------
-- 8. Purchase orders
-- ---------------------------------------------------------------------------

-- A manual PO from the Store Manager: quantities and requested yards, no prices.
-- p_items: [{ stock_item_id, qty, ask_yards, recommended_supplier_id }]
create or replace function create_purchase_order(p_items jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := assert_store_manager();
  v_po uuid;
  v_number text;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'A purchase order needs at least one item';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where (e ->> 'qty')::numeric is null or (e ->> 'qty')::numeric <= 0
       or not exists (select 1 from stock_items i
                      where i.id = (e ->> 'stock_item_id')::uuid and i.factory_id = v_factory)
  ) then
    raise exception 'Every item needs a code from your factory and a quantity above zero';
  end if;

  v_number := next_doc_code(v_factory, 'purchase_orders', 'po_number', 'PO', 4, true);

  insert into purchase_orders (factory_id, po_number, status, source)
  values (v_factory, v_number, 'awaitingProcurement', 'manual')
  returning id into v_po;

  insert into po_items (purchase_order_id, stock_item_id, qty, ask_yards, recommended_supplier_id)
  select v_po, (e ->> 'stock_item_id')::uuid, (e ->> 'qty')::numeric,
         (e ->> 'ask_yards')::numeric, (e ->> 'recommended_supplier_id')::uuid
  from jsonb_array_elements(p_items) e;

  return v_number;
end;
$$;

-- Procurement's side, unchanged except that it now also records the yards per
-- unit actually bought (`got_yards`) on each line it prices or adds.
create or replace function submit_procurement_bill(
  p_purchase_order_id uuid,
  p_actual_supplier_id uuid,
  p_bill_photo_url text,
  p_item_prices jsonb,
  p_additional_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := auth_factory_id();
  v_status po_status;
  v_unpriced int;
begin
  if not (auth_user_role() = 'procurement' or has_grant('procurePo')) then
    raise exception 'Only procurement can submit a bill';
  end if;

  if p_actual_supplier_id is null then
    raise exception 'A bill needs the supplier it was actually bought from';
  end if;

  if p_bill_photo_url is null then
    raise exception 'A bill needs its photo';
  end if;

  select status into v_status
  from purchase_orders
  where id = p_purchase_order_id and factory_id = v_factory;

  if not found then
    raise exception 'Purchase order not found in your factory';
  end if;

  if v_status is distinct from 'awaitingProcurement' then
    raise exception 'Purchase order is not awaiting procurement (status: %)', v_status;
  end if;

  if not exists (
    select 1 from suppliers s
    where s.id = p_actual_supplier_id and s.factory_id = v_factory
  ) then
    raise exception 'Supplier not found in your factory';
  end if;

  update po_items i
  set price = (entry ->> 'price')::numeric,
      got_yards = coalesce((entry ->> 'got_yards')::numeric, i.got_yards)
  from jsonb_array_elements(coalesce(p_item_prices, '[]'::jsonb)) as entry
  where i.id = (entry ->> 'id')::uuid
    and i.purchase_order_id = p_purchase_order_id
    and i.is_additional = false;

  select count(*) into v_unpriced
  from po_items
  where purchase_order_id = p_purchase_order_id
    and is_additional = false
    and (price is null or price <= 0);

  if v_unpriced > 0 then
    raise exception 'Every requested item needs a price (% still unpriced)', v_unpriced;
  end if;

  delete from po_items
  where purchase_order_id = p_purchase_order_id and is_additional = true;

  insert into po_items (
    purchase_order_id, stock_item_id, qty, item_type, color_id,
    sequin_size_mm, sequin_cut_type, price, got_yards, is_additional
  )
  select
    p_purchase_order_id,
    null,
    (entry ->> 'qty')::numeric,
    (entry ->> 'item_type')::stock_type,
    entry ->> 'color_id',
    (entry ->> 'sequin_size_mm')::numeric,
    entry ->> 'sequin_cut_type',
    (entry ->> 'price')::numeric,
    (entry ->> 'got_yards')::numeric,
    true
  from jsonb_array_elements(coalesce(p_additional_items, '[]'::jsonb)) as entry;

  update purchase_orders
  set status = 'submitted',
      actual_supplier_id = p_actual_supplier_id,
      bill_photo_url = p_bill_photo_url,
      submitted_at = now(),
      submitted_by = auth.uid()
  where id = p_purchase_order_id;
end;
$$;

-- Confirming receipt is what credits stock. Both waiting states confirm the
-- same way: 'submitted' (Procurement fulfilled a manual PO) and
-- 'awaitingConfirmation' (a system-generated PO reached the supplier).
--
-- The party is the supplier actually bought from. A system-generated PO only
-- carries a supplier *name*; it is matched against the roster, and a name the
-- roster does not know is refused rather than invented as a new supplier.
create or replace function confirm_purchase_order(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := assert_store_manager();
  v_po purchase_orders%rowtype;
  v_party uuid;
  v_line record;
  v_item uuid;
  v_lot uuid;
begin
  select * into v_po
  from purchase_orders
  where id = p_purchase_order_id and factory_id = v_factory
  for update;

  if not found then
    raise exception 'Purchase order not found in your factory';
  end if;

  if v_po.status not in ('submitted', 'awaitingConfirmation') then
    raise exception 'Purchase order is not awaiting confirmation (status: %)', v_po.status;
  end if;

  v_party := v_po.actual_supplier_id;
  if v_party is null and v_po.supplier_name is not null then
    select id into v_party
    from suppliers
    where factory_id = v_factory and lower(name) = lower(v_po.supplier_name)
    order by (status = 'active') desc
    limit 1;
  end if;

  if v_party is null then
    raise exception 'Supplier "%" is not on your supplier roster — add it in Company Admin first',
      coalesce(v_po.supplier_name, 'unknown');
  end if;

  for v_line in
    select * from po_items where purchase_order_id = p_purchase_order_id
  loop
    v_item := coalesce(
      v_line.stock_item_id,
      resolve_stock_item(v_factory, coalesce(v_line.item_type, 'thread'), v_line.color_id,
                         v_line.sequin_size_mm, v_line.sequin_cut_type)
    );

    if v_line.stock_item_id is null then
      update po_items set stock_item_id = v_item where id = v_line.id;
    end if;

    v_lot := credit_lot(v_factory, v_item, v_party, v_line.qty,
                        coalesce(v_line.got_yards, v_line.ask_yards), v_line.price);

    insert into stock_moves (factory_id, stock_lot_id, qty, kind, purchase_order_id)
    values (v_factory, v_lot, v_line.qty, 'po', p_purchase_order_id);
  end loop;

  update purchase_orders
  set status = 'confirmed',
      actual_supplier_id = v_party,
      confirmed_at = now(),
      confirmed_by = auth.uid()
  where id = p_purchase_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Sales
-- ---------------------------------------------------------------------------

create or replace function record_sale(
  p_stock_item_id uuid, p_qty numeric, p_value numeric, p_customer_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := assert_store_manager();
  v_sale uuid;
  v_code text;
begin
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'A sale needs a customer';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'A sale needs a quantity above zero';
  end if;
  if p_value is null or p_value <= 0 then
    raise exception 'A sale needs a value';
  end if;
  if not exists (select 1 from stock_items where id = p_stock_item_id and factory_id = v_factory) then
    raise exception 'Code not found in your factory';
  end if;

  v_code := next_doc_code(v_factory, 'sales', 'code', 'SO', 3, false);

  insert into sales (factory_id, code, customer_name, stock_item_id, qty, value, recorded_by)
  values (v_factory, v_code, trim(p_customer_name), p_stock_item_id, p_qty, p_value, auth.uid())
  returning id into v_sale;

  insert into stock_moves (factory_id, stock_lot_id, qty, kind, sale_id)
  select v_factory, d.stock_lot_id, -d.qty_taken, 'sale', v_sale
  from drain_stock(v_factory, p_stock_item_id, p_qty) d;

  return v_code;
end;
$$;

create or replace function mark_sale_paid(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := assert_store_manager();
begin
  update sales set paid = true where id = p_sale_id and factory_id = v_factory;
  if not found then
    raise exception 'Sale not found in your factory';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Exchanges
-- p_lines: [{ direction: 'gave'|'got', stock_item_id, qty, unit_yards, value }]
-- ---------------------------------------------------------------------------

create or replace function record_exchange(p_party_id uuid, p_photo_url text, p_lines jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := assert_store_manager();
  v_exchange uuid;
  v_code text;
  v_line exchange_lines%rowtype;
  v_lot uuid;
begin
  if p_photo_url is null then
    raise exception 'An exchange needs its photo';
  end if;
  if not exists (select 1 from suppliers where id = p_party_id and factory_id = v_factory) then
    raise exception 'Counterparty not found in your factory';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_lines) e where e ->> 'direction' = 'gave')
     or not exists (select 1 from jsonb_array_elements(p_lines) e where e ->> 'direction' = 'got') then
    raise exception 'An exchange needs at least one item on each side';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where not exists (select 1 from stock_items i
                      where i.id = (e ->> 'stock_item_id')::uuid and i.factory_id = v_factory)
  ) then
    raise exception 'Every exchange line needs a code from your factory';
  end if;

  v_code := next_doc_code(v_factory, 'exchanges', 'code', 'EX', 4, false);

  insert into exchanges (factory_id, code, party_id, photo_url, recorded_by)
  values (v_factory, v_code, p_party_id, p_photo_url, auth.uid())
  returning id into v_exchange;

  insert into exchange_lines (exchange_id, direction, stock_item_id, qty, unit_yards, value)
  select v_exchange, e ->> 'direction', (e ->> 'stock_item_id')::uuid, (e ->> 'qty')::numeric,
         (e ->> 'unit_yards')::numeric, (e ->> 'value')::numeric
  from jsonb_array_elements(p_lines) e;

  -- Gave lines first, so goods received in the same exchange can never be the
  -- stock that pays for it.
  for v_line in
    select * from exchange_lines where exchange_id = v_exchange order by direction = 'got'
  loop
    if v_line.direction = 'gave' then
      insert into stock_moves (factory_id, stock_lot_id, qty, kind, exchange_line_id)
      select v_factory, d.stock_lot_id, -d.qty_taken, 'exchange_out', v_line.id
      from drain_stock(v_factory, v_line.stock_item_id, v_line.qty) d;
    else
      v_lot := credit_lot(v_factory, v_line.stock_item_id, p_party_id, v_line.qty,
                          v_line.unit_yards, v_line.value);
      insert into stock_moves (factory_id, stock_lot_id, qty, kind, exchange_line_id)
      values (v_factory, v_lot, v_line.qty, 'exchange_in', v_line.id);
    end if;
  end loop;

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Issuance — the materialRequested -> readyToCollect transition, lot-aware
--
-- This is the same handoff `issue_order_materials` (0008) performed, now with
-- what physically moved recorded per line and drained FIFO. That function stays
-- as the one place the status flip lives, but clients can no longer call it
-- directly: an issue that moved no stock would bypass the lots entirely.
--
-- p_lines: [{ stock_item_id, requested_grams, required_qty, issued_qty }]
-- p_bobbin: { stock_item_id, issued_qty } or null. Its required figure is
-- computed here from the factory ratio, never trusted from the client.
-- ---------------------------------------------------------------------------

create or replace function issue_job(p_order_id uuid, p_lines jsonb, p_bobbin jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := assert_store_manager();
  v_line issue_lines%rowtype;
  v_thread numeric;
  v_ratio numeric;
begin
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
    where not exists (select 1 from stock_items i
                      where i.id = (e ->> 'stock_item_id')::uuid and i.factory_id = v_factory)
       or coalesce((e ->> 'issued_qty')::numeric, -1) < 0
  ) then
    raise exception 'Every line needs a code from your factory and an issued quantity';
  end if;

  -- Status check and flip; raises if the order is not waiting for materials.
  perform issue_order_materials(p_order_id);

  for v_line in
    insert into issue_lines (factory_id, order_id, stock_item_id, requested_grams, required_qty, issued_qty)
    select v_factory, p_order_id, (e ->> 'stock_item_id')::uuid, (e ->> 'requested_grams')::numeric,
           (e ->> 'required_qty')::numeric, (e ->> 'issued_qty')::numeric
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
    returning *
  loop
    insert into stock_moves (factory_id, stock_lot_id, qty, kind, issue_line_id)
    select v_factory, d.stock_lot_id, -d.qty_taken, 'issue', v_line.id
    from drain_stock(v_factory, v_line.stock_item_id, v_line.issued_qty) d;
  end loop;

  if p_bobbin is not null and p_bobbin ->> 'stock_item_id' is not null then
    select coalesce(sum(l.issued_qty), 0) into v_thread
    from issue_lines l join stock_items i on i.id = l.stock_item_id
    where l.order_id = p_order_id and i.type = 'thread' and not l.is_bobbin;

    select bobbin_ratio into v_ratio from factories where id = v_factory;

    insert into issue_lines (factory_id, order_id, stock_item_id, required_qty, issued_qty, is_bobbin)
    select v_factory, p_order_id, i.id, ceil(v_thread * v_ratio),
           coalesce((p_bobbin ->> 'issued_qty')::numeric, 0), true
    from stock_items i
    where i.id = (p_bobbin ->> 'stock_item_id')::uuid and i.factory_id = v_factory and i.type = 'bobbin'
    returning * into v_line;

    if v_line.id is null or not v_line.is_bobbin then
      raise exception 'Bobbin code not found in your factory';
    end if;

    insert into stock_moves (factory_id, stock_lot_id, qty, kind, issue_line_id)
    select v_factory, d.stock_lot_id, -d.qty_taken, 'issue', v_line.id
    from drain_stock(v_factory, v_line.stock_item_id, v_line.issued_qty) d;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Returns from the floor
--
-- Material goes back into the lot it was issued from. The caller names the
-- order, code and party; the lot is found from the ledger, and the quantity is
-- capped at what that party's lots gave this order net of earlier returns.
-- ---------------------------------------------------------------------------

create or replace function record_stock_return(
  p_order_id uuid, p_stock_item_id uuid, p_party_id uuid, p_qty numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := assert_store_manager();
  v_issued numeric;
  v_returned numeric;
  v_lot uuid;
  v_return uuid;
  v_code text;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'A return needs a quantity above zero';
  end if;

  select coalesce(sum(-m.qty), 0),
         (array_agg(m.stock_lot_id order by m.created_at desc))[1]
  into v_issued, v_lot
  from stock_moves m
  join issue_lines il on il.id = m.issue_line_id
  join stock_lots l on l.id = m.stock_lot_id
  where m.factory_id = v_factory and m.kind = 'issue'
    and il.order_id = p_order_id and il.stock_item_id = p_stock_item_id
    and l.party_id = p_party_id;

  select coalesce(sum(qty), 0) into v_returned
  from stock_returns
  where factory_id = v_factory and order_id = p_order_id
    and stock_item_id = p_stock_item_id and party_id = p_party_id;

  if v_lot is null then
    raise exception 'Nothing of this code from this party was issued to that order';
  end if;
  if p_qty > v_issued - v_returned then
    raise exception 'Only % can come back — that is what was issued, less earlier returns',
      v_issued - v_returned;
  end if;

  v_code := next_doc_code(v_factory, 'stock_returns', 'code', 'RT', 4, false);

  insert into stock_returns (factory_id, code, order_id, stock_item_id, party_id, qty, recorded_by)
  values (v_factory, v_code, p_order_id, p_stock_item_id, p_party_id, p_qty, auth.uid())
  returning id into v_return;

  update stock_lots set qty = qty + p_qty where id = v_lot;

  insert into stock_moves (factory_id, stock_lot_id, qty, kind, stock_return_id)
  values (v_factory, v_lot, p_qty, 'return', v_return);

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Audit — records a count, never adjusts stock
--
-- p_lines: [{ stock_item_id, counted }], one per code in the factory. Expected
-- is read from the lots here, at submit time, not taken from the client.
-- ---------------------------------------------------------------------------

create or replace function submit_audit(p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory uuid := assert_store_manager();
  v_audit uuid;
  v_missing int;
begin
  select count(*) into v_missing
  from stock_items i
  where i.factory_id = v_factory
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
      where (e ->> 'stock_item_id')::uuid = i.id and (e ->> 'counted') is not null
    );

  if v_missing > 0 then
    raise exception 'Every code needs a count (% still missing)', v_missing;
  end if;

  insert into audit_records (factory_id, items_checked, items_matched, variance_count)
  values (v_factory, 0, 0, 0)
  returning id into v_audit;

  insert into audit_line_items (audit_record_id, stock_item_id, expected_qty, actual_qty)
  select v_audit, i.id,
         coalesce((select sum(l.qty) from stock_lots l where l.stock_item_id = i.id), 0),
         (e ->> 'counted')::numeric
  from stock_items i
  join jsonb_array_elements(p_lines) e on (e ->> 'stock_item_id')::uuid = i.id
  where i.factory_id = v_factory;

  update audit_records a
  set items_checked = s.checked, items_matched = s.matched, variance_count = s.checked - s.matched
  from (
    select count(*) as checked, count(*) filter (where variance = 0) as matched
    from audit_line_items where audit_record_id = v_audit
  ) s
  where a.id = v_audit;

  return v_audit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Grants
-- ---------------------------------------------------------------------------

revoke execute on function issue_order_materials(uuid) from authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'create_purchase_order(jsonb)',
    'submit_procurement_bill(uuid, uuid, text, jsonb, jsonb)',
    'confirm_purchase_order(uuid)',
    'record_sale(uuid, numeric, numeric, text)',
    'mark_sale_paid(uuid)',
    'record_exchange(uuid, text, jsonb)',
    'issue_job(uuid, jsonb, jsonb)',
    'record_stock_return(uuid, uuid, uuid, numeric)',
    'submit_audit(jsonb)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
