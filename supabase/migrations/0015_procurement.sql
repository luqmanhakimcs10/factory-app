-- Procurement module.
--
-- The gap this closes: 0008 let a store manager raise a manual purchase order
-- with quantities and no prices, and nothing could ever price it. `submitted`
-- (0014) is the state in between, and `submit_procurement_bill` is the only way
-- into it.
--
-- Two shapes here are deliberate and worth stating once:
--
--   * **`total` is not a column.** It is `sum(po_items.price)`, computed at
--     read time, for the same reason `total_receivable` was rejected in
--     Prompt 10: a stored total drifts the moment a line item changes and
--     nothing tells you it has.
--   * **Every write is an RPC.** Neither role gets an UPDATE grant that could
--     move `status` directly, because both transitions have preconditions
--     (every requested item priced; the PO actually being in the state the
--     caller thinks it is) that a policy cannot express.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------------
-- 1. purchase_orders — who actually supplied it, and the paper trail
-- ---------------------------------------------------------------------------

alter table purchase_orders add column if not exists actual_supplier_id uuid references suppliers(id);
alter table purchase_orders add column if not exists bill_photo_url text;
alter table purchase_orders add column if not exists submitted_at timestamptz;
alter table purchase_orders add column if not exists submitted_by uuid references profiles(id);
alter table purchase_orders add column if not exists confirmed_at timestamptz;
alter table purchase_orders add column if not exists confirmed_by uuid references profiles(id);

-- ---------------------------------------------------------------------------
-- 2. po_items — a line that need not correspond to anything on the shelf
--
-- An item bought opportunistically at the shop has no `stock_items` row to
-- point at, so the column becomes optional and the item's own identity
-- (type / colour / size / cut) moves onto this table. A requested line still
-- carries `stock_item_id`; an additional one carries the descriptive columns
-- instead. Both are readable without knowing which kind it is.
-- ---------------------------------------------------------------------------

alter table po_items alter column stock_item_id drop not null;
alter table po_items add column if not exists item_type stock_type;
alter table po_items add column if not exists color_id text;
alter table po_items add column if not exists sequin_size_mm numeric;
alter table po_items add column if not exists sequin_cut_type text
  check (sequin_cut_type in ('Cut', 'Flat', 'Cup'));
alter table po_items add column if not exists price numeric;
alter table po_items add column if not exists recommended_supplier_id uuid references suppliers(id);
alter table po_items add column if not exists is_additional boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. RLS
--
-- Reads need nothing new. `purchase_orders_select_same_factory` and
-- `po_items_select_same_factory` (0008) are already factory-wide for every
-- authenticated role, which is exactly what the Queue's "Submitted This Week"
-- section wants: factory-wide, not scoped to `submitted_by = self`. Scoping the
-- read to the submitter would hide a colleague's bill from the person covering
-- their shift.
--
-- 0008's `purchase_orders_write_store_manager` is also left alone. It is what
-- lets a store manager raise a PO in the first place; narrowing it to "confirm
-- only" would delete that ability to gain nothing, since `confirm_purchase_order`
-- runs SECURITY DEFINER and does not consult it.
--
-- What is added: nothing for procurement. It gets no table-write policy at all,
-- by design — `submit_procurement_bill` is its entire write surface.
--
-- The role check inside both RPCs is written as `role = X or has_grant(Y)`, the
-- dual-check pattern from 0013: a dedicated `procurement` login and a unified
-- staff account holding `procurePo` are the same person to this module.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. submit_procurement_bill
--
-- Atomic on purpose. Prices, additional lines and the status flip are one
-- transaction: a half-priced PO in `submitted` would be invisible to the Queue
-- (which lists `awaitingProcurement`) and un-confirmable by the store manager,
-- i.e. lost.
--
-- `p_item_prices` is [{ id, price }] over the PO's existing non-additional
-- lines. `p_additional_items` is [{ item_type, color_id, sequin_size_mm,
-- sequin_cut_type, qty, price }].
-- ---------------------------------------------------------------------------

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

  -- Not merely "not submitted": a confirmed PO must not be reopened and
  -- repriced behind the store manager who already signed it off.
  if v_status is distinct from 'awaitingProcurement' then
    raise exception 'Purchase order is not awaiting procurement (status: %)', v_status;
  end if;

  if not exists (
    select 1 from suppliers s
    where s.id = p_actual_supplier_id and s.factory_id = v_factory
  ) then
    raise exception 'Supplier not found in your factory';
  end if;

  -- Prices land on the requested lines first, so the completeness check below
  -- reads the table rather than trusting the payload it was just handed.
  update po_items i
  set price = (entry ->> 'price')::numeric
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

  -- Additional lines are replaced wholesale rather than appended: the RPC is
  -- reachable only from `awaitingProcurement`, so anything already sitting here
  -- is debris from an attempt that failed a later check, not a colleague's work.
  delete from po_items
  where purchase_order_id = p_purchase_order_id and is_additional = true;

  insert into po_items (
    purchase_order_id, stock_item_id, qty, item_type, color_id,
    sequin_size_mm, sequin_cut_type, price, is_additional
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

-- ---------------------------------------------------------------------------
-- 5. confirm_purchase_order — the store manager's side
--
-- One line of state change, but it is the line that puts the PO on the
-- Accountant's Payables tab, which already filters on `status = 'confirmed'`.
-- ---------------------------------------------------------------------------

create or replace function confirm_purchase_order(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status po_status;
begin
  if auth_user_role() <> 'store_manager' then
    raise exception 'Only a store manager can confirm a purchase order';
  end if;

  select status into v_status
  from purchase_orders
  where id = p_purchase_order_id and factory_id = auth_factory_id();

  if not found then
    raise exception 'Purchase order not found in your factory';
  end if;

  if v_status is distinct from 'submitted' then
    raise exception 'Purchase order is not awaiting confirmation (status: %)', v_status;
  end if;

  update purchase_orders
  set status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = auth.uid()
  where id = p_purchase_order_id;
end;
$$;

revoke execute on function submit_procurement_bill(uuid, uuid, text, jsonb, jsonb) from public;
revoke execute on function confirm_purchase_order(uuid) from public;
grant execute on function submit_procurement_bill(uuid, uuid, text, jsonb, jsonb) to authenticated;
grant execute on function confirm_purchase_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Storage: the bill photo
--
-- Its own bucket rather than `issue-photos`, whose write policy is scoped to
-- store_manager — the same reasoning 0008 gave for not reusing
-- `job-card-photos`. Reads stay factory-wide because the store manager has to
-- look at the bill to confirm it.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('bill-photos', 'bill-photos', false)
on conflict (id) do nothing;

drop policy if exists bill_photos_select on storage.objects;
create policy bill_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bill-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
  );

drop policy if exists bill_photos_write on storage.objects;
create policy bill_photos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bill-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and (auth_user_role() = 'procurement' or has_grant('procurePo'))
  );
