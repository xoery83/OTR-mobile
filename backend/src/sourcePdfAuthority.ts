import {
  sourcePdfSealRequestSchema,
  sourcePdfSealSchema,
  sourcePdfReceiptSchema,
  type SourcePdfSealRequest,
} from "../../src/domain/trip/sourcePdfAuthority";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  PDF_PROFILE,
  PDF_PROFILE_SHA,
  PDF_OPTIONS_SHA,
  verifySourcePdf,
} from "./sourcePdfProfile";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
export type SourcePdfCustodyReader = (scope: {
  accountId: string;
  tripId: string;
  sourceId: string;
  representationId: string;
  sha256: string;
  byteCount: number;
}) => Promise<Uint8Array>;
// Backend-only composition. Caller JSON cannot supply a producer, bytes proof or authority flag.
export function createSourcePdfAuthority(
  connection: CorePgConnection,
  hash: ImportHash,
  readOriginal: SourcePdfCustodyReader,
) {
  return {
    async seal(accountId: string, tripId: string, input: SourcePdfSealRequest) {
      const request = sourcePdfSealRequestSchema.parse(input);
      const requestSha256 = await coreHashValue(
        "otr-source-pdf-request-v1",
        { accountId, tripId, request },
        hash,
      );
      return connection.withLease(async (lease) => {
        let began = false;
        try {
          await lease.query("BEGIN");
          began = true;
          await lease.query("SET LOCAL statement_timeout='10s'");
          await lease.query("SET LOCAL lock_timeout='3s'");
          const prior = (
            await lease.query(
              "SELECT public.trip_source_pdf_lookup($1::uuid,$2::uuid,$3::uuid,$4) AS receipt",
              [accountId, tripId, request.operationId, requestSha256],
            )
          ).rows[0]?.receipt;
          if (prior) {
            const receipt = sourcePdfReceiptSchema.parse(prior);
            if (
              receipt.operationId !== request.operationId ||
              receipt.body.requestSha256 !== requestSha256 ||
              receipt.body.accountId !== accountId ||
              receipt.body.tripId !== tripId ||
              (await coreHashValue("otr-source-pdf-seal-v1", receipt.body, hash)) !==
                receipt.sealSha256
            )
              throw new Error("INVALID_PDF_RECEIPT");
            await lease.query("COMMIT");
            began = false;
            return receipt;
          }
          const context = (
            await lease.query(
              "SELECT public.trip_source_pdf_context($1::uuid,$2::uuid,$3::jsonb) AS context",
              [accountId, tripId, canonicalCoreJson(request)],
            )
          ).rows[0]?.context as {
            original: { payload_sha256: string; byte_count: number };
            derived: {
              text_content: string;
              payload_sha256: string;
              byte_count: number;
              transform_key: string;
              transform_version: string;
              transform_options_sha256: string;
            };
          };
          if (
            !context?.original ||
            !context.derived ||
            !Number.isSafeInteger(context.original.byte_count) ||
            context.original.byte_count < 1 ||
            context.original.byte_count > 65536
          )
            throw new Error("PDF_PROFILE_UNSUPPORTED");
          const bytes = await readOriginal({
            accountId,
            tripId,
            sourceId: request.sourceId,
            representationId: request.originalRepresentationId,
            sha256: context.original.payload_sha256,
            byteCount: context.original.byte_count,
          });
          const result = verifySourcePdf(bytes);
          if (
            result.originalSha256 !== context.original.payload_sha256 ||
            result.originalByteCount !== context.original.byte_count ||
            result.text !== context.derived.text_content ||
            result.textSha256 !== context.derived.payload_sha256 ||
            result.textByteCount !== context.derived.byte_count ||
            context.derived.transform_key !== PDF_PROFILE.transformKey ||
            context.derived.transform_version !== PDF_PROFILE.transformVersion ||
            context.derived.transform_options_sha256 !== PDF_OPTIONS_SHA
          )
            throw new Error("PDF_DERIVATIVE_MISMATCH");
          const body = sourcePdfSealSchema.parse({
            derivativeVersion: 1,
            request,
            accountId,
            tripId,
            requestSha256,
            profileId: PDF_PROFILE.id,
            profileSha256: PDF_PROFILE_SHA,
            producer: PDF_PROFILE.producer,
            originalSha256: result.originalSha256,
            originalByteCount: result.originalByteCount,
            textSha256: result.textSha256,
            textByteCount: result.textByteCount,
            transformOptionsSha256: PDF_OPTIONS_SHA,
            pageMapSha256: result.pageMapSha256,
            pages: result.pages,
          });
          const sealSha256 = await coreHashValue("otr-source-pdf-seal-v1", body, hash);
          const receipt = (
            await lease.query(
              "SELECT public.trip_source_pdf_commit($1::jsonb,$2) AS receipt",
              [canonicalCoreJson(body), sealSha256],
            )
          ).rows[0].receipt;
          const parsed = sourcePdfReceiptSchema.parse(receipt);
          if (
            parsed.sealSha256 !== sealSha256 ||
            canonicalCoreJson(parsed.body) !== canonicalCoreJson(body)
          )
            throw new Error("INVALID_PDF_RECEIPT");
          await lease.query("COMMIT");
          began = false;
          return parsed;
        } catch (error) {
          if (began)
            try {
              await lease.query("ROLLBACK");
            } catch {
              lease.retire();
            }
          throw error;
        }
      });
    },
  };
}
