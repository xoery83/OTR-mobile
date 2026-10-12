import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect } from "vitest";
import {
  PDF_UPLOAD_BETA_V2,
  sourcePdfBetaBindingSchema,
  sourcePdfBetaAckSchema,
  sourcePdfBetaGetSchema,
} from "../../../src/domain/trip/sourcePdfUploadBeta";
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
export type BetaJournal = UploadJournal & {
  termination_outstanding: boolean;
  pdf_beta_ack: Json | null;
  pdf_beta_get: Json | null;
  terminal_result: null;
  terminal_evidence_sha256: null;
};
export const betaPlan = (
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
    "trip_source_pdf_beta",
  );
export const betaExecute = (
  owned: string,
  j: UploadJournal,
  action: string,
  proof: Json | null = null,
) =>
  uploadRpc(
    owned,
    "trip_source_pdf_beta_execute",
    ["uuid", "uuid", "bigint", "text", "jsonb"],
    [
      j.id,
      j.owner_run,
      j.owner_fence,
      action,
      proof === null ? null : canonicalCoreJson(proof),
    ],
  ) as Promise<BetaJournal>;
export async function betaProof(
  owned: string,
  j: UploadJournal,
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
      uploadVersion: 2,
      issuer: PDF_UPLOAD_BETA_V2.issuer,
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
              readId: randomUUID(),
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
        `otr-source-pdf-beta-${action.toLowerCase()}-v2`,
        canonicalCoreJson(proof),
      ])
    ).rows[0].d as string;
    return { ...proof, evidenceSha256 };
  } finally {
    s.close();
  }
}
export async function uploadBetaRetainedPdfFixture(
  owned: string,
  actor: string,
  trip: string,
  source: string,
  original: string,
  bytes: Uint8Array,
  retainedFile: string,
) {
  const plan = await betaPlan(owned, actor, trip, source, original, bytes);
  let j: BetaJournal = (await plan.begin()).journal;
  sourcePdfBetaBindingSchema.parse(j.pdf_binding);
  expect((await plan.begin()).journal).toEqual(j);
  j = await betaExecute(owned, j, "STAGE", {
    sha256: pdfHash(bytes),
    byteCount: bytes.length,
    evidenceSha256: "e".repeat(64),
  });
  j = await betaExecute(owned, j, "DISPATCH");
  const provider = new SyntheticPdfProvider();
  provider.start(j, bytes)();
  await writeFile(retainedFile, provider.bytes!, { flag: "wx", mode: 0o600 });
  j = await betaExecute(
    owned,
    j,
    "ACK",
    sourcePdfBetaAckSchema.parse(await betaProof(owned, j, "ACK")),
  );
  const retained = await readFile(retainedFile);
  j = await betaExecute(
    owned,
    j,
    "GET",
    sourcePdfBetaGetSchema.parse(
      await betaProof(owned, j, "GET", {
        read: {
          readId: randomUUID(),
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
      classification: "CLOSED_SYNTHETIC_BETA_CUSTODY",
      operationId: plan.q.operation_id,
      attemptId: j.id,
      providerWrites: provider.writes,
      remoteDebt: true,
      receiptSha256: receipt.result_sha256,
    }),
  );
  return { plan, j, receipt };
}
