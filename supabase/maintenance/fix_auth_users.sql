-- Repairs the hand-inserted seed accounts so GoTrue can sign them in.
--
-- Symptom: "Database error querying schema" on sign-in.
--
-- Cause: `seed.sql` inserts straight into `auth.users` and only fills the
-- columns it cares about. GoTrue reads several token columns into Go `string`
-- fields, which cannot hold NULL — so the row is unreadable to the auth service
-- even though it looks fine in SQL. It also expects every password user to have
-- a matching `auth.identities` row, which a raw insert does not create.
--
-- Not destructive: fills NULLs and adds missing identity rows. Existing values
-- are left alone. Safe to re-run.
--
-- Column layouts differ between GoTrue versions, so both blocks below check
-- what actually exists before writing.

-- --- 1. NULL token columns -> empty string ----------------------------------

do $$
declare
  col text;
  candidates text[] := array[
    'confirmation_token',
    'recovery_token',
    'email_change',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ];
begin
  foreach col in array candidates loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = col
    ) then
      execute format(
        'update auth.users set %I = %L where %I is null',
        col, '', col
      );
    end if;
  end loop;
end $$;

-- --- 2. Missing identity rows -----------------------------------------------

do $$
declare
  id_is_uuid boolean;
begin
  select data_type = 'uuid' into id_is_uuid
  from information_schema.columns
  where table_schema = 'auth' and table_name = 'identities' and column_name = 'id';

  if id_is_uuid then
    -- Newer layout: `id` is a generated uuid, `provider_id` holds the subject.
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    select
      gen_random_uuid(), u.id::text, u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email),
      'email', now(), now(), now()
    from auth.users u
    where not exists (
      select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
    );
  else
    -- Older layout: `id` itself is the subject.
    insert into auth.identities (
      id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    select
      u.id::text, u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email),
      'email', now(), now(), now()
    from auth.users u
    where not exists (
      select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
    );
  end if;
end $$;

-- --- 3. Confirm the accounts look right --------------------------------------

select
  u.email,
  u.email_confirmed_at is not null as confirmed,
  p.role,
  f.name as factory,
  exists (select 1 from auth.identities i where i.user_id = u.id) as has_identity
from auth.users u
left join profiles p on p.id = u.id
left join factories f on f.id = p.factory_id
order by u.email;
