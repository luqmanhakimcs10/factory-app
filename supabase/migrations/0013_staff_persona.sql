-- Unified staff persona — Part A: schema and the grants model.
--
-- Order Taker and Procurement stop being logins of their own and become
-- *capabilities* granted to one flexible person. The grant lives on
-- `employees.responsibilities`, which until now was a column nothing read.
--
-- Three things had to be true before any screen could be built on that:
--
--   1. `employees` (the HR roster) and `profiles` (who can sign in) had to be
--      linkable at all. They were deliberately unlinked in 0010; that decision
--      is what this migration reverses, and A1 is the whole of it.
--   2. Every policy that currently reads `profiles.role = 'order_taker'` had to
--      keep working while grant-based accounts come online. The old check is
--      extended, never replaced — see A4.
--   3. `orders.stage` had to grow from six values to seven. Postgres cannot
--      reorder an enum in place and 'coding' does not map onto exactly one new
--      value, so A7 is a real type swap with a backfill, not a rename.
--
-- Written to be re-runnable: every step guards on its own prior application.

-- ---------------------------------------------------------------------------
-- A1. Link `employees` to `profiles`
--
-- Nullable, because most of the roster never signs in: a machine worker is
-- payroll, not a user. The unique index is partial for the same reason — many
-- employees share the absence of a login, but no two may share one.
-- ---------------------------------------------------------------------------

alter table employees add column if not exists profile_id uuid references profiles(id);

create unique index if not exists employees_profile_id_idx
  on employees (profile_id)
  where profile_id is not null;

-- ---------------------------------------------------------------------------
-- A2. Rename the `responsibility` values to the ids the screens are wired to
--
-- Renames, not a new type: `alter type ... rename value` rewrites the label in
-- place, so every array already stored on an employee stays valid and no
-- backfill is needed. Only the seed's literal text has to follow.
-- ---------------------------------------------------------------------------

do $rename$
declare
  pair text[];
begin
  foreach pair slice 1 in array array[
    ['order_taking', 'orderTaking'],
    ['order_returns', 'orderReturn'],
    ['order_delivery', 'orderDelivery'],
    ['inventory_procurement', 'procurePo'],
    ['finishing_partner_sheets', 'sheetMovement']
  ] loop
    if exists (
      select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'responsibility' and e.enumlabel = pair[1]
    ) then
      execute format('alter type responsibility rename value %L to %L', pair[1], pair[2]);
    end if;
  end loop;
end $rename$;

-- ---------------------------------------------------------------------------
-- A3. The grants helper
--
-- One shared check, called from policies and from the RPCs at the foot of this
-- file. SECURITY DEFINER because a policy on `employees` would otherwise have
-- to be satisfied to read the row that decides the policy; `search_path` is
-- pinned for the same reason every other definer function here pins it.
--
-- It can only ever report on the caller's own grants: the row is selected by
-- `profile_id = auth.uid()`, so there is no argument that widens it.
-- ---------------------------------------------------------------------------

create or replace function has_grant(g text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from employees e
    where e.profile_id = auth.uid()
      and g::responsibility = any(e.responsibilities)
      and e.status = 'active'
  );
$$;

revoke execute on function has_grant(text) from public;
grant execute on function has_grant(text) to authenticated;

-- ---------------------------------------------------------------------------
-- A4. RLS — dual-check, not a cutover
--
-- Every policy below previously read `auth_user_role() = 'order_taker'` and now
-- reads that OR the equivalent grant. A dedicated order_taker account keeps
-- exactly the access it had; a granted staff account gains the same. Removing
-- the role arm is a later, separate decision and deliberately not taken here.
--
-- There is no procurement half yet: no policy in this schema is gated on
-- 'procurement', because the Procurement module has not been built. When it
-- is, its policies take the same shape —
-- `auth_user_role() = 'procurement' or has_grant('procurePo')`.
-- ---------------------------------------------------------------------------

drop policy if exists clients_insert_order_taker on clients;
create policy clients_insert_order_taker on clients
  for insert to authenticated
  with check (
    factory_id = auth_factory_id()
    and (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
  );

drop policy if exists clients_update_order_taker on clients;
create policy clients_update_order_taker on clients
  for update to authenticated
  using (
    factory_id = auth_factory_id()
    and (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
  )
  with check (
    factory_id = auth_factory_id()
    and (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
  );

drop policy if exists orders_insert_order_taker on orders;
create policy orders_insert_order_taker on orders
  for insert to authenticated
  with check (
    factory_id = auth_factory_id()
    and (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
  );

drop policy if exists orders_update_order_taker on orders;
create policy orders_update_order_taker on orders
  for update to authenticated
  using (
    factory_id = auth_factory_id()
    and (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
  )
  with check (
    factory_id = auth_factory_id()
    and (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
  );

drop policy if exists orders_delete_order_taker on orders;
create policy orders_delete_order_taker on orders
  for delete to authenticated
  using (
    factory_id = auth_factory_id()
    and (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
    and status = 'draft'
  );

drop policy if exists order_sheets_insert_order_taker on order_sheets;
create policy order_sheets_insert_order_taker on order_sheets
  for insert to authenticated
  with check (
    (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id and o.factory_id = auth_factory_id()
    )
  );

drop policy if exists order_sheets_update_order_taker on order_sheets;
create policy order_sheets_update_order_taker on order_sheets
  for update to authenticated
  using (
    (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id and o.factory_id = auth_factory_id()
    )
  )
  with check (
    (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id and o.factory_id = auth_factory_id()
    )
  );

drop policy if exists order_sheets_delete_order_taker on order_sheets;
create policy order_sheets_delete_order_taker on order_sheets
  for delete to authenticated
  using (
    (auth_user_role() = 'order_taker' or has_grant('orderTaking'))
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id
        and o.factory_id = auth_factory_id()
        and o.status = 'draft'
    )
  );

-- Storage mirrors the table policies, so the same arm is added there. Without
-- this a granted staff account could create an order and then fail to attach
-- its proof photo.
drop policy if exists factory_photos_insert on storage.objects;
create policy factory_photos_insert on storage.objects
  for insert to authenticated
  with check (
    (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      (bucket_id in ('client-photos', 'sheet-proof-photos')
        and (auth_user_role() = 'order_taker' or has_grant('orderTaking')))
      or (bucket_id = 'defect-photos' and auth_user_role() = 'qa_person')
    )
  );

drop policy if exists factory_photos_update on storage.objects;
create policy factory_photos_update on storage.objects
  for update to authenticated
  using (
    (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      (bucket_id in ('client-photos', 'sheet-proof-photos')
        and (auth_user_role() = 'order_taker' or has_grant('orderTaking')))
      or (bucket_id = 'defect-photos' and auth_user_role() = 'qa_person')
    )
  )
  with check (
    (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      (bucket_id in ('client-photos', 'sheet-proof-photos')
        and (auth_user_role() = 'order_taker' or has_grant('orderTaking')))
      or (bucket_id = 'defect-photos' and auth_user_role() = 'qa_person')
    )
  );

drop policy if exists factory_photos_delete on storage.objects;
create policy factory_photos_delete on storage.objects
  for delete to authenticated
  using (
    (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      (bucket_id in ('client-photos', 'sheet-proof-photos')
        and (auth_user_role() = 'order_taker' or has_grant('orderTaking')))
      or (bucket_id = 'defect-photos' and auth_user_role() = 'qa_person')
    )
  );

-- ---------------------------------------------------------------------------
-- A6. Finishing-partner SLA
--
-- The partner row carries the *setting*; a movement carries the *snapshot*.
-- Changing a partner's SLA next month must not retroactively make last week's
-- movement late, so `movements.sla_hours` is copied at creation and never read
-- back from here. That is why this is a plain column and not a join.
-- ---------------------------------------------------------------------------

alter table finishing_partners add column if not exists sla_hours numeric not null default 24;

-- ---------------------------------------------------------------------------
-- A5. Movements and return requests
-- ---------------------------------------------------------------------------

create table if not exists movements (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  finishing_partner_id uuid not null references finishing_partners(id),
  order_id uuid not null references orders(id),
  stage finishing_stage not null,
  codes text[] not null,
  status text not null default 'ready' check (status in ('ready', 'atPartner', 'returned')),
  -- Snapshotted from finishing_partners.sla_hours at creation. See A6.
  sla_hours numeric not null,
  sent_at timestamptz,
  returned_at timestamptz,
  damaged_count int not null default 0,
  drop_off_photo_url text,
  pickup_photo_url text,
  created_by uuid references profiles(id),
  -- Not in the source spec. A movement that has not been dropped off yet has a
  -- null `sent_at`, so without this the Drop-off tab has no stable sort key.
  created_at timestamptz not null default now()
);

create index if not exists movements_factory_id_status_idx on movements (factory_id, status);
create index if not exists movements_order_id_idx on movements (order_id);

create table if not exists return_requests (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  order_id uuid not null references orders(id),
  raised_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'returned')),
  returned_at timestamptz,
  return_photo_url text,
  created_by uuid references profiles(id)
);

create index if not exists return_requests_factory_id_status_idx
  on return_requests (factory_id, status);
create index if not exists return_requests_order_id_idx on return_requests (order_id);

create table if not exists return_request_sheets (
  id uuid primary key default gen_random_uuid(),
  return_request_id uuid not null references return_requests(id) on delete cascade,
  repeat_code text not null,
  defect_type defect_type not null,
  flagged_by uuid references profiles(id)
);

create index if not exists return_request_sheets_request_idx
  on return_request_sheets (return_request_id);

-- RLS. Not in the source spec, and not optional: these are tenant tables in a
-- multi-tenant schema, and Supabase exposes every public table to the Data API.
--
-- Reads are factory-wide, as they are for every other operational table here —
-- the Floor Manager and the Accountant both need to see where an order's
-- sheets physically are. Writes are the narrow part: status transitions happen
-- only through the SECURITY DEFINER RPCs at the foot of this file, so there is
-- deliberately no UPDATE policy on any of the three.
alter table movements             enable row level security;
alter table return_requests       enable row level security;
alter table return_request_sheets enable row level security;

drop policy if exists movements_select on movements;
create policy movements_select on movements
  for select to authenticated
  using (factory_id = auth_factory_id());

-- INFERRED, not specified: the spec never says who *creates* a movement. The
-- two candidates are the floor manager dispatching finishing work and the
-- person who physically carries the sheets, so both can. Narrow this once the
-- creation screen exists and names one of them.
drop policy if exists movements_insert on movements;
create policy movements_insert on movements
  for insert to authenticated
  with check (
    factory_id = auth_factory_id()
    and (auth_user_role() = 'floor_manager' or has_grant('sheetMovement'))
  );

drop policy if exists return_requests_select on return_requests;
create policy return_requests_select on return_requests
  for select to authenticated
  using (factory_id = auth_factory_id());

-- No INSERT policy on purpose. Return requests are raised by the inspection
-- trigger (Part B3), which runs SECURITY DEFINER — the same reasoning as
-- `inspection_units` in 0002_rls.sql: rows the client cannot forge.

drop policy if exists return_request_sheets_select on return_request_sheets;
create policy return_request_sheets_select on return_request_sheets
  for select to authenticated
  using (
    exists (
      select 1 from return_requests r
      where r.id = return_request_sheets.return_request_id
        and r.factory_id = auth_factory_id()
    )
  );

-- ---------------------------------------------------------------------------
-- A7. `order_stage`: six values to seven
--
-- 'coding' ("QA Coding") disappears and three floor phases become visible on
-- the timeline. Postgres cannot drop or reorder enum values in place, so this
-- is a new type, a backfill, and a swap.
--
-- The backfill reads `floor_status` in preference to `stage` for the three new
-- middle values, because `stage` never distinguished them: an order in
-- materials collection carried `stage = 'coding'` and only `floor_status` knew
-- better.
-- ---------------------------------------------------------------------------

do $stage$ begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'order_stage' and e.enumlabel = 'coding'
  ) then
    create type order_stage_v2 as enum (
      'inspection', 'jobcard', 'materialCollection', 'machineAssignment',
      'production', 'finishing', 'delivery'
    );

    alter table orders add column stage_v2 order_stage_v2;

    update orders set stage_v2 = case
      when stage = 'inspection' then 'inspection'
      when floor_status in ('materialRequested', 'readyToCollect') then 'materialCollection'
      when floor_status = 'machineAssigning' then 'machineAssignment'
      when floor_status in ('productionAwaiting', 'inProduction') then 'production'
      when stage = 'finishing' then 'finishing'
      when stage = 'delivery' then 'delivery'
      else 'jobcard'          -- covers old 'coding' and 'jobcard'
    end::order_stage_v2
    where stage is not null;

    alter table orders drop column stage;
    alter table orders rename column stage_v2 to stage;
    drop type order_stage;
    alter type order_stage_v2 rename to order_stage;
  end if;
end $stage$;

-- The two triggers that write `stage` both named a value that no longer
-- exists. Recreated here rather than left to fail on the next inspection
-- decision — a plpgsql body is not checked until it runs, so dropping the enum
-- value did not surface either of these.

-- Every unit inspected -> the order leaves Initial Inspection. It used to land
-- on 'coding'; the seven-stage list has no separate coding step, and the
-- backfill above maps the same orders to 'jobcard'.
create or replace function on_inspection_unit_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending int;
  v_returned int;
begin
  select count(*) into v_pending
  from inspection_units
  where order_id = new.order_id and status = 'pending';

  if v_pending = 0 then
    update orders
    set stage = 'jobcard'
    where id = new.order_id and stage = 'inspection';
  end if;

  if new.status = 'returned' then
    select count(*) into v_returned
    from inspection_units
    where order_id = new.order_id and status = 'returned';

    update orders
    set alert_text = v_returned
      || case when v_returned = 1 then ' item' else ' items' end
      || ' returned at inspection — return to the client.'
    where id = new.order_id;
  end if;

  return null;
end;
$$;

-- The reconciliation trigger now has a coarse value for every floor phase, so
-- the interpretation recorded in 0007 — "materialRequested / readyToCollect /
-- machineAssigning keep whatever stage they had" — is retired. That mapping is
-- the same one the backfill above used; the two must not disagree.
create or replace function sync_stage_from_floor_status()
returns trigger
language plpgsql
as $$
begin
  if new.floor_status is distinct from old.floor_status then
    case new.floor_status
      when 'queued' then new.stage := 'jobcard';
      when 'materialRequested' then new.stage := 'materialCollection';
      when 'readyToCollect' then new.stage := 'materialCollection';
      when 'machineAssigning' then new.stage := 'machineAssignment';
      when 'productionAwaiting' then new.stage := 'production';
      when 'inProduction' then new.stage := 'production';
      else null;
    end case;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A8. Delivery, not production-readiness, is what makes an invoice
--
-- An order can be fully produced and still owe nothing until it is in the
-- client's hands. `delivered_at` is that fact; the Accountant's Receivables tab
-- gates on it from here on.
--
-- The photo and signature are stored beside it: `mark_delivered` is handed both
-- and there would otherwise be nowhere to put them.
-- ---------------------------------------------------------------------------

alter table orders add column if not exists delivered_at timestamptz;
alter table orders add column if not exists delivery_photo_url text;
alter table orders add column if not exists delivery_signature_name text;

-- ---------------------------------------------------------------------------
-- E5. The unified persona's own role
--
-- A new `user_role` value rather than a reuse of 'delivery_person': the legacy
-- dedicated roles stay supported per A4, and a person holding grants is not
-- the same thing as a person whose whole job title is delivery. Added here and
-- used by nothing in this file — the routing that consumes it is client-side.
-- ---------------------------------------------------------------------------

alter type user_role add value if not exists 'staff';

-- ---------------------------------------------------------------------------
-- A9. RPCs
--
-- All four are SECURITY DEFINER, which means they bypass RLS and therefore
-- have to re-establish both halves of the boundary themselves: the tenant
-- (`factory_id = auth_factory_id()`) and the capability (`has_grant`). Neither
-- check is redundant — a grant does not imply a factory, and a factory does not
-- imply a grant.
-- ---------------------------------------------------------------------------

create or replace function confirm_drop_off(p_movement_id uuid, p_photo_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_grant('sheetMovement') then
    raise exception 'Only a person granted sheet movement can drop off sheets';
  end if;

  if p_photo_url is null then
    raise exception 'A drop-off needs proof of handoff';
  end if;

  update movements
  set status = 'atPartner',
      sent_at = now(),
      drop_off_photo_url = p_photo_url
  where id = p_movement_id
    and factory_id = auth_factory_id()
    and status = 'ready';

  if not found then
    raise exception 'No movement awaiting drop-off with that id in this factory';
  end if;
end;
$$;

create or replace function confirm_pickup(
  p_movement_id uuid,
  p_photo_url text,
  p_damaged_codes text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codes text[];
begin
  if not has_grant('sheetMovement') then
    raise exception 'Only a person granted sheet movement can collect sheets';
  end if;

  if p_photo_url is null then
    raise exception 'A pickup needs a photo';
  end if;

  select codes into v_codes
  from movements
  where id = p_movement_id
    and factory_id = auth_factory_id()
    and status = 'atPartner';

  if v_codes is null then
    raise exception 'No movement at a partner with that id in this factory';
  end if;

  -- A damaged code the movement never carried is a client bug, not a partial
  -- success: rejected outright rather than counted.
  if not (coalesce(p_damaged_codes, '{}'::text[]) <@ v_codes) then
    raise exception 'Damaged codes must all belong to this movement';
  end if;

  update movements
  set status = 'returned',
      returned_at = now(),
      pickup_photo_url = p_photo_url,
      damaged_count = coalesce(array_length(p_damaged_codes, 1), 0)
  where id = p_movement_id;
end;
$$;

create or replace function mark_delivered(
  p_order_id uuid,
  p_photo_url text,
  p_signature_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_grant('orderDelivery') then
    raise exception 'Only a person granted order delivery can mark an order delivered';
  end if;

  if p_photo_url is null or coalesce(trim(p_signature_name), '') = '' then
    raise exception 'A delivery needs both a photo and a client signature';
  end if;

  update orders
  set delivered_at = now(),
      stage = 'delivery',
      delivery_photo_url = p_photo_url,
      delivery_signature_name = p_signature_name
  where id = p_order_id
    and factory_id = auth_factory_id()
    and delivered_at is null;

  if not found then
    raise exception 'No undelivered order with that id in this factory';
  end if;
end;
$$;

create or replace function confirm_return(p_return_request_id uuid, p_photo_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if not has_grant('orderReturn') then
    raise exception 'Only a person granted order returns can confirm a return';
  end if;

  if p_photo_url is null then
    raise exception 'A return needs a photo';
  end if;

  update return_requests
  set status = 'returned',
      returned_at = now(),
      return_photo_url = p_photo_url
  where id = p_return_request_id
    and factory_id = auth_factory_id()
    and status = 'pending'
  returning order_id into v_order_id;

  if v_order_id is null then
    raise exception 'No pending return request with that id in this factory';
  end if;

  -- Clear the Order Taker's banner only for *this* order, and only once it has
  -- nothing left outstanding. An order with two damaged sheets raised
  -- separately keeps its alert until the second one comes back.
  update orders o
  set alert_text = null
  where o.id = v_order_id
    and not exists (
      select 1 from return_requests r
      where r.order_id = v_order_id and r.status = 'pending'
    );
end;
$$;

revoke execute on function confirm_drop_off(uuid, text) from public;
revoke execute on function confirm_pickup(uuid, text, text[]) from public;
revoke execute on function mark_delivered(uuid, text, text) from public;
revoke execute on function confirm_return(uuid, text) from public;
grant execute on function confirm_drop_off(uuid, text) to authenticated;
grant execute on function confirm_pickup(uuid, text, text[]) to authenticated;
grant execute on function mark_delivered(uuid, text, text) to authenticated;
grant execute on function confirm_return(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: the four new proof photos
--
-- One bucket, not four. Every photo here is proof that a physical handoff
-- happened, taken by the same person on the same round; splitting them by
-- screen would give four buckets with one identical policy each.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', false)
on conflict (id) do nothing;

drop policy if exists staff_photos_select on storage.objects;
create policy staff_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
  );

drop policy if exists staff_photos_write on storage.objects;
create policy staff_photos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      has_grant('sheetMovement') or has_grant('orderDelivery') or has_grant('orderReturn')
    )
  );
