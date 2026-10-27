import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ScheduledTransportContent } from "@/features/day-feed/ScheduledTransportRow";
import type { Depth } from "@/features/day-feed/presentation";
import { UiText } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import {
  transportFidelityFacts,
  transportFidelityScenarios,
  type P5FixtureIntent,
} from "./transportFidelityFixture";

// Render-only fixture workbench: no host chrome, business writes or real original opener.
export function P5FidelityPreview() {
  useUiLocale();
  const [scenarioId, setScenario] = useState("full");
  const [segmentId, setSegment] = useState<string>();
  const [context, setContext] = useState<"FUTURE" | "TODAY" | "PAST">("TODAY");
  const [depth, setDepth] = useState<Depth>("F");
  const [arrival, setArrival] = useState(false);
  const [intent, setIntent] = useState<P5FixtureIntent>();
  const styles = useThemedStyles(createStyles);
  const selected = transportFidelityScenarios.find((value) => value.id === scenarioId)!;
  const facts = transportFidelityFacts(scenarioId, segmentId, setIntent);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={styles.root}
      contentContainerStyle={styles.content}
    >
      <UiText style={styles.title}>{t("p5.preview")}</UiText>
      <UiText style={styles.meta}>{t("p5Lab.proof")}</UiText>
      <ScrollView horizontal keyboardShouldPersistTaps="handled">
        {transportFidelityScenarios.map((value) => (
          <UiChoiceChip
            key={value.id}
            label={value.label}
            selected={value.id === scenarioId}
            onPress={() => {
              setScenario(value.id);
              setSegment(undefined);
              setIntent(undefined);
            }}
          />
        ))}
      </ScrollView>
      <View style={styles.options}>
        {(["FUTURE", "TODAY", "PAST"] as const).map((value) => (
          <UiChoiceChip
            key={value}
            label={t(`p5Lab.scenario.${value}`)}
            selected={value === context}
            onPress={() => setContext(value)}
          />
        ))}
      </View>
      <View style={styles.options}>
        {(["B", "F", "I"] as const).map((value) => (
          <UiChoiceChip
            key={value}
            label={value}
            selected={depth === value}
            onPress={() => setDepth(value)}
          />
        ))}
      </View>
      <View style={styles.options}>
        <UiChoiceChip
          label={t("p5.departure")}
          selected={!arrival}
          onPress={() => setArrival(false)}
        />
        <UiChoiceChip
          label={t("p5.arrival")}
          selected={arrival}
          onPress={() => setArrival(true)}
        />
      </View>
      {selected.segments
        .filter((value) => value.visible)
        .map((value) => (
          <UiChoiceChip
            key={value.id}
            label={value.name}
            selected={value.id === (segmentId ?? selected.segments[0].id)}
            onPress={() => setSegment(value.id)}
          />
        ))}
      <ScheduledTransportContent
        depth={depth}
        context={context}
        arrival={arrival}
        onDepth={setDepth}
        facts={facts}
      />
      {intent ? <UiText style={styles.meta}>{intent.id}</UiText> : null}
    </ScrollView>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.row },
    options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    title: { ...visual.type.section, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
