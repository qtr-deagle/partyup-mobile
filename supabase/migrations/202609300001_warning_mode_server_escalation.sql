begin;

-- Warning Mode: user-picked timers (30 s to 30 min) and server-side escalation.
--
-- Until now only the phone escalated an expired session, so a long timer
-- failed silently if the OS killed the app, the battery died or the phone was
-- taken. A pg_cron job now escalates any session left 'monitoring' past its
-- expiry and pushes the trusted circle through send-sos-push, authenticated by
-- the same vault secrets as dispatch-push (see 202609250007_push_dispatch.sql).

create extension if not exists pg_cron;
create extension if not exists pg_net;

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

  if p_duration_seconds is null or p_duration_seconds < 30 or p_duration_seconds > 1800 then
    raise exception 'Warning Mode timer must be between 30 seconds and 30 minutes';
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

-- Runs as the cron job (no user JWT). escalate_safety_session and
-- trigger_sos_alert key everything off auth.uid(), so each session is escalated
-- with the owner's id set as the request's JWT subject for this transaction.
-- The short grace period lets a phone that's still open escalate first, with
-- its fresher GPS fix.
create or replace function public.escalate_expired_safety_sessions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_alert public.sos_alerts;
  v_url text;
  v_secret text;
  v_count int := 0;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';

  for v_session in
    select id, user_id from public.safety_sessions
    where status = 'monitoring' and expires_at < now() - interval '15 seconds'
    order by expires_at
    for update skip locked
  loop
    begin
      perform set_config('request.jwt.claim.sub', v_session.user_id::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_session.user_id, 'role', 'authenticated')::text, true);

      select * into v_alert from public.escalate_safety_session(v_session.id);
      v_count := v_count + 1;

      -- Only a newly created alert pushes; an already-active manual SOS was
      -- pushed when it was raised.
      if v_alert.id is not null and v_alert.created_at >= now() and v_url is not null and v_secret is not null then
        perform net.http_post(
          url := rtrim(v_url, '/') || '/functions/v1/send-sos-push',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
          body := jsonb_build_object('sosAlertId', v_alert.id)
        );
      end if;
    exception when others then
      raise warning 'escalate_expired_safety_sessions: session % failed: %', v_session.id, sqlerrm;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return v_count;
end;
$$;

revoke all on function public.escalate_expired_safety_sessions() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'escalate-expired-safety-sessions';
select cron.schedule('escalate-expired-safety-sessions', '* * * * *', 'select public.escalate_expired_safety_sessions()');

commit;
