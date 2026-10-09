begin;

-- PayMongo is the only way to pay.
--
-- 1. The old "manual" honor-system flow (rider sends GCash to the driver and
--    types a reference, driver confirms) is gone: its RPCs are dropped, its
--    payment_history rows deleted, and riders stuck "pending" on it go back
--    to "unpaid" so they can pay through PayMongo.
-- 2. Admins can settle a stuck PayMongo payment by hand: mark it paid (after
--    checking the PayMongo dashboard) or cancel it. Both need a note and are
--    audited.
-- 3. Checkouts that never finish are cancelled after 24 hours, so they stop
--    blocking account deletion and the rider can start a fresh payment. If
--    PayMongo later reports the old checkout as paid, the webhook still marks
--    it paid (it matches on the payment intent id).

-- 'cancelled' joins the payment statuses.
alter table public.payment_history drop constraint if exists payment_history_status_check;
alter table public.payment_history
  add constraint payment_history_status_check check (status in ('demo', 'pending', 'paid', 'refunded', 'cancelled'));

-- ---------------------------------------------------------------------
-- 1. Remove the manual flow.
-- ---------------------------------------------------------------------
update public.trip_members
set payment_status = 'unpaid',
    payment_reference = null,
    payment_reported_at = null,
    last_payment_id = null
where payment_channel = 'manual'
  and payment_status = 'pending';

delete from public.payment_history where gateway = 'manual';

alter table public.payment_history drop constraint if exists payment_history_gateway_check;
alter table public.payment_history alter column gateway set default 'paymongo';
alter table public.payment_history
  add constraint payment_history_gateway_check check (gateway = 'paymongo');

drop function if exists public.report_payment(uuid, text);
drop function if exists public.confirm_payment_received(uuid);

-- ---------------------------------------------------------------------
-- 2. Settle or cancel one pending payment. Shared by the admin RPCs and the
--    expiry job (p_actor null = system).
-- ---------------------------------------------------------------------
create or replace function public.settle_pending_payment_internal(
  p_payment_id uuid,
  p_outcome text,
  p_note text,
  p_actor uuid
)
returns public.payment_history
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payment_history;
  v_member public.trip_members;
  v_trip public.trips;
  v_rider_name text;
begin
  if p_outcome not in ('paid', 'cancelled') then
    raise exception 'Unknown outcome %', p_outcome;
  end if;

  select * into v_payment from public.payment_history where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Payment not found';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Only pending payments can be changed (this one is %)', v_payment.status;
  end if;

  update public.payment_history
  set status = p_outcome,
      confirmed_by = case when p_outcome = 'paid' then p_actor else confirmed_by end,
      notes = concat_ws(E'\n', nullif(notes, ''),
        case when p_outcome = 'paid' then 'Marked paid' else 'Cancelled' end
        || case when p_actor is null then ' automatically' else ' by an admin' end
        || coalesce(': ' || nullif(trim(p_note), ''), '')),
      updated_at = now()
  where id = v_payment.id
  returning * into v_payment;

  -- The rider's seat follows only if this is the payment it is waiting on.
  select tm.* into v_member
  from public.trip_members tm
  where tm.id = v_payment.trip_member_id
    and tm.payment_status = 'pending'
    and (v_payment.gateway_payment_intent_id is null or tm.payment_intent_id = v_payment.gateway_payment_intent_id)
  for update;

  if v_member.id is not null then
    if p_outcome = 'paid' then
      update public.trip_members
      set payment_status = 'paid', payment_confirmed_at = now()
      where id = v_member.id;
    else
      update public.trip_members
      set payment_status = 'unpaid', payment_reported_at = null
      where id = v_member.id;
    end if;
  end if;

  select * into v_trip from public.trips where id = v_payment.trip_id;
  select display_name into v_rider_name from public.profiles where id = v_payment.user_id;

  if p_outcome = 'paid' then
    insert into public.notifications (user_id, type, title, message, data)
    values (v_payment.user_id, 'trip', 'Payment confirmed',
      'Your payment of ₱' || v_payment.amount || coalesce(' for "' || v_trip.title || '"', '') || ' was confirmed.',
      jsonb_build_object('trip_id', v_payment.trip_id));
    if v_trip.id is not null and v_trip.creator_id <> v_payment.user_id then
      insert into public.notifications (user_id, type, title, message, data)
      values (v_trip.creator_id, 'trip', 'Payment confirmed',
        coalesce(v_rider_name, 'A rider') || '''s payment of ₱' || v_payment.amount || ' for "' || v_trip.title || '" was confirmed.',
        jsonb_build_object('trip_id', v_payment.trip_id));
    end if;
  else
    insert into public.notifications (user_id, type, title, message, data)
    values (v_payment.user_id, 'trip', 'Payment not completed',
      case when p_actor is null
        then 'Your checkout' || coalesce(' for "' || v_trip.title || '"', '') || ' expired before it was paid. You can pay again from the trip.'
        else 'Your pending payment' || coalesce(' for "' || v_trip.title || '"', '') || ' was cancelled by PartyUp. You can pay again from the trip.'
      end,
      jsonb_build_object('trip_id', v_payment.trip_id));
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor,
    case when p_outcome = 'paid' then 'Marked payment paid' when p_actor is null then 'Expired pending payment' else 'Cancelled payment' end,
    'payment', v_payment.id,
    jsonb_build_object('amount', v_payment.amount, 'user_id', v_payment.user_id, 'trip_id', v_payment.trip_id,
      'intent_id', v_payment.gateway_payment_intent_id, 'note', nullif(trim(p_note), '')));

  return v_payment;
end;
$$;

revoke all on function public.settle_pending_payment_internal(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.admin_mark_payment_paid(p_payment_id uuid, p_note text)
returns public.payment_history
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change payments';
  end if;
  if nullif(trim(p_note), '') is null then
    raise exception 'Add a note saying how you checked the payment';
  end if;
  return public.settle_pending_payment_internal(p_payment_id, 'paid', p_note, auth.uid());
end;
$$;

grant execute on function public.admin_mark_payment_paid(uuid, text) to authenticated;

create or replace function public.admin_cancel_payment(p_payment_id uuid, p_note text)
returns public.payment_history
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change payments';
  end if;
  if nullif(trim(p_note), '') is null then
    raise exception 'Add a reason for cancelling';
  end if;
  return public.settle_pending_payment_internal(p_payment_id, 'cancelled', p_note, auth.uid());
end;
$$;

grant execute on function public.admin_cancel_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Expire abandoned checkouts.
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_gateway_payments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.payment_history
    where status = 'pending'
      and gateway = 'paymongo'
      and created_at < now() - interval '24 hours'
    order by created_at
    limit 200
  loop
    perform public.settle_pending_payment_internal(v_id, 'cancelled', null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_gateway_payments() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('expire-stale-gateway-payments')
  where exists (select 1 from cron.job where jobname = 'expire-stale-gateway-payments');
  perform cron.schedule('expire-stale-gateway-payments', '17 * * * *', 'select public.expire_stale_gateway_payments()');
exception when others then
  raise notice 'pg_cron unavailable, skipping schedule: %', sqlerrm;
end;
$$;

commit;
