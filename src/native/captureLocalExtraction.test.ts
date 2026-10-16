import { expect, it, vi } from "vitest";
import { createCaptureLocalExtractor } from "./captureLocalExtraction";
vi.mock("expo", () => ({ requireNativeModule: vi.fn() }));
vi.mock("expo-crypto", () => ({
  digest: vi.fn(),
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
const sha = "a".repeat(64);
const image = () => ({
  engine: "apple-vision",
  text: "NZ5069",
  originalSha256: sha,
  originalByteCount: 3,
  observations: [
    { text: "NZ5069", confidence: 0.9, boundingBox: { x: 0, y: 0, width: 1, height: 1 } },
  ],
});
function fixture(raw: unknown = image()) {
  const extractCaptureLocal = vi.fn(async (bytes: Uint8Array) => {
    bytes[0] = 9;
    return raw;
  });
  const captureLocalModelCapability = vi.fn(async () => ({
    status: "UNAVAILABLE",
    reason: "DEVICE_NOT_ELIGIBLE",
  }));
  return {
    bridge: { extractCaptureLocal, captureLocalModelCapability },
    hash: vi.fn(async () => sha),
  };
}
it("extracts owned bytes with verified provenance and does not mutate retained bytes", async () => {
  const deps = fixture(),
    bytes = new Uint8Array([1, 2, 3]);
  const result = await createCaptureLocalExtractor(deps).extract(bytes, "image/jpeg");
  expect(result).toEqual(image());
  expect(bytes[0]).toBe(1);
  expect(await createCaptureLocalExtractor(deps).modelCapability()).toEqual({
    status: "UNAVAILABLE",
    reason: "DEVICE_NOT_ELIGIBLE",
  });
});
it("rejects original mismatch, forged OCR text and invalid geometry", async () => {
  for (const raw of [
    { ...image(), originalSha256: "b".repeat(64) },
    { ...image(), text: "NZ9999" },
    {
      ...image(),
      observations: [
        {
          ...image().observations[0],
          boundingBox: { x: 0.9, y: 0, width: 1, height: 1 },
        },
      ],
    },
  ])
    await expect(
      createCaptureLocalExtractor(fixture(raw)).extract(
        new Uint8Array([1, 2, 3]),
        "image/png",
      ),
    ).rejects.toThrow();
});
it("uses the existing PDF evidence validator", async () => {
  const raw = {
    engine: "apple-pdfkit",
    version: 1,
    originalSha256: sha,
    originalByteCount: 3,
    text: "Flight NZ5069",
    pages: [{ pageIndex: 0, start: 0, end: 13 }],
  };
  expect(
    (
      await createCaptureLocalExtractor(fixture(raw)).extract(
        new Uint8Array([1, 2, 3]),
        "application/pdf",
      )
    ).pages,
  ).toEqual(raw.pages);
  await expect(
    createCaptureLocalExtractor(
      fixture({ ...raw, pages: [{ pageIndex: 0, start: 0, end: 14 }] }),
    ).extract(new Uint8Array([1, 2, 3]), "application/pdf"),
  ).rejects.toThrow("PDF_PAGE_MAPPING_INVALID");
});
it("bounds inputs and degrades unavailable native/model capabilities without remote calls", async () => {
  const deps = fixture(),
    extract = createCaptureLocalExtractor(deps);
  await expect(extract.extract(new Uint8Array(), "image/jpeg")).rejects.toThrow(
    "CAPTURE_EXTRACTION_LIMIT",
  );
  await expect(extract.extract(new Uint8Array([1]), "audio/wav")).rejects.toThrow(
    "CAPTURE_EXTRACTION_MEDIA_UNSUPPORTED",
  );
  expect(deps.bridge.extractCaptureLocal).not.toHaveBeenCalled();
  const old = createCaptureLocalExtractor({ ...deps, bridge: {} as never });
  await expect(old.extract(new Uint8Array([1]), "image/jpeg")).rejects.toThrow(
    "CAPTURE_LOCAL_CAPABILITY_UNAVAILABLE",
  );
  expect((await old.modelCapability()).status).toBe("UNAVAILABLE");
  expect(
    (
      await createCaptureLocalExtractor({
        ...deps,
        platform: "android",
      }).modelCapability()
    ).status,
  ).toBe("UNAVAILABLE");
});
it("retains only uniquely anchored valid flight-number hints and rejects hallucinated evidence", async () => {
  const deps = fixture();
  const bridge = {
    ...deps.bridge,
    enrichCaptureFlightLocal: vi.fn(async () => ({
      json: '{"flightNumbers":["NZ5069"]}',
    })),
  };
  const extractor = createCaptureLocalExtractor({ ...deps, bridge });
  expect((await extractor.enrich("旅程 NZ5069 tomorrow")).observations).toEqual([
    { literal: "NZ5069", start: 7, end: 13 },
  ]);
  expect((await extractor.enrich("NZ5069 and NZ5069")).status).toBe("FAILED");
  expect((await extractor.enrich("NZ9999")).observations).toEqual([]);
});
it("bounds optional model latency without losing caller local results", async () => {
  vi.useFakeTimers();
  try {
    const deps = fixture();
    const pending = createCaptureLocalExtractor({
      ...deps,
      bridge: { ...deps.bridge, enrichCaptureFlightLocal: () => new Promise(() => {}) },
    }).enrich("NZ5069");
    await vi.advanceTimersByTimeAsync(20001);
    expect(await pending).toMatchObject({
      status: "FAILED",
      reason: "LOCAL_MODEL_TIMEOUT",
    });
  } finally {
    vi.useRealTimers();
  }
});

it("keeps native failure diagnostics finite without returning provider text", async () => {
  const deps = fixture();
  const bridge = {
    ...deps.bridge,
    enrichCaptureFlightLocal: async () => ({ error: "LOCAL_MODEL_FAILED" }),
  };
  expect(
    (await createCaptureLocalExtractor({ ...deps, bridge }).enrich("NZ5069")).reason,
  ).toBe("LOCAL_MODEL_FAILED");
  const invalid = {
    ...bridge,
    enrichCaptureFlightLocal: async () => ({ error: "private diagnostic" }),
  };
  expect(
    (await createCaptureLocalExtractor({ ...deps, bridge: invalid }).enrich("NZ5069"))
      .reason,
  ).toBe("LOCAL_MODEL_OUTPUT_INVALID");
});

it("decodes exact UTF8 text without requiring a native bridge", async () => {
  const deps = fixture();
  const extractor = createCaptureLocalExtractor({ ...deps, platform: "android" });
  const text = "\ufeff旅程\nFlight: NZ 5069";
  const bytes = new TextEncoder().encode(text);
  expect(await extractor.extract(bytes, "text/plain")).toEqual({
    engine: "utf8-text",
    text,
    originalSha256: sha,
    originalByteCount: bytes.length,
  });
  expect(deps.bridge.extractCaptureLocal).not.toHaveBeenCalled();
  for (const invalid of [
    new Uint8Array([255]),
    new TextEncoder().encode("Flight\0NZ1"),
    new Uint8Array(262145),
  ])
    await expect(extractor.extract(invalid, "text/plain")).rejects.toThrow();
});

it.each([
  ["AB 123", "AB123", "LITERAL_NOT_FOUND"],
  ["AB123 / AB123", "AB123", "MULTIPLE_LITERAL_MATCHES"],
  ["not a flight", "not a flight", "INVALID_SERVICE_LITERAL"],
])(
  "records a bounded evidence rejection reason without returning raw model text",
  async (text, literal, evidenceFailure) => {
    const deps = fixture();
    const extractor = createCaptureLocalExtractor({
      ...deps,
      bridge: {
        ...deps.bridge,
        enrichCaptureFlightLocal: async () => ({
          json: JSON.stringify({ flightNumbers: [literal] }),
        }),
      },
    });
    expect(await extractor.enrich(text)).toEqual({
      status: "FAILED",
      reason: "LOCAL_MODEL_EVIDENCE_INVALID",
      observations: [],
      evidenceFailure,
    });
  },
);

it("keeps semantic generation, transport and unavailable capability distinct", async () => {
  const base = fixture();
  const propose = vi.fn(
    async (_: string, requestId: string) =>
      ({ requestId, error: "LOCAL_MODEL_GENERATION_ERROR" }) as Record<string, unknown>,
  );
  const cancel = vi.fn(async () => undefined);
  const extractor = createCaptureLocalExtractor({
    hash: base.hash,
    bridge: {
      ...base.bridge,
      proposeCaptureFlightAssemblyLocal: propose,
      cancelCaptureFlightAssemblyLocal: cancel,
    },
  });
  expect(await extractor.proposeAssembly("{}")).toEqual({
    status: "FAILED",
    reason: "LOCAL_MODEL_GENERATION_ERROR",
  });
  propose.mockImplementation(async (_, requestId) => ({ requestId, json: "not-json" }));
  expect(await extractor.proposeAssembly("{}")).toEqual({
    status: "FAILED",
    reason: "LOCAL_MODEL_TRANSPORT_PARSE",
  });
  propose.mockImplementation(async (_, requestId) => ({
    requestId,
    json: '{"segments":[]}',
  }));
  expect(await extractor.proposeAssembly("{}")).toEqual({
    status: "SUCCEEDED",
    reason: "ASSEMBLY_PROPOSAL_REQUIRES_VALIDATION",
    proposal: { segments: [] },
  });
  propose.mockImplementation(async () => ({
    requestId: "older-run",
    json: '{"segments":[]}',
  }));
  expect(await extractor.proposeAssembly("{}")).toEqual({
    status: "FAILED",
    reason: "LOCAL_MODEL_TRANSPORT_PARSE",
  });
  const oldBinary = createCaptureLocalExtractor({
    hash: base.hash,
    bridge: { ...base.bridge, proposeCaptureFlightAssemblyLocal: propose },
  });
  expect(await oldBinary.proposeAssembly("{}")).toEqual({
    status: "UNAVAILABLE",
    reason: "CAPABILITY_NOT_INSTALLED",
  });
});

it("propagates timeout to the exact Native request and ignores its late output", async () => {
  vi.useFakeTimers();
  try {
    const base = fixture();
    let late: (v: unknown) => void = () => undefined;
    const propose = vi.fn(
      (_json: string, requestId: string): Promise<unknown> =>
        new Promise((resolve) => {
          late = resolve;
        }),
    );
    const cancel = vi.fn(async (_id: string) => undefined);
    const extractor = createCaptureLocalExtractor({
      hash: base.hash,
      bridge: {
        ...base.bridge,
        proposeCaptureFlightAssemblyLocal: propose,
        cancelCaptureFlightAssemblyLocal: cancel,
      },
    });
    const first = extractor.proposeAssembly("{}");
    const firstId = propose.mock.calls[0][1];
    await vi.advanceTimersByTimeAsync(20000);
    expect(await first).toEqual({ status: "FAILED", reason: "LOCAL_MODEL_APP_TIMEOUT" });
    expect(cancel).toHaveBeenCalledExactlyOnceWith(firstId, expect.any(Number));
    propose.mockImplementation(async (_json, id) => ({
      requestId: id,
      json: '{"segments":[]}',
    }));
    const second = await extractor.proposeAssembly("{}");
    expect(propose.mock.calls[1][1]).not.toBe(firstId);
    late({ requestId: firstId, json: '{"invented":true}' });
    await Promise.resolve();
    expect(second.status).toBe("SUCCEEDED");
    expect(cancel).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("cancels an aborted input without cancelling the next input", async () => {
  const base = fixture();
  const controller = new AbortController();
  const propose = vi.fn(
    (_json: string, _id: string): Promise<unknown> => new Promise(() => undefined),
  );
  const cancel = vi.fn(async (_id: string) => undefined);
  const extractor = createCaptureLocalExtractor({
    hash: base.hash,
    bridge: {
      ...base.bridge,
      proposeCaptureFlightAssemblyLocal: propose,
      cancelCaptureFlightAssemblyLocal: cancel,
    },
  });
  const result = extractor.proposeAssembly("{}", { signal: controller.signal });
  const id = propose.mock.calls[0][1];
  controller.abort();
  expect(await result).toEqual({ status: "FAILED", reason: "LOCAL_MODEL_CANCELLED" });
  expect(cancel).toHaveBeenCalledExactlyOnceWith(id, expect.any(Number));
  expect(await extractor.proposeAssembly("{}", { signal: controller.signal })).toEqual({
    status: "FAILED",
    reason: "LOCAL_MODEL_CANCELLED",
  });
  expect(propose).toHaveBeenCalledTimes(1);
});

it.each([
  "LOCAL_MODEL_NATIVE_TIMEOUT",
  "LOCAL_MODEL_APP_TIMEOUT",
  "LOCAL_MODEL_CANCELLED",
  "LOCAL_MODEL_GENERATION_DECODE",
])(
  "preserves Native finite error %s without collapsing transport and generation failures",
  async (reason) => {
    const base = fixture();
    const extractor = createCaptureLocalExtractor({
      hash: base.hash,
      bridge: {
        ...base.bridge,
        proposeCaptureFlightAssemblyLocal: async (_json, requestId) => ({
          requestId,
          error: reason,
        }),
        cancelCaptureFlightAssemblyLocal: async () => undefined,
      },
    });
    expect(await extractor.proposeAssembly("{}")).toEqual({ status: "FAILED", reason });
  },
);
