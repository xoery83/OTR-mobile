import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { PrivateStore } from "./store";
import { readRemoteDiagnostics, remoteReceiptView } from "./remote";
import {
  buildCaptureLocalResult,
  projectCaptureLocalFlightInterpretation,
} from "../../src/domain/capture/captureLocalInterpretation";
import { buildFlightAssemblyRequest } from "../../src/domain/trip/flightSemanticAssembly";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "otr-remote-test-")));
  roots.push(root);
  const store = new PrivateStore(root),
    text = "AB123 route=AKL -> NSN date=2030-12-14",
    input = store.add(Buffer.from(text), "text/plain", "test.txt"),
    baselineRunId = randomUUID();
  const result = buildCaptureLocalResult(
    input.id,
    {
      engine: "utf8-text",
      text,
      originalSha256: input.sha256,
      originalByteCount: input.byteCount,
    },
    { sha256: input.sha256, byteCount: input.byteCount },
    "a".repeat(64),
    "UNAVAILABLE",
  );
  const typed = projectCaptureLocalFlightInterpretation(result),
    a = typed.assembly!;
  const request = buildFlightAssemblyRequest(
    [
      {
        inputId: input.id,
        text,
        originalSha256: input.sha256,
        originalByteCount: input.byteCount,
        parsed: {
          items: a.contentBlocks.map((b) => b.observation),
          fragments: typed.fragments,
        },
      },
    ],
    a,
  );
  store.save(`run-${baselineRunId}.json`, {
    id: baselineRunId,
    inputId: input.id,
    trace: { result },
  });
  const receipt = {
    version: 1 as const,
    id: randomUUID(),
    inputId: input.id,
    baselineRunId,
    originalSha256: input.sha256,
    requestSha256: createHash("sha256").update(JSON.stringify(request)).digest("hex"),
    requestContract: request.partA,
    recordedValidation: { status: "REJECTED" as const, reasonCodes: ["TEST"] },
    provider: "DeepSeek" as const,
    model: "deepseek-flash" as const,
    mode: "TEXT" as const,
    recordedAt: "2026-10-17T00:00:00Z",
    http: 200,
    latencyMs: 5,
    output: '{"bookingGroups":[],"segments":[],"unresolved":[],"conflicts":[]}',
    finishReason: "stop",
    usage: {
      prompt_tokens: 100,
      completion_tokens: 10,
      total_tokens: 110,
      prompt_cache_hit_tokens: 20,
    },
    textInputUpperBound: 300,
    outputLimit: 2048,
    reviewNotes: "Model prose is not fact",
  };
  return { store, input, receipt };
}
it("preserves actual usage without double counting cache and keeps recorded/current checks separate", () => {
  const { store, receipt } = fixture(),
    v = remoteReceiptView(store, receipt);
  expect(v.usage).toMatchObject({
    input_tokens: 100,
    output_tokens: 10,
    total_tokens: 110,
    cached_input_tokens: 20,
  });
  expect(v.cost?.peakUpper).toBeCloseTo(0.000042);
  expect(v.recordedValidation.reasonCodes).toEqual(["TEST"]);
  expect(v.validation.reasonCodes).toContain("OBSERVATIONS_SILENTLY_OMITTED");
  expect(v.admission).toBe("NOT_RUN");
  expect(v.canonicalWrites).toBe(false);
});
it("does not manufacture zero usage or JSON/schema success", () => {
  const { store, receipt } = fixture(),
    v = remoteReceiptView(store, { ...receipt, output: "not JSON", usage: null });
  expect(v.jsonValid).toBe(false);
  expect(v.schemaValid).toBe(false);
  expect(v.cost).toBeNull();
  expect(v.usage.input_tokens).toBeNull();
});
it("rejects mismatched original, baseline and request pins", () => {
  const { store, receipt } = fixture();
  for (const patch of [
    { originalSha256: "b".repeat(64) },
    { baselineRunId: randomUUID() },
    { requestSha256: "b".repeat(64) },
  ])
    expect(() => remoteReceiptView(store, { ...receipt, ...patch })).toThrow();
});
it("keeps bad diagnostics isolated from local inspection and excludes other Inputs", () => {
  const { store, input, receipt } = fixture();
  store.save(`remote-${receipt.id}.json`, receipt);
  store.save(`remote-${randomUUID()}.json`, {
    ...receipt,
    requestSha256: "b".repeat(64),
  });
  expect(readRemoteDiagnostics(store, input.id)).toMatchObject({
    rejectedRecords: 1,
    records: [{ id: receipt.id }],
  });
  expect(readRemoteDiagnostics(store, randomUUID()).records).toEqual([]);
});
