begin;

-- sos_alerts and safety_sessions have had a "select own or staff" RLS policy
-- since 202609030006, but every prior reader went through a SECURITY DEFINER
-- RPC (trigger_sos_alert, escalate_safety_session), which executes as the
-- function owner and never exercises caller-level table grants. The staff
-- Trip Monitoring dashboard is the first thing to run a plain
-- `.from('sos_alerts').select()` as an ordinary authenticated user -- RLS
-- policies alone don't grant access, the base table privilege was simply
-- never given to `authenticated` because nothing needed it until now.
grant select on public.sos_alerts to authenticated;
grant select on public.safety_sessions to authenticated;

commit;
