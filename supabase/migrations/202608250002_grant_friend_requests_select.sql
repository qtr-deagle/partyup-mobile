begin;

-- RLS policy "friend requests own access" was already correct, but the
-- authenticated role was never granted table-level SELECT on friend_requests.
-- Without the grant, PostgREST rejects every direct client query with
-- "permission denied for table friend_requests" before RLS is even evaluated,
-- so getFriendRequestStatuses() in the app silently got zero rows back.
-- Row visibility is still fully enforced by the existing RLS policy.
grant select on public.friend_requests to authenticated;

commit;
