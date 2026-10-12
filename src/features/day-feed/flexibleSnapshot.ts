import { useLayoutEffect, useRef, useState } from "react";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { validFlexibleBlock, type FlexibleBlockPort } from "./composition";

export type FlexibleSnapshotScope = Readonly<{
  accountId: string;
  tripId: string;
  localDate: string;
  generation: number;
}>;
export type FlexibleSnapshot = Readonly<{
  version: "g2-flexible-snapshot/1";
  scope: FlexibleSnapshotScope;
  revision: number;
  blocks: readonly FlexibleBlockPort[];
}>;
// The host declares current scope independently of the feature's publication.
export type FlexiblePublication = Readonly<{
  scope: FlexibleSnapshotScope;
  snapshot: FlexibleSnapshot | null;
}>;
export const flexibleScopeKey = (scope: FlexibleSnapshotScope) =>
  JSON.stringify([scope.accountId, scope.tripId, scope.localDate, scope.generation]);

export function validFlexibleScope(scope: FlexibleSnapshotScope): boolean {
  try {
    return (
      !!scope &&
      typeof scope.accountId === "string" &&
      !!scope.accountId &&
      typeof scope.tripId === "string" &&
      !!scope.tripId &&
      Number.isSafeInteger(scope.generation) &&
      scope.generation >= 0 &&
      validateCalendarDate(scope.localDate) === scope.localDate
    );
  } catch {
    return false;
  }
}

export function replaceFlexibleSnapshot(
  current: FlexibleSnapshot | null,
  next: FlexibleSnapshot | null,
  scope: FlexibleSnapshotScope,
): FlexibleSnapshot | null {
  if (
    !validFlexibleScope(scope) ||
    !next ||
    next.version !== "g2-flexible-snapshot/1" ||
    !validFlexibleScope(next.scope) ||
    flexibleScopeKey(next.scope) !== flexibleScopeKey(scope) ||
    !Number.isSafeInteger(next.revision) ||
    next.revision < 0 ||
    (current && next.revision <= current.revision) ||
    !Array.isArray(next.blocks) ||
    !next.blocks.every((block) => validFlexibleBlock(block, scope)) ||
    new Set(next.blocks.map((block) => block.id)).size !== next.blocks.length
  )
    return current;
  // Own immutable values so a publisher cannot mutate an accepted snapshot in place.
  return Object.freeze({
    ...next,
    scope: Object.freeze({ ...next.scope }),
    blocks: Object.freeze(
      next.blocks.map((block: FlexibleBlockPort) =>
        Object.freeze({
          ...block,
          itemIds: Object.freeze([...block.itemIds]),
          choices: Object.freeze(
            block.choices.map((choice) => Object.freeze({ ...choice })),
          ),
          ...(block.softWindow
            ? { softWindow: Object.freeze({ ...block.softWindow }) }
            : {}),
        }),
      ),
    ),
  });
}

export function useFlexibleSnapshot(
  publication: FlexiblePublication | undefined,
  view: { accountId: string; tripId: string; localDate: string },
) {
  const scope =
    publication &&
    validFlexibleScope(publication.scope) &&
    publication.scope.accountId === view.accountId &&
    publication.scope.tripId === view.tripId &&
    publication.scope.localDate === view.localDate
      ? publication.scope
      : null;
  const key = scope ? flexibleScopeKey(scope) : null;
  const [state, setState] = useState(() => ({
    key,
    epoch: 0,
    snapshot: scope ? replaceFlexibleSnapshot(null, publication!.snapshot, scope) : null,
  }));
  const current = useRef(state);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    const previous = current.current;
    let next =
      previous.key === key
        ? previous
        : { key, epoch: previous.epoch + 1, snapshot: null };
    const snapshot = scope
      ? replaceFlexibleSnapshot(next.snapshot, publication!.snapshot, scope)
      : null;
    if (snapshot !== next.snapshot) next = { ...next, snapshot };
    if (next !== previous) {
      current.current = next;
      setState(next);
    }
  }, [key, scope, publication]);
  const replace = (snapshot: FlexibleSnapshot): boolean => {
    const active = current.current;
    if (!mounted.current || !scope || active.key !== key || active.epoch !== state.epoch)
      return false;
    const next = replaceFlexibleSnapshot(active.snapshot, snapshot, scope);
    if (next === active.snapshot) return false;
    current.current = { ...active, snapshot: next };
    setState(current.current);
    return true;
  };
  return {
    snapshot: state.key === key ? state.snapshot : null,
    replace: publication ? replace : undefined,
  };
}
