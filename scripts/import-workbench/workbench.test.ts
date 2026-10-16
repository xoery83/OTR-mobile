import { request as httpRequest } from "node:http";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  readFileSync,
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
import { PrivateStore, statistics, compare, escapeHtml } from "./store";
import { createWorkbench, ORIGIN } from "./server";
const root = realpathSync(mkdtempSync(join(tmpdir(), "otr-wb-test-")));
const store = new PrivateStore(root);
const app = createWorkbench(store);
let testOrigin = "";
const testFetch = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
) =>
  new Promise<{ status: number; json: () => Promise<unknown> }>((resolve, reject) => {
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
  expect((await sendTrace(trace)).status).toBe(200);
  expect((await sendTrace(trace)).status).toBe(400);
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
