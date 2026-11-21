import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  directedInviteRecipientsSchema,
  directedIncomingInvitationsSchema,
  directedInvitationDetailSchema,
} from "../../src/data/api/directedInviteReadContracts";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";

// Owning provider must enforce current invite authority/known co-travel recipients,
// or exact registered recipient proof, before returning any limited preview data.
export type DirectedInviteReadPort = Readonly<{
  // An older provider without discovery remains unavailable, never a fabricated empty inbox.
  incoming?(scope: {
    accountId: string;
  }): Promise<z.infer<typeof directedIncomingInvitationsSchema> | null>;
  recipients(scope: {
    accountId: string;
    tripId: string;
  }): Promise<z.infer<typeof directedInviteRecipientsSchema> | null>;
  invitation(scope: {
    accountId: string;
    inviteId: string;
  }): Promise<z.infer<typeof directedInvitationDetailSchema> | null>;
}>;
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });
const error = (status: number, code: string) => reply(status, { error: { code } });

// Isolated domain handler only: no app/bootstrap mount or database capability is installed here.
export async function tripDirectedInviteReadBoundary(
  request: Request,
  user: AuthenticatedAccount,
  port?: DirectedInviteReadPort,
) {
  if (!isNormalAccount(user))
    return error(403, "DIRECTED_INVITE_NORMAL_ACCOUNT_REQUIRED");
  const url = new URL(request.url);
  const recipients = /^\/v2\/trips\/([^/]+)\/directed-invite-recipients$/.exec(
    url.pathname,
  );
  const invitation = /^\/v1\/account\/directed-invitations\/([^/]+)$/.exec(url.pathname);
  const incoming = url.pathname === "/v1/account/directed-invitations";
  const id = coreUuid.safeParse(recipients?.[1] ?? invitation?.[1]);
  if ((!incoming && ((!recipients && !invitation) || !id.success)) || url.search)
    return error(400, "DIRECTED_INVITE_READ_INVALID");
  if (request.method !== "GET") return error(405, "METHOD_NOT_ALLOWED");
  if (!port || request.signal.aborted)
    return error(503, "DIRECTED_INVITE_READ_UNAVAILABLE");
  try {
    if (incoming) {
      if (!port.incoming) return error(503, "DIRECTED_INVITE_READ_UNAVAILABLE");
      const raw = await port.incoming({ accountId: user.id });
      if (raw === null) return error(404, "DIRECTED_INVITE_NOT_VISIBLE");
      const value = directedIncomingInvitationsSchema.parse(raw);
      if (request.signal.aborted || value.accountId !== user.id)
        throw Error("DIRECTED_INCOMING_SCOPE_MISMATCH");
      return reply(200, value);
    }
    if (!id.success) return error(400, "DIRECTED_INVITE_READ_INVALID");
    if (recipients) {
      const raw = await port.recipients({ accountId: user.id, tripId: id.data });
      if (raw === null) return error(404, "DIRECTED_INVITE_NOT_VISIBLE");
      const value = directedInviteRecipientsSchema.parse(raw);
      if (
        request.signal.aborted ||
        value.accountId !== user.id ||
        value.tripId !== id.data
      )
        throw Error("DIRECTED_INVITE_READER_SCOPE_MISMATCH");
      return reply(200, value);
    }
    const raw = await port.invitation({ accountId: user.id, inviteId: id.data });
    if (raw === null) return error(404, "DIRECTED_INVITE_NOT_VISIBLE");
    const value = directedInvitationDetailSchema.parse(raw);
    if (
      request.signal.aborted ||
      value.accountId !== user.id ||
      value.invitation.inviteId !== id.data
    )
      throw Error("DIRECTED_INVITE_READER_SCOPE_MISMATCH");
    return reply(200, value);
  } catch {
    return error(503, "DIRECTED_INVITE_READ_UNAVAILABLE");
  }
}
