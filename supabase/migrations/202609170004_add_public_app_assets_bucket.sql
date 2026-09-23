begin;

-- Public bucket for small static assets the app needs served over plain
-- https with the real Content-Type intact (e.g. the PayMongo return_url
-- bridge page). The Edge Functions gateway forces text/plain + a locked-down
-- CSP on every function response regardless of headers set in code, which
-- breaks serving real HTML from a function -- Storage's public object CDN
-- does not have that restriction, so static HTML lives here instead.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-assets', 'app-assets', true, 1048576, array['text/html'])
on conflict (id) do nothing;

drop policy if exists "app assets staff write" on storage.objects;
create policy "app assets staff write"
  on storage.objects for all
  using (bucket_id = 'app-assets' and public.is_staff_or_admin())
  with check (bucket_id = 'app-assets' and public.is_staff_or_admin());

commit;
