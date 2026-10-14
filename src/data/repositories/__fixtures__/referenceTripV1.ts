import type { CreateTripItemInput } from "@/domain/trip/types";
import type { TripRepository } from "../tripRepository";

const id = (value: number) =>
  `b61a0000-0061-4000-8000-${value.toString(16).padStart(12, "0")}`;

// QA-only pending subset of the full sixteen-Item scenario; never accepted authority.
export const referenceTripV1 = {
  version: "otr-reference-trip/1",
  seedVersion: "otr-reference-trip-local-pending/1",
  namespace: "b61a0000-0061-4000-8000",
  createdAt: "2027-01-01T00:00:00Z",
  qaViewClock: { instant: "2027-02-06T03:00:00Z", zone: "Asia/Tokyo" },
  trip: {
    tripId: id(1),
    operationId: id(2),
    name: "OTR Reference Trip V1",
    destination: "Auckland / Tokyo / Kyoto / Osaka",
    startDate: "2027-02-01",
    endDate: "2027-02-12",
  },
  persons: [1, 2, 3].map((number) => ({
    personId: id(100 + number),
    displayName: `Reference Person ${number}`,
    status: "DEFERRED_OWNING_PRODUCER" as const,
  })),
  items: [
    {
      itemId: id(1001),
      operationId: id(2001),
      family: "P1",
      title: "Reference Tokyo neighbourhood walk",
      startDate: "2027-02-02",
    },
    {
      itemId: id(1002),
      operationId: id(2002),
      family: "P1",
      title: "Reference Kyoto market — time undecided",
      startDate: "2027-02-07",
    },
    {
      itemId: id(1005),
      operationId: id(2005),
      family: "P3",
      title: "Reference Tokyo multi-night stay",
      startDate: "2027-02-01",
      endDate: "2027-02-05",
    },
    {
      itemId: id(1006),
      operationId: id(2006),
      family: "P3",
      title: "Reference Kyoto single-night stay",
      startDate: "2027-02-05",
      endDate: "2027-02-06",
    },
    {
      itemId: id(1007),
      operationId: id(2007),
      family: "P3",
      title: "Reference Kyoto replacement base",
      startDate: "2027-02-06",
      endDate: "2027-02-12",
    },
  ] satisfies CreateTripItemInput[],
} as const;

export async function seedReferenceTripV1(
  repository: Pick<TripRepository, "createTrip" | "addItem">,
) {
  const trip = await repository.createTrip(referenceTripV1.trip);
  for (const item of referenceTripV1.items) await repository.addItem(trip.id, item);
  return trip;
}

// Reference-local synthetic authority only; never real Auth/Trip initialization.
export async function createReferenceTripV1LocalProducer(
  accountId: string,
  hash: import("@/domain/trip/flightImportReview").ImportHash,
) {
  const { executeCoreCommandV2 } =
    await import("../../../../backend/src/tripCoreV2Commands");
  const { buildCoreActorCollection } =
    await import("../../../../backend/src/tripCoreV2Collection");
  const { emptyCoreGraph } = await import("@/domain/trip/tripCoreV2Mutation");
  const { coreUuid } = await import("@/domain/trip/tripCoreV2");
  const { corePayloadSchemas } = await import("@/domain/trip/tripCoreV2Commands");
  coreUuid.parse(accountId);
  const actor = {
    accountId,
    tripId: referenceTripV1.trip.tripId,
    active: true,
    canManageShared: true,
    personId: referenceTripV1.persons[0].personId,
    personIds: [referenceTripV1.persons[0].personId],
  };
  let graph = emptyCoreGraph();
  const receipts = new Map<string, { domainReceiptId: string; receiptText: string }>();
  let pending: Promise<void> = Promise.resolve();
  const storage: import("../../../../backend/src/tripCoreV2Commands").CoreCommandStorage =
    {
      async withLockedCommand(scope, work) {
        if (scope.actorAccountId !== accountId || scope.tripId !== actor.tripId)
          throw new Error("REFERENCE_LOCAL_SCOPE");
        const prior = pending;
        let release!: () => void;
        pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        await prior;
        try {
          return await work({
            actor,
            authoritativeClock: async () => referenceTripV1.createdAt,
            readReceipt: async () => receipts.get(scope.operationId) ?? null,
            hasLegacyOperation: async () => false,
            canReadReceipt: async () => true,
            enabledCommands: async () => ["CREATE_ITEM"],
            readLockedGraph: async () => graph,
            verifyAdmission: async () => {},
            lifecycleGraphHash: async () => undefined,
            async commit(mutation, receipt) {
              if (mutation) graph = mutation.graph;
              const stored = {
                domainReceiptId: id(3000 + receipts.size),
                receiptText: JSON.stringify(receipt),
              };
              receipts.set(scope.operationId, stored);
              return stored.domainReceiptId;
            },
          });
        } finally {
          release();
        }
      },
    };
  return {
    evidenceLevel: "REFERENCE_LOCAL_SYNTHETIC" as const,
    async execute(command: import("@/domain/trip/tripCoreV2Commands").CoreCommand) {
      const expected = referenceTripV1.items.find(
        (item) =>
          item.operationId === command.operationId && item.itemId === command.target.id,
      );
      const payload = corePayloadSchemas.CREATE_ITEM.safeParse(command.payload);
      if (
        command.command !== "CREATE_ITEM" ||
        command.admission.mode !== "MANUAL" ||
        command.tripId !== actor.tripId ||
        !expected ||
        !payload.success ||
        payload.data.family !== expected.family
      )
        throw new Error("REFERENCE_LOCAL_FINITE_COMMAND");
      const result = await executeCoreCommandV2(
        storage,
        accountId,
        actor.tripId,
        command,
        hash,
      );
      if (result.projection !== "FULL" || result.receipt.outcome !== "APPLIED")
        throw new Error("REFERENCE_LOCAL_COMMAND_REJECTED");
      return result;
    },
    async collection() {
      if (
        receipts.size !== referenceTripV1.items.length ||
        graph.itinerary_events.length !== referenceTripV1.items.length
      )
        throw new Error("REFERENCE_LOCAL_INCOMPLETE");
      return buildCoreActorCollection(
        graph,
        actor,
        {
          epoch: id(3),
          revision: receipts.size,
          accessRevision: 1,
          generatedAt: referenceTripV1.createdAt,
        },
        [
          {
            person_id: actor.personId,
            account_id: accountId,
            active: true,
            participating: true,
            revision: 1,
          },
        ],
        hash,
      );
    },
  };
}
