-- Accountant module: the money hub.
--
-- Collects client payments, pays confirmed supplier bills, runs payroll with
-- automatic loan/damage/leave deductions, shows loans read-only, raises
-- expenses for someone else to approve, and reports trends.
--
-- The write boundaries below are the point of this migration. Several screens
-- in this module are deliberately read-only because the action belongs to
-- another role, and that has to be enforced by grants and functions rather than
-- by the UI simply not drawing a button.

-- ---------------------------------------------------------------------------
-- po_items.price
--
-- Prompt 6 gave a PO line a quantity but no money. Payables cannot be computed
-- without it, and the Bill Detail screen shows a price per line.
-- ---------------------------------------------------------------------------

alter table po_items add column if not exists price numeric not null default 0;

-- ---------------------------------------------------------------------------
-- Payment ledgers
--
-- Separate append-only tables rather than a JSONB array on the parent: each
-- entry carries a proof photo and a recorder, and a payment record must be
-- permanent once written.
-- ---------------------------------------------------------------------------

create table if not exists invoice_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  amount numeric not null check (amount > 0),
  photo_url text not null,
  recorded_by uuid references profiles(id),
  paid_at timestamptz not null default now()
);
create index if not exists invoice_payments_order_id_idx on invoice_payments (order_id);

create table if not exists po_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id),
  amount numeric not null check (amount > 0),
  photo_url text not null,
  recorded_by uuid references profiles(id),
  paid_at timestamptz not null default now()
);
create index if not exists po_payments_purchase_order_id_idx on po_payments (purchase_order_id);

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------

create table if not exists salary_records (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  person_id uuid not null references profiles(id),
  period text not null,                     -- 'YYYY-MM'; format still to be confirmed
  base_pay numeric not null,
  bonus numeric not null default 0,
  -- Display-only here. Nothing in any built module writes these two yet; the
  -- damage figure most likely ties to the floor manager's per-stage worker
  -- tracking, which has no link to payroll.
  damage_deduction numeric not null default 0,
  damage_stage text,
  leave_deduction numeric not null default 0,
  leave_approved_by uuid references profiles(id),
  paid boolean not null default false,
  paid_at timestamptz,
  paid_photo_url text,
  paid_by uuid references profiles(id)
);
create index if not exists salary_records_factory_id_period_idx on salary_records (factory_id, period);

-- ---------------------------------------------------------------------------
-- Loans — read-only to this module, always
-- ---------------------------------------------------------------------------

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  worker_id uuid not null references profiles(id),
  principal numeric not null,
  installment numeric not null,
  approved boolean not null default false,
  recorded_by uuid references profiles(id),
  recorded_at timestamptz not null default now()
);
create index if not exists loans_factory_id_worker_id_idx on loans (factory_id, worker_id);

-- Rows here are written only as a side effect of pay_salary(), never by a
-- client insert — the accountant has no insert grant on this table at all.
create table if not exists loan_history (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id),
  period text not null,
  amount numeric not null,
  paid_at timestamptz not null default now()
);
create index if not exists loan_history_loan_id_idx on loan_history (loan_id);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

do $$ begin
  create type expense_category as enum (
    'water', 'internet', 'electric', 'machine_repair', 'food', 'marketing', 'maintenance', 'other'
  );
exception when duplicate_object then null;
end $$;
do $$ begin
  create type recurring_type as enum ('none', 'weekly', 'monthly', 'yearly');
exception when duplicate_object then null;
end $$;

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  category expense_category not null,
  other_name text,
  amount numeric not null check (amount > 0),
  description text,
  recurring_type recurring_type not null default 'none',
  photo_url text not null,
  approved boolean not null default false,
  submitted_by uuid references profiles(id),
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint other_name_required
    check (category <> 'other' or (other_name is not null and other_name <> ''))
);
create index if not exists expenses_factory_id_approved_idx on expenses (factory_id, approved);

-- ---------------------------------------------------------------------------
-- Monthly rollup
--
-- The table exists; nothing populates it. The month-close job or view is a
-- separate design problem and is deliberately not invented here. The Stats
-- tab's "current month" figures never read this table — they are recomputed
-- live from real rows, because this month is not closed.
-- ---------------------------------------------------------------------------

create table if not exists monthly_history (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id),
  month_label text not null,                -- e.g. 'Jul 2026'
  income numeric not null,
  payables numeric not null,
  salary numeric not null,
  expenses_by_category jsonb not null default '{}'
);
create index if not exists monthly_history_factory_id_idx on monthly_history (factory_id);

-- ---------------------------------------------------------------------------
-- Server-side money
--
-- The UI caps payment entry at the remaining balance, but that is a nicety.
-- These are the real boundary, so the maths lives here too.
-- ---------------------------------------------------------------------------

/** Total billed for an order, from its billing mode. Mirrors ledgerMath.ts. */
create or replace function order_total_bill(p_order_id uuid)
returns numeric
language sql
stable
as $$
  select case
    when o.billing is null then 0
    when o.billing ->> 'mode' = 'repeat' then
      coalesce(r.total_repeats, 0) * coalesce((o.billing ->> 'repeat_price')::numeric, 0)
    else
      round(
        (coalesce(n.total_stitches, 0) * coalesce(r.total_repeats, 0) / 1000.0)
        * coalesce((o.billing ->> 'stitch_rate_per_1000')::numeric, 0)
      )
  end
  from orders o
  left join lateral (
    select sum(s.repeats) as total_repeats from order_sheets s where s.order_id = o.id
  ) r on true
  left join lateral (
    select sum((entry ->> 'stitches')::numeric) as total_stitches
    from jsonb_array_elements(coalesce(o.needles, '[]'::jsonb)) as entry
  ) n on true
  where o.id = p_order_id;
$$;

create or replace function order_remaining_receivable(p_order_id uuid)
returns numeric
language sql
stable
as $$
  select order_total_bill(p_order_id)
    - coalesce((select damaged_repeats_price from orders where id = p_order_id), 0)
    - coalesce((select sum(amount) from invoice_payments where order_id = p_order_id), 0);
$$;

create or replace function po_remaining_payable(p_po_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce((select sum(price) from po_items where purchase_order_id = p_po_id), 0)
    - coalesce((select sum(amount) from po_payments where purchase_order_id = p_po_id), 0);
$$;

/** Record a client payment against an invoice. Rejects an overpayment. */
create or replace function record_invoice_payment(
  p_order_id uuid,
  p_amount numeric,
  p_photo_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
  v_id uuid;
begin
  if auth_user_role() <> 'accountant' then
    raise exception 'Only an accountant can record a payment';
  end if;

  if not exists (
    select 1 from orders where id = p_order_id and factory_id = auth_factory_id()
  ) then
    raise exception 'Order not found in your factory';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  v_remaining := order_remaining_receivable(p_order_id);

  if p_amount > v_remaining then
    raise exception 'Payment of % exceeds the remaining receivable of %', p_amount, v_remaining;
  end if;

  insert into invoice_payments (order_id, amount, photo_url, recorded_by)
  values (p_order_id, p_amount, p_photo_url, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

/** Pay a confirmed supplier bill. Rejects an overpayment. */
create or replace function pay_bill(
  p_purchase_order_id uuid,
  p_amount numeric,
  p_photo_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
  v_id uuid;
begin
  if auth_user_role() <> 'accountant' then
    raise exception 'Only an accountant can pay a bill';
  end if;

  -- Only a confirmed PO is payable at all; anything earlier is invisible to
  -- this role by policy and unpayable by this function.
  if not exists (
    select 1 from purchase_orders
    where id = p_purchase_order_id
      and factory_id = auth_factory_id()
      and status = 'confirmed'
  ) then
    raise exception 'Purchase order not found, or not confirmed';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  v_remaining := po_remaining_payable(p_purchase_order_id);

  if p_amount > v_remaining then
    raise exception 'Payment of % exceeds the remaining payable of %', p_amount, v_remaining;
  end if;

  insert into po_payments (purchase_order_id, amount, photo_url, recorded_by)
  values (p_purchase_order_id, p_amount, p_photo_url, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

/**
 * Pay a salary, and take that period's loan installment in the same
 * transaction.
 *
 * One function rather than two client calls on purpose: a salary marked paid
 * without its matching loan_history row silently overpays the worker and
 * corrupts the loan balance, and two round trips from a phone on a factory
 * floor will eventually produce exactly that.
 */
create or replace function pay_salary(
  p_salary_record_id uuid,
  p_photo_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
  v_period text;
  v_paid boolean;
  v_loan_id uuid;
  v_installment numeric;
  v_balance numeric;
begin
  if auth_user_role() <> 'accountant' then
    raise exception 'Only an accountant can pay a salary';
  end if;

  select person_id, period, paid
  into v_person, v_period, v_paid
  from salary_records
  where id = p_salary_record_id and factory_id = auth_factory_id();

  if not found then
    raise exception 'Salary record not found in your factory';
  end if;

  if v_paid then
    raise exception 'This salary has already been paid';
  end if;

  update salary_records
  set paid = true,
      paid_at = now(),
      paid_by = auth.uid(),
      paid_photo_url = p_photo_url
  where id = p_salary_record_id;

  -- One approved loan with a balance left, if any: take this period's
  -- installment, capped at whatever is still owed.
  select l.id,
         l.installment,
         l.principal - coalesce((select sum(h.amount) from loan_history h where h.loan_id = l.id), 0)
  into v_loan_id, v_installment, v_balance
  from loans l
  where l.worker_id = v_person
    and l.factory_id = auth_factory_id()
    and l.approved
    and l.principal - coalesce((select sum(h.amount) from loan_history h where h.loan_id = l.id), 0) > 0
  order by l.recorded_at
  limit 1;

  if v_loan_id is not null then
    insert into loan_history (loan_id, period, amount)
    values (v_loan_id, v_period, least(v_installment, v_balance));
  end if;
end;
$$;

revoke execute on function record_invoice_payment(uuid, numeric, text) from public;
revoke execute on function pay_bill(uuid, numeric, text) from public;
revoke execute on function pay_salary(uuid, text) from public;
grant execute on function record_invoice_payment(uuid, numeric, text) to authenticated;
grant execute on function pay_bill(uuid, numeric, text) to authenticated;
grant execute on function pay_salary(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
--
-- What this role may NOT do is the important half:
--   orders            no update grant at all
--   purchase_orders   reads restricted to status = 'confirmed'
--   *_payments        insert and select only, never update or delete
--   salary_records    select only; `paid` moves only through pay_salary
--   loans/history     select only, under any circumstance
--   expenses          insert and select; approval belongs to another role
--   monthly_history   select only
-- ---------------------------------------------------------------------------

alter table invoice_payments enable row level security;
alter table po_payments      enable row level security;
alter table salary_records   enable row level security;
alter table loans            enable row level security;
alter table loan_history     enable row level security;
alter table expenses         enable row level security;
alter table monthly_history  enable row level security;

-- A confirmed PO is the only kind this role can see — enforced here, not in the
-- query, so guessing an id gets you nothing. RESTRICTIVE because 0008 already
-- grants a permissive factory-wide read that a narrower policy would not undo.
drop policy if exists purchase_orders_accountant_scope on purchase_orders;
create policy purchase_orders_accountant_scope on purchase_orders
  as restrictive
  for select to authenticated
  using (auth_user_role() <> 'accountant' or status = 'confirmed');

drop policy if exists invoice_payments_select on invoice_payments;
create policy invoice_payments_select on invoice_payments
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = invoice_payments.order_id and o.factory_id = auth_factory_id()
    )
  );

drop policy if exists po_payments_select on po_payments;
create policy po_payments_select on po_payments
  for select to authenticated
  using (
    exists (
      select 1 from purchase_orders po
      where po.id = po_payments.purchase_order_id and po.factory_id = auth_factory_id()
    )
  );

-- No insert policy on either payments table: rows arrive only through the RPCs
-- above, which run security definer and validate the amount first.

drop policy if exists salary_records_select on salary_records;
create policy salary_records_select on salary_records
  for select to authenticated
  using (factory_id = auth_factory_id());

drop policy if exists loans_select on loans;
create policy loans_select on loans
  for select to authenticated
  using (factory_id = auth_factory_id());

drop policy if exists loan_history_select on loan_history;
create policy loan_history_select on loan_history
  for select to authenticated
  using (
    exists (
      select 1 from loans l
      where l.id = loan_history.loan_id and l.factory_id = auth_factory_id()
    )
  );

drop policy if exists expenses_select on expenses;
create policy expenses_select on expenses
  for select to authenticated
  using (factory_id = auth_factory_id());

drop policy if exists expenses_insert_accountant on expenses;
create policy expenses_insert_accountant on expenses
  for insert to authenticated
  with check (
    factory_id = auth_factory_id()
    and auth_user_role() = 'accountant'
    -- Raised pending, always. Approval is a different role's write, and that
    -- role does not exist yet.
    and approved = false
    and submitted_by = auth.uid()
  );

drop policy if exists monthly_history_select on monthly_history;
create policy monthly_history_select on monthly_history
  for select to authenticated
  using (factory_id = auth_factory_id());

-- ---------------------------------------------------------------------------
-- Storage: payment and expense proof photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('ledger-photos', 'ledger-photos', false)
on conflict (id) do nothing;

drop policy if exists ledger_photos_select on storage.objects;
create policy ledger_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ledger-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
  );

drop policy if exists ledger_photos_write on storage.objects;
create policy ledger_photos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ledger-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and auth_user_role() = 'accountant'
  );
