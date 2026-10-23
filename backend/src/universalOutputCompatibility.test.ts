import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  createUniversalPort,
  UNIVERSAL_IMPORT_VERSION,
  type UniversalManifest,
  type UniversalResult,
} from "./universalImport";
import { projectUniversalMinimumFacts } from "./universalReadiness";
import { validateUniversalAdvisory } from "./universalAdvisory";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";

const actor = randomUUID(),
  trip = randomUUID(),
  batch = randomUUID(),
  account = randomUUID();
const source = (value: string) => {
  const bytes = Buffer.from(value);
  return {
    accountId: account,
    tripId: trip,
    batchId: batch,
    inputId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
    revision: 1,
    mime: "text/plain",
    originalSha256: createHash("sha256").update(bytes).digest("hex"),
    bytes,
  };
};
const span = (bytes: Buffer, raw: string, index: number) => ({
  sourceIndex: index,
  raw,
  start: bytes.indexOf(Buffer.from(raw)),
  end: bytes.indexOf(Buffer.from(raw)) + Buffer.byteLength(raw),
});
async function run(manifest: UniversalManifest, output: unknown) {
  const receipts = new Map<string, UniversalResult>();
  const port = createUniversalPort(
    {
      readManifest: async () => manifest,
      claimDispatch: async (marker) => {
        receipts.set(marker.taskId, marker);
        return { claimed: true, receipt: marker };
      },
      writeReceipt: async (result) => {
        receipts.set(result.taskId, result);
      },
      readReceipt: async (_, __, taskId) => receipts.get(taskId) ?? null,
    },
    {
      mode: "LOCAL_FIXTURE",
      interpret: async () => ({
        output,
        providerReceipt: { outcome: "LOCAL_FIXTURE", requestId: null },
      }),
    },
  );
  return port.execute(actor, batch, {
    version: UNIVERSAL_IMPORT_VERSION,
    tripId: trip,
    taskId: randomUUID(),
  });
}
it("keeps W HIGH separate from dated family minimum facts and does not require P4 supplier", () => {
  const field = (path: string, raw: string) => ({
    sourceId: "S0",
    path,
    raw,
    start: 0,
    end: Buffer.byteLength(raw),
  });
  expect(
    projectUniversalMinimumFacts({
      token: "i1",
      kind: "P1",
      subtype: "ACTIVITY",
      fields: [field("activity.name", "Walk")],
      bookingTokens: [],
      ticketTokens: [],
    }),
  ).toMatchObject({
    minimumFacts: "INCOMPLETE",
    missing: ["START_DATE"],
    createReady: false,
  });
  expect(
    projectUniversalMinimumFacts({
      token: "i4",
      kind: "P4",
      subtype: "RENTAL_CAR",
      fields: [field("title", "Car"), field("pickup.date", "2026-10-14")],
      bookingTokens: [],
      ticketTokens: [],
    }),
  ).toMatchObject({
    minimumFacts: "EVIDENCED_CANDIDATE_FACTS",
    missing: [],
    createReady: false,
  });
  expect(
    projectUniversalMinimumFacts({
      token: "i5",
      kind: "P5",
      subtype: "TRAIN",
      fields: [
        field("service", "Northern Explorer"),
        field("origin.local_date", "2026-10-14"),
      ],
      bookingTokens: [],
      ticketTokens: [],
    }),
  ).toMatchObject({ minimumFacts: "EVIDENCED_CANDIDATE_FACTS", missing: [] });
  expect(
    projectUniversalMinimumFacts({
      token: "i2",
      kind: "P2",
      subtype: "FLIGHT",
      fields: [field("service", "NZ123"), field("origin.local_date", "2026-10-14")],
      bookingTokens: [],
      ticketTokens: [],
    }),
  ).toMatchObject({
    minimumFacts: "INCOMPLETE",
    missing: ["FLIGHT_NUMBER_OR_QUALIFIED_EXCEPTION"],
  });
});
it("retains one-call multi-label classification, cross-source corroboration and optional P3 evidence as Source observations", async () => {
  const a = source(
    "Property: Grand Hotel\nCheck in: 2026-10-14\nCheck out: 2026-10-15\nContact: Ann\nBooking confirmation\n",
  );
  const b = source("Grand Hotel\n");
  const interpretation = {
    v: 2,
    items: [
      {
        id: "i1",
        kind: "P3",
        subtype: "ACCOMMODATION",
        f: [
          [0, "property.name", "Grand Hotel"],
          [0, "check_in.date", "2026-10-14"],
          [0, "check_out.date", "2026-10-15"],
        ],
      },
    ],
    bookings: [],
    tickets: [],
    links: [],
    issues: [],
  };
  const output = {
    version: "otr-universal-advisory/1",
    interpretation,
    advisory: {
      classifications: [
        {
          evidence: span(a.bytes, "Booking confirmation", 0),
          labels: ["BOOKING_CONFIRMATION", "ITINERARY"],
        },
      ],
      supportingEvidence: [
        {
          kind: "ITEM",
          token: "i1",
          path: "property.name",
          evidence: span(b.bytes, "Grand Hotel", 1),
        },
      ],
      optionalFields: [
        {
          kind: "P3",
          token: "i1",
          path: "stay.contact",
          label: span(a.bytes, "Contact", 0),
          evidence: span(a.bytes, "Ann", 0),
        },
      ],
    },
  };
  const result = await run(
    { accountId: account, tripId: trip, batchId: batch, representations: [a, b] },
    output,
  );
  expect(result.status).toBe("CANDIDATES_READY");
  expect(result.advisoryStatus).toBe("VALID");
  expect(result.sourceObservations).toHaveLength(3);
  expect(result.sourceObservations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "SAME_FIELD_SUPPORT",
        evidence: expect.objectContaining({
          sourceId: b.sourceId,
          representationId: b.representationId,
        }),
      }),
      expect.objectContaining({
        type: "OPTIONAL_SOURCE_FIELD",
        path: "stay.contact",
        evidence: expect.objectContaining({
          sourceId: a.sourceId,
          representationId: a.representationId,
        }),
      }),
    ]),
  );
  expect(result.minimumFacts).toMatchObject([
    { minimumFacts: "EVIDENCED_CANDIDATE_FACTS", createReady: false },
  ]);
  expect(result.outputCoverage).toBe("PARTIAL_COVERAGE");
});
it("withholds false advisory spans without erasing independently valid compact interpretation", async () => {
  const a = source("Activity: Museum walk\n");
  const result = await run(
    { accountId: account, tripId: trip, batchId: batch, representations: [a] },
    {
      version: "otr-universal-advisory/1",
      interpretation: {
        v: 2,
        items: [
          {
            id: "i1",
            kind: "P1",
            subtype: "ACTIVITY",
            f: [[0, "activity.name", "Museum walk"]],
          },
        ],
        bookings: [],
        tickets: [],
        links: [],
        issues: [],
      },
      advisory: {
        classifications: [
          {
            evidence: { sourceIndex: 0, raw: "Ticket", start: 0, end: 6 },
            labels: ["TICKET"],
          },
        ],
        supportingEvidence: [],
        optionalFields: [],
      },
    },
  );
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    readiness: { minimumFacts: "INCOMPLETE", createReady: false },
    presentationTier: "INCOMPLETE",
  });
  expect(result.advisoryStatus).toBe("PARTIAL");
  expect(result.sourceObservations).toEqual([]);
});

it("retains evidenced P4 title/date as partial Source observation when frozen tier incorrectly requires supplier", async () => {
  const a = source("Title: Airport car\nPickup date: 2026-10-14\n");
  const result = await run(
    { accountId: account, tripId: trip, batchId: batch, representations: [a] },
    {
      v: 2,
      items: [
        {
          id: "i4",
          kind: "P4",
          subtype: "RENTAL_CAR",
          f: [
            [0, "title", "Airport car"],
            [0, "pickup.date", "2026-10-14"],
          ],
        },
      ],
      bookings: [],
      tickets: [],
      links: [],
      issues: [],
    },
  );
  expect(result.quality?.decisions[0].tier).toBe("ABSTAIN");
  expect(result.sourceObservations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "P4_WORKBENCH_TIER_MISMATCH", token: "i4" }),
    ]),
  );
  expect(result.minimumFacts[0]).toMatchObject({
    minimumFacts: "EVIDENCED_CANDIDATE_FACTS",
    createReady: false,
  });
  expect(result.candidates).toEqual([]);
});

it("rejects model-supplied canonical identities in advisory without erasing the independent item", async () => {
  const a = source("Activity: Museum walk\n");
  const result = await run(
    { accountId: account, tripId: trip, batchId: batch, representations: [a] },
    {
      version: "otr-universal-advisory/1",
      interpretation: {
        v: 2,
        items: [
          {
            id: "i1",
            kind: "P1",
            subtype: "ACTIVITY",
            f: [[0, "activity.name", "Museum walk"]],
          },
        ],
        bookings: [],
        tickets: [],
        links: [],
        issues: [],
      },
      advisory: {
        classifications: [],
        supportingEvidence: [],
        optionalFields: [],
        canonicalTicketId: "forged",
      },
    },
  );
  expect(result.candidates).toHaveLength(1);
  expect(result.advisoryStatus).toBe("INVALID");
  expect(result.sourceObservations).toEqual([]);
  expect(result.outputCoverage).toBe("PARTIAL_COVERAGE");
});

it.each([8, 64])(
  "binds advisory evidence on the last of %i source representations",
  async (count) => {
    const sources = Array.from({ length: count }, (_, i) =>
      source(`Document ${i + 1}: Invoice\n`),
    );
    const last = sources[count - 1];
    const result = await run(
      { accountId: account, tripId: trip, batchId: batch, representations: sources },
      {
        version: "otr-universal-advisory/1",
        interpretation: {
          v: 2,
          items: [],
          bookings: [],
          tickets: [],
          links: [],
          issues: [],
        },
        advisory: {
          classifications: [
            { evidence: span(last.bytes, "Invoice", count - 1), labels: ["INVOICE"] },
          ],
          supportingEvidence: [],
          optionalFields: [],
        },
      },
    );
    expect(result.advisoryStatus).toBe("VALID");
    expect(result.sourceBindings).toHaveLength(count);
    expect(result.sourceObservations).toEqual([
      expect.objectContaining({
        type: "DOCUMENT_CLASSIFICATION",
        evidence: expect.objectContaining({
          alias: `S${count - 1}`,
          sourceId: last.sourceId,
          representationId: last.representationId,
        }),
      }),
    ]);
  },
);

it("rejects an oversized 64-source request before task claim or Provider dispatch", async () => {
  const sources = Array.from({ length: 64 }, (_, i) =>
    source(`Document ${i}: ${"x".repeat(600)}\n`),
  );
  let claims = 0;
  let calls = 0;
  const port = createUniversalPort(
    {
      readManifest: async () => ({
        accountId: account,
        tripId: trip,
        batchId: batch,
        representations: sources,
      }),
      claimDispatch: async (marker) => {
        claims++;
        return { claimed: true, receipt: marker };
      },
      writeReceipt: async () => {},
      readReceipt: async () => null,
    },
    {
      mode: "LOCAL_FIXTURE",
      interpret: async () => {
        calls++;
        throw new Error("SHOULD_NOT_DISPATCH");
      },
    },
  );
  await expect(
    port.execute(actor, batch, {
      version: UNIVERSAL_IMPORT_VERSION,
      tripId: trip,
      taskId: randomUUID(),
    }),
  ).rejects.toThrow("UNIVERSAL_TEXT_BOUND");
  expect(claims).toBe(0);
  expect(calls).toBe(0);
});

it("accepts only the complete optional field role, never an unrelated name or type label", () => {
  const a = source(
    "Hotel name: Grand Hotel\nRoom type: Suite\nPassenger name: Alice\nTransport type: Shuttle\n",
  );
  const result = validateUniversalAdvisory(
    {
      classifications: [],
      supportingEvidence: [],
      optionalFields: [
        {
          kind: "P2",
          token: "i2",
          path: "passenger.name",
          label: span(a.bytes, "Hotel name", 0),
          evidence: span(a.bytes, "Grand Hotel", 0),
        },
        {
          kind: "P5",
          token: "i5",
          path: "transport.type",
          label: span(a.bytes, "Room type", 0),
          evidence: span(a.bytes, "Suite", 0),
        },
        {
          kind: "P2",
          token: "i2",
          path: "passenger.name",
          label: span(a.bytes, "Passenger name", 0),
          evidence: span(a.bytes, "Alice", 0),
        },
        {
          kind: "P5",
          token: "i5",
          path: "transport.type",
          label: span(a.bytes, "Transport type", 0),
          evidence: span(a.bytes, "Shuttle", 0),
        },
      ],
    },
    [
      {
        alias: "S0",
        inputId: a.inputId,
        sourceId: a.sourceId,
        representationId: a.representationId,
        revision: a.revision,
        originalSha256: a.originalSha256,
        submittedSha256: a.originalSha256,
        bytes: a.bytes,
        modality: "TEXT",
      },
    ],
    {
      objects: [
        { token: "i2", kind: "P2", fields: [] },
        { token: "i5", kind: "P5", fields: [] },
      ],
      bookings: [],
      tickets: [],
    },
  );
  expect(result.status).toBe("PARTIAL");
  expect(result.issues).toEqual([
    "OPTIONAL_FIELD_UNQUALIFIED",
    "OPTIONAL_FIELD_UNQUALIFIED",
  ]);
  expect(result.observations).toEqual([
    expect.objectContaining({
      path: "passenger.name",
      evidence: expect.objectContaining({ raw: "Alice" }),
    }),
    expect.objectContaining({
      path: "transport.type",
      evidence: expect.objectContaining({ raw: "Shuttle" }),
    }),
  ]);
});

it("rejects truncated field labels but accepts indented and semicolon-delimited full labels", () => {
  const a = source(
    "Not passenger name: Hotel Ltd\nRoom transport type: Suite\n  Passenger name: Alice; Transport type: Shuttle\n",
  );
  const result = validateUniversalAdvisory(
    {
      classifications: [],
      supportingEvidence: [],
      optionalFields: [
        {
          kind: "P2",
          token: "i2",
          path: "passenger.name",
          label: span(a.bytes, "passenger name", 0),
          evidence: span(a.bytes, "Hotel Ltd", 0),
        },
        {
          kind: "P5",
          token: "i5",
          path: "transport.type",
          label: span(a.bytes, "transport type", 0),
          evidence: span(a.bytes, "Suite", 0),
        },
        {
          kind: "P2",
          token: "i2",
          path: "passenger.name",
          label: span(a.bytes, "Passenger name", 0),
          evidence: span(a.bytes, "Alice", 0),
        },
        {
          kind: "P5",
          token: "i5",
          path: "transport.type",
          label: span(a.bytes, "Transport type", 0),
          evidence: span(a.bytes, "Shuttle", 0),
        },
      ],
    },
    [
      {
        alias: "S0",
        inputId: a.inputId,
        sourceId: a.sourceId,
        representationId: a.representationId,
        revision: a.revision,
        originalSha256: a.originalSha256,
        submittedSha256: a.originalSha256,
        bytes: a.bytes,
        modality: "TEXT",
      },
    ],
    {
      objects: [
        { token: "i2", kind: "P2", fields: [] },
        { token: "i5", kind: "P5", fields: [] },
      ],
      bookings: [],
      tickets: [],
    },
  );
  expect(result.status).toBe("PARTIAL");
  expect(result.issues).toEqual([
    "OPTIONAL_FIELD_UNQUALIFIED",
    "OPTIONAL_FIELD_UNQUALIFIED",
  ]);
  expect(result.observations).toEqual([
    expect.objectContaining({
      path: "passenger.name",
      evidence: expect.objectContaining({ raw: "Alice" }),
    }),
    expect.objectContaining({
      path: "transport.type",
      evidence: expect.objectContaining({ raw: "Shuttle" }),
    }),
  ]);
});

it("bounds the exact transmitted system and user text at 32768 UTF-8 bytes", () => {
  const request = (length: number) => {
    const bytes = Buffer.alloc(length, 120);
    return buildUniversalDeepSeekRequest({
      taskId: randomUUID(),
      actorId: actor,
      accountId: account,
      tripId: trip,
      batchId: batch,
      promptVersion: COMPACT_PROMPT_VERSION,
      instruction: universalInstruction,
      advisoryInstruction: universalAdvisoryInstruction,
      sources: [
        {
          index: 0,
          sourceId: "S0",
          mime: "text/plain",
          modality: "TEXT",
          sha256: createHash("sha256").update(bytes).digest("hex"),
          bytes,
        },
      ],
    });
  };
  const base = request(0).textBytes;
  const accepted = request(32768 - base);
  const messages = JSON.parse(accepted.body).messages as [
    { content: string },
    { content: { type: string; text?: string }[] },
  ];
  const actual =
    Buffer.byteLength(messages[0].content) +
    messages[1].content
      .filter((part) => part.type === "text")
      .reduce((sum, part) => sum + Buffer.byteLength(part.text ?? ""), 0);
  expect(accepted.textBytes).toBe(32768);
  expect(actual).toBe(32768);
  expect(() => request(32769 - base)).toThrow("UNIVERSAL_TEXT_BOUND");
});
