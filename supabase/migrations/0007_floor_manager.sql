-- Floor Manager module.
--
-- This module owns one new table (`machines`); everything else hangs off the
-- existing `orders` / `order_sheets` rows, because a job card, a materials
-- request and a production run are all facts *about an order*, not separate
-- entities that could drift away from it.

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

alter table orders add column if not exists design_code text;
alter table orders add column if not exists job_card_code text;
-- [{ color_id, stitches }] — QA-owned, seeded after inspection.
alter table orders add column if not exists threads jsonb;
-- [{ color_id, needle, stitches }] — Floor-Manager-owned.
alter table orders add column if not exists needles jsonb;
-- [{ color_id, qty_grams }]
alter table orders add column if not exists materials jsonb;
-- { clipping: bool, piko: bool, press: bool }
alter table orders add column if not exists stages jsonb;
alter table orders add column if not exists excluded_note text;
alter table orders add column if not exists damaged_repeats_price numeric;
-- { mode: 'stitch'|'repeat', stitch_rate_per_1000, repeat_price }
alter table orders add column if not exists billing jsonb;

-- The Floor Manager's granular workflow position. Deliberately separate from
-- the coarse `stage` column: `stage` drives the six-label Timeline that the
-- Order Taker's Order Detail screen already reads, and has no room for these
-- distinctions.
do $$ begin
  create type floor_status as enum (
    'queued', 'materialRequested', 'readyToCollect', 'machineAssigning',
    'productionAwaiting', 'inProduction'
  );
exception when duplicate_object then null;
end $$;
alter table orders add column if not exists floor_status floor_status;

create index if not exists orders_floor_status_idx on orders (floor_status);

-- ---------------------------------------------------------------------------
-- order_sheets — per-sheet production progress
-- ---------------------------------------------------------------------------

do $$ begin
  create type sheet_stage as enum (
    'producing', 'readyForStage', 'stageFormDone', 'readyForFinal', 'ready'
  );
exception when duplicate_object then null;
end $$;
alter table order_sheets add column if not exists stage sheet_stage;
alter table order_sheets add column if not exists stage_index int default 0;
-- [{ key, delivery_person, worker_name }]
alter table order_sheets add column if not exists stage_records jsonb default '[]';

-- ---------------------------------------------------------------------------
-- machines
-- ---------------------------------------------------------------------------

create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  label text not null,
  status text not null default 'idle' check (status in ('idle', 'running')),
  -- { order_id, code, client, design_code, needles } | null
  current_job jsonb,
  -- { order_id, code, client, needles } | null
  last_job jsonb,
  created_at timestamptz not null default now()
);
create index if not exists machines_factory_id_idx on machines (factory_id);

-- ---------------------------------------------------------------------------
-- Coarse-stage reconciliation
--
-- `stage` is derived from `floor_status` rather than replaced by it, so the
-- Order Taker's timeline keeps working untouched.
--
-- NOTE, and this is an interpretation rather than a stated rule: only 'queued'
-- and the two production statuses have a coarse equivalent. An order sitting in
-- materialRequested / readyToCollect / machineAssigning keeps whatever `stage`
-- it had — in practice 'coding' — so the Order Taker's timeline still reads
-- "QA Coding" right through the inventory and machine-assignment phases. If
-- that looks wrong on real data, mapping those three to 'jobcard' here is a
-- one-line change.
-- ---------------------------------------------------------------------------

create or replace function sync_stage_from_floor_status()
returns trigger
language plpgsql
as $$
begin
  if new.floor_status is distinct from old.floor_status then
    if new.floor_status = 'queued' then
      new.stage := 'jobcard';
    elsif new.floor_status in ('productionAwaiting', 'inProduction') then
      new.stage := 'production';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_sync_stage on orders;
create trigger orders_sync_stage
before update of floor_status on orders
for each row
execute function sync_stage_from_floor_status();

-- ---------------------------------------------------------------------------
-- Code generation, mirroring next_order_code in 0005
-- ---------------------------------------------------------------------------

create or replace function next_prefixed_code(p_factory_id uuid, p_prefix text, p_column text)
returns text
language plpgsql
as $$
declare
  v_seq int;
  v_code text;
  v_taken boolean;
begin
  -- One lock per (factory, prefix) so design codes and job-card codes do not
  -- serialise against each other.
  perform pg_advisory_xact_lock(hashtext(p_factory_id::text || ':' || p_prefix));

  execute format(
    'select count(*) from orders where factory_id = $1 and %I is not null',
    p_column
  ) into v_seq using p_factory_id;

  loop
    v_seq := v_seq + 1;
    v_code := p_prefix || '-' || lpad(v_seq::text, 4, '0');

    execute format('select exists (select 1 from orders where %I = $1)', p_column)
    into v_taken using v_code;

    exit when not v_taken;
  end loop;

  return v_code;
end;
$$;

create or replace function next_design_code()
returns text
language sql
as $$
  select next_prefixed_code(auth_factory_id(), 'DSN', 'design_code');
$$;

create or replace function next_job_card_code()
returns text
language sql
as $$
  select next_prefixed_code(auth_factory_id(), 'JC', 'job_card_code');
$$;

revoke execute on function next_prefixed_code(uuid, text, text) from public;
revoke execute on function next_design_code() from public;
revoke execute on function next_job_card_code() from public;
grant execute on function next_design_code() to authenticated;
grant execute on function next_job_card_code() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table machines enable row level security;

drop policy if exists machines_select_same_factory on machines;
create policy machines_select_same_factory on machines
  for select to authenticated
  using (factory_id = auth_factory_id());

drop policy if exists machines_write_floor_manager on machines;
create policy machines_write_floor_manager on machines
  for update to authenticated
  using (factory_id = auth_factory_id() and auth_user_role() = 'floor_manager')
  with check (factory_id = auth_factory_id() and auth_user_role() = 'floor_manager');

drop policy if exists machines_insert_floor_manager on machines;
create policy machines_insert_floor_manager on machines
  for insert to authenticated
  with check (factory_id = auth_factory_id() and auth_user_role() = 'floor_manager');

-- The floor manager drives an order from job card through production, so it
-- needs update on both tables — still only inside its own factory.
drop policy if exists orders_update_floor_manager on orders;
create policy orders_update_floor_manager on orders
  for update to authenticated
  using (factory_id = auth_factory_id() and auth_user_role() = 'floor_manager')
  with check (factory_id = auth_factory_id() and auth_user_role() = 'floor_manager');

drop policy if exists order_sheets_update_floor_manager on order_sheets;
create policy order_sheets_update_floor_manager on order_sheets
  for update to authenticated
  using (
    auth_user_role() = 'floor_manager'
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id and o.factory_id = auth_factory_id()
    )
  )
  with check (
    auth_user_role() = 'floor_manager'
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id and o.factory_id = auth_factory_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: job-card photos (design sheet re-shoot, materials collection proof)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('job-card-photos', 'job-card-photos', false)
on conflict (id) do nothing;

drop policy if exists job_card_photos_select on storage.objects;
create policy job_card_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-card-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
  );

drop policy if exists job_card_photos_write on storage.objects;
create policy job_card_photos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-card-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and auth_user_role() = 'floor_manager'
  );

-- ---------------------------------------------------------------------------
-- Realtime
--
-- The Requested Detail screen watches for the Store Manager flipping
-- materialRequested -> readyToCollect. That role has no screens yet, so this
-- subscription is the only way this module learns about the transition.
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table orders;
exception
  when duplicate_object then null;
end $$;
