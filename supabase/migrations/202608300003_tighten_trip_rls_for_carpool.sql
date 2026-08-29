begin;

-- The blanket "trip members access" policy (for all, using user_id =
-- auth.uid() or creator) previously let a rider write their own
-- trip_members row directly -- e.g. self-marking payment_status = 'paid', or
-- inserting an 'accepted' row bypassing capacity/visibility checks entirely.
-- Likewise "payment history insert" let a rider forge a paid record with any
-- amount. Every mutation on these tables now goes exclusively through the
-- security-definer RPCs added in 202608300002_add_carpool_rpcs.sql, which run
-- as the table owner and are unaffected by this revoke.
revoke insert, update, delete on public.trip_members from authenticated;
revoke insert, update on public.payment_history from authenticated;

-- A trip's driver needs to see their riders' payment rows to confirm them --
-- previously only the payer themselves (or staff) could see a payment_history row.
drop policy if exists "payment history access" on public.payment_history;
create policy "payment history access"
on public.payment_history
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_staff_or_admin()
  or exists (select 1 from public.trips t where t.id = payment_history.trip_id and t.creator_id = auth.uid())
);

commit;
