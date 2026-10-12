import type { FlexibleBlockPort } from "@/features/day-feed/composition";
import {
  flexibleScopeKey,
  replaceFlexibleSnapshot,
  type FlexibleSnapshot,
  type FlexibleSnapshotScope,
} from "@/features/day-feed/flexibleSnapshot";
import { initialState, projectFixture, type FixtureId, type Context } from "./fixtures";
import { reduceGallery, type Action, type GalleryState } from "./model";

export function fixtureBlocks(
  state: GalleryState,
  fixture: FixtureId,
  scope: FlexibleSnapshotScope,
): readonly FlexibleBlockPort[] {
  const my = projectFixture(state, fixture, "MY");
  const group = projectFixture(state, fixture, "GROUP");
  const base = {
    version: "g2-flexible/1" as const,
    synthetic: true as const,
    accountId: scope.accountId,
    tripId: scope.tripId,
    localDate: scope.localDate,
  };
  return [
    ...(my.block
      ? [
          {
            ...base,
            id: my.block.id,
            title: my.block.title,
            softWindow: { startMinute: my.block.start, endMinute: my.block.end },
            itemIds: my.affiliation?.itemIds ?? [],
            choices: [
              ...my.choices.map((r) => ({
                id: r.id,
                name: r.name,
                scope: "MY" as const,
              })),
              ...group.choices.map((r) => ({
                id: r.id,
                name: r.name,
                scope: "GROUP" as const,
              })),
            ],
          },
        ]
      : []),
    ...my.adjacentBlocks.map((block) => ({
      ...base,
      id: block.id,
      title: block.title,
      itemIds: [],
      choices: [],
      softWindow: { startMinute: block.start, endMinute: block.end },
    })),
  ];
}

export function fixtureSnapshot(
  fixture: FixtureId,
  scope: FlexibleSnapshotScope,
): FlexibleSnapshot {
  const snapshot = replaceFlexibleSnapshot(
    null,
    {
      version: "g2-flexible-snapshot/1",
      scope,
      revision: 0,
      blocks: fixtureBlocks(initialState(fixture), fixture, scope),
    },
    scope,
  );
  if (!snapshot) throw new Error("FLEXIBLE_FIXTURE_SCOPE");
  return snapshot;
}

// One feature-owned producer per synthetic contribution; G2 remains the acceptance authority.
export function createSnapshotProducer(
  fixture: FixtureId,
  initial: FlexibleSnapshot,
  context: Context,
) {
  const scope = initial.scope;
  let accepted = initial;
  let state = initialState(fixture);
  const primaryId = `fixture-flexible-${fixture}`;
  const synchronize = (snapshot: FlexibleSnapshot) => {
    if (flexibleScopeKey(snapshot.scope) !== flexibleScopeKey(scope)) return false;
    if (snapshot.revision > accepted.revision) {
      const checked = replaceFlexibleSnapshot(accepted, snapshot, scope);
      if (!checked) return false;
      accepted = checked;
    }
    const block = accepted.blocks.find((b) => b.id === primaryId);
    state = {
      ...state,
      resources: [
        ...state.resources,
        ...(block?.choices ?? [])
          .filter((c) => !state.resources.some((r) => r.id === c.id))
          .filter((c, i, all) => all.findIndex((other) => other.id === c.id) === i)
          .map((c) => Object.freeze({ id: c.id, name: c.name, relevant: false })),
      ],
      my: block?.choices.filter((c) => c.scope === "MY").map((c) => c.id) ?? state.my,
      block: block
        ? {
            id: block.id,
            title: block.title,
            area: state.block?.area,
            start: block.softWindow?.startMinute ?? 780,
            end: block.softWindow?.endMinute ?? 1080,
          }
        : null,
    };
    return true;
  };
  return {
    read(snapshot: FlexibleSnapshot) {
      return synchronize(snapshot) ? state : null;
    },
    apply(
      snapshot: FlexibleSnapshot,
      activeScope: FlexibleSnapshotScope,
      action: Action,
      publish: (next: FlexibleSnapshot) => boolean,
    ): boolean {
      if (
        flexibleScopeKey(activeScope) !== flexibleScopeKey(scope) ||
        !synchronize(snapshot) ||
        context === "past" ||
        (fixture === "f14" &&
          ["resize", "delete", "title", "create"].includes(action.type)) ||
        ["promotion", "create"].includes(action.type)
      )
        return false;
      const nextState = reduceGallery(state, action);
      if (nextState === state || !Number.isSafeInteger(accepted.revision + 1))
        return false;
      const projected = fixtureBlocks(nextState, fixture, scope).find(
        (b) => b.id === nextState.block?.id,
      );
      const oldBlock = accepted.blocks.find((b) => b.id === primaryId);
      const replacement = projected
        ? {
            ...oldBlock,
            ...projected,
            itemIds: oldBlock?.itemIds ?? projected.itemIds,
            choices: [
              ...projected.choices.filter((c) => c.scope === "MY"),
              ...(oldBlock?.choices.filter((c) => c.scope === "GROUP") ??
                projected.choices.filter((c) => c.scope === "GROUP")),
            ],
          }
        : null;
      const blocks = accepted.blocks.filter((b) => b.id !== primaryId);
      if (replacement) blocks.push(replacement);
      const next = replaceFlexibleSnapshot(
        accepted,
        {
          version: "g2-flexible-snapshot/1",
          scope,
          revision: accepted.revision + 1,
          blocks,
        },
        scope,
      );
      if (!next || !publish(next)) return false;
      accepted = next;
      state = nextState;
      return true;
    },
  };
}
