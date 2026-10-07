begin;

-- The PartyUp fee on carpool fuel contributions is 2%, not 10%. Must match
-- CARPOOL_PLATFORM_FEE_RATE in lib/carpool.ts.
create or replace function public.carpool_platform_fee_rate()
returns numeric
language sql
immutable
as $$ select 0.02::numeric $$;

-- Re-price fees already stored at 10% for riders who haven't paid yet.
-- Anything paid, reported as paid, or mid-checkout at the gateway keeps the
-- amount the rider was shown.
update public.trip_members
set platform_fee = round(offered_amount * public.carpool_platform_fee_rate(), 2),
    payment_amount = case
      when payment_amount is not null then offered_amount + round(offered_amount * public.carpool_platform_fee_rate(), 2)
      else payment_amount
    end
where offered_amount is not null
  and platform_fee is not null
  and payment_status = 'unpaid'
  and payment_intent_id is null;

commit;
