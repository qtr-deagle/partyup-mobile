-- Harden resolve_sos_alert (admin console "Resolve SOS").
--
-- * Only an ACTIVE alert can be resolved. Before this, a second admin tab (or
--   a stale button) could "resolve" an alert that was already resolved or
--   that the traveler had already ended with "I'm safe", overwriting
--   resolved_by / resolved_at / resolution_notes.
-- * Resolution notes are required. The console now asks the admin to confirm
--   the person is safe and to write how it was resolved; the database
--   enforces the notes part so no client can skip it.
--
-- Same signature, so existing grants and callers keep working.

begin;

create or replace function public.resolve_sos_alert(p_alert_id uuid, p_notes text default null)
returns public.sos_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert public.sos_alerts;
  v_status text;
begin
  if not public.is_staff_or_admin() then
    raise exception 'Not authorized';
  end if;

  if nullif(btrim(coalesce(p_notes, '')), '') is null then
    raise exception 'Write how the SOS was resolved before resolving it';
  end if;

  select status into v_status
  from public.sos_alerts
  where id = p_alert_id
  for update;

  if v_status is null then
    raise exception 'SOS alert not found';
  end if;

  if v_status <> 'active' then
    raise exception 'This SOS is no longer active (it was already resolved)';
  end if;

  update public.sos_alerts
  set status = 'resolved',
      resolved_by = auth.uid(),
      resolved_at = now(),
      resolution_notes = btrim(p_notes)
  where id = p_alert_id
  returning * into v_alert;

  return v_alert;
end;
$$;

grant execute on function public.resolve_sos_alert(uuid, text) to authenticated;

commit;
