-- FactoryERP — row-level security.
--
-- Tenant isolation is absolute: every policy below is anchored to the caller's
-- own profiles.factory_id, including for super_admin. Cross-factory tooling is
-- a separate concern and deliberately has no path through these policies.

-- ---------------------------------------------------------------------------
-- Helpers
--
-- SECURITY DEFINER so that reading the caller's own profile does not re-enter
-- the policies on `profiles` — a plain subquery there recurses infinitely.
-- ---------------------------------------------------------------------------

create or replace function auth_factory_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select factory_id from profiles where id = auth.uid();
$$;

create or replace function auth_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

revoke execute on function auth_factory_id() from public;
revoke execute on function auth_user_role() from public;
grant execute on function auth_factory_id() to authenticated;
grant execute on function auth_user_role() to authenticated;

alter table factories        enable row level security;
alter table profiles         enable row level security;
alter table clients          enable row level security;
alter table orders           enable row level security;
alter table order_sheets     enable row level security;
alter table inspection_units enable row level security;

-- ---------------------------------------------------------------------------
-- factories / profiles — read-only to the app; provisioning is out of scope.
-- ---------------------------------------------------------------------------

drop policy if exists factories_select_own on factories;
create policy factories_select_own on factories
  for select to authenticated
  using (id = auth_factory_id());

drop policy if exists profiles_select_same_factory on profiles;
create policy profiles_select_same_factory on profiles
  for select to authenticated
  using (factory_id = auth_factory_id());

-- ---------------------------------------------------------------------------
-- clients — order_taker writes, everyone in the factory reads.
-- ---------------------------------------------------------------------------

drop policy if exists clients_select_same_factory on clients;
create policy clients_select_same_factory on clients
  for select to authenticated
  using (factory_id = auth_factory_id());

drop policy if exists clients_insert_order_taker on clients;
create policy clients_insert_order_taker on clients
  for insert to authenticated
  with check (
    factory_id = auth_factory_id()
    and auth_user_role() = 'order_taker'
  );

drop policy if exists clients_update_order_taker on clients;
create policy clients_update_order_taker on clients
  for update to authenticated
  using (
    factory_id = auth_factory_id()
    and auth_user_role() = 'order_taker'
  )
  with check (
    -- The WITH CHECK clause repeats the tenant test so a row cannot be updated
    -- into another factory.
    factory_id = auth_factory_id()
    and auth_user_role() = 'order_taker'
  );

-- ---------------------------------------------------------------------------
-- orders — order_taker writes, qa_person (and the rest of the factory) reads.
-- ---------------------------------------------------------------------------

drop policy if exists orders_select_same_factory on orders;
create policy orders_select_same_factory on orders
  for select to authenticated
  using (factory_id = auth_factory_id());

drop policy if exists orders_insert_order_taker on orders;
create policy orders_insert_order_taker on orders
  for insert to authenticated
  with check (
    factory_id = auth_factory_id()
    and auth_user_role() = 'order_taker'
  );

drop policy if exists orders_update_order_taker on orders;
create policy orders_update_order_taker on orders
  for update to authenticated
  using (
    factory_id = auth_factory_id()
    and auth_user_role() = 'order_taker'
  )
  with check (
    factory_id = auth_factory_id()
    and auth_user_role() = 'order_taker'
  );

drop policy if exists orders_delete_order_taker on orders;
create policy orders_delete_order_taker on orders
  for delete to authenticated
  using (
    factory_id = auth_factory_id()
    and auth_user_role() = 'order_taker'
    -- Only an unsubmitted order can be discarded.
    and status = 'draft'
  );

-- ---------------------------------------------------------------------------
-- order_sheets — no factory_id column, so tenancy joins through orders.
-- ---------------------------------------------------------------------------

drop policy if exists order_sheets_select_same_factory on order_sheets;
create policy order_sheets_select_same_factory on order_sheets
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_sheets.order_id
        and o.factory_id = auth_factory_id()
    )
  );

drop policy if exists order_sheets_insert_order_taker on order_sheets;
create policy order_sheets_insert_order_taker on order_sheets
  for insert to authenticated
  with check (
    auth_user_role() = 'order_taker'
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id
        and o.factory_id = auth_factory_id()
    )
  );

drop policy if exists order_sheets_update_order_taker on order_sheets;
create policy order_sheets_update_order_taker on order_sheets
  for update to authenticated
  using (
    auth_user_role() = 'order_taker'
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id
        and o.factory_id = auth_factory_id()
    )
  )
  with check (
    auth_user_role() = 'order_taker'
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id
        and o.factory_id = auth_factory_id()
    )
  );

drop policy if exists order_sheets_delete_order_taker on order_sheets;
create policy order_sheets_delete_order_taker on order_sheets
  for delete to authenticated
  using (
    auth_user_role() = 'order_taker'
    and exists (
      select 1 from orders o
      where o.id = order_sheets.order_id
        and o.factory_id = auth_factory_id()
        and o.status = 'draft'
    )
  );

-- ---------------------------------------------------------------------------
-- inspection_units — qa_person updates, the factory reads.
--
-- There is no INSERT policy on purpose: rows are created only by the
-- SECURITY DEFINER fan-out trigger on order_sheets, so the client cannot get
-- the counts out of step with the sheets by inserting its own.
-- ---------------------------------------------------------------------------

drop policy if exists inspection_units_select_same_factory on inspection_units;
create policy inspection_units_select_same_factory on inspection_units
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = inspection_units.order_id
        and o.factory_id = auth_factory_id()
    )
  );

drop policy if exists inspection_units_update_qa on inspection_units;
create policy inspection_units_update_qa on inspection_units
  for update to authenticated
  using (
    auth_user_role() = 'qa_person'
    and exists (
      select 1 from orders o
      where o.id = inspection_units.order_id
        and o.factory_id = auth_factory_id()
    )
  )
  with check (
    auth_user_role() = 'qa_person'
    and exists (
      select 1 from orders o
      where o.id = inspection_units.order_id
        and o.factory_id = auth_factory_id()
    )
  );
