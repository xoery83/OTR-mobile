import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { corePersonBindingSchema } from "../../src/domain/trip/tripCoreV2Read";
import { projectCoreItem } from "../../src/domain/trip/tripCoreV2Views";
import type { CoreActor, CoreGraph } from "../../src/domain/trip/tripCoreV2Mutation";
import { buildCoreActorCollection } from "./tripCoreV2Collection";
import {
  lockCorePgActor,
  readCorePgGraph,
  type CorePgConnection,
  type CorePgLease,
} from "./tripCoreV2PgStorage";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
export type CorePgReadAuthority = {
  authorize(
    lease: CorePgLease,
    actor: CoreActor,
    graph: CoreGraph,
  ): Promise<{
    originalDocumentIds: readonly string[];
    ledgerExpenseIds: readonly string[];
    sourceEvidenceRefs?: readonly string[];
  }>;
};
export function createCorePgReader(
  connection: CorePgConnection,
  hash: ImportHash,
  authority?: CorePgReadAuthority,
) {
  async function snapshot(actorAccountId: string, tripId: string) {
    coreUuid.parse(actorAccountId);
    coreUuid.parse(tripId);
    return connection.withLease(async (lease) => {
      let began = false;
      try {
        await lease.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        began = true;
        await lease.query("SET LOCAL statement_timeout='5000ms'");
        await lease.query("SET LOCAL lock_timeout='1000ms'");
        await lease.query("SET LOCAL TIME ZONE 'UTC'");
        const identity = (
          await lease.query("SELECT session_user AS principal,current_user AS role")
        ).rows[0];
        if (
          identity?.principal !== "otr_trip_core_v2_gateway" ||
          identity.role !== "otr_trip_core_v2_gateway"
        )
          throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
        await lease.query(
          "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
          [actorAccountId, tripId],
        );
        const actor = await lockCorePgActor(lease, actorAccountId, tripId);
        if (!actor.active) throw new Error("NOT_VISIBLE");
        if (
          !(
            await lease.query(
              "SELECT runtime_enabled FROM public.trip_core_activation_gate WHERE singleton",
            )
          ).rows[0]?.runtime_enabled
        )
          throw new Error("CORE_CAPABILITY_CLOSED");
        const state = (
          await lease.query(
            "SELECT epoch,revision::float8 AS revision,access_revision::float8 AS access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
            [tripId],
          )
        ).rows[0];
        if (!state) throw new Error("CORE_READ_UNAVAILABLE");
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
        const graph = await readCorePgGraph(lease, tripId);
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
        const bindings = z
          .array(
            corePersonBindingSchema.extend({
              revision: z.number().int().min(0).safe(),
            }),
          )
          .max(20000)
          .parse(
            (
              await lease.query(
                "SELECT public.trip_core_read_person_bindings($1::uuid,$2::uuid) AS bindings",
                [actorAccountId, tripId],
              )
            ).rows[0]?.bindings,
          );
        const rights = authority
          ? await authority.authorize(lease, actor, graph)
          : { originalDocumentIds: [], ledgerExpenseIds: [], sourceEvidenceRefs: [] };
        const collection = await buildCoreActorCollection(
          graph,
          actor,
          {
            epoch: coreUuid.parse(state.epoch),
            revision: z.number().int().positive().safe().parse(state.revision),
            accessRevision: z
              .number()
              .int()
              .positive()
              .safe()
              .parse(state.access_revision),
            generatedAt: new Date().toISOString(),
          },
          bindings,
          hash,
          rights.originalDocumentIds,
          rights.ledgerExpenseIds,
          rights.sourceEvidenceRefs,
        );
        await lease.query("COMMIT");
        began = false;
        return { actor, graph, collection, rights, bindings };
      } catch (error) {
        if (began) {
          try {
            await lease.query("ROLLBACK");
          } catch {
            lease.retire();
          }
        }
        throw error;
      }
    });
  }
  return {
    async collection(actorAccountId: string, tripId: string) {
      return (await snapshot(actorAccountId, tripId)).collection;
    },
    async item(actorAccountId: string, tripId: string, itemId: string) {
      coreUuid.parse(itemId);
      const s = await snapshot(actorAccountId, tripId);
      return projectCoreItem(s.graph, s.actor, itemId, {
        ...s.rights,
        rosterHash: s.collection.manifest.participatingRosterHash,
        participatingPersonIds: s.bindings
          .filter((b) => b.active && b.participating)
          .map((b) => b.person_id),
      });
    },
  };
}
