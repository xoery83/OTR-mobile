import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SheetHeader } from "@/components/SheetHeader";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { UiChoiceChip as ChoiceChip, UiTextInput as TextInput } from "@/ui/forms";
import { t, type MessageKey } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import type {
  ExpenseSettlementParticipation,
  ExpenseSplitMethod,
} from "@/domain/ledger/types";
import { MoneyText, type MoneyTextProps } from "./MoneyText";
import {
  currencyAmountInput,
  type DraftMember,
  shouldShowGroupSettlement,
} from "./expenseDraft";
import { exactSharingAllocation } from "./expenseEntryPresentation";

export type ExpenseSharingDraft = {
  payerId: string;
  participantIds: string[];
  splitMode: ExpenseSplitMethod;
  exact: Record<string, string>;
  percentages: Record<string, string>;
  settlementParticipation: ExpenseSettlementParticipation;
};

export type ExpenseSharingInputs = {
  initial: ExpenseSharingDraft;
  members: DraftMember[];
  actorId: string;
  minor: number | null;
  currency: string;
  scale?: number;
  onApply(staged: ExpenseSharingDraft): void;
};

const splitLabels: Record<ExpenseSplitMethod, MessageKey> = {
  EQUAL_PERSON: "expense.splitEqual",
  EQUAL_HOUSEHOLD: "expense.splitHousehold",
  HOUSEHOLD_SHARES: "expense.householdShares",
  EXACT: "ui.exactAmounts",
  PERCENTAGE: "ui.percentages",
};

export function ExpenseSharingSheet({
  hosted,
  initial,
  members,
  actorId,
  minor,
  currency,
  scale,
  onApply,
  onCancel,
  exitPending,
}: ExpenseSharingInputs &
  ({ hosted: true; exitPending: boolean; onCancel?: never } | { hosted?: false; exitPending?: never; onCancel: () => void })) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 2;
  const [sharingEdit, setSharingDraft] = useState(initial);
  const sharingMembers = members.filter((member) =>
    sharingEdit.participantIds.includes(member.id),
  );
  const exactAllocation = exactSharingAllocation(
    minor,
    scale ?? 2,
    sharingMembers.map((member) => member.id),
    sharingEdit.exact,
  );
  const invalid =
    sharingMembers.length > 1 &&
    sharingEdit.splitMode === "EXACT" &&
    !exactAllocation.valid;
  const apply = () => {
    if (!invalid && !exitPending) onApply(sharingEdit);
  };
  const fields = (
    <View style={styles.sheetContent}>
      <Text style={styles.sharingHeading}>{t("ui.paidBy")}</Text>
      <View style={styles.chipList}>
        {members.map((member) => (
          <ChoiceChip
            key={`payer-${member.id}`}
            label={member.id === actorId ? t("ui.you") : member.displayName}
            selected={sharingEdit.payerId === member.id}
            onPress={() => setSharingDraft({ ...sharingEdit, payerId: member.id })}
          />
        ))}
      </View>
      <Text style={styles.sharingHeading}>{t("ui.participants")}</Text>
      <View style={styles.chipList}>
        {members.map((member) => {
          const selected = sharingEdit.participantIds.includes(member.id);
          return (
            <ChoiceChip
              key={`participant-${member.id}`}
              label={member.id === actorId ? t("ui.you") : member.displayName}
              selected={selected}
              onPress={() => {
                const ids = selected
                  ? sharingEdit.participantIds.filter((id) => id !== member.id)
                  : [...sharingEdit.participantIds, member.id];
                if (ids.length) setSharingDraft({ ...sharingEdit, participantIds: ids });
              }}
            />
          );
        })}
      </View>
      {sharingMembers.length > 1 ? (
        <>
          <Text style={styles.sharingHeading}>{t("ui.split")}</Text>
          <View style={styles.chipList}>
            {(
              [
                ...new Set<ExpenseSplitMethod>([
                  "EQUAL_PERSON",
                  "EXACT",
                  sharingEdit.splitMode,
                ]),
              ] as ExpenseSplitMethod[]
            ).map((mode) => (
              <ChoiceChip
                key={mode}
                label={t(splitLabels[mode])}
                selected={sharingEdit.splitMode === mode}
                onPress={() => setSharingDraft({ ...sharingEdit, splitMode: mode })}
              />
            ))}
          </View>
          {sharingEdit.splitMode === "EXACT" ? (
            <>
              <View style={styles.allocationSummary}>
                <AllocationLine
                  label={t("ui.expenseTotal")}
                  minor={minor}
                  currency={currency}
                  scale={scale ?? 2}
                  placeholder={t("ui.addAnAmount")}
                />
                <AllocationLine
                  label={t("ui.assigned")}
                  minor={exactAllocation.assignedMinor}
                  currency={currency}
                  scale={scale ?? 2}
                />
                <AllocationLine
                  label={t("ui.remaining")}
                  minor={exactAllocation.remainingMinor}
                  currency={currency}
                  scale={scale ?? 2}
                  warning={
                    exactAllocation.remainingMinor !== null &&
                    exactAllocation.remainingMinor !== 0
                  }
                />
                {!exactAllocation.valid ? (
                  <Text style={styles.allocationHint}>
                    {minor === null
                      ? t("ui.enterAnExpenseAmountBeforeCompletingExactAmounts")
                      : exactAllocation.remainingMinor !== null &&
                          exactAllocation.remainingMinor < 0
                        ? t("ui.assignedAmountsExceedTheExpenseTotal")
                        : t("ui.assignTheFullExpenseTotalAcrossSelectedParticipants")}
                  </Text>
                ) : null}
              </View>
              {minor !== null
                ? sharingMembers.map((member) => (
                    <View
                      key={member.id}
                      style={[styles.customRow, largeText && styles.customRowLargeText]}
                    >
                      <Text style={styles.rowLabel}>
                        {member.id === actorId ? t("ui.you") : member.displayName}
                      </Text>
                      <TextInput
                        accessibilityLabel={t("entry.memberAmount", {
                          name:
                            member.id === actorId ? t("common.you") : member.displayName,
                        })}
                        keyboardType={scale === 0 ? "number-pad" : "decimal-pad"}
                        onChangeText={(value) =>
                          setSharingDraft({
                            ...sharingEdit,
                            exact: {
                              ...sharingEdit.exact,
                              [member.id]: currencyAmountInput(
                                sharingEdit.exact[member.id] ?? "",
                                value,
                                scale ?? 2,
                              ),
                            },
                          })
                        }
                        placeholder={currency}
                        style={[
                          styles.customInput,
                          largeText && styles.customInputLargeText,
                        ]}
                        value={sharingEdit.exact[member.id] ?? ""}
                      />
                    </View>
                  ))
                : null}
            </>
          ) : null}
        </>
      ) : null}
      {shouldShowGroupSettlement(sharingEdit.participantIds, sharingEdit.payerId) ? (
        <>
          <Text style={styles.sharingHeading}>{t("ui.groupSettlement")}</Text>
          <View style={styles.chipList}>
            {(["INCLUDED", "EXCLUDED"] as const).map((value) => (
              <ChoiceChip
                key={value}
                label={value === "INCLUDED" ? t("ui.include") : t("ui.exclude")}
                selected={sharingEdit.settlementParticipation === value}
                onPress={() =>
                  setSharingDraft({ ...sharingEdit, settlementParticipation: value })
                }
              />
            ))}
          </View>
          <Text style={styles.hint}>
            {sharingEdit.settlementParticipation === "INCLUDED"
              ? t("ui.includedInThisTripsCalculationOfWhoOwesWhom")
              : t("ui.savedInExpensesButExcludedFromThisTripsCalculationOf")}
          </Text>
        </>
      ) : null}
    </View>
  );
  const title = t("ui.sharing");
  if (hosted) {
    return (
      <SheetRoutePanel
        title={title}
        action={{ label: t("common.done"), onPress: apply, disabled: invalid || exitPending }}
      >
        {fields}
      </SheetRoutePanel>
    );
  }
  return (
    <Modal
      allowSwipeDismissal
      animationType="slide"
      onRequestClose={onCancel}
      presentationStyle="pageSheet"
    >
      <SheetHeader
        leftLabel={t("ui.cancel")}
        onLeft={onCancel}
        onRight={apply}
        rightLabel={t("ui.apply")}
        rightDisabled={invalid}
        title={title}
      />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={styles.legacyBody}
      >
        {fields}
      </ScrollView>
    </Modal>
  );
}

function AllocationLine({
  label,
  warning = false,
  ...money
}: MoneyTextProps & { label: string; warning?: boolean }) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.allocationLine}>
      <Text style={styles.allocationLabel}>{label}</Text>
      <MoneyText
        style={[styles.allocationValue, warning && styles.allocationWarning]}
        {...money}
      />
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    legacyBody: { flex: 1, backgroundColor: colors.background },
    sheetContent: { gap: 10, padding: 16, paddingBottom: 48 },
    sharingHeading: {
      color: colors.textTertiary,
      fontSize: 15,
      fontWeight: "700",
      marginTop: 12,
    },
    chipList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    rowLabel: { color: colors.textPrimary, flex: 1, fontSize: 17, fontWeight: "600" },
    hint: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    allocationSummary: {
      backgroundColor: colors.groupedBackground,
      borderRadius: 8,
      gap: 6,
      padding: 12,
    },
    allocationLine: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    allocationLabel: { color: colors.textTertiary, fontSize: 14 },
    allocationValue: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
    allocationWarning: { color: colors.destructive },
    allocationHint: { color: colors.destructive, fontSize: 13 },
    customRow: { alignItems: "center", flexDirection: "row", gap: 12 },
    customRowLargeText: { alignItems: "stretch", flexDirection: "column" },
    customInput: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      color: colors.textPrimary,
      fontSize: 17,
      minHeight: 48,
      paddingHorizontal: 10,
      textAlign: "right",
      width: 120,
    },
    customInputLargeText: { width: "100%" },
  });
