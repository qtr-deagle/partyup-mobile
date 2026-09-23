begin;

-- trip_itinerary_days and trip_favorites (added in 202609110001) have had RLS
-- select policies since creation, but every prior reader went through
-- create_trip/get_trip_detail (SECURITY DEFINER RPCs), which never exercises
-- caller-level table grants. The staff Trip Monitoring dashboard is the first
-- thing to run a plain `.from('trip_itinerary_days').select()` as an ordinary
-- authenticated user, surfacing "permission denied for table
-- trip_itinerary_days" -- same root cause already fixed once for
-- sos_alerts/safety_sessions in 202609190005: RLS policies alone don't grant
-- access, the base table privilege was simply never given to `authenticated`.
grant select on public.trip_itinerary_days to authenticated;
grant select on public.trip_favorites to authenticated;

commit;
