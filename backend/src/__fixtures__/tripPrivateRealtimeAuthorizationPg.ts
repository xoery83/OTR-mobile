import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { session } from "./tripCoreV2Sql";
import {
  createCorePgStorage,
  lockCorePgActor,
  readCorePgGraph,
  withCorePgStorageTransaction,
  type CorePgConnection,
  type CorePgLease,
} from "../tripCoreV2PgStorage";
import { readCoreGate } from "../tripSustainedGate";
import { createCorePgReader } from "../tripCoreV2PgRead";
import { executeCoreCommandV2 } from "../tripCoreV2Commands";
import { coreDefaults } from "../../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../../src/domain/trip/tripCoreV2Temporal";
import { projectCoreItem } from "../../../src/domain/trip/tripCoreV2Views";
import type { RealtimeCoreAtomicPort } from "../tripPrivateRealtimeAuthorityPg";

export const realtimePgIds = {
  trip: "10000000-0000-4000-8000-000000000001",
  a: "00000000-0000-4000-8000-000000000002",
  b: "00000000-0000-4000-8000-000000000004",
  peer: "00000000-0000-4000-8000-000000000003",
  person: "12000000-0000-4000-8000-000000000002",
};
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const docker = (...args: string[]) =>
  execFileSync("/opt/homebrew/bin/docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 20000,
  });

// Candidate sidecar fixture only: no active/role/permission mirror and no Hosted migration.
const livenessSql = `
CREATE TABLE public.trip_realtime_liveness(
 account_id uuid NOT NULL REFERENCES auth.users(id),trip_id uuid NOT NULL REFERENCES public.trips(id),
 generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),PRIMARY KEY(account_id,trip_id));
CREATE FUNCTION public.otr_realtime_generation_owner_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN
 IF current_user<>'postgres' OR new.account_id<>old.account_id OR new.trip_id<>old.trip_id OR new.generation<>old.generation+1 THEN RAISE EXCEPTION 'CANONICAL_REALTIME_GENERATION_WRITER_REQUIRED';END IF;RETURN new;END$$;
REVOKE ALL ON FUNCTION public.otr_realtime_generation_owner_guard() FROM public,anon,authenticated,service_role;
CREATE TRIGGER owner_writer BEFORE UPDATE ON public.trip_realtime_liveness FOR EACH ROW EXECUTE FUNCTION public.otr_realtime_generation_owner_guard();
CREATE TABLE public.trip_realtime_transitions(
 receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL,
 account_id uuid NOT NULL REFERENCES auth.users(id),trip_id uuid NOT NULL REFERENCES public.trips(id),
 actor_person_id uuid NOT NULL REFERENCES public.journey_members(id),kind text NOT NULL CHECK(kind IN ('REVOKED','REGRANTED')),
 previous_generation bigint NOT NULL CHECK(previous_generation BETWEEN 1 AND 9007199254740990),
 generation bigint NOT NULL CHECK(generation=previous_generation+1 AND generation<=9007199254740991),
 UNIQUE(account_id,trip_id,operation_id));
CREATE FUNCTION public.otr_realtime_transition_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'FIXTURE_TRANSITION_IMMUTABLE';END$$;
REVOKE ALL ON FUNCTION public.otr_realtime_transition_immutable() FROM public,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.trip_realtime_transitions FOR EACH ROW EXECUTE FUNCTION public.otr_realtime_transition_immutable();
ALTER TABLE public.trip_realtime_liveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_realtime_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_realtime_liveness,public.trip_realtime_transitions FROM public,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.trip_realtime_liveness TO otr_trip_core_v2_gateway;
GRANT SELECT ON public.trip_realtime_transitions TO otr_trip_core_v2_gateway;
CREATE POLICY scoped ON public.trip_realtime_liveness TO otr_trip_core_v2_gateway USING(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid AND trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid) WITH CHECK(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid AND trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
CREATE POLICY scoped ON public.trip_realtime_transitions FOR SELECT TO otr_trip_core_v2_gateway USING(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid AND trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
CREATE FUNCTION public.otr_realtime_fixture_session(sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE found jsonb; BEGIN
 IF session_user<>'otr_trip_core_v2_gateway' OR current_setting('otr.fixture.private_realtime',true) IS DISTINCT FROM 'LOCAL_NETWORK_NONE' THEN RAISE EXCEPTION 'LOCAL_FIXTURE_SESSION_ONLY';END IF;
 SELECT jsonb_build_object('sessionId',id,'accountId',user_id) INTO found FROM auth.sessions WHERE id=sid AND user_id=nullif(current_setting('otr.core.actor',true),'')::uuid AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
 IF found IS NULL THEN RAISE EXCEPTION 'FIXTURE_EXACT_SESSION_REVOKED';END IF;RETURN found;END$$;
REVOKE ALL ON FUNCTION public.otr_realtime_fixture_session(uuid) FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.otr_realtime_fixture_session(uuid) TO otr_trip_core_v2_gateway;
`;

export async function realtimePgFixture(name: string) {
  if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(name))
    throw Error("OWNED_FIXTURE_REQUIRED");
  if (
    docker(
      "inspect",
      "--format",
      '{{.HostConfig.NetworkMode}}/{{index .Config.Labels "otr.auth.fixture"}}',
      name,
    ).trim() !== "none/private-realtime"
  )
    throw Error("OWNED_NETWORK_NONE_FIXTURE_REQUIRED");
  async function admin<T>(work: (lease: CorePgLease) => Promise<T>) {
    const sql = session(name);
    try {
      await sql.lease.query("SET ROLE postgres");
      return await work(sql.lease);
    } finally {
      sql.close();
    }
  }
  const administrative = (sql: string, params?: readonly unknown[]) =>
    admin((lease) => lease.query(sql, params));
  const connection: CorePgConnection = {
    async withLease(work) {
      const sql = session(name);
      try {
        await sql.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
        return await work(sql.lease);
      } finally {
        sql.close();
      }
    },
  };
  for (const [index, suffix] of [
    "foundation",
    "version_dispatch",
    "owning_session",
    "read_scope",
    "source_scope",
    "candidate_publication",
    "legacy_claim_fence",
    "retained_claim_fence",
  ].entries()) {
    const path = `supabase/migrations/20261011000${index + 1}00_trip_core_v2_${suffix}.sql`;
    await administrative(readFileSync(path, "utf8"));
  }
  for (const path of [
    "supabase/migrations/20261013000200_core_ordinary_order.sql",
    "supabase/migrations/20261013000500_trip_create_owning_port.sql",
    "supabase/dev-forward/core-v2/20261014000300_trip_core_v2_finite_activation_contract.sql",
  ])
    await administrative(readFileSync(path, "utf8"));
  if (
    (
      await administrative(
        "SELECT count(*)::int AS n FROM auth.users WHERE id=$1::uuid",
        [realtimePgIds.b],
      )
    ).rows[0].n !== 1
  )
    throw Error("EXISTING_SYNTHETIC_ACCOUNT_REQUIRED");
  await administrative(livenessSql);
  await administrative(
    "INSERT INTO public.trip_realtime_liveness(account_id,trip_id,generation) SELECT id,$1::uuid,1 FROM auth.users WHERE id IN ($2::uuid,$3::uuid,$4::uuid)",
    [realtimePgIds.trip, realtimePgIds.a, realtimePgIds.b, realtimePgIds.peer],
  );
  const sessions = [
    realtimePgIds.a,
    realtimePgIds.a,
    realtimePgIds.b,
    realtimePgIds.peer,
  ].map((accountId) => ({
    accountId,
    sessionId: randomUUID(),
    token: `synthetic-pg-bearer-${randomUUID()}`,
  }));
  for (const s of sessions)
    await administrative(
      "INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after) VALUES($1::uuid,$2::uuid,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '10 minutes')",
      [s.sessionId, s.accountId],
    );
  const known = new Map(sessions.map((s) => [s.token, s]));
  const setGate = (accountId: string) =>
    administrative(
      "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_ITEM'],enabled_families=ARRAY['P1','P3'],enabled_admission_modes=ARRAY['MANUAL'],scope_actor_account_id=$1::uuid,scope_trip_id=$2::uuid,scope_started_at=clock_timestamp()-interval '1 second',scope_expires_at=clock_timestamp()+interval '10 minutes'",
      [accountId, realtimePgIds.trip],
    );
  await administrative(
    "INSERT INTO public.trip_core_read_state(trip_id) VALUES($1::uuid)",
    [realtimePgIds.trip],
  );
  await setGate(realtimePgIds.a);
  const storage = createCorePgStorage(connection, hash),
    privateItem = randomUUID(),
    groupItem = randomUUID();
  for (const [id, visibility] of [
    [privateItem, "PRIVATE"],
    [groupItem, "GROUP"],
  ] as const) {
    const receipt = await executeCoreCommandV2(
      storage,
      realtimePgIds.a,
      realtimePgIds.trip,
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId: realtimePgIds.trip,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id },
        baseVector: [{ kind: "ITEM", id, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          ...coreDefaults("organizer"),
          acl: { visibility, people: [] },
          family: "P3",
          core: { title: "Isolated Realtime visibility fixture" },
          schedule: {
            start: coreDateBoundary("2026-12-10"),
            end: coreDateBoundary("2026-12-12"),
          },
        },
      },
      hash,
    );
    if (receipt.projection !== "FULL" || receipt.receipt.outcome !== "APPLIED")
      throw Error("FIXTURE_CORE_CREATE_NOT_APPLIED");
  }
  const reader = createCorePgReader(connection, hash);
  const core: RealtimeCoreAtomicPort = {
    withScope(scope, work) {
      return withCorePgStorageTransaction(connection, hash, async ({ lease }) => {
        await lease.query(
          "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true),set_config('otr.fixture.private_realtime','LOCAL_NETWORK_NONE',true)",
          [scope.accountId, scope.tripId],
        );
        const currentActor = () => lockCorePgActor(lease, scope.accountId, scope.tripId);
        return work({
          query: lease.query,
          async currentSession() {
            const s = known.get(scope.accessToken);
            if (!s || s.accountId !== scope.accountId)
              throw Error("FIXTURE_SESSION_BINDING");
            const row = (
              await lease.query(
                "SELECT public.otr_realtime_fixture_session($1::uuid) AS identity",
                [s.sessionId],
              )
            ).rows[0]?.identity;
            return row as { sessionId: string; accountId: string };
          },
          currentActor,
          async qualifyCore() {
            const actor = await currentActor();
            const allowed = (
              await lease.query(
                "SELECT public.trip_core_finite_scope_allowed($1::uuid,$2::uuid) AS allowed",
                [scope.accountId, scope.tripId],
              )
            ).rows[0]?.allowed;
            if (
              !actor.active ||
              !actor.personId ||
              allowed !== true ||
              !(
                await readCoreGate(
                  lease,
                  scope.accountId,
                  scope.tripId,
                  undefined,
                  "runtime_enabled",
                )
              )?.runtime_enabled
            )
              throw Error("FIXTURE_CORE_QUALIFICATION_DENIED");
            await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
            const state = (
              await lease.query(
                "SELECT epoch,access_revision::float8 AS access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid FOR SHARE",
                [scope.tripId],
              )
            ).rows[0];
            await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
            return {
              qualification: "NOT_A_PRIVATE_JOIN_LEASE",
              actorAccountId: actor.accountId,
              tripId: actor.tripId,
              actorPersonId: actor.personId,
              coreEpoch: state.epoch as string,
              coreAccessRevision: state.access_revision as number,
            };
          },
          async readVisibleItem(itemId) {
            const actor = await currentActor();
            await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
            let graph;
            try {
              graph = await readCorePgGraph(lease, scope.tripId);
            } finally {
              await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
            }
            const body = projectCoreItem(graph, actor, itemId);
            return body
              ? { accountId: scope.accountId, tripId: scope.tripId, itemId, body }
              : null;
          },
        });
      });
    },
  };
  async function transition(
    kind: "REVOKED" | "REGRANTED",
    operationId = randomUUID(),
    fault?: "BEFORE_RECEIPT" | "CAUGHT_RECEIPT",
  ) {
    return admin(async (lease) => {
      await lease.query("BEGIN");
      try {
        // Follow Core's canonical lock order before the independent connection fence.
        await lease.query("SELECT id FROM public.trips WHERE id=$1::uuid FOR SHARE", [
          realtimePgIds.trip,
        ]);
        await lease.query(
          "SELECT /* realtime_fixture_transition */ trip_id FROM public.trip_members WHERE trip_id=$1::uuid AND user_id=$2::uuid FOR UPDATE",
          [realtimePgIds.trip, realtimePgIds.a],
        );
        await lease.query(
          "SELECT /* realtime_fixture_transition */ id FROM public.journey_members WHERE id=$1::uuid FOR UPDATE",
          [realtimePgIds.person],
        );
        const before = (
          await lease.query(
            "SELECT generation::float8 AS generation FROM public.trip_realtime_liveness WHERE account_id=$1::uuid AND trip_id=$2::uuid FOR UPDATE",
            [realtimePgIds.a, realtimePgIds.trip],
          )
        ).rows[0].generation as number;
        const prior = (
          await lease.query(
            "SELECT receipt_id FROM public.trip_realtime_transitions WHERE account_id=$1::uuid AND trip_id=$2::uuid AND operation_id=$3::uuid",
            [realtimePgIds.a, realtimePgIds.trip, operationId],
          )
        ).rows[0];
        if (prior) {
          await lease.query("COMMIT");
          return { operationId, repeated: true };
        }
        if (kind === "REVOKED") {
          await lease.query(
            "DELETE FROM public.trip_members WHERE trip_id=$1::uuid AND user_id=$2::uuid",
            [realtimePgIds.trip, realtimePgIds.a],
          );
          await lease.query(
            "UPDATE public.journey_members SET status='unlinked',user_id=NULL WHERE id=$1::uuid",
            [realtimePgIds.person],
          );
        } else {
          await lease.query(
            "UPDATE public.journey_members SET status='linked',user_id=$1::uuid WHERE id=$2::uuid",
            [realtimePgIds.a, realtimePgIds.person],
          );
        }
        await lease.query(
          "UPDATE public.trip_realtime_liveness SET generation=generation+1 WHERE account_id=$1::uuid AND trip_id=$2::uuid",
          [realtimePgIds.a, realtimePgIds.trip],
        );
        if (fault === "BEFORE_RECEIPT") throw Error("FIXTURE_RECEIPT_FAILURE");
        const insert = () =>
          lease.query(
            "INSERT INTO public.trip_realtime_transitions(operation_id,account_id,trip_id,actor_person_id,kind,previous_generation,generation) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7)",
            [
              operationId,
              realtimePgIds.a,
              realtimePgIds.trip,
              realtimePgIds.person,
              kind,
              before,
              fault === "CAUGHT_RECEIPT" ? 0 : before + 1,
            ],
          );
        if (fault === "CAUGHT_RECEIPT") {
          await insert().catch(() => undefined);
          throw Error("FIXTURE_ABORTED_RECEIPT");
        } else await insert();
        await lease.query("COMMIT");
        return { operationId, repeated: false };
      } catch (error) {
        await lease.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
  }
  async function state() {
    return (
      await administrative(
        "SELECT jsonb_build_object('generation',(SELECT generation FROM public.trip_realtime_liveness WHERE account_id=$1::uuid AND trip_id=$2::uuid),'status',(SELECT status FROM public.journey_members WHERE id=$3::uuid),'receipts',(SELECT count(*) FROM public.trip_realtime_transitions WHERE account_id=$1::uuid AND trip_id=$2::uuid),'generationXmin',(SELECT xmin::text FROM public.trip_realtime_liveness WHERE account_id=$1::uuid AND trip_id=$2::uuid),'memberXmin',(SELECT xmin::text FROM public.journey_members WHERE id=$3::uuid),'receiptXmin',(SELECT xmin::text FROM public.trip_realtime_transitions WHERE account_id=$1::uuid AND trip_id=$2::uuid ORDER BY generation DESC LIMIT 1)) AS state",
        [realtimePgIds.a, realtimePgIds.trip, realtimePgIds.person],
      )
    ).rows[0].state as Record<string, unknown>;
  }
  return {
    name,
    core,
    administrative,
    admin,
    connection,
    reader,
    transition,
    state,
    setGate,
    sessions,
    privateItem,
    groupItem,
    hash,
    gateway: {
      async validateAccessToken(token: string) {
        const s = known.get(token);
        if (!s) return null;
        const row = (
          await administrative(
            "SELECT id FROM auth.sessions WHERE id=$1::uuid AND user_id=$2::uuid AND (not_after IS NULL OR not_after>clock_timestamp())",
            [s.sessionId, s.accountId],
          )
        ).rows[0];
        return row ? { id: s.accountId, accountClass: "NORMAL_ACCOUNT" as const } : null;
      },
    },
  };
}
