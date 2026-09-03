-- Read-only. Reports which migrations have actually been applied, by looking
-- for an object each one creates.
--
-- Use this instead of re-running a migration to find out: the migrations are
-- one-shot scripts, and re-running raises on the first object that already
-- exists ("policy ... already exists"), which tells you nothing useful.

with checks(migration, object, present) as (
  values
    ('0001_init', 'table orders',
      to_regclass('public.orders') is not null),
    ('0001_init', 'trigger order_sheets_fan_out',
      exists (select 1 from pg_trigger where tgname = 'order_sheets_fan_out')),

    ('0002_rls', 'function auth_factory_id()',
      to_regprocedure('public.auth_factory_id()') is not null),
    ('0002_rls', 'RLS enabled on orders',
      coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.orders')), false)),
    ('0002_rls', 'policy orders_select_same_factory',
      exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'orders'
                and policyname = 'orders_select_same_factory')),

    ('0003_storage', 'bucket client-photos',
      exists (select 1 from storage.buckets where id = 'client-photos')),
    ('0003_storage', 'bucket defect-photos',
      exists (select 1 from storage.buckets where id = 'defect-photos')),

    ('0004_order_proof_photo', 'orders.proof_photo_url added',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'orders'
                and column_name = 'proof_photo_url')),
    ('0004_order_proof_photo', 'order_sheets.proof_photo_url dropped',
      not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'order_sheets'
                    and column_name = 'proof_photo_url')),

    ('0005_submit_order', 'function submit_order(...)',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'submit_order')),

    ('0006_inspection_triggers', 'trigger inspection_units_decided',
      exists (select 1 from pg_trigger where tgname = 'inspection_units_decided')),

    ('0007_floor_manager', 'orders.floor_status added',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'orders'
                and column_name = 'floor_status')),
    ('0007_floor_manager', 'table machines',
      to_regclass('public.machines') is not null),
    ('0007_floor_manager', 'function next_job_card_code()',
      to_regprocedure('public.next_job_card_code()') is not null),
    ('0007_floor_manager', 'bucket job-card-photos',
      exists (select 1 from storage.buckets where id = 'job-card-photos')),

    ('0008_store_manager', 'table stock_items',
      to_regclass('public.stock_items') is not null),
    ('0008_store_manager', 'table purchase_orders',
      to_regclass('public.purchase_orders') is not null),
    ('0008_store_manager', 'table audit_line_items',
      to_regclass('public.audit_line_items') is not null),
    ('0008_store_manager', 'orders.issued_by added',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'orders'
                and column_name = 'issued_by')),
    ('0008_store_manager', 'function issue_order_materials(uuid)',
      to_regprocedure('public.issue_order_materials(uuid)') is not null),
    ('0008_store_manager', 'policy orders_store_manager_scope',
      exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'orders'
                and policyname = 'orders_store_manager_scope')),
    ('0008_store_manager', 'bucket issue-photos',
      exists (select 1 from storage.buckets where id = 'issue-photos')),

    ('0009_accountant', 'po_items.price added',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'po_items'
                and column_name = 'price')),
    ('0009_accountant', 'table invoice_payments',
      to_regclass('public.invoice_payments') is not null),
    ('0009_accountant', 'table salary_records',
      to_regclass('public.salary_records') is not null),
    ('0009_accountant', 'table loans',
      to_regclass('public.loans') is not null),
    ('0009_accountant', 'table expenses',
      to_regclass('public.expenses') is not null),
    ('0009_accountant', 'table monthly_history',
      to_regclass('public.monthly_history') is not null),
    ('0009_accountant', 'function pay_salary(uuid, text)',
      to_regprocedure('public.pay_salary(uuid, text)') is not null),
    ('0009_accountant', 'policy purchase_orders_accountant_scope',
      exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'purchase_orders'
                and policyname = 'purchase_orders_accountant_scope')),
    ('0009_accountant', 'bucket ledger-photos',
      exists (select 1 from storage.buckets where id = 'ledger-photos'))
)
select
  migration,
  object,
  case when present then 'ok' else 'MISSING' end as status
from checks
order by migration, object;
