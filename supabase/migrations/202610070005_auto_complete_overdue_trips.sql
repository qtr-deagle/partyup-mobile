begin;

-- Trips only became 'completed' when the organizer tapped Complete Trip
-- (complete_trip), so a forgotten trip stayed 'ongoing' forever. This closes
-- any ongoing trip 12 hours after its scheduled end. It's the same status
-- change, so guild_points_on_trip_completed still awards the usual points.
--
-- Scheduled end = end_at, or start_at + duration_days (min 1 day) when a
-- trip has no end_at. The website's trip board shows these trips as
-- "Overdue" during the 12-hour grace window; keep its rule in sync
-- (TripMonitoringBoard.tsx, OVERDUE_GRACE_HOURS).
create or replace function public.auto_complete_overdue_trips()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.trips t
  set status = 'completed'
  where t.status = 'ongoing'
    and coalesce(
          t.end_at,
          t.start_at + make_interval(days => greatest(coalesce(t.duration_days, 1), 1))
        ) < now() - interval '12 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Only the scheduler runs this.
revoke all on function public.auto_complete_overdue_trips() from public, anon, authenticated;

-- Every 15 minutes. pg_cron is already used by other jobs here; skip quietly
-- if it isn't available (e.g. a local stack without the extension).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('auto-complete-overdue-trips')
  where exists (select 1 from cron.job where jobname = 'auto-complete-overdue-trips');
  perform cron.schedule('auto-complete-overdue-trips', '*/15 * * * *', 'select public.auto_complete_overdue_trips()');
exception when others then
  raise notice 'pg_cron unavailable, skipping schedule: %', sqlerrm;
end;
$$;

commit;
