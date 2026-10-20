import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { prototypeMembers } from "./fixtures";
import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import type { PrototypeDraftSplitMode } from "./types";
import {
  formatMoney,
  Icon,
  PrimaryButton,
  PrototypeBanner,
  Section,
  Separator,
} from "./ui";

const modes: { id: PrototypeDraftSplitMode; label: string; detail: string }[] = [
  {
    id: "EQUAL_PERSON",
    label: "Equal per person",
    detail: "Everyone pays the same share",
  },
  {
    id: "EQUAL_HOUSEHOLD",
    label: "Equal per household",
    detail: "Households split equally, then their members",
  },
  {
    id: "HOUSEHOLD_SHARES",
    label: "Family shares",
    detail: "Adults 1 share · Mia 0.5 share",
  },
  { id: "EXACT", label: "Exact amounts", detail: "Enter each member's amount" },
  {
    id: "PERCENTAGE",
    label: "Percentages",
    detail: "Allocate a percentage to each member",
  },
];

export function SplitScreen() {
  const { draft, updateDraft } = useLedgerPrototype();
  const amountMinor = Math.round((Number(draft.amount) || 0) * 100);
  const selectedMembers = prototypeMembers.filter((member) =>
    draft.participantIds.includes(member.id),
  );

  const toggleMember = (id: string) => {
    const selected = draft.participantIds.includes(id);
    if (selected && draft.participantIds.length === 1) return;
    updateDraft({
      participantIds: selected
        ? draft.participantIds.filter((item) => item !== id)
        : [...draft.participantIds, id],
    });
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <PrototypeBanner />
        <Section title="Method">
          {modes.map((mode, index) => (
            <View key={mode.id}>
              {index > 0 ? <Separator /> : null}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: draft.splitMode === mode.id }}
                onPress={() => updateDraft({ splitMode: mode.id })}
                style={({ pressed }) => [styles.modeRow, pressed ? styles.pressed : null]}
              >
                <View style={styles.grow}>
                  <Text style={styles.title}>{mode.label}</Text>
                  <Text style={styles.detail}>{mode.detail}</Text>
                </View>
                <Icon
                  color={
                    draft.splitMode === mode.id ? colors.accent : colors.tertiaryLabel
                  }
                  name={draft.splitMode === mode.id ? "checkmark.circle.fill" : "circle"}
                  size={22}
                />
              </Pressable>
            </View>
          ))}
        </Section>

        <Section title="Included travellers">
          {prototypeMembers.map((member, index) => {
            const selected = draft.participantIds.includes(member.id);
            return (
              <View key={member.id}>
                {index > 0 ? <Separator /> : null}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleMember(member.id)}
                  style={({ pressed }) => [
                    styles.memberRow,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={[styles.avatar, { backgroundColor: member.color }]}>
                    <Text style={styles.avatarText}>{member.shortName[0]}</Text>
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.title}>{member.shortName}</Text>
                    <Text style={styles.detail}>
                      {member.memberShare === 0.5
                        ? "Child · 0.5 family share"
                        : "Adult · 1 family share"}
                    </Text>
                  </View>
                  <Icon
                    color={selected ? colors.accent : colors.tertiaryLabel}
                    name={selected ? "checkmark.circle.fill" : "circle"}
                    size={22}
                  />
                </Pressable>
              </View>
            );
          })}
        </Section>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {selectedMembers.length} travellers included
          </Text>
          <Text style={styles.detail}>
            {amountMinor
              ? `${formatMoney(amountMinor, draft.currency)} will resolve to exact minor-unit shares on save.`
              : "Enter an amount to preview exact allocations."}
          </Text>
        </View>
      </ScrollView>
      <View style={styles.bottomBar}>
        <PrimaryButton label="Done" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 18, padding: 16, paddingBottom: 100 },
  grow: { flex: 1 },
  modeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    padding: 14,
  },
  memberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    padding: 12,
  },
  pressed: { backgroundColor: "#E9E9ED" },
  title: { color: colors.label, fontSize: 17, fontWeight: "600" },
  detail: { color: colors.secondaryLabel, fontSize: 14, lineHeight: 19, marginTop: 2 },
  avatar: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
  summary: { paddingHorizontal: 4 },
  summaryTitle: { color: colors.label, fontSize: 17, fontWeight: "600" },
  bottomBar: {
    backgroundColor: colors.groupedBackground,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
    paddingBottom: 18,
  },
});
