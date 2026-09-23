  begin;

  -- Tours set a fixed organizer price per person at creation (ticket-style
  -- pricing), unlike carpool's live total-cost split. Skip auto-computing
  -- price_per_person for tours so it isn't clobbered on every membership
  -- change; seats_available/status bookkeeping stays identical for both types.
  create or replace function public.recompute_trip_fare()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_trip_id uuid;
    v_rider_count int;
    v_total_cost numeric(10,2);
    v_seats_total int;
    v_trip_type text;
  begin
    if TG_TABLE_NAME = 'trips' then
      v_trip_id := new.id;
    elsif TG_OP = 'DELETE' then
      v_trip_id := old.trip_id;
    else
      v_trip_id := new.trip_id;
    end if;

    select count(*) into v_rider_count
    from public.trip_members
    where trip_id = v_trip_id and member_role = 'member' and status = 'accepted';

    select total_cost, seats_total, trip_type into v_total_cost, v_seats_total, v_trip_type
    from public.trips where id = v_trip_id;

    update public.trips
    set
      price_per_person = case
        when v_trip_type = 'tour' then price_per_person
        when v_total_cost is null then null
        else round(v_total_cost / greatest(v_rider_count, 1), 2)
      end,
      seats_available = case when v_seats_total is null then null else greatest(v_seats_total - v_rider_count, 0) end,
      status = case
        when v_seats_total is not null and (v_seats_total - v_rider_count) <= 0 and status = 'open' then 'full'
        when v_seats_total is not null and (v_seats_total - v_rider_count) > 0 and status = 'full' then 'open'
        else status
      end
    where id = v_trip_id;

    if TG_OP = 'DELETE' then
      return old;
    end if;
    return new;
  end;
  $$;

  -- create_trip's signature is changing (five new trailing params), so the old
  -- overload must be dropped rather than replaced in place.
  drop function if exists public.create_trip(text, text, text, timestamptz, timestamptz, text, int, numeric, text, numeric, numeric);

  create or replace function public.create_trip(
    p_title text,
    p_origin text,
    p_destination text,
    p_start_at timestamptz default null,
    p_end_at timestamptz default null,
    p_visibility text default 'public',
    p_seats_total int default null,
    p_total_cost numeric default null,
    p_notes text default null,
    p_destination_lat numeric default null,
    p_destination_lng numeric default null,
    p_trip_type text default 'carpool',
    p_price_per_person numeric default null,
    p_duration_days int default null,
    p_interests text[] default '{}',
    p_itinerary jsonb default '[]'::jsonb
  )
  returns public.trips
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_trip public.trips;
    v_code text;
    v_member_role text;
    v_end_at timestamptz;
    v_day jsonb;
  begin
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;

    if not exists (
      select 1 from public.profiles where id = auth.uid() and verification_status = 'approved'
    ) then
      raise exception 'You must complete ID verification before creating a trip';
    end if;

    if p_trip_type not in ('carpool', 'tour') then
      raise exception 'Invalid trip type';
    end if;

    if p_visibility not in ('public', 'trusted_circle', 'private') then
      raise exception 'Invalid visibility';
    end if;

    if trim(coalesce(p_title, '')) = '' or trim(coalesce(p_origin, '')) = '' or trim(coalesce(p_destination, '')) = '' then
      raise exception 'Title, origin, and destination are required';
    end if;

    if p_trip_type = 'tour' and (p_duration_days is null or p_duration_days <= 0) then
      raise exception 'Duration (in days) is required for tours';
    end if;

    v_end_at := p_end_at;
    if p_trip_type = 'tour' and p_end_at is null and p_start_at is not null and p_duration_days is not null then
      v_end_at := p_start_at + ((p_duration_days - 1) || ' days')::interval;
    end if;

    v_member_role := case when p_trip_type = 'tour' then 'coordinator' else 'driver' end;

    loop
      v_code := encode(gen_random_bytes(5), 'hex');
      exit when not exists (select 1 from public.trips where invite_code = v_code);
    end loop;

    insert into public.trips (
      creator_id, title, trip_type, origin, destination, start_at, end_at,
      status, visibility, seats_total, seats_available, total_cost, price_per_person,
      invite_code, notes, destination_lat, destination_lng, duration_days, interest_tags
    )
    values (
      auth.uid(), trim(p_title), p_trip_type, trim(p_origin), trim(p_destination), p_start_at, v_end_at,
      'open', p_visibility, p_seats_total, p_seats_total, p_total_cost,
      case when p_trip_type = 'tour' then p_price_per_person else null end,
      v_code, nullif(trim(coalesce(p_notes, '')), ''), p_destination_lat, p_destination_lng,
      p_duration_days, coalesce(p_interests, '{}')
    )
    returning * into v_trip;

    insert into public.trip_members (trip_id, user_id, member_role, status, joined_at)
    values (v_trip.id, auth.uid(), v_member_role, 'accepted', now());

    if p_trip_type = 'tour' and jsonb_typeof(p_itinerary) = 'array' then
      for v_day in select * from jsonb_array_elements(p_itinerary) loop
        insert into public.trip_itinerary_days (trip_id, day_number, description)
        values (
          v_trip.id,
          (v_day ->> 'day_number')::int,
          trim(coalesce(v_day ->> 'description', ''))
        );
      end loop;
    end if;

    select * into v_trip from public.trips where id = v_trip.id;
    return v_trip;
  end;
  $$;

  grant execute on function public.create_trip(
    text, text, text, timestamptz, timestamptz, text, int, numeric, text, numeric, numeric, text, numeric, int, text[], jsonb
  ) to authenticated;

  -- get_trip_detail's return columns are changing (trip_type, duration_days,
  -- interest_tags), which Postgres won't allow via create-or-replace on a
  -- table-returning function -- drop first.
  drop function if exists public.get_trip_detail(uuid);

  create or replace function public.get_trip_detail(p_trip_id uuid)
  returns table (
    id uuid, title text, trip_type text, origin text, destination text,
    start_at timestamptz, end_at timestamptz, duration_days int,
    status text, visibility text, seats_total int, seats_available int, notes text,
    total_cost numeric, price_per_person numeric, rider_count int, interest_tags text[],
    invite_code text,
    driver_id uuid, driver_display_name text, driver_avatar_url text,
    driver_gcash_handle text, driver_paymaya_handle text,
    is_driver boolean, my_status text, my_payment_status text, my_payment_amount numeric,
    my_invited_by_display_name text
  )
  language plpgsql
  stable
  security definer
  set search_path = public
  as $$
  begin
    if not exists (
      select 1 from public.trips t
      where t.id = p_trip_id
        and (t.creator_id = auth.uid() or public.is_trip_member(p_trip_id) or public.is_staff_or_admin())
    ) then
      raise exception 'Trip not found';
    end if;

    return query
    select
      t.id, t.title, t.trip_type, t.origin, t.destination, t.start_at, t.end_at, t.duration_days,
      t.status, t.visibility, t.seats_total, t.seats_available, t.notes,
      t.total_cost, t.price_per_person,
      (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int,
      t.interest_tags,
      t.invite_code,
      d.id, d.display_name, d.avatar_url, d.gcash_handle, d.paymaya_handle,
      (t.creator_id = auth.uid()),
      my_tm.status,
      my_tm.payment_status,
      my_tm.payment_amount,
      inviter.display_name
    from public.trips t
    join public.profiles d on d.id = t.creator_id
    left join public.trip_members my_tm on my_tm.trip_id = t.id and my_tm.user_id = auth.uid()
    left join public.profiles inviter on inviter.id = my_tm.invited_by_user_id
    where t.id = p_trip_id;
  end;
  $$;

  grant execute on function public.get_trip_detail(uuid) to authenticated;

  -- list_my_trips's return columns are changing -- drop first (table-returning
  -- function, same reasoning as above).
  drop function if exists public.list_my_trips(text);

  create or replace function public.list_my_trips(p_trip_type text default 'carpool')
  returns table (
    id uuid, title text, origin text, destination text,
    start_at timestamptz, end_at timestamptz, duration_days int,
    status text, visibility text, seats_total int, seats_available int,
    total_cost numeric, price_per_person numeric, interest_tags text[],
    rider_count int, my_role text, my_status text, pending_join_requests_count int,
    organizer_id uuid, organizer_display_name text, organizer_avatar_url text, organizer_verified boolean,
    is_favorited boolean, created_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
  as $$
    select
      t.id, t.title, t.origin, t.destination, t.start_at, t.end_at, t.duration_days,
      t.status, t.visibility, t.seats_total, t.seats_available, t.total_cost, t.price_per_person, t.interest_tags,
      (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int,
      tm.member_role, tm.status,
      case when tm.member_role in ('driver', 'coordinator')
        then (select count(*) from public.trip_members pr where pr.trip_id = t.id and pr.status = 'pending')::int
        else 0
      end,
      o.id, o.display_name, o.avatar_url, (o.verification_status = 'approved'),
      exists(select 1 from public.trip_favorites f where f.trip_id = t.id and f.user_id = auth.uid()),
      t.created_at
    from public.trips t
    join public.trip_members tm on tm.trip_id = t.id and tm.user_id = auth.uid()
    join public.profiles o on o.id = t.creator_id
    where t.trip_type = p_trip_type
      and tm.status in ('accepted', 'pending')
    order by t.created_at desc;
  $$;

  grant execute on function public.list_my_trips(text) to authenticated;

  -- Public, not-yet-joined trips for the "Browse Tours" sub-tab (also usable
  -- later for a carpool browse view, hence trip-type-parameterized).
  create or replace function public.list_browse_trips(p_trip_type text default 'tour', p_search text default null)
  returns table (
    id uuid, title text, origin text, destination text,
    start_at timestamptz, end_at timestamptz, duration_days int,
    status text, visibility text, seats_total int, seats_available int, rider_count int,
    total_cost numeric, price_per_person numeric, interest_tags text[],
    organizer_id uuid, organizer_display_name text, organizer_avatar_url text, organizer_verified boolean,
    is_favorited boolean, created_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
  as $$
    select
      t.id, t.title, t.origin, t.destination, t.start_at, t.end_at, t.duration_days,
      t.status, t.visibility, t.seats_total, t.seats_available,
      (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int,
      t.total_cost, t.price_per_person, t.interest_tags,
      o.id, o.display_name, o.avatar_url, (o.verification_status = 'approved'),
      exists(select 1 from public.trip_favorites f where f.trip_id = t.id and f.user_id = auth.uid()),
      t.created_at
    from public.trips t
    join public.profiles o on o.id = t.creator_id
    where t.trip_type = p_trip_type
      and t.visibility = 'public'
      and t.status in ('open', 'full')
      and t.creator_id <> auth.uid()
      and not exists (
        select 1 from public.trip_members tm
        where tm.trip_id = t.id and tm.user_id = auth.uid() and tm.status in ('accepted', 'pending')
      )
      and (p_search is null or trim(p_search) = '' or t.title ilike '%' || trim(p_search) || '%' or t.destination ilike '%' || trim(p_search) || '%')
    order by t.start_at nulls last, t.created_at desc;
  $$;

  grant execute on function public.list_browse_trips(text, text) to authenticated;

  -- Read-only preview of a tour the caller hasn't joined yet (tapping a Browse
  -- card). Omits invite_code and driver payment handles -- not needed pre-join;
  -- get_trip_detail takes over with full access once the user joins/creates.
  create or replace function public.get_tour_detail(p_trip_id uuid)
  returns table (
    id uuid, title text, origin text, destination text,
    start_at timestamptz, end_at timestamptz, duration_days int,
    status text, visibility text, notes text,
    seats_total int, seats_available int, rider_count int,
    price_per_person numeric, total_cost numeric, interest_tags text[],
    organizer_id uuid, organizer_display_name text, organizer_avatar_url text, organizer_verified boolean,
    is_creator boolean, my_status text, is_favorited boolean
  )
  language plpgsql
  stable
  security definer
  set search_path = public
  as $$
  begin
    if not exists (
      select 1 from public.trips t
      where t.id = p_trip_id and t.trip_type = 'tour'
        and (t.visibility = 'public' or t.creator_id = auth.uid() or public.is_trip_member(p_trip_id) or public.is_staff_or_admin())
    ) then
      raise exception 'Tour not found';
    end if;

    return query
    select
      t.id, t.title, t.origin, t.destination, t.start_at, t.end_at, t.duration_days,
      t.status, t.visibility, t.notes,
      t.seats_total, t.seats_available,
      (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int,
      t.price_per_person, t.total_cost, t.interest_tags,
      o.id, o.display_name, o.avatar_url, (o.verification_status = 'approved'),
      (t.creator_id = auth.uid()),
      my_tm.status,
      exists(select 1 from public.trip_favorites f where f.trip_id = t.id and f.user_id = auth.uid())
    from public.trips t
    join public.profiles o on o.id = t.creator_id
    left join public.trip_members my_tm on my_tm.trip_id = t.id and my_tm.user_id = auth.uid()
    where t.id = p_trip_id;
  end;
  $$;

  grant execute on function public.get_tour_detail(uuid) to authenticated;

  -- Ordered itinerary days for a trip, gated the same way as the itinerary RLS.
  create or replace function public.list_trip_itinerary(p_trip_id uuid)
  returns table (id uuid, day_number int, description text)
  language plpgsql
  stable
  security definer
  set search_path = public
  as $$
  begin
    if not exists (
      select 1 from public.trips t
      where t.id = p_trip_id
        and (t.visibility = 'public' or t.creator_id = auth.uid() or public.is_trip_member(p_trip_id) or public.is_staff_or_admin())
    ) then
      raise exception 'Trip not found';
    end if;

    return query
    select d.id, d.day_number, d.description
    from public.trip_itinerary_days d
    where d.trip_id = p_trip_id
    order by d.day_number;
  end;
  $$;

  grant execute on function public.list_trip_itinerary(uuid) to authenticated;

  -- "Join Tour" button action for public tours -- no invite code involved.
  -- trusted_circle/private tours still require an invite link, same as carpool.
  create or replace function public.join_public_trip(p_trip_id uuid)
  returns table (trip_id uuid, member_status text)
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_trip public.trips;
    v_existing public.trip_members;
  begin
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;

    select * into v_trip from public.trips where id = p_trip_id and visibility = 'public';
    if v_trip.id is null then
      raise exception 'Trip not found';
    end if;

    if v_trip.creator_id = auth.uid() then
      raise exception 'You created this trip';
    end if;

    select * into v_existing from public.trip_members where trip_id = v_trip.id and user_id = auth.uid();
    if v_existing.id is not null then
      return query select v_trip.id, v_existing.status;
      return;
    end if;

    if v_trip.status <> 'open' then
      raise exception 'This trip is no longer accepting participants';
    end if;

    if v_trip.seats_total is not null and coalesce(v_trip.seats_available, 0) <= 0 then
      raise exception 'This trip is full';
    end if;

    insert into public.trip_members (trip_id, user_id, member_role, status, joined_at)
    values (v_trip.id, auth.uid(), 'member', 'accepted', now());

    insert into public.notifications (user_id, type, title, message)
    values (
      v_trip.creator_id, 'trip', 'New participant joined',
      (select display_name from public.profiles where id = auth.uid()) || ' joined "' || v_trip.title || '".'
    );

    return query select v_trip.id, 'accepted'::text;
  end;
  $$;

  grant execute on function public.join_public_trip(uuid) to authenticated;

  -- Favorite/heart toggle for tour cards.
  create or replace function public.toggle_trip_favorite(p_trip_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_existing uuid;
  begin
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;

    select id into v_existing from public.trip_favorites where trip_id = p_trip_id and user_id = auth.uid();
    if v_existing is not null then
      delete from public.trip_favorites where id = v_existing;
      return false;
    end if;

    insert into public.trip_favorites (user_id, trip_id) values (auth.uid(), p_trip_id);
    return true;
  end;
  $$;

  grant execute on function public.toggle_trip_favorite(uuid) to authenticated;

  -- "Interested" sub-tab: the caller's favorited tours.
  create or replace function public.list_favorite_trips(p_trip_type text default 'tour')
  returns table (
    id uuid, title text, origin text, destination text,
    start_at timestamptz, end_at timestamptz, duration_days int,
    status text, visibility text, seats_total int, seats_available int, rider_count int,
    total_cost numeric, price_per_person numeric, interest_tags text[],
    organizer_id uuid, organizer_display_name text, organizer_avatar_url text, organizer_verified boolean,
    created_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
  as $$
    select
      t.id, t.title, t.origin, t.destination, t.start_at, t.end_at, t.duration_days,
      t.status, t.visibility, t.seats_total, t.seats_available,
      (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int,
      t.total_cost, t.price_per_person, t.interest_tags,
      o.id, o.display_name, o.avatar_url, (o.verification_status = 'approved'),
      f.created_at
    from public.trip_favorites f
    join public.trips t on t.id = f.trip_id
    join public.profiles o on o.id = t.creator_id
    where f.user_id = auth.uid() and t.trip_type = p_trip_type
    order by f.created_at desc;
  $$;

  grant execute on function public.list_favorite_trips(text) to authenticated;

  commit;
