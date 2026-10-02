begin;

-- Lets travelers file payment reports from the trip screen so they land in
-- the website's Payment Management > Issues tab (which lists reports with
-- report_type = 'payment'). Same signature as 202609110007, so this replaces
-- the function in place. Payment reports must point at a trip the caller
-- hosts or has joined -- nobody else has a payment to dispute there.
create or replace function public.submit_report(
  p_reported_user_id uuid default null,
  p_trip_id uuid default null,
  p_report_type text default 'other',
  p_details text default '',
  p_evidence_paths text[] default '{}'
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.reports;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_report_type not in ('safety', 'behavior', 'payment', 'other') then
    raise exception 'Invalid report type';
  end if;

  if trim(coalesce(p_details, '')) = '' then
    raise exception 'Please describe what happened';
  end if;

  if p_reported_user_id is not null and p_reported_user_id = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;

  if p_reported_user_id is null and p_trip_id is null then
    raise exception 'A report must reference a user or a trip';
  end if;

  if p_report_type = 'payment' then
    if p_trip_id is null then
      raise exception 'A payment report must reference a trip';
    end if;

    if not exists (select 1 from public.trips t where t.id = p_trip_id and t.creator_id = auth.uid())
      and not exists (
        select 1 from public.trip_members m
        where m.trip_id = p_trip_id and m.user_id = auth.uid() and m.status = 'accepted'
      ) then
      raise exception 'You can only report payments for trips you are part of';
    end if;
  end if;

  if array_length(p_evidence_paths, 1) is not null and array_length(p_evidence_paths, 1) > 5 then
    raise exception 'You can attach up to 5 photos';
  end if;

  insert into public.reports (reporter_id, reported_user_id, trip_id, report_type, details, evidence_paths)
  values (auth.uid(), p_reported_user_id, p_trip_id, p_report_type, trim(p_details), coalesce(p_evidence_paths, '{}'))
  returning * into result;

  return result;
end;
$$;

grant execute on function public.submit_report(uuid, uuid, text, text, text[]) to authenticated;

commit;
