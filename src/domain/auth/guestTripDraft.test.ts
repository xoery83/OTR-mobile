import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { guestTripDraftSnapshotSchema } from "./guestTripDraft";

function createDraft() {
  const tripId = randomUUID();
  return {
    schemaId: "otr.auth.guest-trip-draft/1" as const,
    draftId: randomUUID(),
    tripId,
    mode: "CREATE" as const,
    value: {
      operation: { operationId: randomUUID(), tripId },
      name: "  原文未保存  ",
      start: "2026-12-10",
      end: "2026-12-01",
      destinations: [],
      selfNickname: "别名",
      knownSelfName: "",
      travelers: [],
    },
  };
}
it("preserves raw Unicode, whitespace and unfinished date input rather than validating a finished Trip", () => {
  const raw = createDraft();
  expect(guestTripDraftSnapshotSchema.parse(raw)).toEqual(raw);
  raw.value.name = raw.value.start = raw.value.end = "";
  expect(guestTripDraftSnapshotSchema.parse(raw)).toEqual(raw);
});
it("rejects a different operation Trip or an unbound draft identity", () => {
  const raw = createDraft();
  expect(
    guestTripDraftSnapshotSchema.safeParse({ ...raw, tripId: randomUUID() }).success,
  ).toBe(false);
  expect(
    guestTripDraftSnapshotSchema.safeParse({ ...raw, draftId: "display-name" }).success,
  ).toBe(false);
});
it("rejects unregistered credential/account fields instead of serializing an arbitrary JSON bag", () => {
  const raw = createDraft();
  expect(
    guestTripDraftSnapshotSchema.safeParse({
      ...raw,
      value: { ...raw.value, accessToken: "synthetic-forbidden-field" },
    }).success,
  ).toBe(false);
  expect(
    guestTripDraftSnapshotSchema.safeParse({ ...raw, accountId: randomUUID() }).success,
  ).toBe(false);
});
it("retains explicit Person and operation identities without name inference", () => {
  const raw = createDraft();
  const people = [
    { personId: randomUUID(), operationId: randomUUID(), displayName: "同名" },
    { personId: randomUUID(), operationId: randomUUID(), displayName: "同名" },
  ];
  const result = guestTripDraftSnapshotSchema.parse({
    ...raw,
    value: { ...raw.value, travelers: people },
  });
  expect(result.value).toMatchObject({ travelers: people });
});

it("rejects a foreign Trip hidden inside an otherwise valid Edit CAS baseline", () => {
  const tripId = randomUUID();
  const raw = {
    schemaId: "otr.auth.guest-trip-draft/1",
    draftId: randomUUID(),
    tripId,
    mode: "EDIT",
    value: {
      fields: {
        before: { name: "Guest", destination: null, startDate: null, endDate: null },
        beforeCover: null,
        draftCover: null,
        coverChanged: false,
        initialDestinations: [],
        destinationItems: [],
        destinationsBefore: [],
        name: "",
        destination: "",
        start: "",
        end: "",
      },
      context: {
        tripId,
        syncFormatVersion: 2,
        deferredMetadataBase: null,
        deferredActionId: null,
        metadataBase: {
          formatVersion: 3,
          actorAccountId: randomUUID(),
          tripId: randomUUID(),
          metadataRevision: 0,
          metadata: {
            name: "Guest",
            destination: null,
            destinations: [],
            startDate: null,
            endDate: null,
          },
        },
      },
    },
  };
  expect(guestTripDraftSnapshotSchema.safeParse(raw).success).toBe(false);
  raw.value.context.metadataBase.tripId = tripId;
  expect(guestTripDraftSnapshotSchema.safeParse(raw).success).toBe(true);
});
