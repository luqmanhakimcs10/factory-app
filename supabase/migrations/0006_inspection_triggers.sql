-- Inspection side effects, in the database.
--
-- Both of these are cross-module: the Order Taker's Order Detail screen reads
-- `orders.stage` and `orders.alert_text` and knows nothing about inspection
-- internals. Putting the logic here means it stays correct no matter which
-- client changed the unit — this app today, a floor terminal or an admin tool
-- later.
--
-- SECURITY DEFINER because a qa_person has no update policy on `orders` (see
-- 0002_rls.sql), and should not: the only writes to `orders` they can cause are
-- these two, on the order their own unit belongs to.

create or replace function on_inspection_unit_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending int;
  v_returned int;
begin
  -- Every unit accounted for -> the order leaves Initial Inspection.
  --
  -- "Accounted for" includes returned units, not just passed ones: a return is
  -- a finished inspection decision, and the physical return to the client is
  -- handled separately by the order taker off the alert card below.
  select count(*) into v_pending
  from inspection_units
  where order_id = new.order_id and status = 'pending';

  if v_pending = 0 then
    update orders
    set stage = 'coding'
    where id = new.order_id and stage = 'inspection';
  end if;

  if new.status = 'returned' then
    -- Recomputed from scratch every time rather than incremented, so the
    -- message stays accurate as further returns land on the same order.
    select count(*) into v_returned
    from inspection_units
    where order_id = new.order_id and status = 'returned';

    update orders
    set alert_text = v_returned
      || case when v_returned = 1 then ' item' else ' items' end
      || ' returned at inspection — return to the client.'
    where id = new.order_id;
  end if;

  return null;
end;
$$;

drop trigger if exists inspection_units_decided on inspection_units;
create trigger inspection_units_decided
after update of status on inspection_units
for each row
when (new.status is distinct from old.status and new.status <> 'pending')
execute function on_inspection_unit_decided();
