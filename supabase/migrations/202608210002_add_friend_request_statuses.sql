    begin;

    drop function if exists public.search_profiles(text);
    create or replace function public.search_profiles(p_query text default '')
    returns table (
    id uuid,
    display_name text,
    avatar_url text,
    interests text[],
    request_status text,
    request_id uuid
    )
    language sql
    stable
    security definer
    set search_path = public
    as $$
    select
        p.id,
        p.display_name,
        p.avatar_url,
        p.interests,
        relationship.status,
        relationship.request_id
    from public.profiles p
    left join lateral (
        select
        fr.id as request_id,
        case
            when fr.status = 'accepted' then 'accepted'
            when fr.requester_id = auth.uid() then 'outgoing_pending'
            else 'incoming_pending'
        end as status
        from public.friend_requests fr
        where ((fr.requester_id = auth.uid() and fr.recipient_id = p.id)
        or (fr.recipient_id = auth.uid() and fr.requester_id = p.id))
        and fr.status in ('pending', 'accepted')
        order by case when fr.status = 'accepted' then 1 else 0 end desc, fr.updated_at desc
        limit 1
    ) relationship on true
    where p.is_active
        and p.id <> auth.uid()
        and (
        nullif(trim(p_query), '') is null
        or p.display_name ilike '%' || trim(p_query) || '%'
        or exists (
            select 1 from unnest(coalesce(p.interests, '{}'::text[])) interest
            where interest ilike '%' || trim(p_query) || '%'
        )
        )
    order by p.display_name asc
    limit 50;
    $$;

    grant execute on function public.search_profiles(text) to authenticated;

    create or replace function public.list_incoming_friend_requests()
    returns table (
    id uuid,
    requester_id uuid,
    display_name text,
    created_at timestamptz
    )
    language sql
    stable
    security definer
    set search_path = public
    as $$
    select fr.id, fr.requester_id, p.display_name, fr.created_at
    from public.friend_requests fr
    join public.profiles p on p.id = fr.requester_id
    where fr.recipient_id = auth.uid()
        and fr.status = 'pending'
    order by fr.created_at desc;
    $$;

    grant execute on function public.list_incoming_friend_requests() to authenticated;

    commit;
