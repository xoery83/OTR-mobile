import { registerPendingPdfFixture } from "./sourcePdfRegistrationAcceptance";
import { interpretFlightBatch } from "../../../src/data/interpretation/flightInterpretation";
import { buildCaptureFlightPublicationV2 } from "../../../src/data/interpretation/captureFlightCoreV2";
import { coreHashValue } from "../../../src/domain/trip/tripCoreV2Read";
import { canonicalCoreJson } from "../../../src/domain/trip/tripCoreV2Json";
import { bindFlightBatch } from "../../../src/data/interpretation/__fixtures__/flightInterpretation";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect } from "vitest";
import type { captureFlightFixture } from "../../../src/data/interpretation/__fixtures__/captureFlightCoreV2";
import { createSourcePdfAuthority } from "../sourcePdfAuthority";
import {
  PDF_OPTIONS_SHA,
  pdfHash,
  verifySourcePdf,
  encodeProfilePdf,
} from "../sourcePdfProfile";
import { publicationTestHash as hash } from "./tripCoreV2CandidatePublication";
import { session, seedPublicationSource } from "./tripCoreV2Sql";
import type { CorePgLease } from "../tripCoreV2PgStorage";
export async function seedAndSealPdf(
  admin: ReturnType<typeof session>,
  owned: string,
  f: Awaited<ReturnType<typeof captureFlightFixture>>,
) {
  const bytes = new Uint8Array(
    await readFile(new URL("./source-pdf/synthetic-roundtrip.pdf", import.meta.url)),
  );
  const decoded = verifySourcePdf(bytes),
    p = f.built.publication;
  expect(decoded.text).toBe(f.batch.request.materials[0].text);
  const originalId = randomUUID(),
    account = f.context.accountId,
    trip = f.context.tripId;
  const original = {
    ...structuredClone(f.batch.catalog.trip_source_representations[0]),
    id: originalId,
    material_kind: "BINARY" as const,
    mime_type: "application/pdf",
    encoding: null,
    text_content: null,
    payload_sha256: pdfHash(bytes),
    byte_count: bytes.length,
    storage_provider: "supabase_storage",
    storage_bucket: "trip-source-material",
    object_key:
      process.env.OTR_CORE_PDF_SOURCE_REGISTRATION === "1"
        ? `v1/${trip}/${p.sourceId}/${originalId}/payload`
        : `synthetic/${p.sourceId}/${originalId}`,
    remote_state: "VERIFIED" as const,
    verified_at: "2026-10-12T00:00:00.000000Z",
  };
  Object.assign(f.batch.catalog.trip_sources[0], {
    source_kind: "FILE",
    acquisition_channel: "FILES",
  });
  Object.assign(f.batch.catalog.trip_source_revisions[0], {
    original_representation_ids: [originalId],
  });
  Object.assign(f.batch.catalog.trip_source_representations[0], {
    role: "DERIVED",
    parent_ids: [originalId],
    transform_key: "otr.pdf.literal-text",
    transform_version: "1",
    transform_options_sha256: PDF_OPTIONS_SHA,
    regenerability: "POSSIBLE",
  });
  f.batch.catalog.trip_source_representations.push(original);
  await bindFlightBatch(f.batch);
  f.set = await interpretFlightBatch(f.batch, {
    sha256: hash,
    getAccountId: f.getAccountId,
    now: () => "2026-10-06T00:00:00Z",
  });
  const rebuilt = await buildCaptureFlightPublicationV2(
    f.context,
    f.set,
    f.batch.request.materials,
    p.publicationId,
    hash,
    f.getAccountId,
  );
  expect(rebuilt.publication.candidates.map((c) => c.candidateId)).toEqual(
    p.candidates.map((c) => c.candidateId),
  );
  Object.assign(p, rebuilt.publication);
  f.built = { ...rebuilt, publication: p };
  expect(p.inputCatalogSha256).toBe(f.set.input_sha256);
  const registered =
    process.env.OTR_CORE_PDF_SOURCE_REGISTRATION === "1"
      ? await registerPendingPdfFixture(
          admin,
          owned,
          account,
          trip,
          p.sourceId,
          originalId,
          f.batch.request.materials[0].pin.representation_id,
          bytes,
        )
      : undefined;
  await seedPublicationSource(
    admin,
    { materials: f.batch.request.materials, request: p },
    account,
    trip,
    f.built.sourcePublication,
    {
      id: originalId,
      sha256: pdfHash(bytes),
      byteCount: bytes.length,
      optionsSha256: PDF_OPTIONS_SHA,
    },
    Boolean(registered),
  );
  const connect = {
    withLease: async <T>(work: (lease: CorePgLease) => Promise<T>) => {
      const s = session(owned);
      try {
        await s.lease.query("SET SESSION AUTHORIZATION otr_trip_source_command_gateway");
        return await work(s.lease);
      } finally {
        s.close();
      }
    },
  };
  let reads = 0;
  let supplied: Uint8Array = bytes;
  const makeAuthority = (connection = connect) =>
    createSourcePdfAuthority(connection, hash, async (scope) => {
      expect(scope).toMatchObject({
        accountId: account,
        tripId: trip,
        sourceId: p.sourceId,
        representationId: originalId,
        sha256: pdfHash(bytes),
        byteCount: bytes.length,
      });
      reads++;
      return supplied;
    });
  const q = {
    derivativeVersion: 1 as const,
    operationId: randomUUID(),
    sourceId: p.sourceId,
    sourceRevision: 1,
    sourceRowRevision: 1,
    originalRepresentationId: originalId,
    originalRowRevision: registered ? 2 : 1,
    derivedRepresentationId: f.batch.request.materials[0].pin.representation_id,
  };
  await expect(makeAuthority().seal(account, trip, q)).rejects.toThrow(
    "PDF_AUTHORITY_CLOSED",
  );
  expect(reads).toBe(0);
  await admin.lease.query(
    "ALTER TABLE public.trip_source_pdf_gate DROP CONSTRAINT IF EXISTS trip_source_pdf_gate_enabled_check",
  );
  await admin.lease.query("UPDATE public.trip_source_pdf_gate SET enabled=true");
  await expect(
    makeAuthority().seal(account, trip, { ...q, sourceRowRevision: 2 }),
  ).rejects.toThrow("PDF_CONTEXT_STALE");
  await expect(
    makeAuthority().seal("00000000-0000-4000-8000-000000000002", trip, q),
  ).rejects.toThrow();
  await expect(makeAuthority().seal(account, randomUUID(), q)).rejects.toThrow();
  supplied = bytes.slice();
  supplied[0] = 0;
  await expect(makeAuthority().seal(account, trip, q)).rejects.toThrow(
    "PDF_PROFILE_UNSUPPORTED",
  );
  supplied = bytes;
  supplied = encodeProfilePdf(decoded.text.replace("NZ1", "NZ9").split("\n"));
  await expect(makeAuthority().seal(account, trip, q)).rejects.toThrow(
    "PDF_DERIVATIVE_MISMATCH",
  );
  supplied = bytes;
  await expect(
    makeAuthority().seal(account, trip, { ...q, sourceRevision: 2 }),
  ).rejects.toThrow("PDF_CONTEXT_STALE");
  const lostResponseConnection = {
    withLease: async <T>(work: (lease: CorePgLease) => Promise<T>): Promise<T> => {
      await connect.withLease(work);
      throw new TypeError("SYNTHETIC_SOURCE_RESPONSE_LOSS");
    },
  };
  await expect(
    makeAuthority(lostResponseConnection).seal(account, trip, q),
  ).rejects.toThrow("SYNTHETIC_SOURCE_RESPONSE_LOSS");
  const readsAfterLoss = reads;
  const receipt = await makeAuthority().seal(account, trip, q),
    beforeReads = reads;
  expect(reads).toBe(readsAfterLoss);
  // Discarded response then cold constructor recovery reads no bytes and returns the exact immutable seal.
  expect(await makeAuthority().seal(account, trip, q)).toEqual(receipt);
  expect(reads).toBe(beforeReads);
  await expect(
    makeAuthority().seal(account, trip, { ...q, operationId: randomUUID() }),
  ).rejects.toThrow("source_pdf_one_epoch_seal");
  await expect(
    makeAuthority().seal(account, trip, { ...q, sourceRowRevision: 2 }),
  ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
  await expect(
    makeAuthority().seal(account, trip, { ...q, producer: "apple-pdfkit" } as typeof q),
  ).rejects.toThrow();
  expect(
    (
      await admin.lease.query(
        "SELECT count(*)::int AS n FROM public.trip_source_pdf_seals",
      )
    ).rows[0].n,
  ).toBe(1);
  const forged = {
    ...receipt.body,
    request: { ...q, operationId: randomUUID() },
    pages: [{ pageIndex: 0, start: 0, end: decoded.textByteCount }],
  };
  forged.requestSha256 = await coreHashValue(
    "otr-source-pdf-request-v1",
    { accountId: account, tripId: trip, request: forged.request },
    hash,
  );
  forged.pageMapSha256 = pdfHash(canonicalCoreJson(forged.pages));
  const forgedSha = await coreHashValue("otr-source-pdf-seal-v1", forged, hash);
  await expect(
    connect.withLease((lease) =>
      lease.query("SELECT public.trip_source_pdf_commit($1::jsonb,$2)", [
        canonicalCoreJson(forged),
        forgedSha,
      ]),
    ),
  ).rejects.toThrow("INVALID_PDF_SEAL");
  await expect(
    connect.withLease((lease) =>
      lease.query("SELECT public.trip_source_pdf_commit($1::jsonb,$2)", [
        canonicalCoreJson({ ...receipt.body, producer: "apple-pdfkit" }),
        receipt.sealSha256,
      ]),
    ),
  ).rejects.toThrow();
  const alter = async (statement: string, params: unknown[] = []) => {
    await admin.lease.query(
      "ALTER TABLE public.trip_source_representations DISABLE TRIGGER USER",
    );
    try {
      await admin.lease.query(statement, params);
    } finally {
      await admin.lease.query(
        "ALTER TABLE public.trip_source_representations ENABLE TRIGGER USER",
      );
    }
  };
  await alter(
    "UPDATE public.trip_source_representations SET text_content=$2,payload_sha256=$3 WHERE id=$1::uuid",
    [
      q.derivedRepresentationId,
      decoded.text.replace("NZ1", "NZ9"),
      pdfHash(decoded.text.replace("NZ1", "NZ9")),
    ],
  );
  await expect(
    makeAuthority().seal(account, trip, { ...q, operationId: randomUUID() }),
  ).rejects.toThrow("PDF_DERIVATIVE_MISMATCH");
  await alter(
    "UPDATE public.trip_source_representations SET text_content=$2,payload_sha256=$3 WHERE id=$1::uuid",
    [q.derivedRepresentationId, decoded.text, pdfHash(decoded.text)],
  );
  await alter(
    "UPDATE public.trip_source_representations SET remote_state='LOST',row_revision=row_revision+1 WHERE id=$1::uuid",
    [originalId],
  );
  await expect(
    makeAuthority().seal(account, trip, { ...q, operationId: randomUUID() }),
  ).rejects.toThrow("PDF_CONTEXT_STALE");
  // Seal replay remains a historical receipt; it is never a new qualification decision.
  expect(await makeAuthority().seal(account, trip, q)).toEqual(receipt);
  await alter(
    "UPDATE public.trip_source_representations SET remote_state='VERIFIED',row_revision=$2 WHERE id=$1::uuid",
    [originalId, registered ? 2 : 1],
  );
  console.info(
    JSON.stringify({
      classification: "CP_FLIGHT_PDF_AUTH_01_SOURCE_SEAL",
      originalId,
      originalSha256: pdfHash(bytes),
      operationId: q.operationId,
      sealSha256: receipt.sealSha256,
      pages: receipt.body.pages,
      replay: "EXACT",
      negativeSealWrites: 0,
    }),
  );
  return {
    originalId,
    receipt,
    alter,
    async close() {
      await admin.lease.query("UPDATE public.trip_source_pdf_gate SET enabled=false");
    },
  };
}
