import { describe, expect, it } from "vitest";
import { fixture, seal, id, sha256 } from "./__fixtures__/batchAssessment";
import { assessCaptureBatch, BATCH_ASSESSMENT_LIMITS } from "./batchAssessment";
import { importDigest } from "../trip/flightImportReview";
import type { Json } from "../trip/eventIntentJson";
import { submissionContextSchema } from "./captureSubmission";
import {
  ASSESSMENT_BODY_BYTES,
  observationJson,
  validateAssessmentObservation,
} from "./batchAssessmentObservation";

async function bodyFixture() {
  const request = await fixture();
  const context = submissionContextSchema.parse({
    id: request.manifest.contextSnapshotId,
    version: 1,
    accountId: request.manifest.accountId,
    batchId: request.manifest.batchId,
    observedAt: "2026-10-08T00:00:00.000Z",
    clock: "DEVICE_WALL",
    entrySurface: "CAPTURE",
    tripPrior: null,
  });
  request.manifest.tripPriorId = null;
  request.manifest.contextSha256 = await importDigest(
    "otr-capture-context-v1",
    context as Json,
    sha256,
  );
  const sealed = await seal(request);
  const envelope = await assessCaptureBatch(observationJson(sealed), sha256);
  return {
    version: 1 as const,
    c2RequestSha256: "a".repeat(64),
    c2ManifestSha256: "b".repeat(64),
    contextSha256: request.manifest.contextSha256,
    parentBodySha256: null,
    manifest: sealed.manifest,
    snapshot: sealed.snapshot,
    envelope,
  };
}
describe("dormant assessment immutable body", () => {
  it("uses approved context namespace and stable canonical validation, without mutating original context text", async () => {
    const context = submissionContextSchema.parse({
      id: id(5),
      version: 1,
      accountId: id(1),
      batchId: id(2),
      observedAt: "2026-10-08T00:00:00.000Z",
      clock: "DEVICE_WALL",
      entrySurface: "CAPTURE",
      tripPrior: null,
    });
    const original = JSON.stringify(context);
    const hash = await importDigest("otr-capture-context-v1", context as Json, sha256);
    expect(hash).not.toBe(await sha256(new TextEncoder().encode(original)));
    expect(
      await importDigest(
        "otr-capture-context-v1",
        JSON.parse(observationJson(context)),
        sha256,
      ),
    ).toBe(hash);
    expect(JSON.stringify(context)).toBe(original);
    const body = await bodyFixture(),
      raw = observationJson(body),
      verified = await validateAssessmentObservation(raw, sha256);
    expect(verified.body.contextSha256).toBe(hash);
    expect(Object.isFrozen(verified.body.snapshot.inputs)).toBe(true);
    expect(verified.body.envelope.preparation).toBe("NOT_AUTHORIZED");
    expect(verified.body.envelope.domainAdmission).toBe("NOT_AUTHORIZED");
  });
  it.each(["unknown", "duplicate", "noncanonical", "digest", "envelope", "revision"])(
    "rejects %s",
    async (kind) => {
      const body = structuredClone(await bodyFixture());
      let raw = observationJson(body);
      if (kind === "unknown") raw = raw.replace("{", '{"unknown":1,');
      if (kind === "duplicate") raw = raw.replace("{", '{"version":1,');
      if (kind === "noncanonical") raw = " " + raw;
      if (kind === "digest") body.contextSha256 = "f".repeat(64);
      if (kind === "envelope") body.envelope.barrier = "PENDING";
      if (kind === "revision") body.snapshot.assessmentRevision = 2;
      if (["digest", "envelope", "revision"].includes(kind)) raw = observationJson(body);
      await expect(validateAssessmentObservation(raw, sha256)).rejects.toMatchObject({
        code: "INTEGRITY",
      });
    },
  );
  it("enforces inclusive UTF-8 2MiB and independent 1MiB C4a raw boundary before hashing", async () => {
    const exact = "é".repeat(ASSESSMENT_BODY_BYTES / 2);
    let calls = 0;
    const hash = async (bytes: Uint8Array) => {
      calls++;
      return sha256(bytes);
    };
    await expect(validateAssessmentObservation(exact, hash)).rejects.toMatchObject({
      code: "INTEGRITY",
    });
    await expect(validateAssessmentObservation(exact + "a", hash)).rejects.toMatchObject({
      code: "RECORD_TOO_LARGE",
    });
    expect(calls).toBe(0);
    await expect(
      assessCaptureBatch(" ".repeat(BATCH_ASSESSMENT_LIMITS.bytes + 1), hash),
    ).rejects.toThrow("C4A_RESOURCE_LIMIT");
    await expect(
      assessCaptureBatch(" ".repeat(BATCH_ASSESSMENT_LIMITS.bytes), hash),
    ).rejects.toThrow("C4A_RAW_INPUT_INVALID");
    expect(calls).toBe(0);
  });
  it("some C4a-valid requests exceed the complete-body bound; rejects intact", async () => {
    const request = await fixture();
    request.manifest.inputs = request.manifest.inputs.slice(0, 1);
    request.snapshot.inputs = request.snapshot.inputs.slice(0, 1);
    request.snapshot.findings = Array.from({ length: 64 }, (_, n) => ({
      ...structuredClone(request.snapshot.findings[0]),
      id: id(10000 + n),
      evidence: [request.snapshot.findings[0].evidence[0]],
      dependencies: [request.snapshot.findings[0].dependencies[0]],
    }));
    const pin = request.snapshot.inputs[0].bindings[0].pin;
    const make = async (count: number) => {
      request.snapshot.historicalEvidence = Array.from(
        { length: Math.ceil(count / 64) },
        (_, group) => ({
          accountId: request.manifest.accountId,
          batchId: id(800 + group),
          runId: id(900 + group),
          runGeneration: Number.MAX_SAFE_INTEGER,
          pins: Array.from({ length: Math.min(64, count - group * 64) }, (_, n) => ({
            ...pin,
            id: id(1000 + n),
          })),
        }),
      );
      return seal(request);
    };
    let lo = 1,
      hi = 4096;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2),
        r = await make(mid);
      if (
        new TextEncoder().encode(observationJson(r)).length <=
        BATCH_ASSESSMENT_LIMITS.bytes
      )
        lo = mid;
      else hi = mid - 1;
    }
    const sealed = await make(lo),
      envelope = await assessCaptureBatch(observationJson(sealed), sha256);
    const canonical = observationJson(sealed);
    const padded =
      canonical +
      " ".repeat(
        BATCH_ASSESSMENT_LIMITS.bytes - new TextEncoder().encode(canonical).byteLength,
      );
    expect(await assessCaptureBatch(padded, sha256)).toEqual(envelope);
    await expect(assessCaptureBatch(padded + " ", sha256)).rejects.toThrow(
      "C4A_RESOURCE_LIMIT",
    );
    const raw = observationJson({
      version: 1,
      c2RequestSha256: "a".repeat(64),
      c2ManifestSha256: "b".repeat(64),
      contextSha256: sealed.manifest.contextSha256,
      parentBodySha256: null,
      manifest: sealed.manifest,
      snapshot: sealed.snapshot,
      envelope,
    });
    expect(new TextEncoder().encode(raw).length).toBeGreaterThan(ASSESSMENT_BODY_BYTES);
    await expect(validateAssessmentObservation(raw, sha256)).rejects.toMatchObject({
      code: "RECORD_TOO_LARGE",
    });
  });
});
