import { randomUUID } from "node:crypto";
import { open, readFile, writeFile } from "node:fs/promises";
import { expect } from "vitest";
import {
  PDF_UPLOAD_CAUSAL_V3,
  sourcePdfCausalBindingSchema,
  sourcePdfCausalAckSchema,
  sourcePdfCausalGetSchema,
} from "../../../src/domain/trip/sourcePdfUploadCausal";
import { canonicalCoreJson, type Json } from "../../../src/domain/trip/tripCoreV2Json";
import { sourcePdfUploadReceiptSchema } from "../../../src/domain/trip/sourcePdfUploadAuthority";
import { session } from "./tripCoreV2Sql";
import {
  makeUploadPlan,
  uploadRpc,
  SyntheticPdfProvider,
  type UploadJournal,
} from "./sourcePdfUpload";
import { pdfHash } from "../sourcePdfProfile";
export type CausalJournal = UploadJournal & {
  pdf_causal_read_permit: {
    readId: string;
    ackEvidenceSha256: string;
    ownerRun: string;
    ownerFence: number;
  } | null;
  termination_outstanding: boolean;
  pdf_beta_ack: Json | null;
  pdf_beta_get: Json | null;
  terminal_result: null;
  terminal_evidence_sha256: null;
};
export const causalPlan = (
  owned: string,
  actor: string,
  trip: string,
  source: string,
  original: string,
  bytes: Uint8Array,
  mime = "application/pdf",
) =>
  makeUploadPlan(
    owned,
    actor,
    trip,
    source,
    original,
    bytes,
    mime,
    "trip_source_pdf_causal",
  );
export const causalExecute = (
  owned: string,
  j: CausalJournal,
  action: string,
  proof: Json | null = null,
) =>
  uploadRpc(
    owned,
    "trip_source_pdf_causal_execute",
    ["uuid", "uuid", "bigint", "text", "jsonb"],
    [
      j.id,
      j.owner_run,
      j.owner_fence,
      action,
      proof === null ? null : canonicalCoreJson(proof),
    ],
  ) as Promise<CausalJournal>;
export async function causalProof(
  owned: string,
  j: CausalJournal,
  action: "ACK" | "GET",
  overrides: Record<string, Json> = {},
) {
  const s = session(owned);
  try {
    const observedAt = (
      await s.lease.query(
        "SELECT public.trip_event_utc_timestamp(clock_timestamp()) AS t",
      )
    ).rows[0].t as string;
    const body = JSON.stringify({
      Key: `${j.pdf_binding.bucket}/${j.pdf_binding.objectKey}`,
      Id: randomUUID(),
    });
    const proof = {
      uploadVersion: 3,
      issuer: PDF_UPLOAD_CAUSAL_V3.issuer,
      binding: j.pdf_binding,
      ownerRun: j.owner_run,
      ownerFence: j.owner_fence,
      dispatchId: j.pdf_dispatch_id,
      observedAt,
      ...(action === "ACK"
        ? {
            response: {
              status: 200,
              transportComplete: true,
              upsert: false,
              body,
              bodySha256: pdfHash(new TextEncoder().encode(body)),
              bodyByteCount: Buffer.byteLength(body),
            },
          }
        : {
            read: {
              readId: j.pdf_causal_read_permit?.readId ?? randomUUID(),
              ackEvidenceSha256:
                j.pdf_causal_read_permit?.ackEvidenceSha256 ?? "0".repeat(64),
              sha256: j.pdf_binding.sha256,
              byteCount: j.pdf_binding.byteCount,
              mimeType: "application/pdf",
              cacheBypassed: true,
            },
          }),
      ...overrides,
    };
    const evidenceSha256 = (
      await s.lease.query("SELECT public.trip_source_hash($1,$2::jsonb) AS d", [
        `otr-source-pdf-beta-${action.toLowerCase()}-v3`,
        canonicalCoreJson(proof),
      ])
    ).rows[0].d as string;
    return { ...proof, evidenceSha256 };
  } finally {
    s.close();
  }
}
export async function uploadCausalRetainedPdfFixture(
  owned: string,
  actor: string,
  trip: string,
  source: string,
  original: string,
  bytes: Uint8Array,
  retainedFile: string,
) {
  const plan = await causalPlan(owned, actor, trip, source, original, bytes);
  let j: CausalJournal = (await plan.begin()).journal;
  sourcePdfCausalBindingSchema.parse(j.pdf_binding);
  expect((await plan.begin()).journal).toEqual(j);
  const stage = await open(retainedFile + ".stage", "wx", 0o600);
  try {
    await stage.writeFile(bytes);
    await stage.sync();
  } finally {
    await stage.close();
  }
  const staged = await readFile(retainedFile + ".stage");
  expect(pdfHash(staged)).toBe(j.pdf_binding.sha256);
  j = await causalExecute(owned, j, "STAGE", {
    sha256: pdfHash(bytes),
    byteCount: bytes.length,
    evidenceSha256: "e".repeat(64),
  });
  j = await causalExecute(owned, j, "DISPATCH");
  j = await causalExecute(owned, j, "CONFIRM");
  const provider = new SyntheticPdfProvider();
  provider.start(j, bytes)();
  await writeFile(retainedFile, provider.bytes!, { flag: "wx", mode: 0o600 });
  j = await causalExecute(
    owned,
    j,
    "ACK",
    sourcePdfCausalAckSchema.parse(await causalProof(owned, j, "ACK")),
  );
  j = await causalExecute(owned, j, "READ");
  const retained = await controlledIndependentRead(j, () => readFile(retainedFile));
  j = await causalExecute(
    owned,
    j,
    "GET",
    sourcePdfCausalGetSchema.parse(
      await causalProof(owned, j, "GET", {
        read: {
          readId: j.pdf_causal_read_permit?.readId ?? randomUUID(),
          ackEvidenceSha256:
            j.pdf_causal_read_permit?.ackEvidenceSha256 ?? "0".repeat(64),
          sha256: pdfHash(retained),
          byteCount: retained.length,
          mimeType: "application/pdf",
          cacheBypassed: true,
        },
      }),
    ),
  );
  const receipt = sourcePdfUploadReceiptSchema.parse(await plan.finish(j));
  expect(receipt.outcome).toBe("APPLIED");
  expect(receipt.result_remote_state).toBe("PENDING");
  expect(await plan.finish(j)).toEqual(receipt);
  expect((await plan.begin()).receipt).toEqual(receipt);
  expect(j.termination_outstanding).toBe(true);
  expect(j.terminal_result).toBeNull();
  expect(j.terminal_evidence_sha256).toBeNull();
  console.log(
    JSON.stringify({
      classification: "CLOSED_SYNTHETIC_CAUSAL_CUSTODY",
      operationId: plan.q.operation_id,
      attemptId: j.id,
      providerWrites: provider.writes,
      remoteDebt: true,
      receiptSha256: receipt.result_sha256,
    }),
  );
  return { plan, j, receipt };
}

// Controlled producer contract test helper, not a real storage capability claim.
export async function controlledIndependentRead(
  j: CausalJournal,
  read: () => Promise<Uint8Array>,
  cached = false,
) {
  const permit = j.pdf_causal_read_permit;
  if (
    !j.pdf_beta_ack ||
    !permit ||
    permit.ackEvidenceSha256 !==
      (j.pdf_beta_ack as Record<string, Json>).evidenceSha256 ||
    permit.ownerRun !== j.owner_run ||
    permit.ownerFence !== j.owner_fence
  )
    throw Error("ACK_LINKED_READ_REQUIRED");
  if (cached) throw Error("CACHED_READ_FORBIDDEN");
  return read();
}
