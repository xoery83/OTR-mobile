import { readReviewedP1Gate, readCoreGate, type CoreGateMode } from "./tripSustainedGate";
import { isReviewedP1Gate, normalManualCapabilities } from "./tripNormalP1Policy";
import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  coreClosedCapabilities,
  coreCapabilitiesSchema,
} from "../../src/domain/trip/tripCoreV2Commands";
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
import type {
  CurrentDocumentAccess,
  DocumentOriginalRequest,
} from "./tripDocumentOriginalRead";
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
  gateMode?: CoreGateMode,
) {
  async function snapshot(
    actorAccountId: string,
    tripId: string,
    ordinaryOrderVersion?: 1,
  ) {
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
        const finiteScope = async () => {
          const allowed = (
            await lease.query(
              "SELECT public.trip_core_finite_scope_allowed($1::uuid,$2::uuid) AS allowed",
              [actorAccountId, tripId],
            )
          ).rows[0]?.allowed;
          if (allowed !== true) throw new Error("CORE_CAPABILITY_CLOSED");
        };
        await finiteScope();
        const actor = await lockCorePgActor(lease, actorAccountId, tripId);
        if (!actor.active) throw new Error("NOT_VISIBLE");
        if (
          !(
            await readCoreGate(lease, actorAccountId, tripId, gateMode, "runtime_enabled")
          )?.runtime_enabled
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
          : {
              originalDocumentIds: [],
              ledgerExpenseIds: [],
              sourceEvidenceRefs: [],
            };
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
          ordinaryOrderVersion,
        );
        await finiteScope();
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
    async capabilities(actorAccountId: string, tripId: string, operationId?: string) {
      coreUuid.parse(actorAccountId);
      coreUuid.parse(tripId);
      if (operationId !== undefined) coreUuid.parse(operationId);
      return connection.withLease(async (lease) => {
        let began = false;
        try {
          await lease.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
          began = true;
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
          if (operationId !== undefined)
            await lease.query("SELECT set_config('otr.core.operation',$1,true)", [
              operationId,
            ]);
          const allowed = async () =>
            (
              await lease.query(
                "SELECT public.trip_core_finite_scope_allowed($1::uuid,$2::uuid) AS allowed",
                [actorAccountId, tripId],
              )
            ).rows[0]?.allowed === true;
          let enabled = await allowed();
          if (enabled) {
            const actor = await lockCorePgActor(lease, actorAccountId, tripId);
            const state = (
              await lease.query(
                "SELECT epoch FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
                [tripId],
              )
            ).rows[0];
            enabled =
              actor.active &&
              actor.personId !== null &&
              coreUuid.safeParse(state?.epoch).success &&
              (await allowed());
          }
          const gate = enabled
            ? await readCoreGate(lease, actorAccountId, tripId, gateMode)
            : undefined;
          const manual = normalManualCapabilities(gate);
          const normal = manual !== null;
          const reviewedGate =
            enabled && gateMode?.sustainedDev && gateMode.reviewedP1
              ? await readReviewedP1Gate(lease, actorAccountId, tripId)
              : undefined;
          const reviewedP2 = isReviewedP1Gate(reviewedGate, "P2");
          const reviewedP3 = isReviewedP1Gate(reviewedGate, "P3");
          const reviewedP4 = isReviewedP1Gate(reviewedGate, "P4");
          const reviewedP5 = isReviewedP1Gate(reviewedGate, "P5");
          const reviewedP6 = isReviewedP1Gate(reviewedGate, "P6");
          const reviewed =
            enabled &&
            gateMode?.sustainedDev &&
            gateMode.reviewedP1 &&
            (isReviewedP1Gate(reviewedGate) ||
              reviewedP2 ||
              reviewedP3 ||
              reviewedP4 ||
              reviewedP5 ||
              reviewedP6);
          const result = enabled
            ? coreCapabilitiesSchema.parse({
                ...coreClosedCapabilities,
                activationState: "ENABLED",
                enabledCommands: reviewedP2
                  ? ["CREATE_SPARSE_FLIGHT"]
                  : normal && !reviewedP3 && !reviewedP4 && !reviewedP5 && !reviewedP6
                    ? manual!.commands
                    : ["CREATE_ITEM"],
                enabledFamilies: reviewedP2
                  ? ["P2"]
                  : reviewedP6
                    ? ["P6"]
                    : reviewedP5
                      ? ["P5"]
                      : reviewedP4
                        ? ["P4"]
                        : reviewedP3
                          ? ["P3"]
                          : normal
                            ? manual!.families
                            : ["P1", "P3"],
                enabledAdmissionModes:
                  reviewedP2 || reviewedP3 || reviewedP4 || reviewedP5 || reviewedP6
                    ? ["REVIEWED_SOURCE"]
                    : reviewed
                      ? ["MANUAL", "REVIEWED_SOURCE"]
                      : ["MANUAL"],
                sourceEvidenceAvailable: !!reviewed,
              })
            : coreClosedCapabilities;
          await lease.query("COMMIT");
          began = false;
          return result;
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
    },
    // Internal ACL observation only; Source retention/copy rights remain independent.
    async currentDocumentAccess(
      request: DocumentOriginalRequest,
    ): Promise<CurrentDocumentAccess> {
      const current = await snapshot(request.actorAccountId, request.tripId);
      return {
        actor: current.actor,
        graph: current.graph,
        accessRevision: current.collection.manifest.accessRevision,
      };
    },
    async collection(actorAccountId: string, tripId: string, ordinaryOrderVersion?: 1) {
      return (await snapshot(actorAccountId, tripId, ordinaryOrderVersion)).collection;
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
