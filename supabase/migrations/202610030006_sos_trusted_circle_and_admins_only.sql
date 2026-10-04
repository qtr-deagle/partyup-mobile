begin;

-- =====================================================================
-- SOS is private: only the person's trusted circle and admins see it.
-- Guild Leaders lose the SOS map access granted in 202610010006/0009.
--   * Trusted contacts are unaffected: they get the SOS notification from
--     trigger_sos_alert() and the live location via can_view_location().
--   * Admins keep sos_alerts through "sos alerts select own or staff"
--     (is_staff_or_admin() = admin only since 202610010006).
-- =====================================================================

drop policy if exists "sos alerts leader read" on public.sos_alerts;

drop policy if exists "current locations leader sos read" on public.current_locations;
create policy "current locations admin sos read" on public.current_locations for select to authenticated
  using (
    public.is_admin()
    and exists (select 1 from public.sos_alerts s where s.user_id = current_locations.user_id and s.status = 'active')
  );

drop policy if exists "profiles leader read" on public.profiles;

commit;
