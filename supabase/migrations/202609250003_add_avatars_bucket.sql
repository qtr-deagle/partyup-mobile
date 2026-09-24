begin;

-- Public bucket for profile photos. Avatars are shown to other travelers
-- (trip members, chat, map pins), so they're served from the public CDN URL
-- that gets stored in profiles.avatar_url. Each user writes only under their
-- own <user_id>/ folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "avatars own insert" on storage.objects;
create policy "avatars own insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Public URLs work without this; it's only so a user can list their own
-- folder to clean up previous avatars.
drop policy if exists "avatars own select" on storage.objects;
create policy "avatars own select"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars own delete" on storage.objects;
create policy "avatars own delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

commit;
