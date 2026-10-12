import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { expect } from "vitest";
import { createSourcePdfRegistration } from "../sourcePdfRegistration";
import type { CorePgLease } from "../tripCoreV2PgStorage";
import { session } from "./tripCoreV2Sql";
import { publicationTestHash as hash } from "./tripCoreV2CandidatePublication";
import { coreHashValue } from "../../../src/domain/trip/tripCoreV2Read";
import { importDigest } from "../../../src/domain/trip/flightImportReview";
import { canonicalCoreJson } from "../../../src/domain/trip/tripCoreV2Json";
import { type SourcePdfVerifyCommand } from "../../../src/domain/trip/sourcePdfRegistration";
import { pdfHash, encodeProfilePdf, verifySourcePdf } from "../sourcePdfProfile";
export async function registerPendingPdfFixture(
  admin: ReturnType<typeof session>,
  owned: string,
  actor: string,
  trip: string,
  source: string,
  original: string,
  derived: string,
  bytes: Uint8Array,
) {
  const directory = await mkdtemp(join(tmpdir(), "otr-pdf-source-retained-"));
  const objectKey = `v1/${trip}/${source}/${original}/payload`,
    file = join(directory, objectKey);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  // Only the acquisition descriptor is synthetic-seeded. New VERIFY/register run with all guards enabled.
  await admin.lease.query("BEGIN");
  for (const table of [
    "trip_sources",
    "trip_source_revisions",
    "trip_source_representations",
  ])
    await admin.lease.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
  await admin.lease.query(
    "INSERT INTO public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) VALUES($1::uuid,$2::uuid,$3::uuid,$1,repeat('0',64),'FILE','FILES','UNKNOWN',clock_timestamp(),1,1)",
    [source, trip, actor],
  );
  await admin.lease.query(
    "INSERT INTO public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES($1::uuid,1,clock_timestamp(),$2::uuid,$1,repeat('0',64),ARRAY[$3::uuid],'AS_SUPPLIED','ACQUISITION')",
    [source, actor, original],
  );
  await admin.lease.query(
    "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,mime_type,payload_sha256,byte_count,regenerability,created_at,storage_provider,storage_bucket,object_key,remote_state) VALUES($1::uuid,1,$2::uuid,1,'ORIGINAL','BINARY','application/pdf',$3,$4,'NOT_APPLICABLE',clock_timestamp(),'supabase_storage','trip-source-material',$5,'PENDING')",
    [original, source, pdfHash(bytes), bytes.length, objectKey],
  );
  await admin.lease.query("SET CONSTRAINTS ALL IMMEDIATE");
  for (const table of [
    "trip_sources",
    "trip_source_revisions",
    "trip_source_representations",
  ])
    await admin.lease.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
  await admin.lease.query("COMMIT");
  const canonicalBefore = (
    await admin.lease.query("SELECT count(*)::int AS n FROM public.itinerary_events")
  ).rows[0].n;
  const connection = {
    withLease: async <T>(work: (l: CorePgLease) => Promise<T>) => {
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
  const reader = async (scope: {
    accountId: string;
    tripId: string;
    sourceId: string;
    representationId: string;
    sha256: string;
    byteCount: number;
  }) => {
    expect(scope).toEqual({
      accountId: actor,
      tripId: trip,
      sourceId: source,
      representationId: original,
      sha256: pdfHash(bytes),
      byteCount: bytes.length,
    });
    reads++;
    return new Uint8Array(await readFile(file));
  };
  const api = () => createSourcePdfRegistration(connection, hash, reader);
  const payload = {
    material_revision: 1,
    expected_source_row_revision: 1,
    expected_source_state: {
      lifecycle: "ACTIVE" as const,
      retention_state: "RETAINED" as const,
    },
    representation_id: original,
    expected_representation_row_revision: 1,
    expected_representation_state: {
      remote_state: "PENDING" as const,
      retention_state: "RETAINED" as const,
    },
  };
  const verify: SourcePdfVerifyCommand = {
    contract_version: 1,
    command: "VERIFY_REPRESENTATION",
    operation_id: randomUUID(),
    operation_key: randomUUID(),
    actor_account_id: actor,
    trip_id: trip,
    source_id: source,
    operation_sha256: "0".repeat(64),
    payload,
  };
  verify.operation_sha256 = await importDigest(
    "otr-source-command-v1",
    [
      1,
      verify.command,
      verify.operation_id,
      verify.operation_key,
      actor,
      trip,
      source,
      [1, 1, ["ACTIVE", "RETAINED"], original, 1, ["PENDING", "RETAINED"]],
    ],
    hash,
  );
  try {
    await expect(api().verifyOriginal(actor, trip, verify)).rejects.toThrow(
      "TRIP_SOURCE_COMMANDS_DISABLED",
    );
    expect(reads).toBe(0);
    await admin.lease.query(
      "ALTER TABLE public.trip_source_command_gate DROP CONSTRAINT trip_source_gate_closed",
    );
    await admin.lease.query("UPDATE public.trip_source_command_gate SET enabled=true");
    await expect(api().verifyOriginal(actor, trip, verify)).rejects.toThrow(
      "PDF_AUTHORITY_CLOSED",
    );
    expect(reads).toBe(0);
    await admin.lease.query(
      "ALTER TABLE public.trip_source_pdf_gate DROP CONSTRAINT trip_source_pdf_gate_enabled_check",
    );
    await admin.lease.query("UPDATE public.trip_source_pdf_gate SET enabled=true");
    await rm(file);
    await expect(api().verifyOriginal(actor, trip, verify)).rejects.toThrow("ENOENT");
    expect(
      (
        await admin.lease.query(
          "SELECT count(*)::int AS n FROM public.trip_source_operations WHERE id=$1::uuid",
          [verify.operation_id],
        )
      ).rows[0].n,
    ).toBe(0);
    await writeFile(file, encodeProfilePdf(["changed retained bytes"]));
    await expect(api().verifyOriginal(actor, trip, verify)).rejects.toThrow(
      "MATERIAL_INTEGRITY_MISMATCH",
    );
    const quartz = JSON.parse(
      await readFile(
        new URL(
          "../../../src/data/interpretation/__fixtures__/nativeFlightPdf.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await writeFile(file, Buffer.from(quartz.originalBase64, "base64"));
    await expect(api().verifyOriginal(actor, trip, verify)).rejects.toThrow(
      "PDF_PROFILE_UNSUPPORTED",
    );
    await writeFile(file, bytes);
    const loss = {
      withLease: async <T>(work: (l: CorePgLease) => Promise<T>): Promise<T> => {
        await connection.withLease(work);
        throw new Error("SYNTHETIC_RESPONSE_LOSS");
      },
    };
    await expect(
      createSourcePdfRegistration(loss, hash, reader).verifyOriginal(actor, trip, verify),
    ).rejects.toThrow("SYNTHETIC_RESPONSE_LOSS");
    const afterLoss = reads;
    const verified = await api().verifyOriginal(actor, trip, verify);
    expect(reads).toBe(afterLoss);
    expect(verified).toMatchObject({
      outcome: "APPLIED",
      result_remote_state: "VERIFIED",
      result_representation_row_revision: 2,
    });
    await expect(api().verifyOriginal(randomUUID(), trip, verify)).rejects.toThrow(
      "SOURCE_ACCESS_DENIED",
    );
    const q = {
      derivativeVersion: 1 as const,
      operationId: randomUUID(),
      sourceId: source,
      sourceRevision: 1,
      sourceRowRevision: 1,
      originalRepresentationId: original,
      originalRowRevision: 2,
      derivedRepresentationId: derived,
      verificationOperationId: verify.operation_id,
      verificationResultSha256: String(verified.result_sha256),
    };
    await expect(
      api().registerDerived(actor, trip, { ...q, originalRowRevision: 1 }),
    ).rejects.toThrow("PDF_CONTEXT_STALE");
    await expect(
      api().registerDerived(actor, trip, { ...q, sourceRevision: 2 }),
    ).rejects.toThrow("PDF_CONTEXT_STALE");
    await expect(
      api().registerDerived(actor, trip, {
        ...q,
        verificationResultSha256: "0".repeat(64),
      }),
    ).rejects.toThrow("PDF_CONTEXT_STALE");
    await expect(
      api().registerDerived("00000000-0000-4000-8000-000000000002", trip, q),
    ).rejects.toThrow();
    await expect(api().registerDerived(actor, randomUUID(), q)).rejects.toThrow();
    await expect(
      api().registerDerived(actor, trip, { ...q, producer: "apple-pdfkit" } as typeof q),
    ).rejects.toThrow();
    await writeFile(file, encodeProfilePdf(["changed retained bytes"]));
    await expect(api().registerDerived(actor, trip, q)).rejects.toThrow(
      "MATERIAL_INTEGRITY_MISMATCH",
    );
    await writeFile(file, bytes);
    await expect(
      api().registerDerived(actor, trip, {
        ...q,
        originalRepresentationId: randomUUID(),
      }),
    ).rejects.toThrow("PDF_CONTEXT_STALE");
    await admin.lease.query(
      "ALTER TABLE public.trip_source_representations DISABLE TRIGGER USER",
    );
    await admin.lease.query(
      "UPDATE public.trip_source_representations SET payload_sha256=repeat('0',64) WHERE id=$1::uuid",
      [original],
    );
    await admin.lease.query(
      "ALTER TABLE public.trip_source_representations ENABLE TRIGGER USER",
    );
    await expect(api().registerDerived(actor, trip, q)).rejects.toThrow(
      "PDF_CONTEXT_STALE",
    );
    await admin.lease.query(
      "ALTER TABLE public.trip_source_representations DISABLE TRIGGER USER",
    );
    await admin.lease.query(
      "UPDATE public.trip_source_representations SET payload_sha256=$2 WHERE id=$1::uuid",
      [original, pdfHash(bytes)],
    );
    await admin.lease.query(
      "ALTER TABLE public.trip_source_representations ENABLE TRIGGER USER",
    );
    await admin.lease.query(
      "ALTER TABLE public.trip_source_representations DISABLE TRIGGER USER",
    );
    await admin.lease.query(
      "UPDATE public.trip_source_representations SET remote_state='LOST',row_revision=3 WHERE id=$1::uuid",
      [original],
    );
    await admin.lease.query(
      "ALTER TABLE public.trip_source_representations ENABLE TRIGGER USER",
    );
    await expect(api().registerDerived(actor, trip, q)).rejects.toThrow(
      "PDF_CONTEXT_STALE",
    );
    await admin.lease.query(
      "ALTER TABLE public.trip_source_representations DISABLE TRIGGER USER",
    );
    await admin.lease.query(
      "UPDATE public.trip_source_representations SET remote_state='VERIFIED',row_revision=2 WHERE id=$1::uuid",
      [original],
    );
    await admin.lease.query(
      "ALTER TABLE public.trip_source_representations ENABLE TRIGGER USER",
    );
    await expect(
      createSourcePdfRegistration(loss, hash, reader).registerDerived(actor, trip, q),
    ).rejects.toThrow("SYNTHETIC_RESPONSE_LOSS");
    const afterRegistrationLoss = reads;
    const registered = await api().registerDerived(actor, trip, q);
    expect(reads).toBe(afterRegistrationLoss);
    expect(await api().registerDerived(actor, trip, q)).toEqual(registered);
    await expect(
      api().registerDerived(actor, trip, { ...q, sourceRowRevision: 2 }),
    ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
    await expect(
      api().registerDerived(actor, trip, { ...q, operationId: randomUUID() }),
    ).rejects.toThrow("trip_source_pdf_registrations_derived_representation_id_key");
    const forged = {
      ...registered.body,
      request: { ...q, operationId: randomUUID(), derivedRepresentationId: randomUUID() },
      pages: [{ pageIndex: 0, start: 0, end: registered.body.textByteCount }],
    };
    forged.requestSha256 = await coreHashValue(
      "otr-source-pdf-registration-request-v1",
      { accountId: actor, tripId: trip, request: forged.request },
      hash,
    );
    forged.pageMapSha256 = pdfHash(canonicalCoreJson(forged.pages));
    const forgeryHash = await coreHashValue(
      "otr-source-pdf-registration-v1",
      forged,
      hash,
    );
    await expect(
      connection.withLease((l) =>
        l.query("SELECT public.trip_source_pdf_registration_commit($1::jsonb,$2,$3)", [
          canonicalCoreJson(forged),
          forgeryHash,
          verifySourcePdf(bytes).text,
        ]),
      ),
    ).rejects.toThrow("INVALID_PDF_REGISTRATION");
    const wrongOptions = {
      ...registered.body,
      request: { ...q, operationId: randomUUID(), derivedRepresentationId: randomUUID() },
      transformOptionsSha256: "0".repeat(64),
    };
    wrongOptions.requestSha256 = await coreHashValue(
      "otr-source-pdf-registration-request-v1",
      { accountId: actor, tripId: trip, request: wrongOptions.request },
      hash,
    );
    const wrongOptionsSha = await coreHashValue(
      "otr-source-pdf-registration-v1",
      wrongOptions,
      hash,
    );
    await expect(
      connection.withLease((l) =>
        l.query("SELECT public.trip_source_pdf_registration_commit($1::jsonb,$2,$3)", [
          canonicalCoreJson(wrongOptions),
          wrongOptionsSha,
          verifySourcePdf(bytes).text,
        ]),
      ),
    ).rejects.toThrow("INVALID_PDF_REGISTRATION");
    expect(
      (
        await admin.lease.query(
          "SELECT count(*)::int AS n FROM public.trip_source_pdf_seals",
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await admin.lease.query(
          "SELECT current_material_revision,row_revision FROM public.trip_sources WHERE id=$1::uuid",
          [source],
        )
      ).rows[0],
    ).toEqual({ current_material_revision: 1, row_revision: 1 });
    expect(
      (await admin.lease.query("SELECT count(*)::int AS n FROM public.itinerary_events"))
        .rows[0].n,
    ).toBe(canonicalBefore);
    console.info(
      JSON.stringify({
        classification: "CP_FLIGHT_PDF_SOURCE_02_OWNING_REGISTRATION",
        sourceId: source,
        originalId: original,
        derivedId: derived,
        objectKey,
        originalSha256: pdfHash(bytes),
        originalByteCount: bytes.length,
        verificationOperationId: verify.operation_id,
        verificationResultSha256: verified.result_sha256,
        registrationOperationId: q.operationId,
        registrationSha256: registered.registrationSha256,
        pages: registered.body.pages,
        retainedFileRead: true,
        lostVerifyAndRegistrationResponseRecovered: true,
        preSealAuthority: false,
        sourceMaterialRevision: 1,
        sourceRowRevision: 1,
        originalRowRevision: 2,
        ordinaryQuartz: "REVIEW",
        newCanonicalItems: 0,
      }),
    );
    return registered;
  } finally {
    await admin.lease.query("UPDATE public.trip_source_command_gate SET enabled=false");
    await admin.lease.query("UPDATE public.trip_source_pdf_gate SET enabled=false");
    await rm(directory, { recursive: true, force: true });
  }
}
