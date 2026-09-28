begin;

-- SOS live tracking: the client now sends a fresh GPS fix with the alert
-- (instead of relying on a possibly stale current_locations row), the user can
-- end their own alert with "I'm safe", and a repeat press reuses the active
-- alert instead of fanning out a second one.

alter table public.sos_alerts
  add column if not exists accuracy_m numeric(10,2);

drop function if exists public.trigger_sos_alert(uuid, uuid, text);

create or replace function public.trigger_sos_alert(
  p_trip_id uuid default null,
  p_safety_session_id uuid default null,
  p_trigger_reason text default 'manual',
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_accuracy numeric default null
)
returns public.sos_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert public.sos_alerts;
  v_lat numeric;
  v_lng numeric;
  v_accuracy numeric;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_trigger_reason not in ('manual', 'auto_escalation') then
    raise exception 'Invalid trigger reason';
  end if;

  if p_trigger_reason = 'manual' and not coalesce(
    (select emergency_sos_enabled from public.profiles where id = auth.uid()), true
  ) then
    raise exception 'Emergency SOS is disabled in your safety settings';
  end if;

  -- A fresh fix from the phone wins. It is also written to current_locations
  -- (forced visible: SOS overrides a hidden location) so staff and the trusted
  -- circle start from the exact spot, and the live stream continues from there.
  if p_latitude is not null and p_longitude is not null then
    insert into public.current_locations (user_id, latitude, longitude, accuracy_m, is_visible, updated_at)
    values (auth.uid(), p_latitude, p_longitude, p_accuracy, true, now())
    on conflict (user_id) do update
      set latitude = excluded.latitude,
          longitude = excluded.longitude,
          accuracy_m = excluded.accuracy_m,
          is_visible = true,
          updated_at = excluded.updated_at;
    v_lat := p_latitude;
    v_lng := p_longitude;
    v_accuracy := p_accuracy;
  else
    update public.current_locations set is_visible = true where user_id = auth.uid();
    select latitude, longitude, accuracy_m into v_lat, v_lng, v_accuracy
    from public.current_locations where user_id = auth.uid();
  end if;

  -- One active alert per user: a second press (or an escalation racing a
  -- manual press) returns the existing alert instead of alerting everyone again.
  select * into v_alert from public.sos_alerts
  where user_id = auth.uid() and status = 'active'
  order by created_at desc
  limit 1;
  if v_alert.id is not null then
    return v_alert;
  end if;

  insert into public.sos_alerts (user_id, trip_id, safety_session_id, trigger_reason, latitude, longitude, accuracy_m)
  values (auth.uid(), p_trip_id, p_safety_session_id, p_trigger_reason, v_lat, v_lng, v_accuracy)
  returning * into v_alert;

  insert into public.notifications (user_id, type, title, message, data)
  select
    tc.contact_user_id,
    'safety',
    (select display_name from public.profiles where id = auth.uid()) || ' needs help',
    'Emergency alert triggered' || case when v_lat is not null then ' — live location shared.' else '.' end,
    jsonb_build_object('sos_alert_id', v_alert.id, 'from_user_id', auth.uid(), 'latitude', v_lat, 'longitude', v_lng)
  from public.trusted_contacts tc
  where tc.user_id = auth.uid() and tc.status = 'accepted' and tc.alerts_enabled = true;

  get diagnostics v_count = row_count;

  update public.sos_alerts set recipient_count = v_count where id = v_alert.id returning * into v_alert;

  return v_alert;
end;
$$;

grant execute on function public.trigger_sos_alert(uuid, uuid, text, numeric, numeric, numeric) to authenticated;

-- The user ends their own alert. Trusted contacts get a plain 'system'
-- notification -- not 'safety', which would open the full-screen SOS overlay.
create or replace function public.mark_sos_safe(p_alert_id uuid)
returns public.sos_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert public.sos_alerts;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.sos_alerts
  set status = 'resolved',
      resolved_by = auth.uid(),
      resolved_at = now(),
      resolution_notes = 'Marked safe by user'
  where id = p_alert_id and user_id = auth.uid() and status = 'active'
  returning * into v_alert;

  if v_alert.id is null then
    raise exception 'No active SOS alert to end';
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, type, title, message, data)
  select
    tc.contact_user_id,
    'system',
    coalesce(v_name, 'Your contact') || ' is safe',
    coalesce(v_name, 'Your contact') || ' ended their emergency alert.',
    jsonb_build_object('sos_alert_id', v_alert.id, 'from_user_id', auth.uid())
  from public.trusted_contacts tc
  where tc.user_id = auth.uid() and tc.status = 'accepted' and tc.alerts_enabled = true;

  return v_alert;
end;
$$;

grant execute on function public.mark_sos_safe(uuid) to authenticated;

commit;
