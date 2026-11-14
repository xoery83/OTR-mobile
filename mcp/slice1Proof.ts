import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { itemEditBaseOutput, uuid } from "./contract";
import { contentDigest, sha } from "./mutation";
import { mutationOutput } from "./mutationContract";

const hex = z.string().regex(/^[0-9a-f]{64}$/);
const contextSchema = z.strictObject({
  windowId: z.string().regex(/^[0-9a-f]{32}$/),
  startsAt: z.iso.datetime({ offset: true }),
  normalCloseAt: z.iso.datetime({ offset: true }),
  logsSHA256: hex,
  baseRequestId: uuid,
  previewRequestId: uuid,
});
const proofSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    version: z.literal("otr.mcp.response-proof/1"),
    kind: z.literal("EDIT_BASE"),
    inputSHA256: hex,
    outputSHA256: hex,
  }),
  z.strictObject({
    version: z.literal("otr.mcp.response-proof/1"),
    kind: z.literal("PREVIEW"),
    inputSHA256: hex,
    outputSHA256: hex,
    previewDigest: hex,
  }),
]);

// Offline evidence comparison only; this result cannot install confirmation or submit.
export function verifySlice1Proof(
  logsText: string,
  quotesValue: unknown,
  contextValue: unknown,
) {
  const context = contextSchema.parse(contextValue);
  assert.notEqual(context.baseRequestId, context.previewRequestId);
  const start = Date.parse(context.startsAt),
    end = Date.parse(context.normalCloseAt);
  assert(end > start && end - start <= 30 * 60 * 1000);
  assert(Buffer.byteLength(logsText) <= 262144 && sha(logsText) === context.logsSHA256);
  const logs = z
    .object({
      status: z.literal("CAPTURED"),
      evidence: z.literal("BOUNDED_TAIL_NOT_COMMIT_PROOF"),
      events: z.array(z.record(z.string(), z.unknown())).max(64),
    })
    .parse(JSON.parse(logsText));
  const quotes = z
    .object({
      editBaseRequest: z.unknown(),
      editBase: z.unknown(),
      previewRequest: z.unknown(),
      previewResult: z.unknown(),
    })
    .parse(quotesValue);
  for (const key of [
    "editBaseRequest",
    "editBase",
    "previewRequest",
    "previewResult",
  ] as const)
    assert(quotes[key] !== undefined, "QUOTED_REQUEST_AND_RESULT_REQUIRED");
  const rawCase = readFileSync(
    new URL("../docs/mcp/slice1/QA_CASES_FRESH.json", import.meta.url),
  );
  assert.equal(
    sha(rawCase),
    "6d5d4e07b14c5a5e9c692e3db24040a7dd076edddbcf8f743bbb86007169d6da",
  );
  const plan = JSON.parse(rawCase.toString());
  const expected = plan.cases.find((c: { client: string }) => c.client === "ChatGPT");
  assert.deepEqual(quotes.editBaseRequest, {
    trip_id: plan.tripId,
    item_id: plan.itemId,
  });
  const { mode, ...previewInput } = z
    .record(z.string(), z.unknown())
    .parse(quotes.previewRequest);
  assert(mode === undefined || mode === "PREVIEW");
  assert.deepEqual(previewInput, expected.input);
  const base = itemEditBaseOutput.parse(quotes.editBase);
  assert.equal(base.item.tripId, plan.tripId);
  assert.equal(base.item.itemId, plan.itemId);
  assert.equal(base.item.itemRevision, 2);
  assert.equal(base.item.description, expected.beforeNotes);
  assert.equal(base.item.capabilities?.canEdit, true);
  assert.equal(base.record.kind, "ITEM");
  assert.equal(base.record.id, plan.itemId);
  assert.equal(base.record.revision, 2);
  const body = base.record.body as Record<string, unknown>;
  assert.equal(body.id, plan.itemId);
  assert.equal(body.trip_id, plan.tripId);
  assert.equal(body.owner_account_id, plan.accountId);
  assert.equal(body.semantic_revision, 2);
  assert.equal(body.description, expected.beforeNotes);
  const preview = mutationOutput.parse(quotes.previewResult);
  assert.equal(preview.outcome, "PREVIEW");
  for (const key of ["trip_id", "item_id", "operation_id", "preview_digest"] as const)
    assert.equal(preview[key], expected.identity[key]);
  assert.equal(preview.current_revision, null);
  assert.deepEqual(preview.query, expected.identity.query);
  const correlate = (
    id: string,
    kind: "EDIT_BASE" | "PREVIEW",
    input: unknown,
    output: unknown,
  ) => {
    const matching = logs.events.filter((event) => event.requestId === id);
    assert.equal(matching.length, 1, "EXACT_UNIQUE_REQUEST_PROOF_REQUIRED");
    const event = matching[0];
    assert.equal(event.event, "MCP_QA_REQUEST");
    assert.equal(event.status, 200);
    assert(
      !Object.hasOwn(event, "errorCode") && !Object.hasOwn(event, "authFailureSource"),
    );
    assert.equal(
      event.tool,
      kind === "EDIT_BASE" ? "get_trip_item_edit_base" : "update_trip_item",
    );
    const timestamp = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/)
        .parse(event.dockerTimestamp),
      at = Date.parse(timestamp);
    assert(Number.isFinite(at) && at >= start && at < end, "PROOF_OUTSIDE_BOUND_WINDOW");
    const proof = proofSchema.parse(event.responseProof);
    assert.equal(proof.kind, kind);
    assert.equal(proof.inputSHA256, contentDigest(input));
    assert.equal(proof.outputSHA256, contentDigest(output));
    if (proof.kind === "PREVIEW")
      assert.equal(proof.previewDigest, preview.preview_digest);
    return at;
  };
  const baseAt = correlate(
    context.baseRequestId,
    "EDIT_BASE",
    quotes.editBaseRequest,
    quotes.editBase,
  );
  const previewAt = correlate(
    context.previewRequestId,
    "PREVIEW",
    quotes.previewRequest,
    quotes.previewResult,
  );
  assert(baseAt <= previewAt, "BASE_MUST_PRECEDE_PREVIEW");
  return {
    status: "MATCHED_HANDLER_OUTPUT_NOT_APPLY_AUTHORITY",
    windowId: context.windowId,
    operationId: preview.operation_id,
    revision: 2,
    previewDigest: preview.preview_digest,
    baseRequestId: context.baseRequestId,
    previewRequestId: context.previewRequestId,
    logsSHA256: context.logsSHA256,
    businessSubmissions: 0,
  } as const;
}
