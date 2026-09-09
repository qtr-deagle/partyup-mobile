begin;

-- Live location sharing already has a real, working flag on current_locations.is_visible
-- (set via the set_location_visibility RPC and used by the Map screen) -- no separate
-- profiles column for it, to avoid two disconnected sources of truth.
alter table public.profiles
  add column if not exists warning_alerts_enabled boolean not null default true,
  add column if not exists emergency_sos_enabled boolean not null default true;

commit;
