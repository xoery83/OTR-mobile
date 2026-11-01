import { readReviewedP1Gate, readCoreGate, type CoreGateMode } from "./tripSustainedGate";
import { isReviewedP1Gate, normalManualCapabilities } from "./tripNormalP1Policy";
import { z } from "zod";
import { coreUuid, coreTableSchemas } from "../../src/domain/trip/tripCoreV2";
import {
  authorizedTripVersionFromCollection,
  authoredVersionItemSchema,
  authorizedTripVersionFromAuthoredProjection,
} from "../../src/domain/trip/tripAuthorizedVersion";
import {
  coreClosedCapabilities,
  coreCapabilitiesSchema,
} from "../../src/domain/trip/tripCoreV2Commands";
import { corePersonBindingSchema } from "../../src/domain/trip/tripCoreV2Read";
import { projectCoreItem } from "../../src/domain/trip/tripCoreV2Views";
import {
  coreCanRead,
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "../../src/domain/trip/tripCoreV2Mutation";
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
  // Only the document-only composition may skip empty external-object rights.
  authoredSummaryWithoutExternalObjects?: true;
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
  async function qualifiedSnapshot<T>(
    actorAccountId: string,
    tripId: string,
    project: (
      lease: CorePgLease,
      actor: CoreActor,
      state: { epoch: unknown; revision: unknown; access_revision: unknown },
    ) => Promise<T>,
    mark?: (phase: string) => void,
  ) {
    coreUuid.parse(actorAccountId);
    coreUuid.parse(tripId);
    return connection.withLease(async (lease) => {
      mark?.("leaseMs");
      let began = false;
      try {
        await lease.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        began = true;
        mark?.("beginMs");
        // Only local settings precede identity validation; no scope or business read does.
        const identity = (
          await lease.query(
            "SELECT session_user AS principal,current_user AS role,set_config('statement_timeout','5000ms',true),set_config('lock_timeout','1000ms',true),set_config('TimeZone','UTC',true),set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
            [actorAccountId, tripId],
          )
        ).rows[0];
        if (
          identity?.principal !== "otr_trip_core_v2_gateway" ||
          identity.role !== "otr_trip_core_v2_gateway"
        )
          throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
        mark?.("setupMs");

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
        mark?.("scopeMs");
        const actor = await lockCorePgActor(lease, actorAccountId, tripId);
        if (!actor.active) throw new Error("NOT_VISIBLE");
        mark?.("actorMs");
        if (
          !(
            await readCoreGate(lease, actorAccountId, tripId, gateMode, "runtime_enabled")
          )?.runtime_enabled
        )
          throw new Error("CORE_CAPABILITY_CLOSED");
        mark?.("gateMs");
        const rawState = (
          await lease.query(
            "SELECT epoch,revision::float8 AS revision,access_revision::float8 AS access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
            [tripId],
          )
        ).rows[0];
        if (!rawState) throw new Error("CORE_READ_UNAVAILABLE");
        const state = z
          .strictObject({
            epoch: coreUuid,
            revision: z.number().int().positive().safe(),
            access_revision: z.number().int().positive().safe(),
          })
          .parse(rawState);
        mark?.("stateMs");
        const result = await project(lease, actor, {
          epoch: state.epoch,
          revision: state.revision,
          access_revision: state.access_revision,
        });
        mark?.("projectMs");
        await finiteScope();
        mark?.("finalScopeMs");
        await lease.query("COMMIT");
        began = false;
        mark?.("commitMs");
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
  }
  async function readBindings(
    lease: CorePgLease,
    actorAccountId: string,
    tripId: string,
  ) {
    return z
      .array(corePersonBindingSchema.extend({ revision: z.number().int().min(0).safe() }))
      .max(20000)
      .parse(
        (
          await lease.query(
            "SELECT public.trip_core_read_person_bindings($1::uuid,$2::uuid) AS bindings",
            [actorAccountId, tripId],
          )
        ).rows[0]?.bindings,
      );
  }
  async function readSnapshot(
    lease: CorePgLease,
    actor: CoreActor,
    state: { epoch: unknown; revision: unknown; access_revision: unknown },
    ordinaryOrderVersion?: 1,
  ) {
    const tripId = actor.tripId;
    await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
    const graph = await readCorePgGraph(lease, tripId);
    await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
    const bindings = await readBindings(lease, actor.accountId, tripId);
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
        accessRevision: z.number().int().positive().safe().parse(state.access_revision),
        generatedAt: new Date().toISOString(),
      },
      bindings,
      hash,
      rights.originalDocumentIds,
      rights.ledgerExpenseIds,
      rights.sourceEvidenceRefs,
      ordinaryOrderVersion,
    );
    return { actor, graph, collection, rights, bindings };
  }
  async function snapshot(
    actorAccountId: string,
    tripId: string,
    ordinaryOrderVersion?: 1,
  ) {
    return qualifiedSnapshot(actorAccountId, tripId, (lease, actor, state) =>
      readSnapshot(lease, actor, state, ordinaryOrderVersion),
    );
  }
  async function authoredVersion(lease: CorePgLease, actor: CoreActor, epoch: unknown) {
    // expense_links is already excluded by the complete Core graph reader.
    const allowed = new Set([
      "itinerary_events",
      "trip_stay_details",
      "trip_stay_rooms",
      "trip_item_participants",
      "trip_item_visibility_people",
      "expense_links",
    ]);
    const blockedTables = Object.keys(coreTableSchemas).filter((t) => !allowed.has(t));
    const columns = Object.keys(authoredVersionItemSchema.shape);
    // All identifiers come from the closed Core schemas, never a request.
    const query = [
      `SELECT 'item'::text AS projection_kind,jsonb_build_object(${columns.map((k) => `'${k}',"${k}"`).join(",")}) AS fact FROM public.itinerary_events WHERE trip_id=$1::uuid AND business_contract_version=2`,
      "SELECT 'participants',to_jsonb(p) FROM public.trip_item_participants p WHERE trip_id=$1::uuid",
      "SELECT 'visibilityPeople',to_jsonb(p) FROM public.trip_item_visibility_people p WHERE trip_id=$1::uuid",
      `SELECT 'blocked',to_jsonb(EXISTS(${blockedTables.map((t) => `SELECT 1 FROM public."${t}" WHERE trip_id=$1::uuid`).join(" UNION ALL ")}))`,
    ].join(" UNION ALL ");
    await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
    let rows;
    try {
      rows = (
        await lease.query(
          `SELECT * FROM (${query}) authored_version_projection LIMIT 20002`,
          [actor.tripId],
        )
      ).rows;
    } finally {
      await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
    }
    if (rows.filter((r) => r.projection_kind !== "blocked").length > 20000)
      throw Error("CORE_READ_RESOURCE_LIMIT");
    if (
      rows.filter((r) => r.projection_kind === "blocked").length !== 1 ||
      rows.some((r) => r.projection_kind === "blocked" && r.fact !== false)
    )
      return null;
    const items = [],
      participants = [],
      visibilityPeople = [];
    for (const row of rows) {
      if (row.projection_kind === "item") {
        const item = authoredVersionItemSchema.safeParse(row.fact);
        if (!item.success) return null;
        items.push(item.data);
      } else if (row.projection_kind === "participants") {
        participants.push(coreTableSchemas.trip_item_participants.parse(row.fact));
      } else if (row.projection_kind === "visibilityPeople") {
        visibilityPeople.push(
          coreTableSchemas.trip_item_visibility_people.parse(row.fact),
        );
      } else if (row.projection_kind !== "blocked")
        throw Error("CORE_VERSION_PROJECTION_INVALID");
    }
    // ITEM ACL evaluation needs only these projections; this is never a Core snapshot.
    const graph = emptyCoreGraph();
    graph.itinerary_events = items;
    graph.trip_item_visibility_people = visibilityPeople;
    const itemIds = new Set(items.map((r) => r.id));
    if ([...participants, ...visibilityPeople].some((r) => !itemIds.has(r.item_id)))
      return null;
    const visible = items.filter((r) => coreCanRead(graph, actor, "ITEM", r));
    const ids = new Set(visible.map((r) => r.id));
    return authorizedTripVersionFromAuthoredProjection(
      {
        actorAccountId: actor.accountId,
        tripId: actor.tripId,
        epoch: coreUuid.parse(epoch),
        items: visible,
        participants: participants.filter((r) => ids.has(r.item_id)),
        visibilityPeople: visibilityPeople.filter((r) => ids.has(r.item_id)),
        bindings: await readBindings(lease, actor.accountId, actor.tripId),
      },
      hash,
    );
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
    async authorizedVersion(
      actorAccountId: string,
      tripId: string,
      ordinaryOrderVersion?: 1,
    ) {
      let projection = "FULL";
      const started = performance.now();
      let projectionStarted = started;
      let lastPhase = started;
      const phases: Record<string, number> = {};
      const result = await qualifiedSnapshot(
        actorAccountId,
        tripId,
        async (lease, actor, state) => {
          projectionStarted = performance.now();
          if (
            ordinaryOrderVersion === undefined &&
            (!authority || authority.authoredSummaryWithoutExternalObjects)
          ) {
            const version = await authoredVersion(lease, actor, state.epoch);
            if (version) {
              projection = "AUTHORED";
              return version;
            }
          }
          const { collection } = await readSnapshot(
            lease,
            actor,
            state,
            ordinaryOrderVersion,
          );
          return authorizedTripVersionFromCollection(
            collection,
            actorAccountId,
            tripId,
            hash,
          );
        },
        (phase) => {
          const at = performance.now();
          phases[phase] = Math.round(at - lastPhase);
          lastPhase = at;
        },
      );
      try {
        console.info(
          JSON.stringify({
            event: "core_authorized_version_projection",
            projection,
            beforeProjectionMs: Math.round(projectionStarted - started),
            projectionAndCommitMs: Math.round(performance.now() - projectionStarted),
            phases,
          }),
        );
      } catch {
        // Diagnostics cannot replace an authorized read or expose its values.
      }
      return result;
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
