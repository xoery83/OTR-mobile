import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  tripRealtimeLeaseSchema,
  type TripRealtimeLease,
} from "../../src/domain/auth/tripRealtimeAuthorization";
import type { DevBackendGateway } from "./app";
import { isNormalAccount } from "./authAccountQualification";
import { isOAuthResourceToken } from "./authResourceTokenBoundary";

const nilUuid = "00000000-0000-0000-0000-000000000000";
const admissionInput = z.strictObject({
  tripId: coreUuid,
  localGeneration: z.number().int().nonnegative().safe(),
});
export type TripPrivateRealtimeAdmissionPort = {
  // Must atomically authorize the current normal Session/Actor and join privately.
  // Recheck the same bearer/current access inside admission; never log or return it.
  // The owning transport independently enforces actual access expiry and revoke.
  authorizeAndJoin(
    scope: Readonly<{
      accountId: string;
      tripId: string;
      localGeneration: number;
      accessToken: string;
    }>,
    signal: AbortSignal,
  ): Promise<{ lease: TripRealtimeLease; close(): void }>;
};

// Dormant normal-Auth → owning-port boundary, not Core authorization or a Session authority.
// Denial/expiry closes only this handle; it never reauthenticates or deletes offline cache.
export function createTripPrivateRealtimeAdmission(deps: {
  gateway: Pick<DevBackendGateway, "validateAccessToken">;
  port?: TripPrivateRealtimeAdmissionPort;
}) {
  return async (request: Request, raw: unknown) => {
    if (!deps.port) throw Error("PRIVATE_REALTIME_ADMISSION_CLOSED");
    request.signal.throwIfAborted();
    const input = admissionInput.parse(raw);
    const token = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
    if (!token || isOAuthResourceToken(token))
      throw Error("PRIVATE_REALTIME_NORMAL_ACCOUNT_REQUIRED");
    const user = await deps.gateway.validateAccessToken(token);
    request.signal.throwIfAborted();
    if (!user || !isNormalAccount(user))
      throw Error("PRIVATE_REALTIME_NORMAL_ACCOUNT_REQUIRED");
    const scope = Object.freeze({ accountId: user.id, accessToken: token, ...input });
    const controller = new AbortController();
    let handle:
      | Awaited<ReturnType<TripPrivateRealtimeAdmissionPort["authorizeAndJoin"]>>
      | undefined;
    let closed = false;
    let transportClosed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closeTransport = () => {
      if (!handle || transportClosed) return;
      transportClosed = true;
      try {
        handle.close();
      } catch {
        /* Cleanup failure must not reopen or retry admission. */
      }
    };
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      request.signal.removeEventListener("abort", close);
      controller.abort();
      closeTransport();
    };
    request.signal.addEventListener("abort", close, { once: true });
    try {
      if (request.signal.aborted) throw Error("PRIVATE_REALTIME_CANCELLED");
      handle = await deps.port.authorizeAndJoin(scope, controller.signal);
      const lease = tripRealtimeLeaseSchema.parse(handle.lease);
      // Access revision is supplied by the atomic owner, never derived from Core content revision.
      const remaining = lease.expiresAt - Date.now();
      if (
        closed ||
        request.signal.aborted ||
        lease.accountId !== user.id ||
        lease.tripId !== input.tripId ||
        lease.actorPersonId === nilUuid ||
        lease.leaseId === nilUuid ||
        remaining <= 0 ||
        remaining > 2_147_483_647
      )
        throw Error("PRIVATE_REALTIME_ADMISSION_REJECTED");
      timer = setTimeout(close, remaining);
      return Object.freeze({
        lease: Object.freeze(lease),
        localGeneration: input.localGeneration,
        close,
      });
    } catch (error) {
      close();
      closeTransport(); // A transport may resolve after its parent cancellation already closed.
      throw error;
    }
  };
}
