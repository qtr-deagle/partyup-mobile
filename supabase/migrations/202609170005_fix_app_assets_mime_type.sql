begin;

-- The upload client sends "text/html; charset=utf-8", not bare "text/html",
-- so the bucket's allowlist from 202609170004 rejected every upload.
update storage.buckets
set allowed_mime_types = array['text/html', 'text/html; charset=utf-8']
where id = 'app-assets';

commit;
