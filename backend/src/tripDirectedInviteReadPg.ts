import type { DirectedInviteReadPort } from "./tripDirectedInviteReadHttp";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  directedInviteRecipientsSchema,
  directedInvitationDetailSchema,
  directedIncomingInvitationsSchema,
} from "../../src/data/api/directedInviteReadContracts";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";

// Explicit server composition only; connection presence does not enable this reader.
export function composeDirectedInviteReader(
  connection: CorePgConnection,
  options: Readonly<{ enabled: boolean }>,
): DirectedInviteReadPort | undefined {
  if (options.enabled !== true) return undefined;
  async function read(method: "recipients" | "invitation" | "incoming", actor: string, id: string | null) {
    coreUuid.parse(actor);
    if (method === "incoming") {
      if (id !== null) throw Error("DIRECTED_INVITE_READ_OBJECT_INVALID");
    } else coreUuid.parse(id);
    return connection.withLease(async (lease) => {
      // Existing invite authority takes row locks; business-read-only, not PG READ ONLY.
      await lease.query("BEGIN");
      let committing = false;
      try {
        const rows = (await lease.query(
          "SELECT public.trip_directed_invite_read($1::text,$2::uuid,$3::uuid) AS result",
          [method, actor, id],
        )).rows;
        if (rows.length !== 1 || !("result" in rows[0]))
          throw Error("DIRECTED_INVITE_READ_RESULT_MISSING");
        const raw = rows[0].result;
        const value = raw === null ? null : method === "incoming"
          ? directedIncomingInvitationsSchema.parse(raw) : method === "recipients"
          ? directedInviteRecipientsSchema.parse(raw)
          : directedInvitationDetailSchema.parse(raw);
        if (value && (value.accountId !== actor ||
          (method === "recipients" && directedInviteRecipientsSchema.parse(value).tripId !== id) ||
          (method === "invitation" && directedInvitationDetailSchema.parse(value).invitation.inviteId !== id)))
          throw Error("DIRECTED_INVITE_READ_SCOPE_MISMATCH");
        committing = true;
        await lease.query("COMMIT");
        return value;
      } catch (error) {
        if (committing) lease.retire();
        else await lease.query("ROLLBACK").catch(() => lease.retire());
        throw error;
      }
    });
  }
  return {
    async incoming(scope) {
      const value = await read("incoming", scope.accountId, null);
      return value === null ? null : directedIncomingInvitationsSchema.parse(value);
    },
    async recipients(scope) {
      const value = await read("recipients", scope.accountId, scope.tripId);
      return value === null ? null : directedInviteRecipientsSchema.parse(value);
    },
    async invitation(scope) {
      const value = await read("invitation", scope.accountId, scope.inviteId);
      return value === null ? null : directedInvitationDetailSchema.parse(value);
    },
  };
}
