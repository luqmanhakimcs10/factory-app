-- Reading the client's design sheet instead of retyping it.
--
-- The Job Card's first step has always said "Photograph the client's design
-- sheet to load stitch and colour details" — and then loaded nothing. The photo
-- lived on the draft, was never written anywhere, and the floor manager typed
-- every stitch count into a numeric keypad on the next screen with the paper
-- sheet in their other hand. This column is where the read version of that
-- paper lands.
--
-- One jsonb rather than a column per field, matching `threads`, `needles`,
-- `materials` and `billing` on this same table. The shape is owned by
-- `supabase/functions/extract-design-sheet` and parsed at the app boundary by
-- `src/features/floor-manager/designSheet.ts`; putting it in columns would mean
-- a migration every time the sheet turns out to carry one more field, and the
-- whole point of the extractor is that sheets differ.
--
-- It holds the parsed fields, the raw text, the storage path of the photo it
-- came from, and which model read it. The raw text is not redundant: a
-- mis-parse can then be diagnosed — and re-parsed — without sending the floor
-- manager back to the client for the sheet.

alter table orders add column if not exists design_sheet_extraction jsonb;

comment on column orders.design_sheet_extraction is
  'Structured read of the client''s design sheet: parsed fields, raw text, source photo path, model and timestamp. Written by the extract-design-sheet edge function. Advisory only — the floor manager confirms every value before it reaches the job card.';

-- No new bucket. `job-card-photos` was created in 0007 for exactly this ("design
-- sheet re-shoot, materials collection proof"), its write policy is already
-- scoped to `floor_manager`, and its read policy is already factory-wide — which
-- is what the edge function needs when it fetches the image back as the caller.

-- ---------------------------------------------------------------------------
-- Nothing here grants a new write path.
--
-- The edge function acts as the signed-in floor manager, using their JWT rather
-- than the service role, so it can write exactly what they could write and
-- nothing more. 0007's `orders_update_floor_manager` policy is what actually
-- authorises the write, and it is left alone deliberately: an extractor that
-- needed its own elevated policy would be an extractor that could edit orders
-- the person driving it cannot.
-- ---------------------------------------------------------------------------
