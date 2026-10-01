begin;

-- =====================================================================
-- 0. Security: "staff" powers are admin-only again.
--
-- When staff became Guild Leaders, every policy/RPC that checked
-- is_staff_or_admin() started handing leaders near-admin access: read any
-- chat, edit any profile or trip, see trusted contacts and location
-- history, and (via protect_profile_sensitive_fields) change their OWN role
-- to admin. Leaders are now promoted travelers, so is_staff_or_admin()
-- means admin only, and leaders get back exactly what their screens need
-- through is_guild_leader_or_admin(): the ID/vehicle review queues and
-- photos, the people they're reviewing, and active SOS alerts.
-- =====================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

create or replace function public.is_guild_leader_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('guild_leader', 'admin');
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_guild_leader_or_admin() to authenticated;

-- Review queues.
drop policy if exists "id verifications leader read" on public.id_verifications;
create policy "id verifications leader read" on public.id_verifications for select to authenticated
  using (public.is_guild_leader_or_admin());

drop policy if exists "vehicles leader read" on public.vehicles;
create policy "vehicles leader read" on public.vehicles for select to authenticated
  using (public.is_guild_leader_or_admin() and verification_status <> 'unverified');

-- Only the people a leader actually has reason to look at.
drop policy if exists "profiles leader read" on public.profiles;
create policy "profiles leader read" on public.profiles for select to authenticated
  using (
    public.is_guild_leader_or_admin()
    and (
      exists (select 1 from public.id_verifications iv where iv.user_id = profiles.id)
      or exists (select 1 from public.vehicles v where v.user_id = profiles.id and v.verification_status <> 'unverified')
      or exists (select 1 from public.sos_alerts s where s.user_id = profiles.id)
    )
  );

drop policy if exists "id verifications storage leader read" on storage.objects;
create policy "id verifications storage leader read" on storage.objects for select
  using (bucket_id = 'id-verifications' and public.is_guild_leader_or_admin());

drop policy if exists "vehicle verifications storage leader read" on storage.objects;
create policy "vehicle verifications storage leader read" on storage.objects for select
  using (bucket_id = 'vehicle-verifications' and public.is_guild_leader_or_admin());

-- SOS map: alerts, and the live location of someone with an active alert.
drop policy if exists "sos alerts leader read" on public.sos_alerts;
create policy "sos alerts leader read" on public.sos_alerts for select to authenticated
  using (public.is_guild_leader_or_admin());

drop policy if exists "current locations leader sos read" on public.current_locations;
create policy "current locations leader sos read" on public.current_locations for select to authenticated
  using (
    public.is_guild_leader_or_admin()
    and exists (select 1 from public.sos_alerts s where s.user_id = current_locations.user_id and s.status = 'active')
  );

-- The review RPCs and the vehicle edit guard must still let leaders review.
create or replace function public.review_id_verification(
  p_verification_id uuid,
  p_decision text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_guild_leader_or_admin() then
    raise exception 'Only Guild Leaders or admins can review ID verifications';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select user_id into v_user_id
  from public.id_verifications
  where id = p_verification_id
  for update;

  if v_user_id is null then
    raise exception 'Verification not found';
  end if;

  update public.id_verifications
  set
    status = p_decision,
    reviewer_id = auth.uid(),
    reviewer_notes = p_notes,
    reviewed_at = now()
  where id = p_verification_id;

  update public.profiles
  set verification_status = p_decision
  where id = v_user_id;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_user_id,
    'system',
    case when p_decision = 'approved' then 'ID verification approved' else 'ID verification rejected' end,
    case
      when p_decision = 'approved' then 'Your identity has been verified. You can now create and join trips!'
      else coalesce('Your ID verification was rejected: ' || p_notes, 'Your ID verification was rejected. Please resubmit with clearer documents.')
    end
  );
end;
$$;

create or replace function public.review_vehicle_verification(
  p_vehicle_id uuid,
  p_decision text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_guild_leader_or_admin() then
    raise exception 'Only Guild Leaders or admins can review vehicle verifications';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select user_id into v_user_id
  from public.vehicles
  where id = p_vehicle_id
  for update;

  if v_user_id is null then
    raise exception 'Vehicle not found';
  end if;

  update public.vehicles
  set
    verification_status = p_decision,
    reviewer_id = auth.uid(),
    reviewer_notes = p_notes,
    reviewed_at = now()
  where id = p_vehicle_id;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_user_id,
    'system',
    case when p_decision = 'approved' then 'Vehicle verification approved' else 'Vehicle verification rejected' end,
    case
      when p_decision = 'approved' then 'Your vehicle has been verified. You can now use it to create carpool trips!'
      else coalesce('Your vehicle verification was rejected: ' || p_notes, 'Your vehicle verification was rejected. Please resubmit clearer photos.')
    end
  );
end;
$$;

create or replace function public.guard_vehicle_verification_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_guild_leader_or_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status <> 'unverified' then
      raise exception 'New vehicles must start as unverified';
    end if;
    return new;
  end if;

  if old.verification_status in ('pending', 'approved') and (
    new.make is distinct from old.make
    or new.model is distinct from old.model
    or new.year is distinct from old.year
    or new.color is distinct from old.color
    or new.plate_number is distinct from old.plate_number
    or new.ownership_type is distinct from old.ownership_type
    or new.exterior_image_path is distinct from old.exterior_image_path
    or new.orcr_image_path is distinct from old.orcr_image_path
    or new.plate_image_path is distinct from old.plate_image_path
    or new.authorization_letter_path is distinct from old.authorization_letter_path
    or new.owner_id_front_path is distinct from old.owner_id_front_path
    or new.owner_id_back_path is distinct from old.owner_id_back_path
    or new.owner_signatures_path is distinct from old.owner_signatures_path
  ) then
    raise exception 'This vehicle can''t be edited while it is under review or verified';
  end if;

  if new.verification_status is distinct from old.verification_status
    and not (old.verification_status in ('unverified', 'rejected') and new.verification_status = 'pending') then
    raise exception 'Only reviewers can change a vehicle''s verification status';
  end if;

  if new.reviewer_id is distinct from old.reviewer_id
    or new.reviewer_notes is distinct from old.reviewer_notes
    or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Only reviewers can change review details';
  end if;

  return new;
end;
$$;

grant execute on function public.review_id_verification(uuid, text, text) to authenticated;
grant execute on function public.review_vehicle_verification(uuid, text, text) to authenticated;

-- =====================================================================
-- 1. New point reason for overturned reviews.
-- =====================================================================
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.guild_point_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%reason%'
  loop
    execute format('alter table public.guild_point_events drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.guild_point_events
  add constraint guild_point_events_reason_check check (reason in (
    'id_review', 'vehicle_review', 'report_resolved', 'report_dismissed', 'sos_resolved',
    'trip_completed', 'trip_hosted', 'guild_trip_bonus', 'guild_joined', 'guild_founded',
    'id_verified', 'redemption', 'redemption_refund', 'admin_adjustment', 'mission_reward',
    'review_overturned'
  ));

-- =====================================================================
-- 2. Becoming a Guild Leader: Gold+ verified travelers apply; admins
--    approve on the website.
-- =====================================================================
create table if not exists public.guild_leader_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  guild_name text not null check (char_length(btrim(guild_name)) between 3 and 30),
  pitch text not null check (char_length(btrim(pitch)) between 10 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  admin_notes text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.profiles(id) on delete set null
);

create unique index if not exists guild_leader_applications_one_pending_idx
  on public.guild_leader_applications(user_id) where status = 'pending';
create index if not exists guild_leader_applications_status_idx
  on public.guild_leader_applications(status, created_at);

alter table public.guild_leader_applications enable row level security;
drop policy if exists "leader applications own or admin" on public.guild_leader_applications;
create policy "leader applications own or admin" on public.guild_leader_applications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
grant select on public.guild_leader_applications to authenticated;
grant all on public.guild_leader_applications to service_role;

-- Gold = 750 lifetime pts (RANKS in lib/guilds.ts); rating >= 4 if rated.
create or replace function public.get_leader_eligibility()
returns table (
  lifetime_points bigint,
  is_gold boolean,
  verified boolean,
  avg_rating numeric,
  rating_count bigint,
  rating_ok boolean,
  eligible boolean,
  pending_application boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      public.guild_lifetime_points(auth.uid()) as pts,
      (select verification_status = 'approved' from public.profiles where id = auth.uid()) as verified,
      (select avg(rating) from public.feedback where target_user_id = auth.uid()) as avg_rating,
      (select count(*) from public.feedback where target_user_id = auth.uid()) as rating_count,
      exists (select 1 from public.guild_leader_applications where user_id = auth.uid() and status = 'pending') as pending
  )
  select
    pts,
    pts >= 750,
    coalesce(verified, false),
    round(avg_rating, 2),
    rating_count,
    rating_count = 0 or avg_rating >= 4,
    pts >= 750 and coalesce(verified, false) and (rating_count = 0 or avg_rating >= 4),
    pending
  from me;
$$;

create or replace function public.apply_for_guild_leader(p_guild_name text, p_pitch text)
returns public.guild_leader_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eligible boolean;
  v_app public.guild_leader_applications;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if public.current_user_role() <> 'traveler' then
    raise exception 'Only travelers can apply';
  end if;
  select e.eligible into v_eligible from public.get_leader_eligibility() e;
  if not coalesce(v_eligible, false) then
    raise exception 'You need Gold rank, a verified ID and a 4+ rating to apply';
  end if;
  if exists (select 1 from public.guild_leader_applications where user_id = auth.uid() and status = 'pending') then
    raise exception 'You already have an application under review';
  end if;
  if exists (select 1 from public.guilds where lower(btrim(name)) = lower(btrim(p_guild_name))) then
    raise exception 'That guild name is taken';
  end if;

  insert into public.guild_leader_applications (user_id, guild_name, pitch)
  values (auth.uid(), btrim(p_guild_name), btrim(p_pitch))
  returning * into v_app;

  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, title, message, data)
  select p.id, 'system', 'New Guild Leader application',
    coalesce(v_name, 'A traveler') || ' wants to found ' || v_app.guild_name || '.',
    jsonb_build_object('application_id', v_app.id)
  from public.profiles p where p.role = 'admin';

  return v_app;
end;
$$;

create or replace function public.get_my_leader_application()
returns setof public.guild_leader_applications
language sql
stable
security definer
set search_path = public
as $$
  select * from public.guild_leader_applications
  where user_id = auth.uid()
  order by created_at desc
  limit 1;
$$;

-- Admin queue with what's needed to decide.
create or replace function public.get_leader_applications(p_status text default 'pending')
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  lifetime_points bigint,
  avg_rating numeric,
  rating_count bigint,
  current_guild text,
  guild_name text,
  pitch text,
  status text,
  admin_notes text,
  created_at timestamptz,
  handled_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.user_id, p.display_name, p.avatar_url,
    public.guild_lifetime_points(a.user_id),
    (select round(avg(rating), 2) from public.feedback where target_user_id = a.user_id),
    (select count(*) from public.feedback where target_user_id = a.user_id),
    (select g.name from public.guild_members gm join public.guilds g on g.id = gm.guild_id where gm.user_id = a.user_id),
    a.guild_name, a.pitch, a.status, a.admin_notes, a.created_at, a.handled_at
  from public.guild_leader_applications a
  join public.profiles p on p.id = a.user_id
  where public.is_admin() and (p_status is null or a.status = p_status)
  order by a.created_at;
$$;

create or replace function public.handle_leader_application(p_application_id uuid, p_approve boolean, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.guild_leader_applications;
  v_guild public.guilds;
  v_founded boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only admins can handle leader applications';
  end if;

  select * into v_app from public.guild_leader_applications where id = p_application_id for update;
  if v_app.id is null or v_app.status <> 'pending' then
    raise exception 'This application was already handled';
  end if;

  update public.guild_leader_applications
  set status = case when p_approve then 'approved' else 'declined' end,
      admin_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      handled_at = now(),
      handled_by = auth.uid()
  where id = v_app.id;

  if p_approve then
    update public.profiles set role = 'guild_leader' where id = v_app.user_id;
    -- Leaders lead their own guild; they leave the old one (points stay with it).
    delete from public.guild_members where user_id = v_app.user_id;
    update public.guild_join_requests set status = 'cancelled', handled_at = now(), handled_by = auth.uid()
    where user_id = v_app.user_id and status = 'pending';

    if not exists (select 1 from public.guilds where lower(btrim(name)) = lower(btrim(v_app.guild_name)))
      and not exists (select 1 from public.guilds where leader_id = v_app.user_id) then
      insert into public.guilds (name, leader_id, join_policy)
      values (v_app.guild_name, v_app.user_id, 'approval')
      returning * into v_guild;
      insert into public.guild_members (user_id, guild_id) values (v_app.user_id, v_guild.id);
      perform public.award_guild_points(v_app.user_id, 50, 'guild_founded', 'once', v_guild.id, v_guild.name);
      v_founded := true;
    end if;

    insert into public.notifications (user_id, type, title, message, data)
    values (v_app.user_id, 'system', 'You''re a Guild Leader!',
      case when v_founded
        then v_app.guild_name || ' is founded. Set its emblem and start recruiting.'
        else 'Your application was approved. Found your guild from the Guild screen.'
      end,
      jsonb_build_object('route', '/guild'));
  else
    insert into public.notifications (user_id, type, title, message, data)
    values (v_app.user_id, 'system', 'Leader application not approved',
      'Your application to found ' || v_app.guild_name || ' wasn''t approved this time.'
        || coalesce(' Note: ' || nullif(btrim(coalesce(p_notes, '')), ''), ''),
      jsonb_build_object('route', '/guild'));
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), case when p_approve then 'Approved leader application' else 'Declined leader application' end,
    'profile', v_app.user_id, jsonb_build_object('guild_name', v_app.guild_name, 'founded', v_founded));
end;
$$;

grant execute on function public.get_leader_eligibility() to authenticated;
grant execute on function public.apply_for_guild_leader(text, text) to authenticated;
grant execute on function public.get_my_leader_application() to authenticated;
grant execute on function public.get_leader_applications(text) to authenticated;
grant execute on function public.handle_leader_application(uuid, boolean, text) to authenticated;

-- =====================================================================
-- 3. Guardrails for leader reviews.
-- =====================================================================

-- True when p_leader leads a guild that p_subject is in or asking to join.
create or replace function public.leader_has_conflict(p_leader uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guilds g
    where g.leader_id = p_leader
      and (
        exists (select 1 from public.guild_members gm where gm.guild_id = g.id and gm.user_id = p_subject)
        or exists (select 1 from public.guild_join_requests r where r.guild_id = g.id and r.user_id = p_subject and r.status = 'pending')
      )
  );
$$;

create or replace function public.guard_leader_review_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reviewer_id is not null
    and (new.reviewer_id is distinct from old.reviewer_id or new.reviewed_at is distinct from old.reviewed_at) then
    if public.guild_role_of(new.reviewer_id) = 'guild_leader'
      and public.leader_has_conflict(new.reviewer_id, new.user_id) then
      raise exception 'This person is in or joining your guild, so another leader or an admin will review it';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_leader_review_conflict_id on public.id_verifications;
create trigger guard_leader_review_conflict_id
before update on public.id_verifications
for each row execute function public.guard_leader_review_conflict();

drop trigger if exists guard_leader_review_conflict_vehicle on public.vehicles;
create trigger guard_leader_review_conflict_vehicle
before update on public.vehicles
for each row execute function public.guard_leader_review_conflict();

-- Review points stop after 10 reviews a day (the reviews still count).
create or replace function public.review_points_capped(p_reviewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= 10 from public.guild_point_events
  where user_id = p_reviewer and reason in ('id_review', 'vehicle_review')
    and created_at >= date_trunc('day', now());
$$;

create or replace function public.guild_points_on_id_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('approved', 'rejected')
    and old.status in ('pending', 'resubmitted')
    and new.reviewer_id is not null
    and new.reviewer_id <> new.user_id
    and not public.review_points_capped(new.reviewer_id) then
    perform public.award_guild_points(new.reviewer_id, 10, 'id_review',
      'id:' || new.id || ':' || coalesce(extract(epoch from new.reviewed_at)::bigint::text, ''), new.id);
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.award_guild_points(new.user_id, 50, 'id_verified', 'once', new.id, 'Welcome to PartyUp');
  end if;

  -- An admin reversing a leader's decision takes that leader's points back.
  if old.status in ('approved', 'rejected') and new.status in ('approved', 'rejected')
    and new.status <> old.status
    and old.reviewer_id is not null
    and public.guild_role_of(old.reviewer_id) = 'guild_leader'
    and public.guild_role_of(new.reviewer_id) = 'admin' then
    perform public.award_guild_points(old.reviewer_id, -10, 'review_overturned',
      'overturn:id:' || new.id || ':' || coalesce(extract(epoch from new.reviewed_at)::bigint::text, ''), new.id);
    insert into public.notifications (user_id, type, title, message)
    values (old.reviewer_id, 'system', 'A review was overturned',
      'An admin changed one of your ID decisions to ' || new.status || '. −10 pts. Take a closer look next time.');
  end if;

  return new;
end;
$$;

create or replace function public.guild_points_on_vehicle_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status in ('approved', 'rejected')
    and old.verification_status = 'pending'
    and new.reviewer_id is not null
    and new.reviewer_id <> new.user_id
    and not public.review_points_capped(new.reviewer_id) then
    perform public.award_guild_points(new.reviewer_id, 10, 'vehicle_review',
      'vehicle:' || new.id || ':' || coalesce(extract(epoch from new.reviewed_at)::bigint::text, ''), new.id);
  end if;

  if old.verification_status in ('approved', 'rejected') and new.verification_status in ('approved', 'rejected')
    and new.verification_status <> old.verification_status
    and old.reviewer_id is not null
    and public.guild_role_of(old.reviewer_id) = 'guild_leader'
    and public.guild_role_of(new.reviewer_id) = 'admin' then
    perform public.award_guild_points(old.reviewer_id, -10, 'review_overturned',
      'overturn:vehicle:' || new.id || ':' || coalesce(extract(epoch from new.reviewed_at)::bigint::text, ''), new.id);
    insert into public.notifications (user_id, type, title, message)
    values (old.reviewer_id, 'system', 'A review was overturned',
      'An admin changed one of your vehicle decisions to ' || new.verification_status || '. −10 pts. Take a closer look next time.');
  end if;

  return new;
end;
$$;

-- Leader scorecards for admins.
create or replace function public.get_leader_scorecards()
returns table (
  user_id uuid,
  display_name text,
  guild_id uuid,
  guild_name text,
  member_count bigint,
  reviews_30d bigint,
  reviews_today bigint,
  avg_turnaround_hours numeric,
  overturned bigint,
  lifetime_points bigint,
  last_active timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, g.id, g.name,
    (select count(*) from public.guild_members gm where gm.guild_id = g.id),
    (select count(*) from public.id_verifications iv where iv.reviewer_id = p.id and iv.reviewed_at >= now() - interval '30 days')
      + (select count(*) from public.vehicles v where v.reviewer_id = p.id and v.reviewed_at >= now() - interval '30 days'),
    (select count(*) from public.guild_point_events e where e.user_id = p.id and e.reason in ('id_review', 'vehicle_review') and e.created_at >= date_trunc('day', now())),
    (select round(avg(extract(epoch from (iv.reviewed_at - iv.submitted_at)) / 3600.0)::numeric, 1)
      from public.id_verifications iv where iv.reviewer_id = p.id and iv.reviewed_at >= now() - interval '30 days'),
    (select count(*) from public.guild_point_events e where e.user_id = p.id and e.reason = 'review_overturned'),
    public.guild_lifetime_points(p.id),
    greatest(
      (select max(created_at) from public.guild_point_events e where e.user_id = p.id),
      (select max(reviewed_at) from public.id_verifications iv where iv.reviewer_id = p.id)
    )
  from public.profiles p
  left join public.guilds g on g.leader_id = p.id
  where public.is_admin() and p.role = 'guild_leader'
  order by 6 desc, p.display_name;
$$;

grant execute on function public.get_leader_scorecards() to authenticated;

-- =====================================================================
-- 4. Leaders travel too: trip missions are for everyone.
-- =====================================================================
update public.guild_missions set audience = 'everyone'
where key in (
  'w_trip_1', 'w_trip_3', 'm_dest_3', 'm_host_2', 'm_carpool_5',
  'ms_trips_1', 'ms_trips_10', 'ms_trips_25', 'ms_trips_50',
  'ms_dest_5', 'ms_dest_15', 'ms_dest_30',
  'ms_host_1', 'ms_host_5', 'ms_host_15'
);

commit;
