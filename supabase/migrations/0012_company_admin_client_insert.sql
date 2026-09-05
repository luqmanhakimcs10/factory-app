-- Company Admin: insert on `clients`.
--
-- `0010_company_admin.sql` gave company_admin UPDATE on `clients` and settled
-- the scope question in that file's own comment — "company_admin owns the whole
-- client row" — but only ever wrote the UPDATE policy. INSERT stayed
-- order_taker-only, left over from `0002_rls.sql`, where the only way a client
-- came into existence was mid-intake.
--
-- That is a gap rather than a decision: the Clients screen this role owns has an
-- Add form on it, and an owner adding a client they have not taken an order from
-- yet is the ordinary case for setting billing terms up front. Without this
-- policy that form's Save fails on RLS with nothing on screen explaining why.
--
-- order_taker's own insert policy is untouched and still applies alongside this
-- one — permissive policies OR together, so intake keeps working exactly as it
-- did. The tenant test is repeated here rather than inherited: a WITH CHECK is
-- the only thing standing between an insert and another factory's row.

drop policy if exists clients_insert_company_admin on clients;
create policy clients_insert_company_admin on clients
  for insert to authenticated
  with check (
    factory_id = auth_factory_id()
    and auth_user_role() = 'company_admin'
  );
