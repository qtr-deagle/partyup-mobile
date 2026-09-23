begin;

alter table public.sos_alerts
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolution_notes text;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sos_alerts') then
    alter publication supabase_realtime add table public.sos_alerts;
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'safety_sessions') then
    alter publication supabase_realtime add table public.safety_sessions;
  end if;
end;
$$;

create or replace function public.resolve_sos_alert(p_alert_id uuid, p_notes text default null)
returns public.sos_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert public.sos_alerts;
begin
  if not public.is_staff_or_admin() then
    raise exception 'Not authorized';
  end if;

  update public.sos_alerts
  set status = 'resolved',
      resolved_by = auth.uid(),
      resolved_at = now(),
      resolution_notes = p_notes
  where id = p_alert_id
  returning * into v_alert;

  if v_alert.id is null then
    raise exception 'SOS alert not found';
  end if;

  return v_alert;
end;
$$;

grant execute on function public.resolve_sos_alert(uuid, text) to authenticated;

commit;
