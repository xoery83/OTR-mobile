import { request as httpRequest } from "node:http";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createCaptureLocalExtractorCore,
  validateCaptureLocalModelResponse,
} from "../../src/native/captureLocalExtractionCore";
import { runImportDiagnostic } from "../../src/native/importWorkbenchRun";
import { hash, sourceVersion } from "./mac";
import { runSequentialInputs } from "./batch";
import {
  PrivateStore,
  statistics,
  compare,
  escapeHtml,
  labelSchema,
  previewPage,
} from "./store";
import { createWorkbench, ORIGIN } from "./server";
const root = realpathSync(mkdtempSync(join(tmpdir(), "otr-wb-test-")));
const store = new PrivateStore(root);
const app = createWorkbench(store);
let testOrigin = "";
const testFetch = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
) =>
  new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    bytes: () => Buffer;
    json: () => Promise<unknown>;
  }>((resolve, reject) => {
    const req = httpRequest(
      url.replace(ORIGIN, testOrigin),
      {
        method: init.method ?? "GET",
        headers: { Host: "127.0.0.1:49184", ...init.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (data) => chunks.push(data));
        res.on("end", () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            bytes: () => Buffer.concat(chunks),
            json: async () => JSON.parse(Buffer.concat(chunks).toString()),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(0, "127.0.0.1", resolve);
  });
  testOrigin = "http://127.0.0.1:" + (app.server.address() as { port: number }).port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => app.server.close(() => resolve()));
  rmSync(root, { recursive: true });
});
it("keeps exact-byte input pins, private permissions and refuses traversal/symlinks", () => {
  const input = store.add(Buffer.from("NZ5069"), "text/plain", "<script>file</script>");
  expect(store.bytes(input).toString()).toBe("NZ5069");
  expect(statSync(root).mode & 0o777).toBe(0o700);
  expect(statSync(store.path(`${input.id}.bytes`)).mode & 0o777).toBe(0o600);
  expect(() => store.path("../../secret.json")).toThrow();
  symlinkSync("/etc/hosts", join(root, "bad.json"));
  expect(() => store.path("bad.json")).toThrow();
});
it("shares production evidence validation and fallback, and does not treat hypotheses as ground truth", async () => {
  const bytes = new TextEncoder().encode("Flight NZ5069 booked to fly on 2026-11-01");
  const extractor = createCaptureLocalExtractorCore({
    hash,
    getBridge: () => ({
      extractCaptureLocal: async () => ({}),
      captureLocalModelCapability: async () => ({
        status: "UNAVAILABLE",
        reason: "DEVICE_NOT_ELIGIBLE",
      }),
    }),
  });
  const job = {
    runId: randomUUID(),
    inputId: randomUUID(),
    mediaType: "text/plain",
    byteCount: bytes.length,
    sha256: await hash(bytes),
    hostSourceManifest: { parser: "a".repeat(64) },
  };
  const a = await runImportDiagnostic(job, bytes, extractor, hash, "MAC_COMPONENT");
  const b = await runImportDiagnostic(
    { ...job, runId: randomUUID() },
    bytes,
    extractor,
    hash,
    "MAC_COMPONENT",
  );
  expect(compare(a, b).sameFieldEvidence).toBe(true);
  expect(a.result.sourceAuthority).toBe("NONE");
  expect(a.executedVersion).toEqual({ native: "UNVERIFIED", javascript: "UNVERIFIED" });
  expect(compare(a, b).sameHostSourceManifest).toBe(true);
  expect(a.remoteCost).toBe(0);
  expect(statistics(a).status).toBe("N/A");
  expect(statistics(a, { kind: "HYPOTHESIS", fields: [] }).status).toBe("N/A");
  expect(
    statistics(a, {
      kind: "HUMAN_GROUND_TRUTH",
      fields: a.result.fields.map((f) => ({ path: f.path, raw: f.raw })),
    }),
  ).toMatchObject({ precision: 1, recall: 1 });
  expect(() => compare(a, { ...b, job: { ...b.job, sha256: "b".repeat(64) } })).toThrow(
    "COMPARE_REQUIRES_SAME_BYTES",
  );
  expect(() =>
    validateCaptureLocalModelResponse("NZ 5069", {
      json: '{"flightNumbers":["NZ5069"]}',
    }),
  ).toThrow("LOCAL_MODEL_EVIDENCE_INVALID");
  expect(
    validateCaptureLocalModelResponse("NZ5069", { json: '{"flightNumbers":["NZ5069"]}' })
      .observations[0],
  ).toEqual({ literal: "NZ5069", start: 0, end: 6 });
  await expect(
    runImportDiagnostic(
      { ...job, sha256: "c".repeat(64) },
      bytes,
      extractor,
      hash,
      "MAC_COMPONENT",
    ),
  ).rejects.toThrow("INPUT_PIN_MISMATCH");
});
it("rejects cross-origin writes, foreign Host, unarmed Native and unsupported media", async () => {
  expect(
    (await testFetch(ORIGIN + "/api/state", { headers: { Host: "evil.test:49184" } }))
      .status,
  ).toBe(400);
  expect(
    (
      await testFetch(ORIGIN + "/api/import-trace", {
        method: "POST",
        headers: { Origin: "http://evil.test", "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await testFetch(ORIGIN + "/api/import-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(400);
  expect((await testFetch(ORIGIN + "/native/job")).status).toBe(400);
  expect(
    (
      await testFetch(ORIGIN + "/api/input?media=text/html&name=x", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/octet-stream" },
        body: "x",
      })
    ).status,
  ).toBe(400);
  expect(escapeHtml('</pre><script>alert("x")</script>')).not.toContain("<script>");
  const imported = await testFetch(ORIGIN + "/api/import-trace", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: '{"raw":"</pre><script>x</script>"}',
  });
  expect(await imported.json()).toMatchObject({
    status: "IMPORTED_UNVERIFIED_VIEW_ONLY",
  });
});
it("accepts only the pending pinned diagnostic job and revalidates posted Native evidence", async () => {
  const input = store.add(Buffer.from("Flight NZ5069"), "text/plain", "unit-test.txt");
  // Test-only transport setup, not an installed App or Native Runtime claim.
  app.armNative(Date.now() + 60_000);
  await testFetch(ORIGIN + "/native/job", {
    headers: { "X-OTR-Diagnostic": app.nativeToken },
  });
  const queuedResponse = await testFetch(ORIGIN + "/api/run", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ inputId: input.id, runtime: "IOS_DIAGNOSTIC_COMPONENT" }),
  });
  expect(queuedResponse.status).toBe(202);
  const nativeResponse = await testFetch(ORIGIN + "/native/job", {
    headers: { "X-OTR-Diagnostic": app.nativeToken },
  });
  const claimed = (await nativeResponse.json()) as {
    job: Parameters<typeof runImportDiagnostic>[0];
    bytesBase64: string;
  };
  expect(claimed.job.sha256).toBe(input.sha256);
  expect(
    await (
      await testFetch(ORIGIN + "/native/job", {
        headers: { "X-OTR-Diagnostic": app.nativeToken },
      })
    ).json(),
  ).toBe(null);
  const extractor = createCaptureLocalExtractorCore({
    hash,
    getBridge: () => ({
      extractCaptureLocal: async () => ({}),
      captureLocalModelCapability: async () => ({
        status: "AVAILABLE",
        reason: "SYSTEM_MODEL_AVAILABLE",
      }),
      enrichCaptureFlightLocal: async () => ({ json: '{"flightNumbers":["NZ5069"]}' }),
    }),
  });
  const trace = await runImportDiagnostic(
    claimed.job,
    Buffer.from(claimed.bytesBase64, "base64"),
    extractor,
    hash,
    "IOS_DIAGNOSTIC_COMPONENT",
  );
  const sendTrace = (value: unknown) =>
    testFetch(ORIGIN + "/native/trace", {
      method: "POST",
      headers: {
        "X-OTR-Diagnostic": app.nativeToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
  expect((await sendTrace({ ...trace, textSha256: "f".repeat(64) })).status).toBe(400);
  expect(
    (
      await sendTrace({
        ...trace,
        model: {
          status: "SUCCEEDED",
          reason: "VERBATIM_SERVICE_EVIDENCE_ONLY",
          observations: [{ literal: "NZ9999", start: 7, end: 13 }],
        },
      })
    ).status,
  ).toBe(400);
  // A model call can outlast heartbeat freshness. Its authenticated completion
  // must refresh readiness before a serial batch submits the next input.
  vi.setSystemTime(Date.now() + 6000);
  try {
    expect((await sendTrace(trace)).status).toBe(200);
    const state = (await (await testFetch(ORIGIN + "/api/state")).json()) as {
      native: { ready: boolean };
    };
    expect(state.native.ready).toBe(true);
  } finally {
    vi.useRealTimers();
  }
  expect((await sendTrace(trace)).status).toBe(400);
  const labelsUrl = ORIGIN + "/api/run/" + claimed.job.runId + "/labels";
  expect(await (await testFetch(labelsUrl)).json()).toBe(null);
  const labels = {
    kind: "HUMAN_GROUND_TRUTH",
    fields: [{ path: "service", raw: "NZ5069" }],
  };
  expect(
    (
      await testFetch(labelsUrl, {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify(labels),
      })
    ).status,
  ).toBe(200);
  expect(await (await testFetch(labelsUrl)).json()).toEqual(labels);
});

it("pins the actual core runtime closure and lock; dependency-only changes change the manifest", () => {
  const before = sourceVersion();
  for (const file of [
    "src/domain/intelligence/interpretation.ts",
    "src/domain/trip/flightAdmission.ts",
    "src/domain/trip/flightImportReview.ts",
    "src/domain/trip/eventIntentJson.ts",
    "package-lock.json",
  ])
    expect(before[file], file).toMatch(/^[a-f0-9]{64}$/);
  const dependency = "src/domain/trip/flightAdmission.ts";
  const after = sourceVersion((path) =>
    path === dependency
      ? Buffer.concat([readFileSync(path), Buffer.from("\n// contract change")])
      : readFileSync(path),
  );
  expect(after[dependency]).not.toBe(before[dependency]);
  expect(Object.keys(after).filter((p) => after[p] !== before[p])).toEqual([dependency]);
  const changedLock = sourceVersion((path) =>
    path === "package-lock.json"
      ? Buffer.concat([readFileSync(path), Buffer.from("\n")])
      : readFileSync(path),
  );
  expect(changedLock["package-lock.json"]).not.toBe(before["package-lock.json"]);
});
it("runs one multi-input click serially and continues after a terminal input failure", async () => {
  const calls: string[] = [];
  let poll = 0;
  const result = await runSequentialInputs(
    ["a", "b"],
    "MAC_COMPONENT",
    async (path, value) => {
      if (value) {
        const id = (value as { inputId: string }).inputId;
        calls.push("queue " + id);
        return { id, stage: "QUEUED" };
      }
      calls.push(path);
      return {
        id: path.endsWith("a") ? "a" : "b",
        stage: path.endsWith("a")
          ? ++poll === 1
            ? "APPLE_MODEL"
            : "FAILED"
          : "FINISHED",
      };
    },
    () => undefined,
    async () => undefined,
  );
  expect(calls).toEqual(["queue a", "/api/run/a", "/api/run/a", "queue b", "/api/run/b"]);
  expect(result.map((r) => r.stage)).toEqual(["FAILED", "FINISHED"]);
});
it("does not launch another input after unresolved transport failure", async () => {
  let queued = 0;
  const result = await runSequentialInputs(
    ["a", "b"],
    "MAC_COMPONENT",
    async (_path, value) => {
      if (value) {
        queued++;
        return { id: "a", stage: "QUEUED" };
      }
      throw new Error("transport stopped");
    },
    () => undefined,
  );
  expect(queued).toBe(1);
  expect(result[0].stage).toBe("BATCH_STOPPED_UNRESOLVED");
});

it("serves only pinned originals by UUID with safe inline MIME and same-origin framing", async () => {
  const input = store.add(Buffer.from("original bytes"), "text/plain", "../../evil.html");
  const response = await testFetch(ORIGIN + "/api/input/" + input.id + "/original");
  expect(response.status).toBe(200);
  expect(response.bytes()).toEqual(store.bytes(input));
  expect(response.headers["content-type"]).toBe("text/plain");
  expect(response.headers["content-disposition"]).toBe(
    `inline; filename="${input.id}.txt"`,
  );
  expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(
    (
      await testFetch(ORIGIN + "/api/input/" + input.id + "/original", {
        headers: { Origin: "http://evil.test" },
      })
    ).status,
  ).toBe(400);
  expect((await testFetch(ORIGIN + "/api/input/not-a-uuid/original")).status).not.toBe(
    200,
  );
});

it("revalidates adapted PDF traces including their derived text pins without rejecting valid Native output", async () => {
  const bytes = Buffer.from("%PDF-unit-only");
  const input = store.add(bytes, "application/pdf", "unit-only.pdf");
  app.armNative(Date.now() + 60_000);
  await testFetch(ORIGIN + "/native/job", {
    headers: { "X-OTR-Diagnostic": app.nativeToken },
  });
  await testFetch(ORIGIN + "/api/run", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ inputId: input.id, runtime: "IOS_DIAGNOSTIC_COMPONENT" }),
  });
  const claimed = (await (
    await testFetch(ORIGIN + "/native/job", {
      headers: { "X-OTR-Diagnostic": app.nativeToken },
    })
  ).json()) as { job: Parameters<typeof runImportDiagnostic>[0] };
  const extractor = createCaptureLocalExtractorCore({
    hash,
    getBridge: () => ({
      extractCaptureLocal: async () => ({
        engine: "apple-pdfkit",
        version: 1,
        text: "Flight NZ5069",
        pages: [{ pageIndex: 0, start: 0, end: 13 }],
        originalSha256: input.sha256,
        originalByteCount: bytes.length,
      }),
      captureLocalModelCapability: async () => ({
        status: "UNAVAILABLE",
        reason: "DEVICE_NOT_ELIGIBLE",
      }),
    }),
  });
  const trace = await runImportDiagnostic(
    claimed.job,
    bytes,
    extractor,
    hash,
    "IOS_DIAGNOSTIC_COMPONENT",
  );
  expect(trace.extraction).toHaveProperty("textSha256");
  const response = await testFetch(ORIGIN + "/native/trace", {
    method: "POST",
    headers: { "X-OTR-Diagnostic": app.nativeToken, "Content-Type": "application/json" },
    body: JSON.stringify(trace),
  });
  expect(response.status).toBe(200);
});

function previewFixturePdf() {
  const stream = (color: string) => {
    const content = `q ${color} rg 0 0 200 100 re f Q`;
    return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  };
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 2 /Kids [3 0 R 5 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> /Contents 4 0 R >>",
    stream("1 0 0"),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> /Contents 6 0 R >>",
    stream("0 0 1"),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
it("renders genuine bounded PDF page PNGs, retains private cache, and rejects malformed/foreign/path requests", async () => {
  const input = store.add(previewFixturePdf(), "application/pdf", "two pages.pdf");
  const one = await testFetch(ORIGIN + `/api/input/${input.id}/preview?page=1`);
  const two = await testFetch(ORIGIN + `/api/input/${input.id}/preview?page=2`);
  expect(one.status).toBe(200);
  expect(one.headers["content-type"]).toBe("image/png");
  expect(one.bytes().subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(two.status).toBe(200);
  expect(two.bytes()).not.toEqual(one.bytes());
  expect(one.bytes().readUInt32BE(16)).toBeLessThanOrEqual(4000);
  const cache = readdirSync(root).filter((p) => p.startsWith(`preview-${input.id}-`));
  expect(cache).toHaveLength(2);
  for (const file of cache) expect(statSync(store.path(file)).mode & 0o777).toBe(0o600);
  const png = store.add(one.bytes(), "image/png", "original.png");
  expect(store.preview(png, 1).bytes).toEqual(one.bytes());
  expect(() => store.preview(png, 2)).toThrow("PREVIEW_PAGE_INVALID");
  for (const page of ["0", "-1", "1.1", "33", "1;whoami", "../1"]) {
    expect(() => previewPage(page)).toThrow();
    expect(
      (
        await testFetch(
          ORIGIN + `/api/input/${input.id}/preview?page=${encodeURIComponent(page)}`,
        )
      ).status,
    ).toBe(400);
  }
  expect((await testFetch(ORIGIN + `/api/input/${input.id}/preview?page=3`)).status).toBe(
    400,
  );
  expect(
    (
      await testFetch(ORIGIN + `/api/input/${input.id}/preview?page=1`, {
        headers: { Origin: "http://evil.test" },
      })
    ).status,
  ).toBe(400);
  const corrupt = store.add(Buffer.from("not a pdf"), "application/pdf", "corrupt.pdf");
  expect(
    (await testFetch(ORIGIN + `/api/input/${corrupt.id}/preview?page=1`)).status,
  ).toBe(400);
  writeFileSync(store.path(`${input.id}.bytes`), Buffer.from("tampered"));
  expect((await testFetch(ORIGIN + `/api/input/${input.id}/preview?page=1`)).status).toBe(
    400,
  );
}, 30_000);

it("persists diagnostic zero/many group annotations without treating unchecked or unsupported labels as accuracy", async () => {
  const field = {
    path: "service",
    raw: "NZ5069",
    status: "CONFIRMED" as const,
    participantId: "manual-traveller",
  };
  const annotation = {
    documentStatus: "RESULTS" as const,
    results: [
      {
        id: "manual-a",
        type: "FLIGHT" as const,
        status: "CONFIRMED" as const,
        fields: [field],
        segments: [
          {
            id: "leg-a",
            fields: [{ path: "date", raw: "", status: "NOT_PROVIDED" as const }],
          },
        ],
      },
      {
        id: "manual-b",
        type: "FLIGHT" as const,
        status: "CONFIRMED" as const,
        fields: [],
        segments: [],
      },
    ],
  };
  const labels = labelSchema.parse({
    kind: "HUMAN_GROUND_TRUTH",
    fields: [],
    annotation,
  });
  store.save("annotation-test.json", labels);
  expect(labelSchema.parse(store.read("annotation-test.json"))).toEqual(labels);
  const bytes = new TextEncoder().encode("Flight NZ5069");
  const job = {
    runId: randomUUID(),
    inputId: randomUUID(),
    mediaType: "text/plain",
    byteCount: bytes.length,
    sha256: await hash(bytes),
    hostSourceManifest: {},
  };
  const extractor = createCaptureLocalExtractorCore({
    hash,
    getBridge: () => ({
      extractCaptureLocal: async () => ({}),
      captureLocalModelCapability: async () => ({
        status: "UNAVAILABLE",
        reason: "DEVICE_NOT_ELIGIBLE",
      }),
    }),
  });
  const trace = await runImportDiagnostic(job, bytes, extractor, hash, "MAC_COMPONENT");
  const actual = trace.result.fields[0];
  const checked = labelSchema.parse({
    ...labels,
    annotation: {
      ...annotation,
      results: [
        {
          ...annotation.results[0],
          fields: [{ path: actual.path, raw: actual.raw, status: "CONFIRMED" }],
          segments: [],
        },
      ],
    },
  });
  expect(statistics(trace, checked)).toMatchObject({
    precision: 1,
    recall: 1,
    annotationSummary: { resultCount: 1 },
    typeAccuracy: null,
  });
  const unchecked = labelSchema.parse({
    ...checked,
    annotation: { ...checked.annotation, documentStatus: "UNREVIEWED" },
  });
  expect(statistics(trace, unchecked)).toMatchObject({
    status: "N/A",
    precision: null,
    recall: null,
  });
  for (const result of [
    { ...checked.annotation!.results[0], status: "WRONG_TYPE" },
    { ...checked.annotation!.results[0], type: "STAY" },
    {
      ...checked.annotation!.results[0],
      fields: [{ path: actual.path, raw: "", status: "UNCHECKED" }],
    },
  ]) {
    const partial = labelSchema.parse({
      ...checked,
      annotation: { documentStatus: "RESULTS", results: [result] },
    });
    expect(statistics(trace, partial)).toMatchObject({
      status: "N/A",
      precision: null,
      recall: null,
    });
  }
  const zero = labelSchema.parse({
    kind: "HUMAN_GROUND_TRUTH",
    fields: [],
    annotation: { documentStatus: "NO_RELEVANT_CONTENT", results: [] },
  });
  expect(statistics(trace, zero)).toMatchObject({
    status: "N/A",
    annotationSummary: { resultCount: 0 },
  });
  expect(statistics(trace, { kind: "HUMAN_GROUND_TRUTH", fields: [] }).status).toBe(
    "N/A",
  );
  expect(() =>
    labelSchema.parse({
      ...labels,
      annotation: { ...annotation, documentStatus: "NO_RELEVANT_CONTENT" },
    }),
  ).toThrow();
  expect(() =>
    labelSchema.parse({
      ...labels,
      annotation: {
        ...annotation,
        results: [{ ...annotation.results[0], fields: [{ ...field, raw: "" }] }],
      },
    }),
  ).toThrow();
});

it("does not score swapped cross-result, segment or participant values as pooled100percent", async () => {
  const bytes = new TextEncoder().encode("Flight NZ5069\nFlight NZ5070");
  const job = {
    runId: randomUUID(),
    inputId: randomUUID(),
    mediaType: "text/plain",
    byteCount: bytes.length,
    sha256: await hash(bytes),
    hostSourceManifest: {},
  };
  const extractor = createCaptureLocalExtractorCore({
    hash,
    getBridge: () => ({
      extractCaptureLocal: async () => ({}),
      captureLocalModelCapability: async () => ({
        status: "UNAVAILABLE",
        reason: "DEVICE_NOT_ELIGIBLE",
      }),
    }),
  });
  const trace = await runImportDiagnostic(job, bytes, extractor, hash, "MAC_COMPONENT");
  const fields = trace.result.fields.map((field) => ({
    path: field.path,
    raw: field.raw,
    status: "CONFIRMED" as const,
  }));
  expect(new Set(fields.map((f) => f.raw)).size).toBeGreaterThanOrEqual(2);
  const result = {
    id: "first",
    type: "FLIGHT" as const,
    status: "CONFIRMED" as const,
    fields,
    segments: [],
  };
  const annotations = [
    {
      documentStatus: "RESULTS",
      results: [
        { ...result, fields: [fields[1]] },
        { ...result, id: "second", fields: [fields[0]] },
      ],
    },
    {
      documentStatus: "RESULTS",
      results: [
        {
          ...result,
          fields: [],
          segments: [
            { id: "first-leg", fields: [fields[1]] },
            { id: "second-leg", fields: [fields[0]] },
          ],
        },
      ],
    },
    {
      documentStatus: "RESULTS",
      results: [
        {
          ...result,
          fields: fields.map((field, index) => ({
            ...field,
            participantId: index ? "first-person" : "second-person",
          })),
        },
      ],
    },
  ];
  for (const annotation of annotations) {
    const labels = labelSchema.parse({
      kind: "HUMAN_GROUND_TRUTH",
      fields: fields.map(({ path, raw }) => ({ path, raw })),
      annotation,
    });
    expect(statistics(trace, labels)).toMatchObject({
      status: "N/A",
      precision: null,
      recall: null,
      reasonCode: "IDENTITY_ALIGNMENT_NOT_IMPLEMENTED",
      annotationSummary: { documentStatus: "RESULTS" },
    });
  }
  const single = labelSchema.parse({
    kind: "HUMAN_GROUND_TRUTH",
    fields: [],
    annotation: { documentStatus: "RESULTS", results: [result] },
  });
  expect(statistics(trace, single)).toMatchObject({ precision: 1, recall: 1 });
});
