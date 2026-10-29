import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { CorePgLease } from "./tripCoreV2PgStorage";
export type PdfSourceScopeIdentity = {
  actorAccountId: string;
  tripId: string;
  sourceId: string;
};
// Internal opt-in only, inside the existing Source transaction. SQL owns eligibility.
export async function enterSourcePdfContinuousScope(
  lease: CorePgLease,
  scope: PdfSourceScopeIdentity,
) {
  const values = [scope.actorAccountId, scope.tripId, scope.sourceId].map((id) =>
    coreUuid.parse(id),
  );
  const result = (
    await lease.query(
      "SELECT public.trip_source_universal_pdf_enter($1::uuid,$2::uuid,$3::uuid) AS entered",
      values,
    )
  ).rows[0]?.entered;
  if (result !== true && result !== false) throw Error("PDF_SCOPE_RESPONSE_INVALID");
  return result;
}
