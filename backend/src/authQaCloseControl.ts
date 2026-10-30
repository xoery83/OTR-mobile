import type { CorePgConnection } from "./tripCoreV2PgStorage";

// DEV host-only negative authority, never part of the HTTP or Native composition.
export async function runAuthQaCloseControl(
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
            "SELECT otr_auth_guest_composite.close_qa_policy($1::boolean) AS closed",
            [close],
          )
        ).rows[0];
        if (!row || typeof row.closed !== "boolean")
          throw Error("AUTH_QA_CLOSURE_UNCONFIRMED");
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
  if (closing && (await request(true)) !== true)
    throw Error("AUTH_QA_CLOSURE_UNCONFIRMED");
  const closed = await request(false);
  return {
    status: closed
      ? ("AUTH_QA_POLICY_CLOSED" as const)
      : ("AUTH_QA_POLICY_ACTIVE" as const),
    closed,
  };
}
