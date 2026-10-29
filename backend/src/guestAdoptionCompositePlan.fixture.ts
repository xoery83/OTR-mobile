import { createHash, randomUUID } from "node:crypto";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
const canonical = (v: unknown) => canonicalCoreJson(v as Json);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export function seal(value: unknown) {
  const canonicalText = canonical(value);
  return {
    canonicalText,
    sha256: hash(canonicalText),
    bytes: Buffer.byteLength(canonicalText),
  };
}
export function fixture() {
  const user = { id: randomUUID(), accountClass: "NORMAL_ACCOUNT" as const };
  const guest = randomUUID(),
    trip = randomUUID(),
    person = randomUUID();
  const create = {
    operationId: randomUUID(),
    tripId: trip,
    name: "Guest original Å",
    destination: null,
    startDate: null,
    endDate: null,
  };
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: trip,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id: randomUUID() },
    baseVector: [] as { kind: string; id: string; revision: null }[],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family: "P1",
      core: { title: "Guest walk" },
      schedule: { start: coreDateBoundary("2026-10-30") },
      participation: { mode: "SELF", people: [] as string[], selfPersonId: person },
      acl: { visibility: "SELECTED_PERSONS", people: [person] },
    },
  };
  command.baseVector.push({ kind: "ITEM", id: command.target.id, revision: null });
  const instant = "2026-10-30T00:00:00.000Z";
  const body = {
    schemaId: "otr.auth.guest-trip-p1-source/1",
    sourceKind: "GUEST",
    capabilityVersion: "",
    sqliteVersion: 74,
    sourceGuestLocalId: guest,
    sourceTablesSha256: "a".repeat(64),
    cloudAuthority: false,
    totals: { trips: 1, people: 1, p1Items: 1, queueOperations: 2 },
    trips: [
      {
        create,
        metadata: {
          name: create.name,
          destination: null,
          startDate: null,
          endDate: null,
        },
        sourceTimeline: { createdAt: instant, updatedAt: instant },
        ledgerInitialization: {
          id: trip,
          title: create.name,
          startDate: null,
          endDate: null,
          settlementCurrency: "JPY",
          settlementScale: 0,
          valuationPolicy: "REFERENCE_RATE",
          updatedAt: instant,
        },
        creator: { personId: person, displayName: "旅人 Å" },
        people: [],
        selectedCoverAssetId: null,
        personalCover: null,
        deferredMetadata: [],
        coreIntents: [
          {
            command,
            canonicalText: "",
            sha256: "",
            createdAt: instant,
            state: "PENDING",
          },
        ],
        queueOperationIds: [create.operationId, command.operationId],
      },
    ],
  };
  const grant = {
    contractVersion: 1,
    adoptionId: randomUUID(),
    sourceGuestLocalId: guest,
    targetAccountId: user.id,
    inventorySha256: "b".repeat(64),
    status: "GRANTED",
    grantId: randomUUID(),
    policyVersion: "test-only-not-installed",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    resources: { trips: 1, people: 1, items: 1, files: 0, fileBytes: 0, liveDrafts: 0 },
  };
  async function source() {
    const { guestFilelessCapabilityVersion } =
      await import("../../src/data/auth/guestRegisteredFileQualification");
    body.capabilityVersion = guestFilelessCapabilityVersion;
    const intent = body.trips[0].coreIntents[0];
    intent.canonicalText = canonical(intent.command);
    intent.sha256 = hash("otr-trip-core-intent-v2\n" + intent.canonicalText);
    const canonicalText = canonical(body);
    return seal({
      schemaId: "otr.auth.guest-adoption-recovery/3",
      sourceKind: "GUEST",
      checkpoint: "PREPARED",
      adoptionId: grant.adoptionId,
      sourceGuestLocalId: guest,
      targetAccountId: user.id,
      inventorySha256: grant.inventorySha256,
      tripIds: [trip],
      drafts: [],
      source: {
        canonicalText,
        sha256: hash(canonicalText),
        bytes: Buffer.byteLength(canonicalText),
      },
    });
  }
  return { user, body, grant, source, person };
}
