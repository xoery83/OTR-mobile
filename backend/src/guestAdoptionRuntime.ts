import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  createGuestAdoptionHttpPorts,
  type GuestAdoptionHttpPorts,
} from "./guestAdoptionHttp";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

const scopeSchema = z.strictObject({
  accountId: coreUuid,
  sourceGuestLocalId: coreUuid,
  expiresAt: z.iso.datetime({ offset: true }),
});
export type GuestAdoptionDevRuntime = {
  readonly scope: Readonly<z.infer<typeof scopeSchema>>;
  readonly ports: GuestAdoptionHttpPorts;
};

// One explicit QA principal and Guest, existing primary connection, no SQL policy changes.
export function loadDevGuestAdoptionRuntime(
  environment: Record<string, string | undefined>,
  connection?: CorePgConnection,
): GuestAdoptionDevRuntime | undefined {
  const selected = environment.OTR_DEV_AUTH_GUEST_ADOPTION;
  if (selected === undefined || selected === "0") return undefined;
  let scope: GuestAdoptionDevRuntime["scope"], deadline: number;
  try {
    if (
      selected !== "1" ||
      environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
      environment.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
      !connection ||
      !environment.OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE ||
      environment.OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE.length > 1024
    )
      throw Error();
    scope = Object.freeze(
      scopeSchema.parse(JSON.parse(environment.OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE)),
    );
    deadline = Date.parse(scope.expiresAt);
    if (deadline - Date.now() > 30 * 60_000) throw Error();
  } catch {
    throw Error("GUEST_ADOPTION_RUNTIME_UNAVAILABLE");
  }
  const base = createGuestAdoptionHttpPorts(connection!);
  const bound = (
    actor: string,
    request: { targetAccountId: string; sourceGuestLocalId: string },
  ) => {
    if (
      actor !== scope.accountId ||
      request.targetAccountId !== scope.accountId ||
      request.sourceGuestLocalId !== scope.sourceGuestLocalId
    )
      throw Error("GUEST_ADOPTION_RUNTIME_SCOPE_CLOSED");
  };
  const mutationSignal = (signal: AbortSignal) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error("GUEST_ADOPTION_RUNTIME_SCOPE_CLOSED");
    return AbortSignal.any([signal, AbortSignal.timeout(remaining)]);
  };
  return Object.freeze({
    scope,
    ports: {
      preflight(actor, request, signal) {
        bound(actor, request);
        return base.preflight(actor, request, mutationSignal(signal));
      },
      stage(user, request, signal) {
        bound(user.id, request.grant);
        return base.stage(user, request, mutationSignal(signal));
      },
      publish(user, request, signal) {
        bound(user.id, request);
        return base.publish(user, request, mutationSignal(signal));
      },
      // Existing bound recovery remains possible after the mutation window expires.
      readStatus(actor, request, signal) {
        bound(actor, request);
        return base.readStatus(actor, request, signal);
      },
      readReceipt(actor, request, signal) {
        bound(actor, request);
        return base.readReceipt(actor, request, signal);
      },
      cancel(actor, request, signal) {
        bound(actor, request);
        return base.cancel(actor, request, signal);
      },
    },
  });
}
