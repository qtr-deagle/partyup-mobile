begin;

-- get_trip_invite_link's RETURNS TABLE declares an output column named
-- "invite_code", which shadows public.trips.invite_code inside the function
-- body -- every unqualified reference to invite_code was ambiguous between
-- the two. Same bug class as 202609160002, just missed on this function.
create or replace function public.get_trip_invite_link(p_trip_id uuid)
returns table (trip_id uuid, invite_code text, trip_title text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_title text;
begin
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (t.creator_id = auth.uid() or public.is_trip_member(p_trip_id) or public.is_staff_or_admin())
  ) then
    raise exception 'Trip not found';
  end if;

  select t.invite_code, t.title into v_code, v_title from public.trips t where t.id = p_trip_id;

  if v_code is null then
    loop
      v_code := encode(gen_random_bytes(5), 'hex');
      exit when not exists (select 1 from public.trips t where t.invite_code = v_code);
    end loop;
    update public.trips set invite_code = v_code where id = p_trip_id;
  end if;

  return query select p_trip_id, v_code, v_title;
end;
$$;

grant execute on function public.get_trip_invite_link(uuid) to authenticated;

commit;
