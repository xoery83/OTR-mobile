import { randomUUID } from "node:crypto";
import {
  sourcePdfVerifyCommandSchema,
  sourcePdfVerifyReceiptSchema,
  type SourcePdfVerifyCommand,
} from "../../src/domain/trip/sourcePdfRegistration";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { importDigest, type ImportHash } from "../../src/domain/trip/flightImportReview";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import type { SourcePdfCustodyReader } from "./sourcePdfAuthority";
import {
  sourcePdfV2RegistrationRequestSchema as sourcePdfRegistrationRequestSchema,
  sourcePdfV2RegistrationBodySchema as sourcePdfRegistrationBodySchema,
  sourcePdfV2RegistrationReceiptSchema as sourcePdfRegistrationReceiptSchema,
  type SourcePdfV2RegistrationRequest as SourcePdfRegistrationRequest,
  PDF_V2_OPTIONS_SHA as PDF_OPTIONS_SHA,
} from "./sourcePdfV2Contracts";
import { profile as PDF_PROFILE } from "../../scripts/source-pdf-v2-linux/profile.mjs";
import {
  createSourcePdfV2LinuxVerifier,
  SOURCE_PDF_V2_LINUX_PROFILE_SHA as PDF_PROFILE_SHA,
} from "./sourcePdfV2LinuxVerifier";

// No route/startup binding. Version-2 SQL/profile installation requires its separate protected gate.
export function createSourcePdfV2Registration(
  connection: CorePgConnection,
  hash: ImportHash,
  readOriginal: SourcePdfCustodyReader,
) {
  const verify = createSourcePdfV2LinuxVerifier(readOriginal);
  async function transaction<T>(work: (lease: CorePgLease) => Promise<T>) {
    return connection.withLease(async (lease) => {
      let began = false;
      try {
        await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        began = true;
        await lease.query("SET LOCAL statement_timeout='10s'");
        await lease.query("SET LOCAL lock_timeout='3s'");
        const value = await work(lease);
        await lease.query("COMMIT");
        began = false;
        return value;
      } catch (e) {
        if (began)
          try {
            await lease.query("ROLLBACK");
          } catch {
            lease.retire();
          }
        throw e;
      }
    });
  }
  async function read(
    accountId: string,
    tripId: string,
    sourceId: string,
    representationId: string,
    original: Record<string, unknown>,
  ) {
    if (
      original.storage_provider !== "supabase_storage" ||
      original.storage_bucket !== "trip-source-material" ||
      original.object_key !== `v1/${tripId}/${sourceId}/${representationId}/payload` ||
      typeof original.payload_sha256 !== "string" ||
      !Number.isSafeInteger(original.byte_count) ||
      Number(original.byte_count) < 1 ||
      Number(original.byte_count) > PDF_PROFILE.maxOriginalBytes
    )
      throw new Error("PDF_CUSTODY_UNSUPPORTED");
    const result = await verify({
      accountId,
      tripId,
      sourceId,
      representationId,
      sha256: original.payload_sha256,
      byteCount: Number(original.byte_count),
    });
    if (
      result.originalSha256 !== original.payload_sha256 ||
      result.originalByteCount !== original.byte_count
    )
      throw new Error("MATERIAL_INTEGRITY_MISMATCH");
    return result;
  }
  async function validateVerify(input: unknown, q: SourcePdfVerifyCommand) {
    const r = sourcePdfVerifyReceiptSchema.parse(input);
    if (
      r.source_id !== q.source_id ||
      r.operation_id !== q.operation_id ||
      r.operation_key !== q.operation_key ||
      r.operation_sha256 !== q.operation_sha256 ||
      r.command !== q.command ||
      r.source_id !== q.source_id ||
      r.representation_id !== q.payload.representation_id ||
      (r.outcome === "APPLIED" &&
        (r.error_code !== null ||
          r.result_source_row_revision !== q.payload.expected_source_row_revision ||
          r.result_material_revision !== q.payload.material_revision ||
          r.result_representation_row_revision !==
            q.payload.expected_representation_row_revision + 1 ||
          r.result_remote_state !== "VERIFIED" ||
          r.result_retention_state !== "RETAINED" ||
          !r.result_verified_at)) ||
      r.result_sha256 !==
        (await importDigest(
          "otr-source-result-v1",
          [
            1,
            r.operation_id,
            r.command,
            r.operation_sha256,
            r.outcome,
            r.error_code,
            r.completed_at,
            r.result_source_row_revision,
            r.result_material_revision,
            r.result_representation_row_revision,
            r.result_remote_state,
            r.result_retention_state,
            r.result_action_id,
            r.result_verified_at,
          ],
          hash,
        ))
    )
      throw new Error("REPLAY_UNAVAILABLE");
    return r;
  }
  return {
    async verifyOriginal(
      accountId: string,
      tripId: string,
      input: SourcePdfVerifyCommand,
    ) {
      const q = sourcePdfVerifyCommandSchema.parse(input);
      if (q.actor_account_id !== accountId || q.trip_id !== tripId)
        throw new Error("SOURCE_ACCESS_DENIED");
      return transaction(async (lease) => {
        const attempt = randomUUID();
        const context = (
          await lease.query(
            "SELECT public.trip_source_pdf_v2_original_begin($1::uuid,$2,$3::uuid) AS context",
            [accountId, canonicalCoreJson(q), attempt],
          )
        ).rows[0].context as {
          receipt?: Record<string, unknown>;
          original: Record<string, unknown>;
        };
        if (context.receipt) return validateVerify(context.receipt, q);
        const decoded = await read(
          accountId,
          tripId,
          q.source_id,
          q.payload.representation_id,
          context.original,
        );
        const r = (
          await lease.query(
            "SELECT public.trip_source_pdf_v2_original_finish($1::uuid,$2,$3::uuid,$4,$5::bigint) AS receipt",
            [
              accountId,
              canonicalCoreJson(q),
              attempt,
              decoded.originalSha256,
              decoded.originalByteCount,
            ],
          )
        ).rows[0].receipt as Record<string, unknown>;
        return validateVerify(r, q);
      });
    },
    async registerDerived(
      accountId: string,
      tripId: string,
      input: SourcePdfRegistrationRequest,
    ) {
      const request = sourcePdfRegistrationRequestSchema.parse(input);
      const requestSha256 = await coreHashValue(
        "otr-source-pdf-registration-request-v2",
        { accountId, tripId, request },
        hash,
      );
      return transaction(async (lease) => {
        const prior = (
          await lease.query(
            "SELECT public.trip_source_pdf_v2_registration_lookup($1::uuid,$2::uuid,$3::uuid,$4) AS receipt",
            [accountId, tripId, request.operationId, requestSha256],
          )
        ).rows[0].receipt;
        if (prior) {
          const r = sourcePdfRegistrationReceiptSchema.parse(prior);
          if (
            r.operationId !== request.operationId ||
            r.body.accountId !== accountId ||
            r.body.tripId !== tripId ||
            r.body.requestSha256 !== requestSha256 ||
            r.registrationSha256 !==
              (await coreHashValue("otr-source-pdf-registration-v2", r.body, hash))
          )
            throw new Error("REPLAY_UNAVAILABLE");
          return r;
        }
        const original = (
          await lease.query(
            "SELECT public.trip_source_pdf_v2_registration_context($1::uuid,$2::uuid,$3::jsonb) AS original",
            [accountId, tripId, canonicalCoreJson(request)],
          )
        ).rows[0].original as Record<string, unknown>;
        const decoded = await read(
          accountId,
          tripId,
          request.sourceId,
          request.originalRepresentationId,
          original,
        );
        const body = sourcePdfRegistrationBodySchema.parse({
          derivativeVersion: 2,
          request,
          accountId,
          tripId,
          requestSha256,
          profileId: PDF_PROFILE.id,
          profileSha256: PDF_PROFILE_SHA,
          producer: PDF_PROFILE.producer,
          originalSha256: decoded.originalSha256,
          originalByteCount: decoded.originalByteCount,
          textSha256: decoded.textSha256,
          textByteCount: decoded.textByteCount,
          transformOptionsSha256: PDF_OPTIONS_SHA,
          pageMapSha256: decoded.pageMapSha256,
          pages: decoded.pages,
        });
        const digest = await coreHashValue("otr-source-pdf-registration-v2", body, hash);
        const result = sourcePdfRegistrationReceiptSchema.parse(
          (
            await lease.query(
              "SELECT public.trip_source_pdf_v2_registration_commit($1::jsonb,$2,$3) AS receipt",
              [canonicalCoreJson(body), digest, decoded.text],
            )
          ).rows[0].receipt,
        );
        if (
          result.registrationSha256 !== digest ||
          canonicalCoreJson(result.body) !== canonicalCoreJson(body)
        )
          throw new Error("REPLAY_UNAVAILABLE");
        return result;
      });
    },
  };
}
