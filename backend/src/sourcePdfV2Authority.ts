import {
  sourcePdfV2SealRequestSchema as sourcePdfSealRequestSchema,
  sourcePdfV2SealSchema as sourcePdfSealSchema,
  sourcePdfV2ReceiptSchema as sourcePdfReceiptSchema,
  type SourcePdfV2SealRequest as SourcePdfSealRequest,
  PDF_V2_OPTIONS_SHA as PDF_OPTIONS_SHA,
} from "./sourcePdfV2Contracts";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { profile as PDF_PROFILE } from "../../scripts/source-pdf-v2-linux/profile.mjs";
import {
  createSourcePdfV2LinuxVerifier,
  SOURCE_PDF_V2_LINUX_PROFILE_SHA as PDF_PROFILE_SHA,
} from "./sourcePdfV2LinuxVerifier";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import type { SourcePdfCustodyReader } from "./sourcePdfAuthority";
// Local implementation candidate only; no route/startup binding or /1 writer change.
export function createSourcePdfV2Authority(
  connection: CorePgConnection,
  hash: ImportHash,
  readOriginal: SourcePdfCustodyReader,
) {
  const verify = createSourcePdfV2LinuxVerifier(readOriginal);
  return {
    async seal(accountId: string, tripId: string, input: SourcePdfSealRequest) {
      const request = sourcePdfSealRequestSchema.parse(input);
      const requestSha256 = await coreHashValue(
        "otr-source-pdf-request-v2",
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
              "SELECT public.trip_source_pdf_v2_lookup($1::uuid,$2::uuid,$3::uuid,$4) AS receipt",
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
              (await coreHashValue("otr-source-pdf-seal-v2", receipt.body, hash)) !==
                receipt.sealSha256
            )
              throw new Error("INVALID_PDF_RECEIPT");
            await lease.query("COMMIT");
            began = false;
            return receipt;
          }
          const context = (
            await lease.query(
              "SELECT public.trip_source_pdf_v2_context($1::uuid,$2::uuid,$3::jsonb) AS context",
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
            context.original.byte_count > PDF_PROFILE.maxOriginalBytes
          )
            throw new Error("PDF_PROFILE_UNSUPPORTED");
          const result = await verify({
            accountId,
            tripId,
            sourceId: request.sourceId,
            representationId: request.originalRepresentationId,
            sha256: context.original.payload_sha256,
            byteCount: context.original.byte_count,
          });
          if (
            result.originalSha256 !== context.original.payload_sha256 ||
            result.originalByteCount !== context.original.byte_count ||
            result.text !== context.derived.text_content ||
            result.textSha256 !== context.derived.payload_sha256 ||
            result.textByteCount !== context.derived.byte_count ||
            context.derived.transform_key !== "otr.pdf.qpdf-poppler" ||
            context.derived.transform_version !== "2" ||
            context.derived.transform_options_sha256 !== PDF_OPTIONS_SHA
          )
            throw new Error("PDF_DERIVATIVE_MISMATCH");
          const body = sourcePdfSealSchema.parse({
            derivativeVersion: 2,
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
          const sealSha256 = await coreHashValue("otr-source-pdf-seal-v2", body, hash);
          const receipt = (
            await lease.query(
              "SELECT public.trip_source_pdf_v2_commit($1::jsonb,$2) AS receipt",
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
