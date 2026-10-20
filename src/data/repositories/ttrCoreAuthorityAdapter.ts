import { instantMicroseconds } from "@/domain/trip/dayReadModel";
import { qualifyTtr, ttrInputSchema, type TtrInput } from "@/domain/trip/ttr";
import { openTtr, projectTtr } from "@/domain/trip/ttrState";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import { assertAccountRequestGeneration } from "@/data/auth/accountRequestContext";
import {
  createTripCoreV2Repository,
  type CoreDatabase,
  type CoreQualifiedTtrRead,
  type CoreTtrPublicationLease,
} from "@/data/repositories/tripCoreV2Repository";
import {
  createTtrSelectionRepository,
  type TtrSelectionClock,
  type TtrSelectionRelation,
} from "@/data/repositories/ttrSelectionRepository";
import type { ImportHash } from "@/domain/trip/flightImportReview";

type CorePort = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  "readTtr" | "revalidateTtrWithinTransaction" | "guardTtrPublication"
>;
type Capture = Readonly<{
  orderId: string;
  fromId: string;
  toId: string;
  core: CoreQualifiedTtrRead;
  relation: TtrSelectionRelation;
}>;
const sameContext = (a: AccountRequestContext, b: AccountRequestContext) =>
  a.accountId === b.accountId && a.tripId === b.tripId && a.generation === b.generation;
// Ephemeral presentation tickets only; never a Core authority or durable revision.
let publicationSequence = 0;

/** Dormant bridge; the Selection Repository and Core port must share one serialized DB. */
export function createTtrCoreAuthorityAdapter(core: CorePort, clock: () => string) {
  let disposed = false;
  const captures = new Map<number, Capture>();

  function pinned(ctx: AccountRequestContext, relation: TtrSelectionRelation) {
    const captured = captures.get(relation.publicationVersion);
    return captured &&
      sameContext(ctx, captured.core.authority.scope) &&
      relation.accessRevision === captured.relation.accessRevision &&
      JSON.stringify(relation.input) === JSON.stringify(captured.relation.input)
      ? captured
      : null;
  }

  return {
    async capture(
      ctx: AccountRequestContext,
      orderId: string,
      fromId: string,
      toId: string,
    ) {
      if (disposed) throw new Error("TTR_ADAPTER_DISPOSED");
      const result = await core.readTtr(ctx, orderId, fromId, toId);
      if (disposed) throw new Error("TTR_ADAPTER_DISPOSED");
      assertAccountRequestGeneration(ctx);
      if (result.status === "UNAVAILABLE") return result;
      if (
        !sameContext(ctx, result.authority.scope) ||
        !sameContext(ctx, result.input.scope) ||
        result.authority.order.id !== orderId ||
        result.authority.from.eventId !== fromId ||
        result.authority.to.eventId !== toId ||
        !Number.isSafeInteger(result.authority.collection.access_revision) ||
        result.authority.collection.access_revision < 1 ||
        (result.input.spatialEquivalence !== undefined &&
          result.input.spatialEquivalence.equivalence !== "UNKNOWN") ||
        result.spatial.equivalence !== "UNKNOWN" ||
        result.spatial.proximityAuthority !== "GEOMETRY_ONLY"
      )
        throw new Error("TTR_CORE_AUTHORITY_INVALID");
      const input: TtrInput = ttrInputSchema.parse({
        ...result.input,
        spatialEquivalence: { equivalence: "UNKNOWN" },
      });
      if (qualifyTtr(input).status !== "QUALIFIED")
        throw new Error("TTR_CORE_INPUT_INVALID");
      const now = clock();
      instantMicroseconds(now);
      if (publicationSequence === Number.MAX_SAFE_INTEGER)
        throw new Error("TTR_ADAPTER_EXHAUSTED");
      const publicationVersion = ++publicationSequence;
      const relation: TtrSelectionRelation = {
        input,
        accessRevision: result.authority.collection.access_revision,
        publicationVersion,
      };
      captures.set(publicationVersion, {
        orderId,
        fromId,
        toId,
        core: structuredClone(result),
        relation: structuredClone(relation),
      });
      // Old captures fail closed. Independent pairs may coexist within the bounded window.
      if (captures.size > 64) captures.delete(captures.keys().next().value!);
      return {
        status: "QUALIFIED" as const,
        relation,
        projection: projectTtr(openTtr(input, null, publicationVersion), {
          now,
          displayPermission: "DENIED",
        }),
      };
    },

    // Called only inside the Selection Repository's existing Account gate and transaction.
    async isCurrentRelation(ctx: AccountRequestContext, relation: TtrSelectionRelation) {
      const capture = !disposed && pinned(ctx, relation);
      return capture
        ? core.revalidateTtrWithinTransaction(
            ctx,
            capture.orderId,
            capture.fromId,
            capture.toId,
            capture.core,
          )
        : false;
    },

    // Call only after the existing nine-field Selection Repository commits and releases its gate.
    async guardAfterCommit(
      ctx: AccountRequestContext,
      relation: TtrSelectionRelation,
      handoff: (lease: CoreTtrPublicationLease) => undefined,
    ) {
      const capture = !disposed && pinned(ctx, relation);
      if (!capture)
        return { status: "STALE" as const, reason: "AUTHORITY_CHANGED" as const };
      let forwarded = false;
      const result = await core.guardTtrPublication(
        ctx,
        capture.orderId,
        capture.fromId,
        capture.toId,
        capture.core,
        (lease) => {
          if (!disposed && pinned(ctx, relation)) {
            forwarded = true;
            handoff(lease);
          }
        },
      );
      return result.status === "CURRENT" && !forwarded
        ? { status: "STALE" as const, reason: "AUTHORITY_CHANGED" as const }
        : result;
    },

    dispose() {
      disposed = true;
      captures.clear();
    },
  };
}

/** Dormant composition: both repositories use the identical serialized connection. */
export function createDormantTtrCoreSelectionBundle(
  database: CoreDatabase,
  getAccountId: () => Promise<string>,
  hash: ImportHash,
  now: () => string,
  selectionClock: () => TtrSelectionClock,
) {
  const authority = createTtrCoreAuthorityAdapter(
    createTripCoreV2Repository(database, getAccountId, hash, now),
    now,
  );
  const selectionRepository = createTtrSelectionRepository(database, getAccountId, {
    clock: selectionClock,
    isCurrentRelation: authority.isCurrentRelation,
  });
  return { authority, selectionRepository };
}
