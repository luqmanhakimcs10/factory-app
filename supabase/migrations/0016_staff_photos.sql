-- Proof photos for the Delivery Person flows.
--
-- `0013_staff_persona.sql` built the tables, the grants and the four RPCs, and
-- every one of those RPCs refuses to run without a photo — but it created
-- nowhere to put one. `movements.drop_off_photo_url`, `movements.pickup_photo_url`,
-- `orders.delivery_photo_url` and `return_requests.return_photo_url` all hold a
-- storage path, and until this migration there was no bucket for that path to
-- point into. This is the missing half of A5/A8, not a new feature.
--
-- One bucket, not four. The tenant boundary is the folder prefix, which is
-- identical for all four; splitting them would multiply the policy surface
-- without separating anything the policies actually distinguish.

insert into storage.buckets (id, name, public)
values ('staff-proof-photos', 'staff-proof-photos', false)
on conflict (id) do nothing;

-- Reads: factory-wide, like every other bucket. A pickup photo is evidence
-- QA, the floor manager and the accountant all have reason to open.
drop policy if exists staff_photos_select on storage.objects;
create policy staff_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-proof-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
  );

-- Writes: any of the three grants whose flows attach a photo.
--
-- Deliberately not narrowed per-photo-kind. Storage policies see a bucket and
-- a path, not which column the app is about to write, so a per-grant split
-- here would be enforced by the filename — which is to say, not enforced. The
-- real gate is the RPC: each one re-checks its own grant before it will record
-- the path, so an upload by the wrong grant-holder buys nothing.

drop policy if exists staff_photos_insert on storage.objects;
create policy staff_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-proof-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      has_grant('sheetMovement')
      or has_grant('orderDelivery')
      or has_grant('orderReturn')
    )
  );

-- No WITH CHECK clause: Postgres reuses USING for the new row when one is
-- omitted, and both halves of an update here are the same predicate.
drop policy if exists staff_photos_update on storage.objects;
create policy staff_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'staff-proof-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      has_grant('sheetMovement')
      or has_grant('orderDelivery')
      or has_grant('orderReturn')
    )
  );

drop policy if exists staff_photos_delete on storage.objects;
create policy staff_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'staff-proof-photos'
    and (storage.foldername(name))[1] = auth_factory_id()::text
    and (
      has_grant('sheetMovement')
      or has_grant('orderDelivery')
      or has_grant('orderReturn')
    )
  );
