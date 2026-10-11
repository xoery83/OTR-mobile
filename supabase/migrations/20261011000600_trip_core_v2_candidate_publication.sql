-- Core90: private date-bound airport authority for owning Candidate publication.
begin;
create table public.trip_core_airport_identities (
 namespace text not null check(namespace='IATA_AIRPORT'),
 issuer text not null check(issuer='IATA'),
 airport_code text not null check(airport_code ~ '^[A-Z]{3}$'),
 identity_id text not null check(identity_id='IATA_AIRPORT:'||airport_code),
 valid_from date not null check(isfinite(valid_from)),
 valid_until date check(valid_until is null or isfinite(valid_until) and valid_until>=valid_from),
 registry_version text not null check(length(registry_version) between 1 and 128),
 registry_sha256 text not null check(registry_sha256 ~ '^[0-9a-f]{64}$'),
 enabled boolean not null default true,
 primary key(namespace,airport_code,registry_version,valid_from)
);
create function public.trip_core_airport_registry_immutable()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin
 if tg_op='DELETE' then raise exception 'AIRPORT_AUTHORITY_IMMUTABLE' using errcode='42501';end if;
 if (to_jsonb(new)-'enabled') is distinct from (to_jsonb(old)-'enabled') then raise exception 'AIRPORT_AUTHORITY_IMMUTABLE' using errcode='42501';end if;
 return new;
end $$;
revoke all on function public.trip_core_airport_registry_immutable() from public,anon,authenticated,service_role;
create trigger core_v2_airport_registry_immutable before update or delete on public.trip_core_airport_identities for each row execute function public.trip_core_airport_registry_immutable();
alter table public.trip_core_airport_identities enable row level security;
alter table public.trip_core_airport_identities force row level security;
revoke all on public.trip_core_airport_identities from public,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
create function public.trip_core_resolve_airport(airport_namespace text,airport_issuer text,code text,service_date date)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare actor uuid;trip uuid;scope jsonb;identities jsonb;begin
 if session_user<>'otr_trip_core_v2_gateway' or current_user not in ('postgres','supabase_admin') then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;
 trip:=nullif(current_setting('otr.core.trip',true),'')::uuid;
 if actor is null or trip is null then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 scope:=public.trip_core_lock_actor_scope(actor,trip);
 if scope->>'active'<>'true' then raise exception 'NOT_VISIBLE' using errcode='42501';end if;
 if airport_namespace<>'IATA_AIRPORT' or airport_issuer<>'IATA' or code !~ '^[A-Z]{3}$' or service_date is null or not isfinite(service_date) then return null;end if;
 select jsonb_agg(jsonb_build_object('namespace',r.namespace,'issuer',r.issuer,'code',r.airport_code,'identityId',r.identity_id,'registryVersion',r.registry_version,'registrySha256',r.registry_sha256,'validFrom',r.valid_from,'validUntil',r.valid_until)) into identities
 from (select * from public.trip_core_airport_identities where namespace=airport_namespace and issuer=airport_issuer and airport_code=code and enabled and valid_from<=service_date and (valid_until is null or valid_until>=service_date) order by registry_version,valid_from limit 2 for share) r;
 if jsonb_array_length(identities)=1 then return identities->0;end if;
 return null;
end $$;
revoke all on function public.trip_core_resolve_airport(text,text,text,date) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_resolve_airport(text,text,text,date) to otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
create table public.trip_source_core_v2_publications (
 publication_id uuid primary key,
 account_id uuid not null references auth.users(id) on delete restrict,
 trip_id uuid not null references public.trips(id) on delete restrict,
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 source_revision bigint not null check(source_revision between 1 and 9007199254740991),
 run_id uuid not null references public.trip_source_runs(id) on delete restrict,
 input_catalog_sha256 text not null check(input_catalog_sha256 ~ '^[0-9a-f]{64}$'),
 request_sha256 text not null check(request_sha256 ~ '^[0-9a-f]{64}$'),
 request_json jsonb not null check(jsonb_typeof(request_json)='object' and octet_length(request_json::text)<=32768),
 response_json jsonb not null check(jsonb_typeof(response_json)='object' and octet_length(response_json::text)<=8388608),
 verification_json jsonb not null check(jsonb_typeof(verification_json)='object' and octet_length(verification_json::text)<=4194304),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 foreign key(source_id,source_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict,
 unique(trip_id,account_id,source_id,publication_id)
);
create table public.trip_source_core_v2_associations (
 id uuid primary key,
 account_id uuid not null references auth.users(id) on delete restrict,
 trip_id uuid not null references public.trips(id) on delete restrict,
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 source_revision bigint not null check(source_revision between 1 and 9007199254740991),
 run_id uuid not null references public.trip_source_runs(id) on delete restrict,
 candidate_id uuid not null references public.trip_source_core_v2_candidates(candidate_id) on delete restrict,
 output_slot_id uuid not null unique references public.trip_source_core_v2_slots(output_slot_id) on delete restrict,
 target_kind text not null check(target_kind='ITEM'),
 target_id uuid not null,
 target_revision bigint not null check(target_revision between 1 and 9007199254740991),
 domain_receipt_id uuid not null references public.trip_core_command_receipts(id) on delete restrict,
 receipt_sha256 text not null check(receipt_sha256 ~ '^[0-9a-f]{64}$'),
 identity_sha256 text not null check(identity_sha256 ~ '^[0-9a-f]{64}$'),
 field_evidence jsonb not null check(jsonb_typeof(field_evidence)='object' and octet_length(field_evidence::text)<=65536),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 foreign key(source_id,source_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict,
 foreign key(trip_id,account_id,source_id,candidate_id) references public.trip_source_core_v2_candidates(trip_id,account_id,source_id,candidate_id) on delete restrict
);
create function public.trip_core_publication_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$ begin
 if tg_op<>'INSERT' then raise exception 'CORE_V2_PUBLICATION_IMMUTABLE' using errcode='42501';end if;
 if new.account_id is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or new.trip_id is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 if not exists(select 1 from public.trip_sources src join public.trip_source_runs r on r.id=new.run_id where src.id=new.source_id and src.trip_id=new.trip_id and src.acquired_by=new.account_id and src.current_material_revision=new.source_revision and src.lifecycle='ACTIVE' and src.retention_state='RETAINED' and r.trip_id=new.trip_id and r.actor_account_id=new.account_id and new.source_id=any(r.scope_source_ids) and r.state='READY' and r.superseded_by is null and r.retention_state='RETAINED') then raise exception 'INPUT_STALE' using errcode='23514';end if;
 if tg_table_name='trip_source_core_v2_publications' then
  if not exists(select 1 from public.trip_source_runs where id=new.run_id and input_sha256=new.input_catalog_sha256) then raise exception 'INPUT_STALE' using errcode='23514';end if;
 else
  if not exists(select 1 from public.trip_source_core_v2_slots slot join public.trip_core_command_receipts receipt on receipt.id=new.domain_receipt_id where slot.output_slot_id=new.output_slot_id and slot.account_id=new.account_id and slot.trip_id=new.trip_id and slot.source_id=new.source_id and slot.candidate_id=new.candidate_id and slot.target_kind=new.target_kind and slot.target_id=new.target_id and slot.identity_sha256=new.identity_sha256 and receipt.actor_account_id=new.account_id and receipt.trip_id=new.trip_id and receipt.operation_id=slot.operation_id and receipt.intent_sha256=slot.intent_sha256 and receipt.receipt_sha256=new.receipt_sha256 and receipt.outcome in ('APPLIED','NO_CHANGE') and receipt.body->>'command'=slot.command and exists(select 1 from jsonb_array_elements(receipt.body->'targetVector') v where v->>'kind'=new.target_kind and v->>'id'=new.target_id::text and (v->>'committedRevision')::bigint=new.target_revision)) then raise exception 'RECEIPT_TARGET_MISMATCH' using errcode='23514';end if;
 end if;
 return new;
end $$;
revoke all on function public.trip_core_publication_guard() from public,anon,authenticated,service_role;
grant execute on function public.trip_core_publication_guard() to otr_trip_core_v2_writer;
alter table public.trip_source_core_v2_publications enable row level security;
alter table public.trip_source_core_v2_publications force row level security;
revoke all on public.trip_source_core_v2_publications from public,anon,authenticated,service_role;
grant select on public.trip_source_core_v2_publications to otr_trip_core_v2_gateway;
grant select,insert on public.trip_source_core_v2_publications to otr_trip_core_v2_writer;
create policy core_v2_private_scope on public.trip_source_core_v2_publications to otr_trip_core_v2_gateway,otr_trip_core_v2_writer using(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid and trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and public.trip_core_source_readable(source_id)) with check(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid and trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and public.trip_core_source_readable(source_id));
create trigger core_v2_write_guard before insert or update or delete on public.trip_source_core_v2_publications for each row execute function public.trip_core_guard_write();
create trigger core_v2_publication_guard before insert or update or delete on public.trip_source_core_v2_publications for each row execute function public.trip_core_publication_guard();
alter table public.trip_source_core_v2_associations enable row level security;
alter table public.trip_source_core_v2_associations force row level security;
revoke all on public.trip_source_core_v2_associations from public,anon,authenticated,service_role;
grant select on public.trip_source_core_v2_associations to otr_trip_core_v2_gateway;
grant select,insert on public.trip_source_core_v2_associations to otr_trip_core_v2_writer;
create policy core_v2_private_scope on public.trip_source_core_v2_associations to otr_trip_core_v2_gateway,otr_trip_core_v2_writer using(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid and trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and public.trip_core_source_readable(source_id)) with check(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid and trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and public.trip_core_source_readable(source_id));
create trigger core_v2_write_guard before insert or update or delete on public.trip_source_core_v2_associations for each row execute function public.trip_core_guard_write();
create trigger core_v2_publication_guard before insert or update or delete on public.trip_source_core_v2_associations for each row execute function public.trip_core_publication_guard();
commit;
