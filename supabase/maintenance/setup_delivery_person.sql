-- Bring the Delivery Person persona up on a hosted project.
--
-- `seed.sql` does all of this, but it cannot run against a hosted database: it
-- inserts straight into `auth.users`, which leaves GoTrue unable to read the
-- row (see `fix_auth_users.sql`). On hosted, the user is created through the
-- dashboard and everything downstream is keyed on the email instead — the same
-- shape as `link_profiles_by_email.sql`, which this file assumes has run.
--
-- Order of operations:
--   1. Authentication -> Users -> Add user. Email `delivery.a@example.com`,
--      password `password123`, "Auto Confirm User" ticked.
--   2. Run `link_profiles_by_email.sql` — creates the profile that routes this
--      account to the Staff Dashboard.
--   3. Run this file — creates the grants that put cards on that dashboard,
--      and, optionally, data for the three new flows to show.
--
-- Safe to re-run. Every statement either upserts or guards on its own prior
-- application, so running it twice does not duplicate a movement or a return.

-- ---------------------------------------------------------------------------
-- 1. The grants. This is the part that actually matters.
--
-- `profiles.role` gets the account as far as the Staff Dashboard and no
-- further: every card on it, and every RPC behind those cards, is gated on
-- `has_grant()`, which reads this row. Without it the login works and the
-- dashboard is empty — which is the correct behaviour for an employee with no
-- responsibilities set, and is exactly what it looks like if you skip this.
--
-- All five are granted because that combination is the one worth testing: it is
-- the only one that raises the separation-of-duties note, since the same person
-- both moves material and buys it.
-- ---------------------------------------------------------------------------

insert into employees (
  factory_id, name, role, salary_basis, salary_amount,
  contact, address, cnic, responsibilities, profile_id, join_date, status
)
select
  p.factory_id, 'Imran Ali', 'delivery', 'fixed', 34000,
  '03009991009', 'Bund Road, Lahore', '35201-1000009-9',
  array['orderTaking', 'orderReturn', 'orderDelivery', 'procurePo', 'sheetMovement']::responsibility[],
  p.id, current_date - 95, 'active'
from profiles p
join auth.users u on u.id = p.id
where u.email = 'delivery.a@example.com'
-- `employees_profile_id_idx` is the unique partial index 0013 added, so a
-- second run updates the grants rather than creating a second roster row.
on conflict (profile_id) where profile_id is not null do update
set responsibilities = excluded.responsibilities,
    status = 'active';

-- ---------------------------------------------------------------------------
-- 2. Per-partner SLA
--
-- 0016 defaults `sla_hours` to 24 for every existing partner. Spreading them
-- out is what makes the SLA strip's bands visible: they are fixed hours, not a
-- fraction of the agreement, so a 12-hour partner and a 48-hour one behave
-- differently at the same elapsed time.
-- ---------------------------------------------------------------------------

update finishing_partners set sla_hours = case stage_type
  when 'clipping' then 24
  when 'piko' then 12
  when 'press' then 48
end
where sla_hours = 24;

-- ---------------------------------------------------------------------------
-- 3. Demo data for the three new flows — optional.
--
-- Skip everything below if the project already has real movements and returns.
-- It only writes rows this factory has none of, and every insert derives its
-- order and partner from what is already there rather than from a hardcoded id,
-- so it adapts to whatever the project actually holds.
--
-- Repeat codes are derived rather than stored. `repeatCodes()` builds them from
-- the order code and the sheet's position as
-- `{code suffix}-{sheet index + 1}.{repeat}`, so the expression below has to
-- reproduce that exactly or the chips will not match anything else in the app.
-- ---------------------------------------------------------------------------

-- Three movements, one per status, against the three most recent orders that
-- have sheets. The `atPartner` row is sent relative to `now()`, never a literal:
-- the SLA strip computes from `sent_at + sla_hours` against the clock, so a
-- fixed timestamp would read LATE within a day and never show another state.
with partner as (
  select id, factory_id, stage_type, sla_hours
  from finishing_partners
  where status = 'active'
  order by stage_type
  limit 1
),
candidate as (
  select
    o.id as order_id,
    o.factory_id,
    right(o.code, 4) as suffix,
    s.repeats,
    row_number() over (order by o.created_at desc) as rn
  from orders o
  join lateral (
    select repeats from order_sheets where order_id = o.id order by id limit 1
  ) s on true
  where o.factory_id = (select factory_id from partner)
  order by o.created_at desc
  limit 3
)
insert into movements (
  factory_id, finishing_partner_id, order_id, stage, codes, status,
  sla_hours, sent_at, returned_at, damaged_count, drop_off_photo_url, pickup_photo_url, created_by
)
select
  c.factory_id,
  (select id from partner),
  c.order_id,
  (select stage_type from partner),
  (select array_agg(c.suffix || '-1.' || g) from generate_series(1, c.repeats) g),
  case c.rn when 1 then 'ready' when 2 then 'atPartner' else 'returned' end,
  (select sla_hours from partner),
  case c.rn when 1 then null
            when 2 then now() - interval '8 hours'
            else now() - interval '3 days' end,
  case c.rn when 3 then now() - interval '2 days' else null end,
  case c.rn when 3 then 1 else 0 end,
  case c.rn when 1 then null else 'seed/placeholder.jpg' end,
  case c.rn when 3 then 'seed/placeholder.jpg' else null end,
  (select p.id from profiles p join auth.users u on u.id = p.id
   where u.email = 'delivery.a@example.com')
from candidate c
where not exists (
  select 1 from movements m where m.factory_id = c.factory_id
);

-- One pending return against the most recent order, plus the alert banner it is
-- paired with. Inspection writes both together now; this file does the same,
-- because `confirm_return` clears the banner only when no pending request is
-- left on that order — testing that link needs both halves present.
with target as (
  select o.id as order_id, o.factory_id, right(o.code, 4) as suffix
  from orders o
  where exists (select 1 from order_sheets s where s.order_id = o.id)
    and not exists (select 1 from return_requests r where r.factory_id = o.factory_id)
  order by o.created_at desc
  limit 1
),
created as (
  insert into return_requests (factory_id, order_id, status, raised_at, created_by)
  select t.factory_id, t.order_id, 'pending', now() - interval '2 days',
         (select p.id from profiles p join auth.users u on u.id = p.id
          where u.email = 'qa.a@example.com')
  from target t
  returning id, order_id
)
insert into return_request_sheets (return_request_id, repeat_code, defect_type, flagged_by)
select
  c.id,
  (select suffix from target) || '-1.' || v.n,
  v.defect::defect_type,
  (select p.id from profiles p join auth.users u on u.id = p.id
   where u.email = 'qa.a@example.com')
from created c
cross join (values (1, 'stain'), (2, 'misalign')) as v(n, defect);

update orders
set alert_text = '2 repeats returned by QA — take them back to the client.'
where id in (select order_id from return_requests where status = 'pending')
  and alert_text is null;

-- ---------------------------------------------------------------------------
-- Verify
--
-- Expect one row: the email, `delivery_person`, and five grants. An empty
-- `grants` column means step 3 did not find the profile — check that
-- `link_profiles_by_email.sql` ran and that the auth user's email matches
-- exactly.
-- ---------------------------------------------------------------------------

select
  u.email,
  p.role,
  e.name,
  e.responsibilities as grants,
  (select count(*) from movements m where m.factory_id = p.factory_id) as movements,
  (select count(*) from return_requests r where r.factory_id = p.factory_id) as returns
from auth.users u
join profiles p on p.id = u.id
left join employees e on e.profile_id = p.id
where u.email = 'delivery.a@example.com';
