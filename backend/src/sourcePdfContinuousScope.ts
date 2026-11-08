import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { z } from "zod";
export type PdfSourceScopeIdentity = {
  actorAccountId: string;
  tripId: string;
  sourceId: string;
  commandFrame?:
    | {
        command: Json;
        ordinaryReserve?: {
          nodeId: string;
          producerId: string;
          providerInstanceSha256: string;
        };
      }
    | { pdfRegistration: Json }
    | { pdfSeal: Json }
    | {
        negativeUnknown: {
          operationId: string;
          operationSha256: string;
          attemptId: string;
          ownerRun: string;
          ownerFence: number;
        };
      };
};
// Internal opt-in only, inside the existing Source transaction. SQL owns eligibility.
export async function enterSourcePdfContinuousScope(
  lease: CorePgLease,
  scope: PdfSourceScopeIdentity,
) {
  const values = [scope.actorAccountId, scope.tripId, scope.sourceId].map((id) =>
    coreUuid.parse(id),
  );
  const operation = z
    .object({
      operationId: coreUuid,
      operationSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .safeParse(scope);
  const frame = scope.commandFrame ?? (operation.success ? operation.data : undefined);
  const result = (
    await lease.query(
      frame
        ? "SELECT public.trip_source_universal_pdf_enter($1::uuid,$2::uuid,$3::uuid,$4::jsonb) AS entered"
        : "SELECT public.trip_source_universal_pdf_enter($1::uuid,$2::uuid,$3::uuid) AS entered",
      frame ? [...values, canonicalCoreJson(frame as Json)] : values,
    )
  ).rows[0]?.entered;
  if (result !== true && result !== false) throw Error("PDF_SCOPE_RESPONSE_INVALID");
  return result;
}
