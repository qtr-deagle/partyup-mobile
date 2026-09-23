begin;

alter table public.reports add column if not exists evidence_paths text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence', 'report-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "report evidence storage own insert" on storage.objects;
create policy "report evidence storage own insert"
  on storage.objects for insert
  with check (
    bucket_id = 'report-evidence'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "report evidence storage read" on storage.objects;
create policy "report evidence storage read"
  on storage.objects for select
  using ( 
    bucket_id = 'report-evidence'
    and (
      (auth.uid())::text = (storage.foldername(name))[1]
      or public.is_staff_or_admin()
    )
  );

drop policy if exists "report evidence storage own delete" on storage.objects;
create policy "report evidence storage own delete"
  on storage.objects for delete
  using (
    bucket_id = 'report-evidence'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Adds an optional evidence_paths param (photos the reporter attaches, e.g.
-- a screenshot of an abusive chat). Postgres treats a new trailing param as a
-- distinct overload even with a default, so the old 4-arg signature must be
-- dropped rather than replaced in place (same reasoning as create_trip above).
drop function if exists public.submit_report(uuid, uuid, text, text);

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

  if p_report_type not in ('safety', 'behavior', 'other') then
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
