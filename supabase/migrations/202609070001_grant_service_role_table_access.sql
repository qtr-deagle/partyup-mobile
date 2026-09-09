-- The initial schema migration only ever granted table privileges to the
-- `authenticated` role (see line ~818 of 202608080001_partyup_initial_schema.sql).
-- service_role was assumed to have full access automatically, but this project's
-- default-privilege bootstrap does not reliably cover every table for every role
-- (we hit the same gap for `authenticated` on friend_requests in
-- 202608250002_grant_friend_requests_select.sql). The verify-id-ai edge function
-- is the first thing to use a service-role client directly against PostgREST,
-- which is what surfaced this: "permission denied for table id_verifications".
--
-- service_role already has BYPASSRLS, so these grants only affect the
-- table-level ACL check that happens before RLS is even evaluated.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Make sure this doesn't happen again for tables created by future migrations.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
