-- Procurement, step 1 of 2: the new `po_status` value, alone in its own file.
--
-- This is one line and it cannot be merged into 0015. Postgres refuses to *use*
-- an enum label in the same transaction that added it ("unsafe use of new value
-- of enum type"), and 0015 references 'submitted' in a check on every RPC and
-- in the Queue's own policy. The CLI runs each migration file in its own
-- transaction, so splitting them is what makes the label committed and usable
-- by the time the next file runs.
--
-- Where it sits: 'awaitingProcurement' (Store Manager raises the request, no
-- supplier or price yet) -> 'submitted' (Procurement priced it and attached the
-- bill) -> 'confirmed' (Store Manager reviewed it, and the Accountant's
-- Payables tab picks it up from there).

alter type po_status add value if not exists 'submitted';
