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
  fullSixteen = false,
  bootstrap?: {
    actor: import("@/domain/trip/tripCoreV2Mutation").CoreActor;
    epoch: string;
    accessRevision: number;
  },
) {
  const { executeCoreCommandV2 } =
    await import("../../../../backend/src/tripCoreV2Commands");
  const { buildCoreActorCollection } =
    await import("../../../../backend/src/tripCoreV2Collection");
  const { emptyCoreGraph } = await import("@/domain/trip/tripCoreV2Mutation");
  const { coreUuid } = await import("@/domain/trip/tripCoreV2");
  const { corePayloadSchemas } = await import("@/domain/trip/tripCoreV2Commands");
  coreUuid.parse(accountId);
  const actor = bootstrap
    ? { ...bootstrap.actor, personIds: [...bootstrap.actor.personIds] }
    : {
        accountId,
        tripId: referenceTripV1.trip.tripId,
        active: true,
        canManageShared: true,
        personId: referenceTripV1.persons[0].personId,
        personIds: [referenceTripV1.persons[0].personId],
      };
  if (bootstrap) {
    coreUuid.parse(bootstrap.epoch);
    if (
      actor.accountId !== accountId ||
      actor.tripId !== referenceTripV1.trip.tripId ||
      !actor.active ||
      !actor.personId ||
      !actor.personIds.includes(actor.personId) ||
      !Number.isSafeInteger(bootstrap.accessRevision) ||
      bootstrap.accessRevision < 1
    )
      throw new Error("REFERENCE_BOOTSTRAP_MISMATCH");
    coreUuid.parse(actor.personId);
    for (const person of actor.personIds) coreUuid.parse(person);
  }
  const personId = actor.personId;
  if (!personId) throw new Error("REFERENCE_BOOTSTRAP_MISMATCH");
  const epoch = bootstrap?.epoch ?? id(3),
    accessRevision = bootstrap?.accessRevision ?? 1;
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
            enabledCommands: async () =>
              fullSixteen ? ["CREATE_ITEM", "CREATE_SPARSE_FLIGHT"] : ["CREATE_ITEM"],
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
    evidenceLevel: bootstrap
      ? ("REFERENCE_LOCAL_PG_BOOTSTRAP_MEMORY_ITEMS" as const)
      : ("REFERENCE_LOCAL_SYNTHETIC" as const),
    async execute(command: import("@/domain/trip/tripCoreV2Commands").CoreCommand) {
      const expected = (
        fullSixteen ? referenceTripV1Full.items : referenceTripV1.items
      ).find(
        (item) =>
          item.operationId === command.operationId && item.itemId === command.target.id,
      );
      const sparse = command.command === "CREATE_SPARSE_FLIGHT";
      const payload = sparse
        ? corePayloadSchemas.CREATE_SPARSE_FLIGHT.safeParse(command.payload)
        : corePayloadSchemas.CREATE_ITEM.safeParse(command.payload);
      if (
        (!sparse && command.command !== "CREATE_ITEM") ||
        (sparse && !fullSixteen) ||
        command.admission.mode !== "MANUAL" ||
        command.tripId !== actor.tripId ||
        !expected ||
        !payload.success ||
        (sparse
          ? expected.family !== "P2"
          : !("family" in payload.data) || payload.data.family !== expected.family)
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
        receipts.size !== (fullSixteen ? 16 : referenceTripV1.items.length) ||
        graph.itinerary_events.length !==
          (fullSixteen ? 16 : referenceTripV1.items.length)
      )
        throw new Error("REFERENCE_LOCAL_INCOMPLETE");
      return buildCoreActorCollection(
        graph,
        actor,
        {
          epoch,
          revision: receipts.size,
          accessRevision,
          generatedAt: referenceTripV1.createdAt,
        },
        [
          {
            person_id: personId,
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

// Full sixteen-Item QA preparation. Relationship labels never mint Ticket/Booking rights.
export const referenceTripV1Full = {
  ...referenceTripV1,
  seedVersion: "otr-reference-trip-local-full/1",
  items: [
    {
      key: 1,
      itemId: "b61a0000-0061-4000-8000-0000000003e9",
      operationId: "b61a0000-0061-4000-8000-0000000007d1",
      family: "P1",
      title: "Reference Tokyo neighbourhood walk",
      startDate: "2027-02-02",
      plannedLocalTime: "10:00",
      city: "Tokyo",
    },
    {
      key: 2,
      itemId: "b61a0000-0061-4000-8000-0000000003ea",
      operationId: "b61a0000-0061-4000-8000-0000000007d2",
      family: "P1",
      title: "Reference Kyoto market — time undecided",
      startDate: "2027-02-07",
      city: "Kyoto",
    },
    {
      key: 3,
      itemId: "b61a0000-0061-4000-8000-0000000003eb",
      operationId: "b61a0000-0061-4000-8000-0000000007d3",
      family: "P2",
      title: "Synthetic outbound flight",
      startDate: "2027-02-01",
      flightNumberLiteral: "REF901",
      origin: "Auckland",
      destination: "Tokyo",
    },
    {
      key: 4,
      itemId: "b61a0000-0061-4000-8000-0000000003ec",
      operationId: "b61a0000-0061-4000-8000-0000000007d4",
      family: "P2",
      title: "Synthetic return flight",
      startDate: "2027-02-12",
      flightNumberLiteral: "REF902",
      origin: "Osaka",
      destination: "Auckland",
    },
    {
      key: 5,
      itemId: "b61a0000-0061-4000-8000-0000000003ed",
      operationId: "b61a0000-0061-4000-8000-0000000007d5",
      family: "P3",
      title: "Reference Tokyo multi-night stay",
      startDate: "2027-02-01",
      city: "Tokyo",
      endDate: "2027-02-05",
    },
    {
      key: 6,
      itemId: "b61a0000-0061-4000-8000-0000000003ee",
      operationId: "b61a0000-0061-4000-8000-0000000007d6",
      family: "P3",
      title: "Reference Kyoto single-night stay",
      startDate: "2027-02-05",
      city: "Kyoto",
      endDate: "2027-02-06",
    },
    {
      key: 7,
      itemId: "b61a0000-0061-4000-8000-0000000003ef",
      operationId: "b61a0000-0061-4000-8000-0000000007d7",
      family: "P3",
      title: "Reference Kyoto replacement base",
      startDate: "2027-02-06",
      city: "Kyoto",
      endDate: "2027-02-12",
    },
    {
      key: 8,
      itemId: "b61a0000-0061-4000-8000-0000000003f0",
      operationId: "b61a0000-0061-4000-8000-0000000007d8",
      family: "P4",
      title: "Reference rental A",
      startDate: "2027-02-06",
      pickupCity: "Kyoto",
      returnCity: "Kyoto",
      samePickupGroup: "rental-group-1",
      plannedPickupLocalTime: "11:00",
      endDate: "2027-02-08",
    },
    {
      key: 9,
      itemId: "b61a0000-0061-4000-8000-0000000003f1",
      operationId: "b61a0000-0061-4000-8000-0000000007d9",
      family: "P4",
      title: "Reference rental B",
      startDate: "2027-02-06",
      pickupCity: "Kyoto",
      returnCity: "Osaka",
      samePickupGroup: "rental-group-1",
      plannedPickupLocalTime: "11:00",
      endDate: "2027-02-09",
    },
    {
      key: 10,
      itemId: "b61a0000-0061-4000-8000-0000000003f2",
      operationId: "b61a0000-0061-4000-8000-0000000007da",
      family: "P4",
      title: "Reference same-day rental",
      startDate: "2027-02-09",
      pickupCity: "Osaka",
      returnCity: "Osaka",
      plannedPickupLocalTime: "09:00",
      plannedReturnLocalTime: "17:00",
      endDate: "2027-02-09",
    },
    {
      key: 11,
      itemId: "b61a0000-0061-4000-8000-0000000003f3",
      operationId: "b61a0000-0061-4000-8000-0000000007db",
      family: "P5",
      title: "Reference train segment",
      startDate: "2027-02-05",
      serviceSubtype: "TRAIN",
      origin: "Tokyo",
      destination: "Kyoto",
    },
    {
      key: 12,
      itemId: "b61a0000-0061-4000-8000-0000000003f4",
      operationId: "b61a0000-0061-4000-8000-0000000007dc",
      family: "P5",
      title: "Reference ferry segment",
      startDate: "2027-02-08",
      serviceSubtype: "FERRY",
      origin: "Kyoto",
      destination: "Osaka",
    },
    {
      key: 13,
      itemId: "b61a0000-0061-4000-8000-0000000003f5",
      operationId: "b61a0000-0061-4000-8000-0000000007dd",
      family: "P5",
      title: "Reference overnight train segment",
      startDate: "2027-02-10",
      serviceSubtype: "TRAIN",
      origin: "Osaka",
      destination: "Tokyo",
      endDate: "2027-02-11",
    },
    {
      key: 14,
      itemId: "b61a0000-0061-4000-8000-0000000003f6",
      operationId: "b61a0000-0061-4000-8000-0000000007de",
      family: "P6",
      title: "Reference evening show",
      startDate: "2027-02-03",
      city: "Tokyo",
      plannedLocalTime: "19:00",
      entitlementKey: "ticket-show",
    },
    {
      key: 15,
      itemId: "b61a0000-0061-4000-8000-0000000003f7",
      operationId: "b61a0000-0061-4000-8000-0000000007df",
      family: "P6",
      title: "Reference activity with all-day ticket validity",
      startDate: "2027-02-04",
      city: "Tokyo",
      plannedLocalTime: "14:00",
      entitlementKey: "ticket-day",
      ticketValidity: "ALL_DAY",
    },
    {
      key: 16,
      itemId: "b61a0000-0061-4000-8000-0000000003f8",
      operationId: "b61a0000-0061-4000-8000-0000000007e0",
      family: "P6",
      title: "Reference Booking-only activity",
      startDate: "2027-02-07",
      city: "Kyoto",
      bookingKey: "booking-activity",
      entitlementKey: null,
    },
  ],
  ticketAndBookingRelationships: "DEFERRED_OWNING_PRODUCER",
  p2Qualification: "SPARSE_ONLY",
  p5ServiceIdentity: "EXPLICIT_SYNTHETIC_TEST_LITERAL_NOT_EXTERNAL_SOURCE",
  oldP1PlannedClock: "DEFERRED_IMMUTABLE_DATE_ONLY_CREATE",
} as const;

export async function seedReferenceTripV1Full(
  repository: Pick<TripRepository, "createTrip" | "addItem">,
  core: Pick<
    ReturnType<typeof import("../tripCoreV2Repository").createTripCoreV2Repository>,
    "captureContext" | "enqueue"
  >,
) {
  const trip = await seedReferenceTripV1(repository);
  const context = await core.captureContext(trip.id);
  const { coreDefaults, corePlaceSchema } = await import("@/domain/trip/tripCoreV2");
  const { coreDateBoundary } = await import("@/domain/trip/tripCoreV2Temporal");
  const place = (label: string) =>
    corePlaceSchema.parse({
      ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((key) => [key, null])),
      authored_label: label,
    });
  const clock = (date: string, time?: string) => ({
    ...coreDateBoundary(date),
    ...(time
      ? {
          local_time: `${time}:00`,
          clock_precision: 0,
          quality: "ESTIMATED",
          zone_id: "Asia/Tokyo",
        }
      : {}),
  });
  const pendingFive = new Set<string>(referenceTripV1.items.map((item) => item.itemId));
  for (const fact of referenceTripV1Full.items) {
    if (pendingFive.has(fact.itemId)) continue;
    let command: "CREATE_ITEM" | "CREATE_SPARSE_FLIGHT" = "CREATE_ITEM";
    let payload: unknown;
    const defaults = coreDefaults("organizer");
    switch (fact.family) {
      case "P2":
        command = "CREATE_SPARSE_FLIGHT";
        payload = {
          flightNumberLiteral: fact.flightNumberLiteral,
          departureDate: fact.startDate,
          core: { title: fact.title },
          ...defaults,
        };
        break;
      case "P4":
        payload = {
          family: fact.family,
          core: { title: fact.title },
          ...defaults,
          schedule: {
            start: clock(fact.startDate, fact.plannedPickupLocalTime),
            end: clock(
              fact.endDate,
              "plannedReturnLocalTime" in fact ? fact.plannedReturnLocalTime : undefined,
            ),
          },
          places: { pickup: place(fact.pickupCity), return: place(fact.returnCity) },
        };
        break;
      case "P5":
        payload = {
          family: fact.family,
          core: { title: fact.title },
          ...defaults,
          endpoints: {
            origin: { time: clock(fact.startDate), place: place(fact.origin) },
            destination: {
              time: clock("endDate" in fact ? fact.endDate : fact.startDate),
              place: place(fact.destination),
            },
          },
          service: {
            service_key: `ref-${fact.key}`,
            transport_subtype: fact.serviceSubtype,
            attribution: "OPERATING",
            operator_namespace: "NAME",
            operator_issuer: "reference-local",
            operator_value: "qa-service",
            operator_literal: "Reference QA operator",
            service_number: `REF${fact.key}`,
            service_literal: `Reference service ${fact.key}`,
            codeshare_operating_key: null,
          },
        };
        break;
      case "P6":
        payload = {
          family: fact.family,
          core: { title: fact.title },
          ...defaults,
          schedule: {
            start: clock(
              fact.startDate,
              "plannedLocalTime" in fact ? fact.plannedLocalTime : undefined,
            ),
          },
          place: place(fact.city),
        };
        break;
      default:
        throw new Error("REFERENCE_FULL_UNEXPECTED_SUBSET");
    }
    await core.enqueue(context, {
      contractVersion: 2,
      intentVersion: 2,
      operationId: fact.operationId,
      tripId: trip.id,
      command,
      target: { kind: "ITEM", id: fact.itemId },
      baseVector: [{ kind: "ITEM", id: fact.itemId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload,
    });
  }
  return trip;
}
