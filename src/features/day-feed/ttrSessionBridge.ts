import type { composeDayStream, TransitionProjection } from "./composition";
import type { ComposedTransition } from "./TransitionRow";

export type G2TtrScope = Readonly<{
  accountId: string;
  tripId: string;
  localDate: string;
  generation: number;
  visitKey: string;
}>;
export type G2TtrActionability = Readonly<{
  key: string;
  identity: NonNullable<TransitionProjection["identity"]>;
  inputFingerprint: string | null;
  publicationVersion: number;
  actionable: boolean;
  reason: string | null;
}>;
export type G2TtrSession = Readonly<{
  version: "g2-ttr-session/1";
  revision: number;
  scope: G2TtrScope;
  transitions: readonly G2TtrActionability[];
}>;
export type G2TtrInvalidation = Readonly<{
  version: "g2-ttr-invalidation/1";
  revision: number;
  scope: G2TtrScope;
  previous: G2TtrActionability;
  current: G2TtrActionability | null;
  reason: string;
}>;
export type G2TtrSessionPort = Readonly<{
  scope: G2TtrScope;
  permitted: boolean;
  sheetOpen: boolean;
  onChange(session: G2TtrSession): void;
}>;
export type TtrOpenHandler = (
  intent: ComposedTransition["openTtr"],
  presentation: Pick<ComposedTransition, "key" | "inputFingerprint">,
) => void;
const identityKey = (id: G2TtrActionability["identity"]) =>
  JSON.stringify([
    id.accountId,
    id.tripId,
    id.fromEventId,
    id.toEventId,
    id.occurrenceDiscriminator,
  ]);
function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

/** G2 presentation only: eligibility comes from this Composer's actual output. */
export function composedTtrActionability(
  scope: G2TtrScope,
  stream: ReturnType<typeof composeDayStream>,
  projections: readonly TransitionProjection[],
  permitted: boolean,
): Omit<G2TtrSession, "revision"> {
  const transitions = projections.flatMap((p) => {
    if (!p.identity) return [];
    const key = identityKey(p.identity);
    const composed = stream.rows.find((r) => r.transition?.key === key)?.transition;
    const reason: G2TtrActionability["reason"] =
      p.identity.accountId !== scope.accountId || p.identity.tripId !== scope.tripId
        ? "SCOPE_MISMATCH"
        : !permitted
          ? "PERMISSION"
          : stream.immersive
            ? "OVERLAY"
            : !composed
              ? (p.unavailableReason ?? "NOT_COMPOSED")
              : null;
    return [
      {
        key,
        identity: p.identity,
        inputFingerprint: p.inputFingerprint ?? null,
        publicationVersion: p.publicationVersion,
        actionable:
          reason === null &&
          p.identity.accountId === scope.accountId &&
          p.identity.tripId === scope.tripId,
        reason,
      },
    ];
  });
  return { version: "g2-ttr-session/1", scope, transitions };
}

/** Committed-view lease. Old callbacks never revive after A → B → A. */
export function createG2TtrSessionBridge() {
  let current: G2TtrSession | null = null;
  let signature = "";
  let disposed = false;
  let dispatchBlocked = false;
  return {
    prepare(input: Omit<G2TtrSession, "revision">): G2TtrSession {
      if (current && JSON.stringify(input) === signature) return current;
      return immutable(
        structuredClone({ ...input, revision: (current?.revision ?? 0) + 1 }),
      );
    },
    commit(next: G2TtrSession, sheetOpen: boolean): boolean {
      if (disposed) return false;
      dispatchBlocked = sheetOpen;
      if (next === current) return false;
      current = next;
      const input = {
        version: next.version,
        scope: next.scope,
        transitions: next.transitions,
      };
      signature = JSON.stringify(input);
      return true;
    },
    accepts(
      captured: G2TtrSession,
      intent: Parameters<TtrOpenHandler>[0],
      presentation: Parameters<TtrOpenHandler>[1],
    ): boolean {
      if (disposed || dispatchBlocked || captured !== current) return false;
      const key = identityKey(intent.identity);
      const matches = current.transitions.filter((t) => t.key === key);
      return (
        matches.length === 1 &&
        matches[0].actionable &&
        presentation.key === key &&
        presentation.inputFingerprint === matches[0].inputFingerprint &&
        intent.publicationVersion === matches[0].publicationVersion
      );
    },
    current: () => current,
    dispose() {
      disposed = true;
      current = null;
    },
  };
}
