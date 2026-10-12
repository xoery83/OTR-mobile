import { useState } from "react";
import { Text, View } from "react-native";
import type { FixtureContribution } from "@/features/day-feed-lab/contribution";
import { place, scenario } from "@/features/day-feed-lab/fixtureFacts";
import {
  FlexibleBlockRow,
  type FlexibleBlockRendererProps,
} from "@/features/day-feed/FlexibleBlockRow";
import { choiceFocusKey, blockRowKey } from "@/features/day-feed/composition";
import type { FlexibleSnapshotScope } from "@/features/day-feed/flexibleSnapshot";
import { useThemedStyles } from "@/ui/theme";
import { visual } from "@/ui/visual";
import { FlexibleRenderer, type FlexibleRendererProps } from "./Gallery";
import {
  fixtureIds,
  initialState,
  projectFixture,
  type FixtureId,
  type Context,
} from "./fixtures";
import { createSnapshotProducer, fixtureSnapshot } from "./snapshot";
import { t } from "./copy";

type Destinations = Pick<
  FlexibleRendererProps,
  "onResourceDetailsIntent" | "onMapIntent" | "onNavigateIntent"
>;
const date = "2026-10-12";
const hour = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function flexibleLabContribution(
  fixture: FixtureId,
  context: Context = fixture === "f11" ? "past" : fixture === "f10" ? "today" : "future",
  destinations: Destinations = {},
): FixtureContribution {
  const projection = projectFixture(initialState(fixture), fixture, "MY");
  const entry = scenario(
    `flexible-cp01b-${fixture}-${context}`,
    t(fixture),
    projection.syntheticItems.map((item) =>
      place(
        item.reference,
        t(item.reference === "fixture-tns" ? "tns" : "fixed"),
        date,
        item.startMinute === null ? undefined : hour(item.startMinute),
        item.endMinute === null ? undefined : hour(item.endMinute),
      ),
    ),
  );
  const scope: FlexibleSnapshotScope = {
    accountId: entry.projection.accountId,
    tripId: entry.id,
    localDate: date,
    generation: 0,
  };
  const snapshot = fixtureSnapshot(fixture, scope);
  const producer = createSnapshotProducer(fixture, snapshot, context);
  function Renderer(props: FlexibleBlockRendererProps) {
    const styles = useThemedStyles((c) => ({
      meta: { ...visual.type.meta, color: c.textSecondary },
    }));
    const [localFocus, setLocalFocus] = useState<string | null>(null);
    const [rejected, setRejected] = useState(false);
    const [, refresh] = useState(0);
    const current = props.flexibleSnapshot;
    if (!current || !props.onReplaceFlexibleSnapshot) return null;
    if (props.block.id !== `fixture-flexible-${fixture}`)
      return <FlexibleBlockRow {...props} />;
    const state = producer.read(current);
    if (!state) return null;
    return (
      <View key={blockRowKey(props.block.id, current.scope.localDate)}>
        <FlexibleRenderer
          {...destinations}
          fixture={fixture}
          context={context}
          nestedItems={props.nestedItems}
          timeRailLeft={16}
          focusedId={props.immersive ? localFocus : props.block.focusedChoiceKey}
          onFocusIntent={
            props.immersive
              ? setLocalFocus
              : (key) => {
                  // Browse targets come only from G2's authorized, filtered Choice projection.
                  const choice = props.block.choices.find((c) => c.key === key);
                  props.onChoiceFocusIntent(
                    choice
                      ? choiceFocusKey(props.block.id, choice.scope, choice.id)
                      : null,
                  );
                }
          }
          shared={{
            state,
            dispatch: (action) => {
              const ok = producer.apply(
                current,
                current.scope,
                action,
                props.onReplaceFlexibleSnapshot!,
              );
              setRejected(!ok);
              if (ok) refresh((n) => n + 1);
            },
            scope: props.block.choiceScope,
            choices: props.block.choices.map((c) => c.id),
            group:
              current.blocks
                .find((b) => b.id === props.block.id)
                ?.choices.filter((c) => c.scope === "GROUP")
                .map((c) => c.id) ?? [],
            onScope: props.onChoiceScopeIntent,
            immersive: props.immersive,
            open: props.onBlockImmersiveIntent,
            close: props.onClose,
          }}
        />
        {rejected ? <Text style={styles.meta}>{t("publicationRejected")}</Text> : null}
      </View>
    );
  }
  return {
    ...entry,
    dateRange: { start: date, end: date },
    dates: [date],
    selectedDate: date,
    instant:
      context === "future"
        ? "2026-10-11T12:00:00Z"
        : context === "past"
          ? "2026-10-13T12:00:00Z"
          : "2026-10-12T14:00:00Z",
    supplemental: projection,
    metadata: {
      summary: t(fixture),
      expected: [fixture.toUpperCase(), "CP01B_SOURCE_PREPARATION"],
    },
    flexiblePublication: { scope, snapshot },
    flexibleRenderer: Renderer,
  };
}

// Ready for catalog registration after the confirmed G2-FLEX-02 main integration gate.
export const flexibleLabContributions = () =>
  fixtureIds.map((id) => flexibleLabContribution(id));
