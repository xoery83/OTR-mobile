// Offline configuration plan only. No receipt, Source admission, clock or network.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { universalBatchIdentity } from "../../backend/src/universalBatchSource";
import { projectInitialPdfCommandProposals } from "../../src/domain/trip/sourcePdfPreparationCommands";
import { projectInitialBinaryOriginalCommandProposals } from "../../src/domain/trip/sourceBinaryOriginalCommands";
import { sourcePngOriginalUploadCommandSchema } from "../../src/domain/trip/sourcePngPreparationCommands";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const command = z
  .object({
    command: z.literal("ACQUIRE_SOURCE"),
    actor_account_id: z.uuid(),
    trip_id: z.uuid(),
    source_id: z.uuid(),
    operation_id: z.uuid(),
    operation_sha256: digest,
    payload: z
      .object({
        original: z
          .object({
            id: z.uuid(),
            material_kind: z.enum(["BINARY", "TEXT"]),
            mime_type: z.string().nullable(),
            payload_sha256: digest,
            byte_count: z.number().int().positive(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
const pinsSchema = z.object({
  version: z.literal("otr.native.universal-pin-proposal/1"),
  accountId: z.uuid(),
  tripId: z.uuid(),
  batchId: z.uuid(),
  submissionSha256: digest,
  inputs: z
    .array(
      z.object({
        inputId: z.uuid(),
        sourceState: z.literal("PREPARED"),
        sha256: digest,
        byteCount: z.number().int().positive(),
        sourceCommand: command,
        bindingCas: z.object({
          captureRevision: z.number().int().positive(),
          materialRevision: z.literal(1),
          expectedSourceRevision: z.null(),
        }),
      }),
    )
    .length(3),
});

export async function buildInitialNativeCommandPlan(raw: unknown) {
  const p = pinsSchema.parse(raw),
    scope = { actorId: p.accountId, tripId: p.tripId };
  const frame = {
    batchId: p.batchId,
    taskId: universalBatchIdentity(p.accountId, p.tripId, p.batchId, "task"),
    runId: universalBatchIdentity(p.accountId, p.tripId, p.batchId, "run"),
    submissionSha256: p.submissionSha256,
  };
  const sourceCommandPins: object[] = [];
  const phases: object[] = [];
  const kinds: string[] = [];
  for (const i of p.inputs) {
    const q = i.sourceCommand,
      o = q.payload.original;
    if (
      q.actor_account_id !== p.accountId ||
      q.trip_id !== p.tripId ||
      o.payload_sha256 !== i.sha256 ||
      o.byte_count !== i.byteCount
    )
      throw Error("INITIAL_SOURCE_PLAN_BINDING_MISMATCH");
    sourceCommandPins.push({ ...frame, command: q });
    if (o.material_kind === "TEXT") {
      kinds.push("TEXT");
      continue;
    }
    if (o.mime_type !== "application/pdf" && o.mime_type !== "image/png")
      throw Error("INITIAL_SOURCE_PLAN_FORMAT");
    const pdf = o.mime_type === "application/pdf";
    kinds.push(pdf ? "PDF" : "PNG");
    const proposed = pdf
      ? await projectInitialPdfCommandProposals(scope, q, async (b) => sha(b))
      : await projectInitialBinaryOriginalCommandProposals(
          scope,
          q,
          async (b) => sha(b),
          "PNG",
        );
    if (!pdf) sourcePngOriginalUploadCommandSchema.parse(proposed.upload);
    for (const c of [proposed.prepare, proposed.upload, proposed.verify])
      sourceCommandPins.push({ ...frame, command: c });
    if (pdf) {
      const request = {
        derivativeVersion: 2,
        sourceId: q.source_id,
        sourceRevision: 1,
        sourceRowRevision: 1,
        originalRepresentationId: o.id,
        originalRowRevision: 2,
        derivedRepresentationId: proposed.derivedRepresentationId,
      };
      sourceCommandPins.push({
        ...frame,
        pdfRegistrationTemplate: {
          accountId: p.accountId,
          tripId: p.tripId,
          request: {
            ...request,
            operationId: proposed.registrationOperationId,
            verificationOperationId: proposed.verify.operation_id,
          },
        },
        verificationOperationKey: proposed.verify.operation_key,
        verificationOperationSha256: proposed.verify.operation_sha256,
      });
      const seal = { ...request, operationId: proposed.sealOperationId };
      sourceCommandPins.push({
        ...frame,
        pdfSealTemplate: { accountId: p.accountId, tripId: p.tripId, request: seal },
      });
      phases.push({ inputId: i.inputId, pdfSealRequest: seal });
    }
  }
  if (
    kinds.sort().join() !== "PDF,PNG,TEXT" ||
    new Set(p.inputs.map((i) => i.inputId)).size !== 3 ||
    new Set(p.inputs.map((i) => i.sourceCommand.source_id)).size !== 3
  )
    throw Error("INITIAL_SOURCE_PLAN_ROSTER");
  return {
    version: "otr.finite-native.initial-command-plan/1",
    qualification: "PROJECTED_FRESH_CAS_ONLY_NOT_RECEIPTS_OR_AUTHORITY",
    accountId: p.accountId,
    tripId: p.tripId,
    ...frame,
    sourceCommandPins,
    phases,
    preconditions: [
      "Root2 owning read must prove all three Source/Operation IDs ABSENT before window",
      "Real ACQUIRE receipts must be FINAL/APPLIED and revisions 1/1/1; any mismatch stops, never silently rehash or regrant",
      "PDF registration sole result SHA comes from exact frozen VERIFY actual immutable receipt",
      "No clock or permissions are created by this plan",
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, expectedSha, output] = process.argv.slice(2);
  if (!input || !output || !digest.safeParse(expectedSha).success)
    throw Error("EXPECTED_MANIFEST_SHA_AND_PRIVATE_OUTPUT_REQUIRED");
  const bytes = await readFile(input);
  if (sha(bytes) !== expectedSha) throw Error("INITIAL_SOURCE_MANIFEST_SHA_MISMATCH");
  const plan = await buildInitialNativeCommandPlan(
    JSON.parse(bytes.toString()).sourcePins,
  );
  await writeFile(output, JSON.stringify(plan, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
}
