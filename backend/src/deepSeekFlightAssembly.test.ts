import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  buildDeepSeekFlightAssemblyBody,
  parseDeepSeekFlightAssemblyResponse,
} from "./deepSeekFlight";
import { flightModelWitness } from "./flightHostProtocol";
import { parseReferenceFlightText } from "../../src/domain/trip/referenceFlightExtractor";
import { assembleFlightDocuments } from "../../src/domain/trip/flightAssembly";
import { buildFlightAssemblyRequest } from "../../src/domain/trip/flightSemanticAssembly";
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const text = "AB123 route=AKL -> NSN date=2030-12-14";
  const documents = [
    { inputId: "one", text, parsed: parseReferenceFlightText("one", text) },
  ];
  const request = buildFlightAssemblyRequest(
    documents,
    assembleFlightDocuments(documents),
  );
  const fs = request.partB.fields;
  const proposal = {
    bookingGroups: [],
    segments: [
      {
        id: "s0",
        observationIds: ["o0"],
        fieldIds: fs.map((f) => f.id),
        evidenceIds: [...new Set(fs.flatMap((f) => f.evidenceIds))],
        bookingGroupId: "",
        basis: "Observed only",
      },
    ],
    unresolved: [],
    conflicts: [],
  };
  return { request, proposal };
}
function response(output: unknown, options: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      model: "deepseek-flash",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
      ...options,
    }),
  );
}
it("builds the existing contract and real image as separate data, with reproducible pins", () => {
  const { request } = fixture();
  const text = buildDeepSeekFlightAssemblyBody(request);
  expect(text.sha256).toBe(hash(text.body));
  expect(text.mode).toBe("TEXT");
  expect(text.body).toContain(request.partA.version);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const vision = buildDeepSeekFlightAssemblyBody(request, {
    bytes,
    mediaType: "image/jpeg",
    sha256: hash(bytes),
  });
  expect(JSON.parse(vision.body).messages[1].content[1].image_url.url).toBe(
    `data:image/jpeg;base64,${bytes.toString("base64")}`,
  );
  expect(vision.imageTokens).toBe("UNKNOWN");
  expect(vision.textTokenUpperBound).toBeLessThan(vision.body.length + 256);
});
it("rejects mismatched or oversized image before any dispatch", () => {
  const { request } = fixture();
  for (const bytes of [Buffer.from("x"), Buffer.alloc(4194305)]) {
    expect(() =>
      buildDeepSeekFlightAssemblyBody(request, {
        bytes,
        mediaType: "image/jpeg",
        sha256: "0".repeat(64),
      }),
    ).toThrow("EVIDENCE_INVALID");
  }
});
it("rejects modified business contract", () => {
  const { request } = fixture();
  request.partA = { ...request.partA, rules: [] } as never;
  expect(() => buildDeepSeekFlightAssemblyBody(request)).toThrow("POLICY_BLOCKED");
});
it("separates schema-valid provider output from business acceptance, with actual usage", () => {
  const { request, proposal } = fixture();
  const r = parseDeepSeekFlightAssemblyResponse(
    request,
    response(proposal),
    200,
    15,
    flightModelWitness,
  );
  expect(r.status).toBe("SUCCEEDED");
  expect(r.usage.total_tokens).toBe(130);
  if (r.status === "SUCCEEDED") {
    expect(r.output).toMatchObject({
      validation: { status: "ACCEPTED", grantsAdmission: false },
      grantsAdmission: false,
      modelExplanations: "UNVERIFIED_ADVISORY",
    });
  }
  proposal.segments[0].fieldIds.push("invented");
  const rejected = parseDeepSeekFlightAssemblyResponse(
    request,
    response(proposal),
    200,
    20,
    flightModelWitness,
  );
  expect(rejected).toMatchObject({
    status: "SUCCEEDED",
    output: { validation: { status: "REJECTED", reasonCodes: ["UNKNOWN_FIELD_ID"] } },
  });
});
it.each([401, 402, 429, 500])(
  "retains HTTP error classification %s without treating prose as proposal",
  (status) => {
    const { request } = fixture();
    expect(
      parseDeepSeekFlightAssemblyResponse(
        request,
        response("prose"),
        status,
        1,
        flightModelWitness,
      ).status,
    ).toBe("FAILED");
  },
);
it("rejects natural prose, unknown model and invalid JSON independently", () => {
  const { request, proposal } = fixture();
  expect(
    parseDeepSeekFlightAssemblyResponse(
      request,
      response("prose"),
      200,
      1,
      flightModelWitness,
    ),
  ).toMatchObject({ status: "FAILED", error: "SEMANTIC_INVALID" });
  expect(
    parseDeepSeekFlightAssemblyResponse(
      request,
      response(proposal, { model: "other" }),
      200,
      1,
      flightModelWitness,
    ),
  ).toMatchObject({ status: "FAILED", error: "POLICY_BLOCKED" });
  expect(
    parseDeepSeekFlightAssemblyResponse(
      request,
      Buffer.from("{"),
      200,
      1,
      flightModelWitness,
    ),
  ).toMatchObject({ status: "FAILED", error: "MALFORMED_OUTPUT" });
});

it("accepts actual Capture with null formal Source but rejects fabricated Source in dispatch", async () => {
  const { prepareDeepSeekFlightAssembly } = await import("./deepSeekFlight");
  const { remoteFixture } = await import("./__fixtures__/flightRemote");
  const { randomUUID } = await import("node:crypto");
  const f = await remoteFixture();
  const { request, proposal } = fixture();
  const identity = {
    accountId: f.host.verified_account_id,
    batchId: randomUUID(),
    jobId: randomUUID(),
    inputId: randomUUID(),
    sourceId: null,
    originalSha256: "a".repeat(64),
  };
  request.sourceIds.i0 = identity.inputId;
  const events: string[] = [];
  let sends = 0;
  const prepared = await prepareDeepSeekFlightAssembly({
    environment: "DEV",
    modelWitness: flightModelWitness,
    identity,
    request,
    host: f.host,
    resolver: {
      resolve: async () => ({ value: "UNIT_FAKE_KEY", assertCurrent: async () => {} }),
    },
    send: async (sent) => {
      sends++;
      expect(sent.url).toBe("https://api.deepseek.com/chat/completions");
      return {
        status: 200,
        redirected: false,
        body: (async function* () {
          yield response(proposal);
        })(),
      };
    },
    assertCurrent: async () => {
      events.push("authority");
    },
    assertDispatched: async () => {},
    retainResponse: async (record) => {
      expect(record.identity.jobId).toBe(identity.jobId);
      expect(record.requestSha256).toHaveLength(64);
      events.push("retained");
    },
    monotonic: () => 1,
    deadline: 1000,
    signal: new AbortController().signal,
  });
  const ack = {
    ...identity,
    callId: randomUUID(),
    requestSha256: prepared.prepared.sha256,
    dispatchState: "MAY_HAVE_STARTED",
    executionCertainty: "RUNNING",
    rowRevision: 2,
  };
  await expect(prepared.execute({ ...ack, jobId: randomUUID() })).rejects.toThrow(
    "POLICY_BLOCKED",
  );
  await expect(prepared.execute({ ...ack, sourceId: randomUUID() })).rejects.toThrow(
    "POLICY_BLOCKED",
  );
  expect(sends).toBe(0);
  expect((await prepared.execute(ack)).status).toBe("SUCCEEDED");
  expect(events).toContain("retained");
  await expect(prepared.execute(ack)).rejects.toThrow("POLICY_BLOCKED");
  expect(sends).toBe(1);
});

it("times out a noncooperative transport and isolates its late response", async () => {
  const { prepareDeepSeekFlightAssembly } = await import("./deepSeekFlight");
  const { remoteFixture } = await import("./__fixtures__/flightRemote");
  const { randomUUID } = await import("node:crypto");
  const f = await remoteFixture();
  const { request, proposal } = fixture();
  const identity = {
    accountId: f.host.verified_account_id,
    batchId: randomUUID(),
    jobId: randomUUID(),
    inputId: randomUUID(),
    sourceId: randomUUID(),
    originalSha256: "a".repeat(64),
  };
  request.sourceIds.i0 = identity.inputId;
  let release!: (v: {
    status: number;
    redirected: boolean;
    body: AsyncIterable<Uint8Array>;
  }) => void;
  let retained = 0;
  const adapter = await prepareDeepSeekFlightAssembly({
    environment: "DEV",
    identity,
    request,
    host: f.host,
    modelWitness: flightModelWitness,
    resolver: {
      resolve: async () => ({ value: "UNIT_FAKE_KEY", assertCurrent: async () => {} }),
    },
    send: async () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    assertCurrent: async () => {},
    assertDispatched: async () => {},
    retainResponse: async () => {
      retained++;
    },
    monotonic: () => performance.now(),
    deadline: performance.now() + 35,
    signal: new AbortController().signal,
  });
  const result = await adapter.execute({
    ...identity,
    callId: randomUUID(),
    requestSha256: adapter.prepared.sha256,
    dispatchState: "MAY_HAVE_STARTED",
    executionCertainty: "RUNNING",
    rowRevision: 2,
  });
  expect(result).toMatchObject({ status: "UNKNOWN", error: "TIMEOUT" });
  release({
    status: 200,
    redirected: false,
    body: (async function* () {
      yield response(proposal);
    })(),
  });
  await new Promise((resolve) => setTimeout(resolve, 1));
  expect(retained).toBe(0);
});
