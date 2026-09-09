begin;

alter table public.notifications
  add column if not exists data jsonb not null default '{}'::jsonb;

create table if not exists public.safety_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'monitoring' check (status in ('monitoring', 'cancelled', 'escalated')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists safety_sessions_user_id_idx on public.safety_sessions(user_id);
create index if not exists safety_sessions_monitoring_idx on public.safety_sessions(user_id, status) where status = 'monitoring';

create table if not exists public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  safety_session_id uuid references public.safety_sessions(id) on delete set null,
  trigger_reason text not null check (trigger_reason in ('manual', 'auto_escalation')),
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text not null default 'active' check (status in ('active', 'resolved')),
  recipient_count int not null default 0,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sos_alerts_user_id_idx on public.sos_alerts(user_id);

alter table public.safety_sessions enable row level security;
alter table public.sos_alerts enable row level security;

drop policy if exists "safety sessions select own or staff" on public.safety_sessions;
create policy "safety sessions select own or staff"
on public.safety_sessions
for select
to authenticated
using (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "sos alerts select own or staff" on public.sos_alerts;
create policy "sos alerts select own or staff"
on public.sos_alerts
for select
to authenticated
using (user_id = auth.uid() or public.is_staff_or_admin());

-- No insert/update policies -- all writes to these two tables go through the
-- security-definer RPCs below, matching the trusted_contacts/notifications
-- convention used elsewhere in this schema.

create or replace function public.trigger_sos_alert(
  p_trip_id uuid default null,
  p_safety_session_id uuid default null,
  p_trigger_reason text default 'manual'
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

  select latitude, longitude into v_lat, v_lng from public.current_locations where user_id = auth.uid();

  insert into public.sos_alerts (user_id, trip_id, safety_session_id, trigger_reason, latitude, longitude)
  values (auth.uid(), p_trip_id, p_safety_session_id, p_trigger_reason, v_lat, v_lng)
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

grant execute on function public.trigger_sos_alert(uuid, uuid, text) to authenticated;

create or replace function public.start_safety_session(p_trip_id uuid default null, p_duration_seconds int default 60)
returns public.safety_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.safety_sessions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not coalesce((select warning_alerts_enabled from public.profiles where id = auth.uid()), true) then
    raise exception 'Warning Mode is disabled in your safety settings';
  end if;

  update public.safety_sessions
  set status = 'cancelled', resolved_at = now()
  where user_id = auth.uid() and status = 'monitoring';

  insert into public.safety_sessions (user_id, trip_id, expires_at)
  values (auth.uid(), p_trip_id, now() + make_interval(secs => p_duration_seconds))
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function public.start_safety_session(uuid, int) to authenticated;

create or replace function public.cancel_safety_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.safety_sessions
  set status = 'cancelled', resolved_at = now()
  where id = p_session_id and user_id = auth.uid() and status = 'monitoring';
end;
$$;

grant execute on function public.cancel_safety_session(uuid) to authenticated;

-- Idempotent: both the client's own foreground countdown and the background
-- location-task sweep may race to escalate the same session. If it's no
-- longer 'monitoring', return the existing alert instead of creating a
-- duplicate.
create or replace function public.escalate_safety_session(p_session_id uuid)
returns public.sos_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.safety_sessions;
  v_alert public.sos_alerts;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_session from public.safety_sessions where id = p_session_id and user_id = auth.uid();
  if v_session.id is null then
    raise exception 'Safety session not found';
  end if;

  if v_session.status <> 'monitoring' then
    select * into v_alert from public.sos_alerts
    where safety_session_id = p_session_id
    order by created_at desc
    limit 1;
    return v_alert;
  end if;

  update public.safety_sessions set status = 'escalated', resolved_at = now() where id = p_session_id;

  select * into v_alert from public.trigger_sos_alert(v_session.trip_id, v_session.id, 'auto_escalation');
  return v_alert;
end;
$$;

grant execute on function public.escalate_safety_session(uuid) to authenticated;

commit;
