import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { loadTtrLabTestDriver } from "@/data/repositories/ttrLabTestDriver";
import { openTtrLabSelectionRepository } from "@/data/repositories/ttrLabSelectionRepository";
import { ttrIdentityKey, type TtrIdentity } from "@/domain/trip/ttr";
import type { TtrPresentationProjection } from "@/domain/trip/ttrState";
import { useTtrLabInteraction } from "@/features/ttr/useTtrLabInteraction";
import type { TtrLabFacts } from "@/features/ttr/labFixtures";
import type {
  G2TtrActionability,
  G2TtrInvalidation,
  G2TtrScope,
  G2TtrSession,
  G2TtrSessionPort,
  TtrOpenHandler,
} from "@/features/day-feed/ttrSessionBridge";

type Handle = Awaited<ReturnType<typeof openTtrLabSelectionRepository>>;
const unavailable = {
  read: async () => {
    throw new Error("TTR_LAB_STORAGE_UNAVAILABLE");
  },
  confirm: async () => {
    throw new Error("TTR_LAB_STORAGE_UNAVAILABLE");
  },
};
function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

/** G2 host only. Selection semantics and durable writes belong to the accepted TTR adapter. */
export function useTtrSessionHost(input: {
  facts: TtrLabFacts | null;
  accountId: string;
  tripId: string;
  date: string;
  generation: number;
  instant: string;
  visit: object;
  permitted: boolean;
}) {
  const [visit, setVisit] = useState({
    token: input.visit,
    generation: input.generation,
    number: 0,
  });
  const sameVisit = visit.token === input.visit && visit.generation === input.generation;
  const visitNumber = sameVisit ? visit.number : visit.number + 1;
  if (!sameVisit)
    setVisit({ token: input.visit, generation: input.generation, number: visitNumber });
  const scope: G2TtrScope = {
    accountId: input.accountId,
    tripId: input.tripId,
    localDate: input.date,
    generation: input.generation,
    visitKey: `g2-lab/${visitNumber}`,
  };
  const [replacement, setReplacement] = useState<{
    visitKey: string;
    projection: TtrPresentationProjection;
  } | null>(null);
  const projection =
    replacement?.visitKey === scope.visitKey
      ? replacement.projection
      : (input.facts?.projection ?? null);
  const latest = useRef({ ...input, scope, projection });
  useLayoutEffect(() => {
    latest.current = { ...input, scope, projection };
  });
  const committed = useRef<G2TtrSession | null>(null);
  const [authorization, setAuthorization] = useState<G2TtrSession | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastInvalidation, setLastInvalidation] = useState<G2TtrInvalidation | null>(
    null,
  );
  const activeSheet = useRef(false);
  const activeTransition = useRef<G2TtrActionability | null>(null);
  const failWrite = useRef(false);
  const queuedTap = useRef<(() => void) | null>(null);
  const [rejectedTaps, setRejectedTaps] = useState(0);
  const [scopeGuard, setScopeGuard] = useState<"UNTESTED" | "DENIED" | "FAILED">(
    "UNTESTED",
  );
  const closeHost = useCallback(() => {
    activeSheet.current = false;
    activeTransition.current = null;
    setSheetOpen(false);
  }, []);
  const [repository, setRepository] = useState<Handle["repository"] | null>(null);
  const handle = useRef<Handle | null>(null);
  const opening = useRef(false);
  const mounted = useRef(true);
  const [storageAttempt, setStorageAttempt] = useState(0);
  const enabled = typeof __DEV__ !== "undefined" && __DEV__ === true && !!input.facts;
  const requestContext = useCallback(() => {
    const s = latest.current.scope;
    return { accountId: s.accountId, tripId: s.tripId, generation: s.generation };
  }, []);
  const allowed = useCallback(
    () =>
      typeof __DEV__ !== "undefined" &&
      __DEV__ === true &&
      mounted.current &&
      latest.current.permitted &&
      !!latest.current.facts &&
      latest.current.scope.generation === getAccountGeneration(),
    [],
  );
  const resolve = useCallback(
    (identity: TtrIdentity) => {
      const current = latest.current;
      const p = current.projection;
      const session = committed.current;
      const action = session?.transitions.find((t) => t.key === ttrIdentityKey(identity));
      if (
        !allowed() ||
        !current.facts ||
        !p?.identity ||
        !action?.actionable ||
        session?.scope.visitKey !== current.scope.visitKey ||
        JSON.stringify(session.scope) !== JSON.stringify(current.scope) ||
        ttrIdentityKey(p.identity) !== ttrIdentityKey(identity) ||
        action.publicationVersion !== p.publicationVersion ||
        action.inputFingerprint !== p.inputFingerprint
      )
        return null;
      return {
        relation: {
          input: {
            ...current.facts.input,
            scope: { ...current.facts.input.scope, generation: current.scope.generation },
          },
          accessRevision: 1,
          publicationVersion: p.publicationVersion,
        },
        projection: p,
        presentation: { key: action.key, authorized: true },
      };
    },
    [allowed],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void handle.current?.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!enabled || handle.current || opening.current) return;
    opening.current = true;
    const options: Parameters<typeof openTtrLabSelectionRepository>[0] = {
      source: "SYNTHETIC_TTR_LAB",
      authorized: allowed,
      context: requestContext,
      clock: () => ({ instant: latest.current.instant, certain: true }),
      isCurrentRelation: async (ctx, relation) => {
        const p = latest.current.projection;
        const source = p?.identity ? resolve(p.identity) : null;
        return (
          !!source &&
          JSON.stringify(ctx) === JSON.stringify(requestContext()) &&
          JSON.stringify(relation) === JSON.stringify(source.relation)
        );
      },
    };
    void openTtrLabSelectionRepository(
      options,
      loadTtrLabTestDriver(() => {
        if (!failWrite.current) return false;
        failWrite.current = false;
        return true;
      }),
    )
      .then(async (next) => {
        if (!mounted.current) {
          await next.close();
          return;
        }
        handle.current = next;
        setRepository(next.repository);
      })
      .catch(() => {
        if (mounted.current) setRepository(null);
      })
      .finally(() => {
        opening.current = false;
      });
  }, [enabled, storageAttempt, allowed, requestContext, resolve]);
  const currentAuthorization =
    authorization && JSON.stringify(authorization.scope) === JSON.stringify(scope)
      ? authorization
      : null;
  const action = projection?.identity
    ? currentAuthorization?.transitions.find(
        (t) => t.key === ttrIdentityKey(projection.identity!),
      )
    : null;
  const adapterRef = useRef<ReturnType<typeof useTtrLabInteraction> | null>(null);
  const adapter = useTtrLabInteraction({
    context: {
      accountId: scope.accountId,
      tripId: scope.tripId,
      generation: scope.generation,
      travellerKey: input.facts?.input.scope.travellerKey ?? "synthetic-unavailable",
      localDate: input.date,
      visitKey: scope.visitKey,
    },
    authorization: {
      key: action?.key ?? "unavailable",
      version: currentAuthorization?.revision ?? 0,
      actionable: !!action?.actionable && input.permitted && !!repository,
    },
    repository: repository ?? unavailable,
    resolve,
    clock: () => latest.current.instant,
    publish: (next, key) => {
      const source = next.identity ? resolve(next.identity) : null;
      if (
        !source ||
        key !== source.presentation.key ||
        next.version !== "ttr-presentation/1" ||
        !Number.isSafeInteger(next.publicationVersion) ||
        next.publicationVersion < source.projection.publicationVersion ||
        next.publicationVersion !== adapterRef.current?.view.state?.publicationVersion ||
        !next.actions.openTtr ||
        ttrIdentityKey(next.actions.openTtr.identity) !== key ||
        next.actions.openTtr.publicationVersion !== next.publicationVersion ||
        next.modeOrigin !== "USER_CONFIRMED" ||
        next.visibility !== "SELECTED_MODE" ||
        JSON.stringify(next.anchors) !== JSON.stringify(source.projection.anchors)
      )
        return false;
      const accepted = immutable(structuredClone(next));
      latest.current = { ...latest.current, projection: accepted };
      setReplacement({ visitKey: latest.current.scope.visitKey, projection: accepted });
      return true;
    },
    dismissHost: closeHost,
  });
  useLayoutEffect(() => {
    adapterRef.current = adapter;
  });
  const sessionPort: G2TtrSessionPort = {
    scope,
    permitted: enabled && input.permitted,
    sheetOpen,
    onChange: (next) => {
      if (committed.current === next) return;
      const previous = committed.current;
      committed.current = next;
      setAuthorization(next);
      if (activeSheet.current || activeTransition.current) {
        const old = activeTransition.current;
        if (old) {
          const current = next.transitions.find((t) => t.key === old.key) ?? null;
          setLastInvalidation(
            immutable(
              structuredClone({
                version: "g2-ttr-invalidation/1" as const,
                revision: next.revision,
                scope: next.scope,
                previous: old,
                current,
                reason:
                  JSON.stringify(previous?.scope) !== JSON.stringify(next.scope)
                    ? "SCOPE_CHANGED"
                    : (current?.reason ?? "PROJECTION_REPLACED"),
              }),
            ),
          );
        }
        // The accepted TTR adapter takes revision in authorization and no-argument cancellation.
        adapterRef.current?.invalidate();
        closeHost();
      }
    },
  };
  const onOpenTtr: TtrOpenHandler = (intent, presentation) => {
    const current = latest.current;
    const source = resolve(intent.identity);
    if (
      activeSheet.current ||
      currentAuthorization !== committed.current ||
      !repository ||
      !source ||
      current.scope.visitKey !== scope.visitKey ||
      intent.publicationVersion !== source.projection.publicationVersion ||
      presentation.key !== source.presentation.key ||
      presentation.inputFingerprint !== source.projection.inputFingerprint
    ) {
      setRejectedTaps((n) => n + 1);
      return;
    }
    activeSheet.current = true;
    activeTransition.current =
      committed.current?.transitions.find((t) => t.key === presentation.key) ?? null;
    setSheetOpen(true);
    void adapter.onOpenTtr(intent, presentation);
  };
  const invalidated = !input.permitted || !currentAuthorization || !action?.actionable;
  if (invalidated && sheetOpen) setSheetOpen(false);
  useLayoutEffect(() => {
    if (invalidated) {
      activeSheet.current = false;
      adapterRef.current?.invalidate();
    }
  }, [invalidated]);
  return {
    projection,
    sessionPort,
    onOpenTtr,
    adapter,
    sheetOpen: sheetOpen && enabled && input.permitted,
    retryStorage: () => setStorageAttempt((n) => n + 1),
    storageReady: !!repository,
    rejectedTaps,
    lastInvalidation,
    scopeGuard,
    replacePublication: () => {
      const current = latest.current;
      const p = current.projection;
      if (!enabled || !p?.actions.openTtr) return;
      const next = immutable(
        structuredClone({
          ...p,
          publicationVersion: p.publicationVersion + 1,
          actions: {
            ...p.actions,
            openTtr: {
              ...p.actions.openTtr,
              publicationVersion: p.publicationVersion + 1,
            },
          },
        }),
      );
      latest.current = { ...current, projection: next };
      setReplacement({ visitKey: current.scope.visitKey, projection: next });
    },
    failNextConfirm: () => {
      if (enabled) failWrite.current = true;
    },
    queueTap: () => {
      const p = latest.current.projection;
      if (!enabled || !p?.actions.openTtr || !p.identity) return;
      const intent = structuredClone(p.actions.openTtr);
      const presentation = {
        key: ttrIdentityKey(p.identity),
        inputFingerprint: p.inputFingerprint,
      };
      queuedTap.current = () => onOpenTtr(intent, presentation);
    },
    dispatchQueuedTap: () => {
      const tap = queuedTap.current;
      queuedTap.current = null;
      tap?.();
    },
    testAccountGuard: async () => {
      if (!enabled) return;
      try {
        const unexpected = await openTtrLabSelectionRepository({
          source: "SYNTHETIC_TTR_LAB",
          authorized: () => true,
          context: () => ({
            ...requestContext(),
            accountId: "10000000-0000-4000-8000-000000000002",
          }),
          clock: () => ({ instant: latest.current.instant, certain: true }),
          isCurrentRelation: async () => false,
        });
        await unexpected.close();
        setScopeGuard("FAILED");
      } catch (error) {
        setScopeGuard(
          error instanceof Error && error.message === "TTR_LAB_NON_FIXTURE_SCOPE"
            ? "DENIED"
            : "FAILED",
        );
      }
    },
  };
}
