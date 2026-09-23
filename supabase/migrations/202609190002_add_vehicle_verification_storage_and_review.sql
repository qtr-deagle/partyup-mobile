begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-verifications', 'vehicle-verifications', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "vehicle verifications storage own insert" on storage.objects;
create policy "vehicle verifications storage own insert"
  on storage.objects for insert
  with check (
    bucket_id = 'vehicle-verifications'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "vehicle verifications storage read" on storage.objects;
create policy "vehicle verifications storage read"
  on storage.objects for select
  using (
    bucket_id = 'vehicle-verifications'
    and (
      (auth.uid())::text = (storage.foldername(name))[1]
      or public.is_staff_or_admin()
    )
  );

drop policy if exists "vehicle verifications storage own delete" on storage.objects;
create policy "vehicle verifications storage own delete"
  on storage.objects for delete
  using (
    bucket_id = 'vehicle-verifications'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create or replace function public.review_vehicle_verification(
  p_vehicle_id uuid,
  p_decision text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_staff_or_admin() then
    raise exception 'Only staff or admin can review vehicle verifications';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select user_id into v_user_id
  from public.vehicles
  where id = p_vehicle_id
  for update;

  if v_user_id is null then
    raise exception 'Vehicle not found';
  end if;

  update public.vehicles
  set
    verification_status = p_decision,
    reviewer_id = auth.uid(),
    reviewer_notes = p_notes,
    reviewed_at = now()
  where id = p_vehicle_id;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_user_id,
    'system',
    case when p_decision = 'approved' then 'Vehicle verification approved' else 'Vehicle verification rejected' end,
    case
      when p_decision = 'approved' then 'Your vehicle has been verified. You can now use it to create carpool trips!'
      else coalesce('Your vehicle verification was rejected: ' || p_notes, 'Your vehicle verification was rejected. Please resubmit clearer photos.')
    end
  );
end;
$$;

grant execute on function public.review_vehicle_verification(uuid, text, text) to authenticated;

commit;
