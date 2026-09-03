-- ONE-OFF CLEANUP. Destructive.
--
-- Removes the "Test Factory B" tenant that earlier versions of seed.sql created.
-- The seed no longer creates it, and rls_smoke.sql now builds its own throwaway
-- second tenant inside a transaction — so a permanent Factory B is left over
-- from an older reset and nothing needs it any more.
--
-- Scoped entirely to factory 22222222-2222-2222-2222-222222222222 and its two
-- users. Nothing belonging to Al-Rehman Embroidery is touched.
--
-- Run once, against the database that still has the row. Safe to re-run: every
-- statement is a no-op once the rows are gone.

begin;

-- Deletion order follows the foreign keys:
--   orders.created_by      -> profiles      (no cascade)
--   orders.client_id       -> clients       (no cascade)
--   order_sheets           -> orders        (on delete cascade)
--   inspection_units       -> orders/sheets (on delete cascade)
--   profiles.id            -> auth.users    (on delete cascade)
-- So orders go first, then the rows they point at, then the users, then the
-- factory itself.

delete from orders
where factory_id = '22222222-2222-2222-2222-222222222222';

delete from clients
where factory_id = '22222222-2222-2222-2222-222222222222';

delete from machines
where factory_id = '22222222-2222-2222-2222-222222222222';

-- Storage is deliberately not touched here: Supabase's `storage.protect_delete`
-- trigger blocks direct deletes from `storage.objects`, because removing the row
-- without removing the file leaves an orphan in the bucket. Factory B was never
-- used through the app, so its `{factory_id}/` prefix should be empty in all
-- four buckets. If it is not, delete those files through the Storage dashboard
-- or the Storage API, not from SQL.

-- Cascades to the matching `profiles` rows.
delete from auth.users
where id in (
  'bbbbbbb2-0000-4000-8000-000000000001',  -- taker.b
  'bbbbbbb2-0000-4000-8000-000000000002',  -- qa.b
  'bbbbbbb2-0000-4000-8000-000000000003'   -- floor.b
);

delete from factories
where id = '22222222-2222-2222-2222-222222222222';

commit;
