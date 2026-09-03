-- Super Admin — the platform operator's console.
--
-- Everything below sits one level ABOVE the tenant boundary that Prompts 1-9
-- built. A factory employee is scoped to their own `factory_id`; a platform
-- admin legitimately reads and writes across every tenant. Those are different
-- kinds of permission and this migration keeps them mechanically apart:
--
--   * `profiles.is_platform_admin` is a separate boolean, NOT another value in
--     the `user_role` enum. Every factory-scoped policy written since 0002
--     branches on that enum; adding a platform tier to it is how one typo in
--     one policy turns into a cross-tenant read.
--   * The new tables are default-deny. They carry exactly one policy each, and
--     it checks the boolean directly — never a `factory_id` match, because a
--     factory match is meaningless for a role that spans all of them.
--   * `factories` keeps its existing tenant-scoped select from 0002. That
--     policy is what stops a factory user reading another tenant's row, and it
--     is also how every module's TopBar reads its own factory name.

-- ---------------------------------------------------------------------------
-- 2. The platform-admin flag
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists is_platform_admin boolean not null default false;

/**
 * True only for a platform operator.
 *
 * Security definer so it can read `profiles` regardless of the caller's own
 * policies, and `stable` so the planner calls it once per statement. Mirrors
 * `auth_factory_id()` / `auth_user_role()` from 0002.
 */
create or replace function auth_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_platform_admin from profiles where id = auth.uid()), false);
$$;

revoke execute on function auth_is_platform_admin() from public;
grant execute on function auth_is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 1a. Extend `factories` in place
--
-- Same call as `clients` in 0010: the mockup's "Factory" entity and this table
-- are the same real-world thing, so a second table would fork the tenant list
-- every other module's factory_id points at.
-- ---------------------------------------------------------------------------

alter table factories add column if not exists location text;
alter table factories add column if not exists responsible_person text;
alter table factories add column if not exists cnic_number text;
alter table factories add column if not exists cnic_photo_url text;
alter table factories add column if not exists phone_number text;
-- Manually entered, deliberately not derived from each tenant's `employees`
-- table: a live cross-tenant read is a bigger architectural commitment than
-- this pass makes.
alter table factories add column if not exists employees_count int;
alter table factories add column if not exists subscription_fee numeric;
alter table factories add column if not exists starting_date date;
alter table factories add column if not exists due_date date;
alter table factories add column if not exists status text not null default 'active'
  check (status in ('active', 'inactive'));

-- ---------------------------------------------------------------------------
-- 1b. Subscription payments
--
-- `due_date` is stamped when the invoice is generated and never moves.
-- `paid_date` is written only on the transition to 'paid'. The source mockup
-- collapsed both into one `date` field, which is why it could not tell an
-- overdue invoice from a recently settled one.
-- ---------------------------------------------------------------------------

create table if not exists subscription_payments (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  amount numeric not null,
  description text not null default 'Invoice',
  due_date date,
  paid_date date,
  status text not null default 'pending' check (status in ('paid', 'pending')),
  created_at timestamptz not null default now()
);
create index if not exists subscription_payments_factory_id_status_idx
  on subscription_payments (factory_id, status);

-- ---------------------------------------------------------------------------
-- 1c. Modules registry and per-factory gating
--
-- The registry the original FactoryERP spec described and Prompt 1 never built.
-- This migration creates the tables and the console toggles them; it does NOT
-- wire enforcement into any existing RLS policy. That touches every policy
-- written since Prompt 1 and gets its own pass — see §7 of the prompt.
-- ---------------------------------------------------------------------------

create table if not exists modules (
  id text primary key,
  label text not null
);

insert into modules (id, label) values
  ('order_lifecycle', 'Order Lifecycle'),
  ('inventory_procurement', 'Inventory & Procurement'),
  ('machine_workforce', 'Machine & Workforce'),
  ('finance_reports', 'Finance & Reports')
on conflict (id) do update set label = excluded.label;

create table if not exists factory_modules (
  factory_id uuid not null references factories(id),
  module_id text not null references modules(id),
  enabled boolean not null default true,
  enabled_at timestamptz not null default now(),
  primary key (factory_id, module_id)
);

-- ---------------------------------------------------------------------------
-- 2. RLS — default-deny, platform admin only
--
-- Each new table gets RLS enabled and exactly one FOR ALL policy. With RLS on
-- and no other policy present, every non-platform-admin is denied by default:
-- there is no permissive policy for them to match.
-- ---------------------------------------------------------------------------

alter table subscription_payments enable row level security;
alter table modules               enable row level security;
alter table factory_modules       enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['subscription_payments', 'modules', 'factory_modules'] loop
    execute format('drop policy if exists %I on %I', t || '_platform_admin', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (auth_is_platform_admin()) with check (auth_is_platform_admin())',
      t || '_platform_admin', t
    );
  end loop;
end $$;

-- `factories` already carries `factories_select_own` from 0002 (id =
-- auth_factory_id()). That stays exactly as it is — it is the tenant boundary
-- for ordinary users, and removing it would blank the factory name in every
-- module's TopBar. The platform admin gets its own policy alongside it.
drop policy if exists factories_platform_admin on factories;
create policy factories_platform_admin on factories
  for all to authenticated
  using (auth_is_platform_admin())
  with check (auth_is_platform_admin());

-- profiles: a platform admin needs to read across tenants too. 0002's
-- `profiles_select_same_factory` stays for everyone else.
drop policy if exists profiles_select_platform_admin on profiles;
create policy profiles_select_platform_admin on profiles
  for select to authenticated
  using (auth_is_platform_admin());

-- ---------------------------------------------------------------------------
-- 6. Storage: factory documents (CNIC photos)
--
-- Same `{factoryId}/{file}` shape as every other bucket, but written and read
-- by the platform admin rather than by a tenant, so the policies check the
-- flag instead of the folder's factory prefix.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('factory-docs', 'factory-docs', false)
on conflict (id) do nothing;

drop policy if exists factory_docs_platform_admin on storage.objects;
create policy factory_docs_platform_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'factory-docs' and auth_is_platform_admin())
  with check (bucket_id = 'factory-docs' and auth_is_platform_admin());
