-- Order submit, as one transaction.
--
-- The wizard writes a client (sometimes), an order, and N sheets. Doing that as
-- separate client calls leaves a half-written order behind whenever the phone
-- loses signal mid-sequence — on a factory floor that is the normal case, not
-- the edge case. So it is one RPC: it either all lands or none of it does.
--
-- SECURITY INVOKER (the default) on purpose: every insert below still passes
-- through the RLS policies in 0002_rls.sql, so this is a convenience wrapper,
-- never a way around them.

create or replace function next_order_code(p_factory_id uuid)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_seq int;
  v_code text;
begin
  -- Serialise code generation per factory. Held to end of transaction, so the
  -- next caller only proceeds once this order's row is committed and counted.
  perform pg_advisory_xact_lock(hashtext(p_factory_id::text));

  select upper(left(regexp_replace(name, '[^a-zA-Z]', '', 'g'), 3))
  into v_prefix
  from factories
  where id = p_factory_id;

  if v_prefix is null or v_prefix = '' then
    v_prefix := 'ORD';
  end if;

  select count(*) into v_seq from orders where factory_id = p_factory_id;

  loop
    v_seq := v_seq + 1;
    v_code := v_prefix || '-' || lpad(v_seq::text, 4, '0');
    exit when not exists (select 1 from orders where code = v_code);
  end loop;

  return v_code;
end;
$$;

revoke execute on function next_order_code(uuid) from public;
grant execute on function next_order_code(uuid) to authenticated;

/**
 * Submit (or re-submit) an order.
 *
 * Photo arguments are storage *paths*, already uploaded by the client — the
 * order id is generated on the device precisely so the photos can be filed
 * under it before this call.
 *
 * `p_new_client` is null when an existing client was picked, otherwise
 * {id, name, phone, photo_url, shop_photo_taken}.
 * `p_sheets` is [{color_id, custom_hex, repeats}, ...].
 */
create or replace function submit_order(
  p_order_id uuid,
  p_client_id uuid,
  p_new_client jsonb,
  p_proof_photo_url text,
  p_design_sheet_photo_url text,
  p_sheets jsonb
)
returns table (order_id uuid, order_code text)
language plpgsql
as $$
declare
  v_factory_id uuid := auth_factory_id();
  v_client_id uuid := p_client_id;
  v_code text;
  v_existing_code text;
begin
  if v_factory_id is null then
    raise exception 'No profile for the calling user';
  end if;

  if jsonb_array_length(coalesce(p_sheets, '[]'::jsonb)) = 0 then
    raise exception 'An order needs at least one sheet';
  end if;

  if p_new_client is not null then
    v_client_id := (p_new_client ->> 'id')::uuid;

    insert into clients (id, factory_id, name, phone, photo_url, shop_photo_taken)
    values (
      v_client_id,
      v_factory_id,
      p_new_client ->> 'name',
      p_new_client ->> 'phone',
      p_new_client ->> 'photo_url',
      coalesce((p_new_client ->> 'shop_photo_taken')::boolean, false)
    );
  end if;

  -- A resumed draft already has a row and a code; keep both so the code the
  -- client was told at intake stays the code on the order.
  select code into v_existing_code from orders where id = p_order_id;

  if v_existing_code is null then
    v_code := next_order_code(v_factory_id);

    insert into orders (
      id, factory_id, code, client_id, status, stage,
      proof_photo_url, design_sheet_photo_url, created_by
    )
    values (
      p_order_id, v_factory_id, v_code, v_client_id, 'in_progress', 'inspection',
      p_proof_photo_url, p_design_sheet_photo_url, auth.uid()
    );
  else
    v_code := v_existing_code;

    update orders
    set client_id = v_client_id,
        status = 'in_progress',
        stage = 'inspection',
        proof_photo_url = p_proof_photo_url,
        design_sheet_photo_url = p_design_sheet_photo_url
    where id = p_order_id;

    -- Sheets are replaced wholesale rather than diffed: the cascade drops the
    -- draft's inspection_units and the fan-out trigger regenerates them, so the
    -- unit rows always match the sheets that were actually submitted.
    delete from order_sheets where order_sheets.order_id = p_order_id;
  end if;

  insert into order_sheets (order_id, color_id, custom_hex, repeats)
  select
    p_order_id,
    sheet ->> 'color_id',
    sheet ->> 'custom_hex',
    (sheet ->> 'repeats')::int
  from jsonb_array_elements(p_sheets) as sheet;

  return query select p_order_id, v_code;
end;
$$;

revoke execute on function submit_order(uuid, uuid, jsonb, text, text, jsonb) from public;
grant execute on function submit_order(uuid, uuid, jsonb, text, text, jsonb) to authenticated;
