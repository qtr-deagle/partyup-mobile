    begin;

    create or replace function public.list_friend_connections()
    returns table (
    user_id uuid,
    display_name text,
    avatar_url text,
    interests text[],
    request_id uuid,
    relationship_status text,
    created_at timestamptz
    )
    language sql
    stable
    security definer
    set search_path = public
    as $$
    select
        case when fr.requester_id = auth.uid() then fr.recipient_id else fr.requester_id end,
        other.display_name,
        other.avatar_url,
        other.interests,
        fr.id,
        case
        when fr.status = 'accepted' then 'accepted'
        when fr.recipient_id = auth.uid() then 'incoming_pending'
        else 'outgoing_pending'
        end,
        fr.created_at
    from public.friend_requests fr
    join public.profiles other
        on other.id = case when fr.requester_id = auth.uid() then fr.recipient_id else fr.requester_id end
    where (fr.requester_id = auth.uid() or fr.recipient_id = auth.uid())
        and fr.status in ('pending', 'accepted')
        and other.is_active
    order by
        case when fr.status = 'accepted' then 0 else 1 end,
        other.display_name asc;
    $$;

    grant execute on function public.list_friend_connections() to authenticated;

    commit;