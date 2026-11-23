import { Pressable, StyleSheet, Text } from "react-native";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import type { ReportingScope } from "@/domain/ledger/reporting";
import type { AnalysisExpense } from "@/domain/ledger/spendingAnalysis";
import { formatLedgerDate, formatLedgerMoney } from "./format";
import { formatExpenseCount } from "./searchFilters";
import { useAnalysisStyles } from "./SpendingAnalysisSections";

function exclusionReason(expense: AnalysisExpense, scope: ReportingScope) {
  if (expense.hasOpenConflict) return t("ui.changesNeedReview");
  if (expense.businessStatus === "DRAFT") return t("ui.draftExpense");
  if (expense.businessStatus === "RATE_REQUIRED" || expense.totalMinor === null)
    return t("ui.waitingForConfirmedJourneyCurrencyValue");
  if (scope === "MINE" && expense.personalMinor === null)
    return t("ui.yourShareIsNotAvailableYet");
  return t("ui.notIncludedInSpendingTotal");
}

export function AnalysisExcludedExpenses({
  expenses,
  scope,
  onOpen,
}: {
  expenses: readonly AnalysisExpense[];
  scope: ReportingScope;
  onOpen(id: string): void;
}) {
  useUiLocale();
  const shared = useAnalysisStyles();
  const styles = useThemedStyles(createStyles);
  return (
    <>
      <Text style={shared.meta}>
        {formatExpenseCount(expenses.length)} ·{" "}
        {scope === "MINE" ? t("ledger.mine") : t("ledger.group")}
      </Text>
      {expenses.map((expense) => (
        <Pressable
          key={expense.id}
          accessibilityRole="button"
          onPress={() => onOpen(expense.id)}
          style={styles.excludedExpense}
        >
          <Text numberOfLines={2} style={styles.excludedTitle}>
            {expense.title}
          </Text>
          <Text style={shared.meta}>
            {t("analysis.originalTotal", {
              date: formatLedgerDate(expense.occurredAt),
              amount: formatLedgerMoney(
                expense.originalMinor,
                expense.originalCurrency,
                expense.originalScale,
              ),
            })}
          </Text>
          <Text style={shared.meta}>{exclusionReason(expense, scope)}</Text>
        </Pressable>
      ))}
    </>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    excludedExpense: {
      padding: 12,
      gap: 5,
      backgroundColor: colors.surface,
      borderRadius: 10,
    },
    excludedTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  });
