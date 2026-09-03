-- FactoryERP — storage buckets and their policies.
--
-- Every object key is `{factory_id}/{file}`, and the policies below read that
-- first path segment, so the storage layer enforces exactly the same tenant
-- boundary as the table policies in 0002_rls.sql. All three buckets are
-- private; the app reads through signed URLs (see src/data/storage.ts).
--
-- Design-sheet photos live in `sheet-proof-photos` alongside per-colour proof
-- photos — one bucket for everything attached to a sheet.

insert into storage.buckets (id, name, public)
values
  ('client-photos', 'client-photos', false),
  ('sheet-proof-photos', 'sheet-proof-photos', false),
  ('defect-photos', 'defect-photos', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Reads: anyone signed in, inside their own factory's folder.
-- ---------------------------------------------------------------------------

drop policy if exists factory_photos_select on storage.objects;
create policy factory_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id in ('client-photos', 'sheet-proof-photos', 'defect-photos')
    and (storage.foldername(name))[1] = auth_factory_id()::text
  );

-- ---------------------------------------------------------------------------
-- Writes: mirror the table policies — order_taker owns client and sheet
-- photos, qa_person owns defect photos.
-- ---------------------------------------------------------------------------

drop policy if exists factory_photos_insert on storage.objects;
create policy factory_photos_insert on storage.objects
  for insert to authenticated
  with check (
    (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      (bucket_id in ('client-photos', 'sheet-proof-photos') and auth_user_role() = 'order_taker')
      or (bucket_id = 'defect-photos' and auth_user_role() = 'qa_person')
    )
  );

drop policy if exists factory_photos_update on storage.objects;
create policy factory_photos_update on storage.objects
  for update to authenticated
  using (
    (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      (bucket_id in ('client-photos', 'sheet-proof-photos') and auth_user_role() = 'order_taker')
      or (bucket_id = 'defect-photos' and auth_user_role() = 'qa_person')
    )
  )
  with check (
    (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      (bucket_id in ('client-photos', 'sheet-proof-photos') and auth_user_role() = 'order_taker')
      or (bucket_id = 'defect-photos' and auth_user_role() = 'qa_person')
    )
  );

drop policy if exists factory_photos_delete on storage.objects;
create policy factory_photos_delete on storage.objects
  for delete to authenticated
  using (
    (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      (bucket_id in ('client-photos', 'sheet-proof-photos') and auth_user_role() = 'order_taker')
      or (bucket_id = 'defect-photos' and auth_user_role() = 'qa_person')
    )
  );
