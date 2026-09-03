-- Proof photo moves from per-sheet to per-order.
--
-- The revised intake flow takes one photo covering every sheet in the order,
-- not one photo per colour, so the column moves up to `orders`.
--
-- Downstream: the Inspection module's "proof photo from intake" reference must
-- read `orders.proof_photo_url`. Every unit on an order now shows the same
-- photo — there is no per-colour proof photo any more.

alter table orders add column if not exists proof_photo_url text;

alter table order_sheets drop column if exists proof_photo_url;
