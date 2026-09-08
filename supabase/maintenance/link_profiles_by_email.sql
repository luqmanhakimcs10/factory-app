-- Fallback path: attach profiles to users created through the Supabase
-- dashboard rather than by the seed.
--
-- Use this when `fix_auth_users.sql` did not resolve the sign-in error. Delete
-- the seeded rows from Authentication -> Users, re-add them there with
-- "Auto Confirm User" ticked (same emails, password `password123`), then run
-- this. Dashboard-created users are guaranteed to satisfy whatever GoTrue
-- version this project runs, which a hand-written INSERT is not.
--
-- Re-add ALL NINE emails listed below, not only the role you are chasing.
-- `profiles.id` references `auth.users`, so deleting a user takes its profile
-- with it: recreating only three of them is what leaves `store.a@` and
-- `accounts.a@` failing sign-in, and leaves the accountant's payroll screens
-- with no `worker` row to pay.
--
-- Matches on email, so the new UUIDs do not need to be known or edited in.
-- Safe to re-run; re-running also repairs a profile whose role is wrong.

insert into profiles (id, factory_id, role, full_name)
select
  u.id,
  '11111111-1111-1111-1111-111111111111',
  seed.role::user_role,
  seed.full_name
from (
  values
    ('taker.a@example.com',    'order_taker',   'Order Taker A'),
    ('qa.a@example.com',       'qa_person',     'QA A'),
    ('floor.a@example.com',    'floor_manager', 'Floor Manager A'),
    ('store.a@example.com',    'store_manager', 'Store Manager A'),
    ('accounts.a@example.com', 'accountant',    'Accountant A'),
    -- Never signs in, but salary and loans key on a profile row.
    ('worker.a@example.com',   'worker',        'Imran Ali'),
    ('admin.a@example.com',    'company_admin', 'Company Admin A'),
    -- The unified staff persona. This row only decides that the account lands
    -- on the Staff Dashboard; what it can actually reach comes from the grants
    -- on its `employees` row — run `setup_delivery_person.sql` after this, or
    -- the dashboard renders empty.
    ('delivery.a@example.com', 'delivery_person', 'Imran Ali')
    -- super.a@example.com is deliberately NOT in this list: a platform admin
    -- belongs to the Platform Operations tenant and needs is_platform_admin
    -- set, neither of which this factory-scoped repair script does. See the
    -- block at the bottom of this file.
) as seed(email, role, full_name)
join auth.users u on u.email = seed.email
on conflict (id) do update
set factory_id = excluded.factory_id,
    role = excluded.role,
    full_name = excluded.full_name;

-- Should list nine rows, each with a factory and a role. Any row with a NULL
-- role is an auth user with no profile: that account signs in but lands on the
-- "role isn't available yet" placeholder instead of its module.
select u.email, p.role, f.name as factory
from auth.users u
left join profiles p on p.id = u.id
left join factories f on f.id = p.factory_id
order by u.email;

-- The platform operator, kept separate from the factory roster above because
-- it is scoped to the Platform Operations tenant and gated by a boolean rather
-- than by a role.
insert into factories (id, name, status) values
  ('99999999-9999-4999-8999-999999999999', 'Platform Operations', 'active')
on conflict (id) do nothing;

insert into profiles (id, factory_id, role, full_name, is_platform_admin)
select u.id, '99999999-9999-4999-8999-999999999999', 'super_admin', 'Platform Operator', true
from auth.users u
where u.email = 'super.a@example.com'
on conflict (id) do update
set factory_id = excluded.factory_id,
    role = excluded.role,
    is_platform_admin = true;
