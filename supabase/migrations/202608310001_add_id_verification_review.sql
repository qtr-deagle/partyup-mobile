begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-verifications', 'id-verifications', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "id verifications storage own insert" on storage.objects;
create policy "id verifications storage own insert"
  on storage.objects for insert
  with check (
    bucket_id = 'id-verifications'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "id verifications storage read" on storage.objects;
create policy "id verifications storage read"
  on storage.objects for select
  using (
    bucket_id = 'id-verifications'
    and (
      (auth.uid())::text = (storage.foldername(name))[1]
      or public.is_staff_or_admin()
    )
  );

drop policy if exists "id verifications storage own delete" on storage.objects;
create policy "id verifications storage own delete"
  on storage.objects for delete
  using (
    bucket_id = 'id-verifications'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create or replace function public.review_id_verification(
  p_verification_id uuid,
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
    raise exception 'Only staff or admin can review ID verifications';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select user_id into v_user_id
  from public.id_verifications
  where id = p_verification_id
  for update;

  if v_user_id is null then
    raise exception 'Verification not found';
  end if;

  update public.id_verifications
  set
    status = p_decision,
    reviewer_id = auth.uid(),
    reviewer_notes = p_notes,
    reviewed_at = now()
  where id = p_verification_id;

  update public.profiles
  set verification_status = p_decision
  where id = v_user_id;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_user_id,
    'system',
    case when p_decision = 'approved' then 'ID verification approved' else 'ID verification rejected' end,
    case
      when p_decision = 'approved' then 'Your identity has been verified. You can now create and join trips!'
      else coalesce('Your ID verification was rejected: ' || p_notes, 'Your ID verification was rejected. Please resubmit with clearer documents.')
    end
  );
end;
$$;

commit;
