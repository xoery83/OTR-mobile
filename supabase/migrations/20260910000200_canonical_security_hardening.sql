-- Approved Dev/Staging security model layered over the production-shape baseline.
-- Do not apply this migration to the legacy production project without a separate review.

create or replace function public.protect_profile_account_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_system_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.account_role := 'free_user';
    return new;
  end if;

  if new.account_role is distinct from old.account_role then
    raise exception 'Only system admins can change account roles.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_account_role_trigger on public.profiles;
create trigger protect_profile_account_role_trigger
before insert or update on public.profiles
for each row execute function public.protect_profile_account_role();

create or replace function public.can_share_journey_live_location(
  target_journey_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.journey_members jm
    where jm.trip_id = target_journey_id
      and jm.user_id = target_user_id
      and jm.status = 'linked'
      and jm.role in ('owner', 'group_member')
  );
$$;

drop policy if exists "Journey members can read active live locations"
  on public.journey_live_locations;
drop policy if exists "Users can create own live location"
  on public.journey_live_locations;
drop policy if exists "Users can update own live location"
  on public.journey_live_locations;

create policy "Active journey members can read active live locations"
  on public.journey_live_locations
  for select
  to authenticated
  using (
    public.can_share_journey_live_location(journey_id, auth.uid())
    and (is_live_enabled = true or user_id = auth.uid())
  );

create policy "Active journey members can create own live location"
  on public.journey_live_locations
  for insert
  to authenticated
  with check (
    public.can_share_journey_live_location(journey_id, auth.uid())
    and user_id = auth.uid()
  );

create policy "Active journey members can update own live location"
  on public.journey_live_locations
  for update
  to authenticated
  using (
    public.can_share_journey_live_location(journey_id, auth.uid())
    and user_id = auth.uid()
  )
  with check (
    public.can_share_journey_live_location(journey_id, auth.uid())
    and user_id = auth.uid()
  );

drop policy if exists "Parser rules are manageable by authenticated users"
  on public.parser_rules;
create policy "Parser rules are manageable by authenticated users"
  on public.parser_rules
  for all
  to authenticated
  using (scope <> 'global' or public.is_system_admin())
  with check (scope <> 'global' or public.is_system_admin());

drop policy if exists "Parser examples are manageable by authenticated users"
  on public.parser_examples;
create policy "Parser examples are manageable by authenticated users"
  on public.parser_examples
  for all
  to authenticated
  using (journey_id is not null or public.is_system_admin())
  with check (journey_id is not null or public.is_system_admin());

drop policy if exists "Parser aliases are manageable by authenticated users"
  on public.parser_aliases;
create policy "Parser aliases are manageable by authenticated users"
  on public.parser_aliases
  for all
  to authenticated
  using (scope <> 'global' or public.is_system_admin())
  with check (scope <> 'global' or public.is_system_admin());

drop policy if exists "Authenticated users can manage capture intent rules"
  on public.capture_intent_rules;
create policy "System admins can manage capture intent rules"
  on public.capture_intent_rules
  for all
  to authenticated
  using (public.is_system_admin())
  with check (public.is_system_admin());

drop policy if exists "Authenticated users can manage capture prompt templates"
  on public.capture_prompt_templates;
create policy "System admins can manage capture prompt templates"
  on public.capture_prompt_templates
  for all
  to authenticated
  using (public.is_system_admin())
  with check (public.is_system_admin());

drop policy if exists "Authenticated users can manage capture routing config"
  on public.capture_routing_config;
create policy "System admins can manage capture routing config"
  on public.capture_routing_config
  for all
  to authenticated
  using (public.is_system_admin())
  with check (public.is_system_admin());

drop policy if exists "Trip members can delete their itinerary item ratings"
  on public.itinerary_item_ratings;
create policy "Trip members can delete their itinerary item ratings"
  on public.itinerary_item_ratings
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and (public.is_trip_member(trip_id) or public.is_trip_creator(trip_id))
  );

-- Face detection and embedding writes are backend-owned. Authenticated users
-- retain the production read policies, but direct INSERT/UPDATE/DELETE is removed.
drop policy if exists "Trip managers can manage member face embeddings"
  on public.journey_member_face_embeddings;
drop policy if exists "Trip members can add member face embeddings"
  on public.journey_member_face_embeddings;
drop policy if exists "Trip managers can delete photo faces"
  on public.photo_faces;
drop policy if exists "Trip managers can update photo faces"
  on public.photo_faces;
drop policy if exists "Trip members can confirm photo faces"
  on public.photo_faces;
drop policy if exists "Trip members can insert photo faces"
  on public.photo_faces;

-- Default PostgreSQL EXECUTE is PUBLIC. Remove it from every SECURITY DEFINER
-- function, then restore only the explicitly approved authenticated/service paths.
do $$
declare
  target_function text;
begin
  for target_function in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke all privileges on function %s from public, anon, authenticated, service_role',
      target_function
    );
  end loop;
end;
$$;

grant execute on function public.accept_journey_invite(text) to authenticated, service_role;
grant execute on function public.can_access_memory_shot_preview(text) to authenticated, service_role;
grant execute on function public.can_access_trip_media(text) to authenticated, service_role;
grant execute on function public.can_manage_background_jobs(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_itinerary_event_participants(uuid) to authenticated, service_role;
grant execute on function public.can_manage_itinerary_reservation_participants(uuid) to authenticated, service_role;
grant execute on function public.can_share_journey_live_location(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_upload_trip_media(text) to authenticated, service_role;
grant execute on function public.claim_email_invited_journeys() to authenticated, service_role;
grant execute on function public.claim_journey_member(uuid) to authenticated, service_role;
grant execute on function public.delete_memory_entry_for_current_user(uuid) to authenticated, service_role;
grant execute on function public.get_journey_members_for_current_user(uuid) to authenticated, service_role;
grant execute on function public.get_trip_members_for_current_user(uuid) to authenticated, service_role;
grant execute on function public.is_system_admin(uuid) to authenticated, service_role;
grant execute on function public.is_trip_creator(uuid) to authenticated, service_role;
grant execute on function public.is_trip_member(uuid) to authenticated, service_role;
grant execute on function public.is_trip_member_or_creator(uuid) to authenticated, service_role;
grant execute on function public.is_trip_owner_or_admin(uuid) to authenticated, service_role;
grant execute on function public.list_account_roles() to authenticated, service_role;
grant execute on function public.remove_journey_member(uuid, boolean) to authenticated, service_role;
grant execute on function public.revoke_journey_chat_message_for_current_user(uuid) to authenticated, service_role;
grant execute on function public.search_account_roles(text) to authenticated, service_role;
grant execute on function public.update_own_journey_member_notes(uuid, text) to authenticated, service_role;
grant execute on function public.update_profile_account_role(uuid, text) to authenticated, service_role;

-- Trigger-only functions intentionally receive no API-role EXECUTE grant:
-- add_trip_creator_as_member(), add_trip_creator_as_journey_member(),
-- protect_profile_account_role().
