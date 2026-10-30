import { z } from "zod";
import { prepareGuestAdoptionCompositePlan } from "./guestAdoptionCompositePlan";
import { prepareGuestAdoptionCompositeIdentity } from "./guestAdoptionCompositeIdentity";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";
import type { TripCreatePort } from "./tripCreate";
import type { TripPersonCloudCreatePort } from "./tripPersonCloudCreateHttp";
import type { TripMetadataV2Port } from "./tripMetadataV2";
import { executeCoreCommandV2, type CoreCommandStorage } from "./tripCoreV2Commands";
import { guestAdoptionPreparationSchema } from "../../src/data/auth/guestAdoptionPreparation";
import { verifyGuestSourceCheckpoint } from "../../src/data/auth/guestTripP1SourceSchema";
import { tripCreateWireResultSchema } from "../../src/domain/trip/tripCreateWireContract";
import {
  personCloudCreateSchema,
  personCloudCreateReceiptSchema,
} from "../../src/domain/trip/tripPersonCloudCreate";
import {
  tripMetadataRevisionedSnapshotSchema,
  tripMetadataRevisionedUpdateSchema,
  tripMetadataRevisionedReceiptSchema,
  metadataRequestFromReceipt,
} from "../../src/domain/trip/tripMetadataV2Contract";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { validateCoreReceipt } from "../../src/domain/trip/tripCoreV2Receipt";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { ledgerBootstrapResponseSchema } from "../../src/data/api/ledgerReadContracts";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";

const ledger = ledgerBootstrapResponseSchema.shape.journey.strict();
const canonical = (v: unknown) => canonicalCoreJson(v as Json);
type Binding = Readonly<{
  actorAccountId: string;
  adoptionId: string;
  sourceGuestLocalId: string;
  inventorySha256: string;
  grantId: string;
  planSha256: string;
}>;

// Only a future owning atomic adapter may supply these held ports. Standalone
// HTTP/PG factories must never be composed here: this function owns no COMMIT.
export type GuestAdoptionCompositeTransaction = {
  assertCurrent(binding: Binding): Promise<void>;
  assertNewTrips(actor: string, tripIds: readonly string[]): Promise<void>;
  trips: TripCreatePort;
  people: TripPersonCloudCreatePort;
  initializeLedger(actor: string, original: z.infer<typeof ledger>): Promise<unknown>;
  metadata: TripMetadataV2Port;
  core: CoreCommandStorage;
};

// Unmounted/default closed. Returned evidence is not a publication receipt,
// permission to unlock Guest data, or proof of the outer transaction's outcome.
export async function executeGuestAdoptionComposite(
  user: AuthenticatedAccount,
  owningStaging: unknown,
  checkpoint: unknown,
  transaction?: GuestAdoptionCompositeTransaction,
  signal?: AbortSignal,
) {
  if (!isNormalAccount(user)) throw Error("NORMAL_ACCOUNT_REQUIRED");
  if (!transaction) throw Error("GUEST_ADOPTION_COMPOSITE_CLOSED");
  const trustedUser = Object.freeze({ id: user.id, accountClass: user.accountClass });
  const plan = await prepareGuestAdoptionCompositePlan(
    trustedUser,
    owningStaging,
    checkpoint,
  );
  const sealed = JSON.parse(plan.canonicalText);
  const preparation = guestAdoptionPreparationSchema.parse(
    JSON.parse(sealed.preparation.canonicalText),
  );
  if (preparation.drafts.length) throw Error("GUEST_ADOPTION_DRAFT_RESTORE_REQUIRED");
  if (!preparation.source) throw Error("GUEST_ADOPTION_SOURCE_REQUIRED");
  const source = await verifyGuestSourceCheckpoint(preparation.source, preparation);
  if (
    source.trips.some((trip) =>
      trip.deferredMetadata.some(
        (action) => action.cover && action.cover.before !== action.cover.after,
      ),
    )
  )
    throw Error("GUEST_ADOPTION_COVER_RESTORE_REQUIRED");
  const binding: Binding = Object.freeze({
    actorAccountId: trustedUser.id,
    adoptionId: preparation.adoptionId,
    sourceGuestLocalId: preparation.sourceGuestLocalId,
    inventorySha256: preparation.inventorySha256,
    grantId: sealed.grant.grantId,
    planSha256: plan.sha256,
  });
  const current = async () => {
    if (signal?.aborted) throw Error("GUEST_ADOPTION_EXECUTION_ABORTED");
    if (Date.parse(sealed.grant.expiresAt) <= Date.now())
      throw Error("GUEST_ADOPTION_GRANT_EXPIRED");
    await transaction.assertCurrent(binding);
    if (signal?.aborted) throw Error("GUEST_ADOPTION_EXECUTION_ABORTED");
    if (Date.parse(sealed.grant.expiresAt) <= Date.now())
      throw Error("GUEST_ADOPTION_GRANT_EXPIRED");
  };
  async function checked<T>(work: () => Promise<T>) {
    await current();
    const value = await work();
    await current();
    return value;
  }
  const fail = () => {
    throw Error("GUEST_ADOPTION_EXECUTION_READBACK_MISMATCH");
  };
  const actor = binding.actorAccountId;
  await checked(() =>
    transaction.assertNewTrips(
      actor,
      source.trips.map((t) => t.create.tripId),
    ),
  );
  const created = [];
  for (const trip of source.trips) {
    const receipt = tripCreateWireResultSchema.parse(
      await checked(() => transaction.trips.create(actor, trip.create)),
    );
    const readback = tripCreateWireResultSchema.parse(
      await checked(() => transaction.trips.receipt(actor, trip.create.operationId)),
    );
    if (canonical(receipt) !== canonical(readback)) fail();
    created.push(readback);
  }
  const identity = await prepareGuestAdoptionCompositeIdentity(
    trustedUser,
    { grant: sealed.grant, preparationSha256: sealed.preparation.sha256 },
    sealed.preparation,
    created,
  );
  await current();
  const mapped = JSON.parse(identity.canonicalText).trips as {
    tripId: string;
    intents: {
      operationId: string;
      sourceIntentSha256: string;
      mappedCanonicalText: string;
      mappedIntentSha256: string;
    }[];
  }[];
  const records: unknown[] = [];
  const queueMappings: { queueId: string; operationId: string; kind: string }[] = [];
  for (const trip of source.trips) {
    const tripId = trip.create.tripId;
    queueMappings.push({
      queueId: trip.create.operationId,
      operationId: trip.create.operationId,
      kind: "TRIP_CREATE",
    });
    const people = [];
    for (const person of trip.people) {
      const request = personCloudCreateSchema.parse({
        version: 1,
        operationId: person.operationId,
        personId: person.personId,
        tripId,
        tripCreateOperationId: trip.create.operationId,
        dataOwnership: "CLOUD_SHARED_AUTHORED",
        displayName: person.displayName,
      });
      const receipt = personCloudCreateReceiptSchema.parse(
        await checked(() => transaction.people.create(actor, request)),
      );
      if (
        receipt.actorAccountId !== actor ||
        canonical(receipt.request) !== canonical(request)
      )
        fail();
      const readback = personCloudCreateReceiptSchema.parse(
        await checked(() =>
          transaction.people.receipt(actor, tripId, person.operationId),
        ),
      );
      if (canonical(readback) !== canonical(receipt)) fail();
      people.push(readback);
      queueMappings.push({
        queueId: person.operationId,
        operationId: person.operationId,
        kind: "PERSON_CREATE",
      });
    }
    const metadata = [];
    for (const action of trip.deferredMetadata) {
      const snapshot = tripMetadataRevisionedSnapshotSchema.parse(
        await checked(() =>
          transaction.metadata.snapshot(actor, tripId, action.operationId),
        ),
      );
      // The revision is read from the actual owning transaction, never invented
      // from a V1 queued payload. Deferred local actions retain their own identity.
      if (
        snapshot.actorAccountId !== actor ||
        snapshot.tripId !== tripId ||
        snapshot.formatVersion !== 3 ||
        canonical(snapshot.metadata) !== canonical(action.before)
      )
        fail();
      const request = tripMetadataRevisionedUpdateSchema.parse({
        formatVersion: 3,
        operationId: action.operationId,
        tripId,
        expectedMetadataRevision: snapshot.metadataRevision,
        before: action.before,
        after: action.after,
      });
      const receipt = tripMetadataRevisionedReceiptSchema.parse(
        await checked(() => transaction.metadata.update(actor, request)),
      );
      if (
        receipt.actorAccountId !== actor ||
        canonical(metadataRequestFromReceipt(receipt)) !== canonical(request)
      )
        fail();
      const after = tripMetadataRevisionedSnapshotSchema.parse(
        await checked(() =>
          transaction.metadata.snapshot(actor, tripId, action.operationId),
        ),
      );
      if (
        after.actorAccountId !== actor ||
        after.tripId !== tripId ||
        after.formatVersion !== 3 ||
        after.metadataRevision !== receipt.resultMetadataRevision ||
        canonical(after.metadata) !== canonical(action.after)
      )
        fail();
      metadata.push({ sourceAction: action, receipt });
      queueMappings.push({
        queueId: action.actionId,
        operationId: action.operationId,
        kind: "TRIP_METADATA_DEFERRED",
      });
    }
    const ledgerReadback = ledger.parse(
      await checked(() => transaction.initializeLedger(actor, trip.ledgerInitialization)),
    );
    // Ledger bootstrap derives title/dates from the final Trip, not its stale local cache.
    const { updatedAt: _sourceUpdatedAt, ...sourceLedger } = trip.ledgerInitialization;
    const { updatedAt: serverUpdatedAt, ...remoteLedger } = ledgerReadback;
    if (
      !Number.isFinite(Date.parse(serverUpdatedAt)) ||
      canonical(remoteLedger) !==
        canonical({
          ...sourceLedger,
          title: trip.metadata.name,
          startDate: trip.metadata.startDate,
          endDate: trip.metadata.endDate,
        })
    )
      fail();
    const intents = [];
    const mappedTrip = mapped.find((t) => t.tripId === tripId);
    if (!mappedTrip) throw Error("GUEST_ADOPTION_EXECUTION_IDENTITY_MISSING");
    for (const intent of mappedTrip.intents) {
      const response = await checked(() =>
        executeCoreCommandV2(
          transaction.core,
          actor,
          tripId,
          JSON.parse(intent.mappedCanonicalText),
          tripCoreSha256Hex,
        ),
      );
      if (response.projection !== "FULL")
        throw Error("GUEST_ADOPTION_CORE_RECEIPT_REQUIRED");
      const receipt = await validateCoreReceipt(response.receipt, tripCoreSha256Hex);
      coreUuid.parse(response.domainReceiptId);
      if (
        receipt.actorAccountId !== actor ||
        receipt.tripId !== tripId ||
        receipt.operationId !== intent.operationId ||
        receipt.intentSha256 !== intent.mappedIntentSha256
      )
        fail();
      if (!["APPLIED", "NO_CHANGE"].includes(receipt.outcome))
        throw Error("GUEST_ADOPTION_CORE_NOT_APPLIED");
      intents.push({ ...intent, domainReceiptId: response.domainReceiptId, receipt });
      queueMappings.push({
        queueId: intent.operationId,
        operationId: intent.operationId,
        kind: "CORE",
      });
    }
    records.push({ tripId, people, ledger: ledgerReadback, metadata, intents });
  }
  const originalQueue = source.trips.flatMap((t) => t.queueOperationIds).sort();
  if (canonical(originalQueue) !== canonical(queueMappings.map((m) => m.queueId).sort()))
    fail();
  await current();
  const canonicalText = canonical({
    schemaId: "otr.auth.guest-composite-execution/1",
    authority: "NONE",
    binding,
    identity,
    records,
    queueMappings,
    localRestoreStatus: "REQUIRED_NOT_EXECUTED",
    retainedLocalState: source.trips.map((trip) => ({
      tripId: trip.create.tripId,
      sourceTimeline: trip.sourceTimeline,
      ledgerInitialization: trip.ledgerInitialization,
      creator: trip.creator,
      selectedCoverAssetId: trip.selectedCoverAssetId,
      personalCover: trip.personalCover,
    })),
  });
  const sha256 = await tripCoreSha256Hex(new TextEncoder().encode(canonicalText));
  await current();
  return Object.freeze({ canonicalText, sha256, authority: "NONE" as const });
}
