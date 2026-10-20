begin;

-- One JSON result contains the whole roster; result-row caps cannot truncate it.
-- Invocation is internal to the backend after existing Trip admission.
create function public.read_trip_person_snapshot_v1(target_trip uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'observedAt', to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'personCount', count(*),
    'members', coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'user_id', m.user_id, 'display_name', m.display_name,
      'role', m.role, 'status', m.status, 'updated_at', m.updated_at,
      'participation_active', m.participation_active,
      'participation_revision', m.participation_revision
    ) order by m.display_name), '[]'::jsonb)
  ) from public.journey_members m where m.trip_id = target_trip;
$$;
revoke all on function public.read_trip_person_snapshot_v1(uuid) from public, anon, authenticated;
grant execute on function public.read_trip_person_snapshot_v1(uuid) to service_role;

commit;
