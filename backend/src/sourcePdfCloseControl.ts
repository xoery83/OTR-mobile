import type { CorePgConnection } from "./tripCoreV2PgStorage";
const actor = "f4b059c5-8241-4ffb-aa15-37fa25474543";
const trip = "825f79b2-4a9d-4535-a62e-43000ca50c4a";

// Negative authority only. Each verification gets a fresh READ ONLY transaction.
export async function runSourcePdfCloseControl(
  connection: CorePgConnection,
  closing: boolean,
) {
  async function request(close: boolean) {
    return connection.withLease(async (lease) => {
      let began = false;
      try {
        await lease.query(close ? "BEGIN" : "BEGIN READ ONLY");
        began = true;
        const row = (
          await lease.query(
            "SELECT public.trip_source_universal_pdf_close_control($1::uuid,$2::uuid,$3::boolean) AS closed",
            [actor, trip, close],
          )
        ).rows[0];
        if (!row || typeof row.closed !== "boolean")
          throw Error("PDF_CLOSURE_UNCONFIRMED");
        await lease.query("COMMIT");
        began = false;
        return row.closed;
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
  }
  if (closing && (await request(true)) !== true) throw Error("PDF_CLOSURE_UNCONFIRMED");
  const closed = await request(false);
  return {
    status: closed
      ? ("PDF_SCOPE_CLOSED_VERIFIED" as const)
      : ("PDF_SCOPE_ACTIVE" as const),
    closed,
  };
}
