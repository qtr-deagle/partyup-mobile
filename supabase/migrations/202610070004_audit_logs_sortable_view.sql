begin;

-- The website's Audit Log sorts in the query (it pages on the server), but two
-- of its columns weren't real columns: the admin's name lives in profiles, and
-- severity was only computed in the page from the action text. This view adds
-- both so they can be ordered (and severity filtered) server-side.
--
-- severity_rank: 3 = high, 2 = medium, 1 = low. Keep in sync with getSeverity()
-- in PartyUp-main client/src/pages/AdminAudit.tsx:
--   high   = action starts with "rejected" or mentions "sos"
--   medium = starts with "resolved", "dismissed" or "started investigating"
--   low    = everything else
--
-- security_invoker: the view runs as the reader, so audit_logs' RLS (staff /
-- admin only) and profiles' RLS still apply. Without it a view runs as its
-- owner and would bypass them.
create or replace view public.audit_logs_view
with (security_invoker = true)
as
select
  l.*,
  coalesce(p.display_name, 'System') as actor_name,
  case
    when lower(l.action) like 'rejected%' or lower(l.action) like '%sos%' then 3
    when lower(l.action) like 'resolved%'
      or lower(l.action) like 'dismissed%'
      or lower(l.action) like 'started investigating%' then 2
    else 1
  end as severity_rank
from public.audit_logs l
left join public.profiles p on p.id = l.actor_id;

-- Supabase stopped auto-granting new public relations (2026-10-30), so grant
-- explicitly.
revoke all on public.audit_logs_view from anon;
grant select on public.audit_logs_view to authenticated;

commit;
