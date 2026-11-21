import { readReviewedP1Gate, readCoreGate, type CoreGateMode } from "./tripSustainedGate";
import { isReviewedP1Gate, normalManualCapabilities } from "./tripNormalP1Policy";
import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { authorizedTripVersionFromCollection } from "../../src/domain/trip/tripAuthorizedVersion";
import {
  coreClosedCapabilities,
  coreCapabilitiesSchema,
  validateCoreCommand,
} from "../../src/domain/trip/tripCoreV2Commands";
import { corePersonBindingSchema } from "../../src/domain/trip/tripCoreV2Read";
import { projectCoreItem } from "../../src/domain/trip/tripCoreV2Views";
import {
  coreCanManage,
  type CoreActor,
  type CoreGraph,
} from "../../src/domain/trip/tripCoreV2Mutation";
import {
  buildTripItemSnapshot,
  buildTripItemPage,
  type TripItemListQuery,
} from "./tripItemsRead";
import { readCoreLifecycleState } from "./tripCoreLifecycleState";
import { readCoreExpenseRelations } from "./tripCoreExpenseRelations";
import { coreLifecycleGraphHash } from "../../src/domain/trip/tripCoreV2Lifecycle";
import { itemLifecycleBaseSchema } from "../../src/domain/trip/tripLifecycleContract";
import { readRosterRows, projectTripRoster } from "./tripPeopleRead";
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
export async function setCoreReadIdentity(lease: CorePgLease, actorAccountId: string, tripId: string) {
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
}

export async function assertCoreReadScope(lease: CorePgLease, actorAccountId: string, tripId: string, gateMode?: CoreGateMode) {
  const allowed = (
    await lease.query(
      gateMode?.sustainedDev
        ? "SELECT public.trip_sustained_core_read_scope_allowed($1::uuid,$2::uuid) AS allowed"
        : "SELECT public.trip_core_finite_scope_allowed($1::uuid,$2::uuid) AS allowed",
      [actorAccountId, tripId],
    )
  ).rows[0]?.allowed;
  if (allowed !== true) throw new Error("CORE_CAPABILITY_CLOSED");
}

export async function requireCoreReadActor(lease: CorePgLease, actorAccountId: string, tripId: string, gateMode?: CoreGateMode) {
  await assertCoreReadScope(lease, actorAccountId, tripId, gateMode);
  const actor = await lockCorePgActor(lease, actorAccountId, tripId);
  if (!actor.active) throw new Error("NOT_VISIBLE");
  if (
    !gateMode?.sustainedDev &&
    !(
      await readCoreGate(lease, actorAccountId, tripId, gateMode, "runtime_enabled")
    )?.runtime_enabled
  )
    throw new Error("CORE_CAPABILITY_CLOSED");
  return actor;
}

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
    localDocumentMetadata = false,
    includeDeleted = false,
    includeRoster = false,
    includeCapabilities = false,
  ) {
    coreUuid.parse(actorAccountId);
    coreUuid.parse(tripId);
    return connection.withLease(async (lease) => {
      let began = false;
      try {
        await lease.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        began = true;
        await lease.query(
          "SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='1000ms'; SET LOCAL TIME ZONE 'UTC'",
        );
        await setCoreReadIdentity(lease, actorAccountId, tripId);
        if (gateMode?.sustainedDev)
          await lease.query("SELECT set_config('otr.core.manual_compat','READ',true)");
        const actor = await requireCoreReadActor(lease, actorAccountId, tripId, gateMode);
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
        const expenseRelations = gateMode?.betaLifecycle
          ? await readCoreExpenseRelations(lease, actorAccountId, tripId)
          : undefined;
        if (expenseRelations) graph.expense_links = expenseRelations.links;
        const lifecycle = gateMode?.betaLifecycle
          ? await readCoreLifecycleState(lease, actorAccountId, tripId)
          : undefined;
        const excluded = new Set(
          lifecycle?.deletedItemIds.filter((id) => {
            const row = graph.itinerary_events.find((row) => row.id === id);
            return !includeDeleted || !row || !coreCanManage(graph, actor, "ITEM", row);
          }) ?? [],
        );
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
        if (expenseRelations)
          rights.ledgerExpenseIds = expenseRelations.authorizedExpenseIds;
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
          localDocumentMetadata,
          excluded,
        );
        const roster = includeRoster
          ? await readRosterRows(lease, actorAccountId, tripId)
          : undefined;
        const gate = includeCapabilities
          ? await readCoreGate(
              lease,
              actorAccountId,
              tripId,
              gateMode,
              "runtime_enabled,enabled_commands,enabled_families,enabled_admission_modes",
            )
          : undefined;
        await assertCoreReadScope(lease, actorAccountId, tripId, gateMode);
        await lease.query("COMMIT");
        began = false;
        return { actor, graph, collection, rights, bindings, lifecycle, roster, gate };
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
    async betaCapabilityContext(actorAccountId: string, tripId: string) {
      if (!gateMode?.betaLifecycle) throw new Error("CORE_CAPABILITY_CLOSED");
      const s = await snapshot(
        actorAccountId,
        tripId,
        undefined,
        false,
        false,
        false,
        true,
      );
      const manual = normalManualCapabilities(s.gate, true);
      return {
        actorAccountId,
        tripId,
        accessRevision: s.collection.manifest.accessRevision,
        epoch: s.collection.manifest.epoch,
        observedAt: s.collection.manifest.generatedAt,
        canManageTrip: s.actor.canManageShared,
        state: s.lifecycle!.tripState,
        commands: manual?.commands ?? [],
        families: manual?.families ?? [],
      };
    },
    async people(actorAccountId: string, tripId: string) {
      if (!gateMode?.betaLifecycle) throw new Error("CORE_CAPABILITY_CLOSED");
      const s = await snapshot(actorAccountId, tripId, undefined, false, false, true);
      return projectTripRoster(s.roster, actorAccountId, tripId, hash);
    },
    async itemLifecycle(
      actorAccountId: string,
      tripId: string,
      itemId: string,
      family: string,
    ) {
      if (!gateMode?.betaLifecycle) throw new Error("CORE_CAPABILITY_CLOSED");
      coreUuid.parse(itemId);
      const s = await snapshot(actorAccountId, tripId, undefined, false, true);
      const root = s.graph.itinerary_events.find((row) => row.id === itemId);
      if (
        !root ||
        root.experience_family !== family ||
        !coreCanManage(s.graph, s.actor, "ITEM", root)
      )
        throw new Error("NOT_VISIBLE");
      const command = validateCoreCommand({
        contractVersion: 2,
        intentVersion: 2,
        operationId: itemId,
        tripId,
        command: "HIDE_OBJECT",
        target: { kind: "ITEM", id: itemId },
        baseVector: [{ kind: "ITEM", id: itemId, revision: root.semantic_revision }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          scope: "OBJECT_ONLY",
          affectedIds: [{ kind: "ITEM", id: itemId }],
          graphHash: "0".repeat(64),
        },
      });
      const hasFinancialReferences = s.graph.expense_links.some(
        (row) => row.type === "ITINERARY_EVENT" && row.target_id === itemId,
      );
      return itemLifecycleBaseSchema.parse({
        version: "otr.lifecycle.read/1",
        actorAccountId,
        tripId,
        itemId,
        family,
        itemRevision: root.semantic_revision,
        graphHash: await coreLifecycleGraphHash(s.graph, s.actor, command, hash),
        availableActions:
          s.lifecycle!.tripState !== "ACTIVE" ||
          s.lifecycle!.deletedItemIds.includes(itemId)
            ? []
            : [root.hidden_at ? "RESTORE" : "HIDE", "DELETE"],
        impact: {
          affectedItems: [{ itemId, revision: root.semantic_revision }],
          hasFinancialReferences,
          changesOriginalFiles: false,
          warnings: hasFinancialReferences ? ["FINANCIAL_REFERENCES_RETAINED"] : [],
        },
        observedAt: s.collection.manifest.generatedAt,
      });
    },
    async items(actorAccountId: string, tripId: string, query: TripItemListQuery) {
      if (!gateMode?.betaLifecycle) throw new Error("CORE_CAPABILITY_CLOSED");
      const s = await snapshot(actorAccountId, tripId);
      return buildTripItemPage(
        s.graph,
        s.actor,
        s.collection,
        new Set(s.lifecycle!.deletedItemIds),
        query,
        hash,
      );
    },
    async itemSnapshot(actorAccountId: string, tripId: string, itemId: string) {
      if (!gateMode?.betaLifecycle) throw new Error("CORE_CAPABILITY_CLOSED");
      coreUuid.parse(itemId);
      const s = await snapshot(
        actorAccountId,
        tripId,
        undefined,
        false,
        true,
        false,
        true,
      );
      const result = buildTripItemSnapshot(
        s.graph,
        s.actor,
        s.collection,
        itemId,
        {
          ...s.rights,
          rosterHash: s.collection.manifest.participatingRosterHash,
          participatingPersonIds: s.bindings
            .filter((b) => b.active && b.participating)
            .map((b) => b.person_id),
        },
        true,
        s.lifecycle!.deletedItemIds.includes(itemId),
      );
      const root = s.graph.itinerary_events.find((row) => row.id === itemId)!;
      const manual = normalManualCapabilities(s.gate, true);
      return {
        ...result,
        item: {
          ...result.item,
          capabilities: {
            ...result.item.capabilities,
            canEdit:
              s.gate?.runtime_enabled === true &&
              !!manual?.commands.includes("SET_ITEM_TEXT") &&
              manual.families.includes(String(root.experience_family)) &&
              s.lifecycle!.tripState === "ACTIVE" &&
              !s.lifecycle!.deletedItemIds.includes(itemId) &&
              coreCanManage(s.graph, s.actor, "ITEM", root),
          },
        },
      };
    },
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
          if (gateMode?.sustainedDev)
            await lease.query("SELECT set_config('otr.core.manual_compat','READ',true)");
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
          const manual = normalManualCapabilities(gate, gateMode?.betaLifecycle);
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
                      : normal && manual!.importEnabled ? ["MANUAL", "IMPORT"] : ["MANUAL"],
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
    async collection(
      actorAccountId: string,
      tripId: string,
      ordinaryOrderVersion?: 1,
      localDocumentMetadata = false,
    ) {
      return (await snapshot(actorAccountId, tripId, ordinaryOrderVersion, localDocumentMetadata)).collection;
    },
    async authorizedVersion(
      actorAccountId: string,
      tripId: string,
      ordinaryOrderVersion?: 1,
      localDocumentMetadata = false,
    ) {
      const { collection } = await snapshot(actorAccountId, tripId, ordinaryOrderVersion, localDocumentMetadata);
      return authorizedTripVersionFromCollection(
        collection,
        actorAccountId,
        tripId,
        hash,
      );
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
