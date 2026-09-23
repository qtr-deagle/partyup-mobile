begin;

-- app-assets (202609170004/202609170005) was created to host a static HTML
-- redirect bridge for PayMongo's return_url, but Supabase's storage CDN
-- applies the same forced text/plain + sandboxed CSP as the Functions
-- gateway, so it could never actually render as HTML either. Superseded by
-- matching the return_url directly against openAuthSessionAsync's redirect
-- interception instead (see create-gateway-payment and app/trip/[id].tsx),
-- which needs no hosted page content at all. The bucket itself can't be
-- dropped via SQL (Supabase blocks direct writes to storage tables), but its
-- one object has been removed via the Storage API and nothing references
-- this bucket anymore -- it's just an empty, unused, staff-write-only bucket.
drop policy if exists "app assets staff write" on storage.objects;

commit;
