import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { ledgerCurrencyRepository } from "@/data/repositories/ledgerCurrencyRepository";
import type { JourneyCurrencyPreview } from "@/data/repositories/ledgerCurrencyRepository";
import { createLocalId } from "@/domain/localId";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";

type JourneySetting = { journeyId: string; settlementCurrency: string; title: string };

export default function LedgerSettingsRoute() {
  const [debugMode, setDebugMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [journey, setJourney] = useState<JourneySetting | null>(null);
  const [locked, setLocked] = useState(false);
  const [canChange, setCanChange] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<JourneyCurrencyPreview | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const committing = useRef(false);
  const chinese = Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh");

  useEffect(() => {
    void getDefaultLedgerReportingRepository()
      .then(async (repository) => {
        const [preferences, selectedId, journeys] = await Promise.all([
          repository.getPreferences(),
          repository.getSelectedJourneyId(),
          repository.listJourneys(),
        ]);
        setDebugMode(preferences.debugMode);
        const selected = journeys.find((item) => item.journeyId === selectedId) ?? null;
        if (selected) {
          setJourney(selected);
          const [actor, settlement] = await Promise.all([
            repository.getActorContext(selected.journeyId),
            getDefaultLedgerSettlementRepository(),
          ]);
          setCanChange(actor?.role === "owner");
          setLocked(await settlement.hasFinalized(selected.journeyId));
        }
      })
      .catch(() => setMessage("Settings could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const toggleDebugMode = async (enabled: boolean) => {
    setDebugMode(enabled);
    setMessage(null);
    try {
      const repository = await getDefaultLedgerReportingRepository();
      await repository.setDebugMode(enabled);
    } catch {
      setDebugMode(!enabled);
      setMessage("Debug Mode could not be saved.");
    }
  };

  const selectCurrency = async (currency: string) => {
    setPickerOpen(false);
    setPreview(null);
    setOperationId(null);
    if (!journey || currency === journey.settlementCurrency) return;
    setWorking(true);
    setMessage(null);
    try {
      const next = await ledgerCurrencyRepository.preview(journey.journeyId, currency);
      setPreview(next);
      setOperationId(createLocalId("journeyCurrency"));
    } catch {
      setMessage(
        chinese
          ? "无法连接。请重连后重新预览；旅行结算货币未更改。"
          : "Reconnect and preview again. Journey Currency has not changed.",
      );
    } finally {
      setWorking(false);
    }
  };

  const confirmChange = () => {
    if (!journey || !preview || !operationId || working || committing.current) return;
    if (
      preview.finalizedSettlementCount > 0 ||
      preview.openSettlementCount > 0 ||
      preview.conflictCount > 0
    )
      return;
    Alert.alert(
      chinese ? "确认更改旅行结算货币" : "Confirm Journey Currency change",
      `${preview.currentCurrency} → ${preview.proposedCurrency}. ${
        chinese
          ? "原始消费金额保持不变；未解决的消费暂不计入结算。确认即放弃未完成的结算预览，之后须重新预览。"
          : "Original Expense amounts stay unchanged. Unresolved Expenses are excluded from settlement. Confirming abandons any unfinished settlement preview; request a new one afterward."
      }`,
      [
        { text: chinese ? "取消" : "Cancel", style: "cancel" },
        {
          text: chinese ? "确认" : "Confirm",
          onPress: () =>
            void (async () => {
              committing.current = true;
              setWorking(true);
              try {
                await ledgerCurrencyRepository.commit(
                  journey.journeyId,
                  preview,
                  operationId,
                );
                setJourney({ ...journey, settlementCurrency: preview.proposedCurrency });
                setPreview(null);
                setMessage(
                  chinese ? "旅行结算货币已更新。" : "Journey Currency updated.",
                );
              } catch {
                setPreview(null);
                setMessage(
                  chinese
                    ? "确认或同步未完成。请重连并重新预览当前状态。"
                    : "Confirmation or sync did not finish. Reconnect and preview the current state again.",
                );
              } finally {
                committing.current = false;
                setWorking(false);
              }
            })(),
        },
      ],
    );
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Ledger
        </Text>
        <View style={styles.group}>
          {journey ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: locked || !canChange || working }}
              disabled={locked || !canChange || working}
              onPress={() => setPickerOpen(true)}
              style={styles.row}
            >
              <View style={styles.grow}>
                <Text style={styles.label}>
                  {chinese ? "旅行结算货币" : "Journey Currency"}
                </Text>
                <Text style={styles.detail}>
                  {chinese
                    ? "用于本次旅行的汇总、成员余额和结算。"
                    : "Currency used for Journey totals, balances and settlement."}
                </Text>
                {locked ? (
                  <Text style={styles.detail}>
                    {chinese
                      ? "已有最终结算，此旅行的结算货币已永久锁定。"
                      : "Finalized settlement permanently locks this Journey Currency."}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.label}>{journey.settlementCurrency}</Text>
            </Pressable>
          ) : null}
          <SettingRow
            label="Exchange Rates"
            onPress={() => router.push("/expenses/exchange-rates" as never)}
          />
        </View>
        {working ? <ActivityIndicator /> : null}
        {preview ? (
          <View style={styles.preview}>
            <Text accessibilityRole="header" style={styles.label}>
              {chinese ? "变更预览" : "Change preview"}: {preview.currentCurrency} →{" "}
              {preview.proposedCurrency}
            </Text>
            <Text style={styles.detail}>
              {chinese ? "影响消费" : "Affected Expenses"}: {preview.affectedExpenses}
            </Text>
            <Text style={styles.detail}>
              {chinese ? "同币种" : "Same currency"}: {preview.sameCurrencyCount}
            </Text>
            <Text style={styles.detail}>
              {chinese ? "历史参考汇率可用" : "Historical reference candidates"}:{" "}
              {preview.referenceCandidateCount}
            </Text>
            <Text style={styles.detail}>
              {chinese ? "缺少消费日期" : "Missing economic date"}:{" "}
              {preview.missingEconomicDateCount}
            </Text>
            <Text style={styles.detail}>
              {chinese ? "缺少历史汇率" : "Missing historical quote"}:{" "}
              {preview.missingHistoricalQuoteCount}
            </Text>
            <Text style={styles.detail}>MANUAL_AGREED: {preview.manualAgreedCount}</Text>
            <Text style={styles.detail}>
              ACTUAL_PAYER_COST: {preview.actualPayerCostCount}
            </Text>
            <Text style={styles.detail}>
              {chinese ? "其他政策" : "Other policies"}: {preview.otherPolicyCount}
            </Text>
            <Text style={styles.detail}>
              {chinese ? "冲突" : "Conflicts"}: {preview.conflictCount}
            </Text>
            <Text style={styles.detail}>
              {chinese ? "变更后待估值" : "Expected unresolved"}:{" "}
              {preview.expectedUnresolvedCount}
            </Text>
            <Text style={styles.detail}>
              {chinese ? "未完成结算" : "Open settlement"}: {preview.openSettlementCount};{" "}
              {chinese ? "已最终结算" : "Finalized"}: {preview.finalizedSettlementCount}
            </Text>
            <Text style={styles.detail}>
              {chinese
                ? "最终总额和余额将在确认后重新计算；缺少汇率时不可用。"
                : "Final totals and balances refresh after confirmation; unavailable while rates are missing."}
            </Text>
            {preview.openSettlementCount ? (
              <Text style={styles.error}>
                {chinese
                  ? "先放弃未完成结算，再重新预览。"
                  : "Abandon the open settlement and preview again."}
              </Text>
            ) : null}
            {preview.finalizedSettlementCount ? (
              <Text style={styles.error}>
                {chinese
                  ? "此旅行已最终结算，货币已锁定。"
                  : "This Journey has finalized settlement history and is locked."}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  working ||
                  preview.finalizedSettlementCount > 0 ||
                  preview.openSettlementCount > 0 ||
                  preview.conflictCount > 0,
              }}
              disabled={
                working ||
                preview.finalizedSettlementCount > 0 ||
                preview.openSettlementCount > 0 ||
                preview.conflictCount > 0
              }
              onPress={confirmChange}
              style={styles.confirm}
            >
              <Text style={styles.confirmText}>
                {chinese ? "确认更改" : "Confirm change"}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Developer
        </Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.label}>Debug Mode</Text>
              <Text style={styles.detail}>Show diagnostic information on Ledger</Text>
            </View>
            <Switch
              accessibilityLabel="Debug Mode"
              onValueChange={(enabled) => void toggleDebugMode(enabled)}
              trackColor={{ false: "#CBD5E1", true: "#86CFC4" }}
              value={debugMode}
            />
          </View>
        </View>
        {message ? <Text style={styles.error}>{message}</Text> : null}
      </ScrollView>
      <Modal
        visible={pickerOpen}
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.pickerHeader}>
          <Pressable accessibilityRole="button" onPress={() => setPickerOpen(false)}>
            <Text style={styles.label}>{chinese ? "关闭" : "Close"}</Text>
          </Pressable>
        </View>
        <CurrencyPicker
          selected={journey?.settlementCurrency ?? "NZD"}
          suggestions={[journey?.settlementCurrency ?? "NZD", "EUR", "USD"]}
          onSelect={(code) => void selectCurrency(code)}
        />
      </Modal>
    </>
  );
}

function SettingRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rowValue}>
        <AppIcon color="#94A3B8" name="chevron.right" size={14} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { backgroundColor: "#F6F7F9", flexGrow: 1, padding: 16, paddingBottom: 40 },
  sectionTitle: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginLeft: 4,
    marginTop: 18,
    textTransform: "uppercase",
  },
  group: { backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  grow: { flex: 1 },
  label: { color: "#111827", flex: 1, fontSize: 16, fontWeight: "600" },
  detail: { color: "#64748B", fontSize: 12, marginTop: 2 },
  rowValue: { alignItems: "center", flexDirection: "row", gap: 6 },
  error: { color: "#B91C1C", fontSize: 14, margin: 8 },
  preview: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    gap: 5,
    marginTop: 16,
    padding: 16,
  },
  confirm: { backgroundColor: "#0F766E", borderRadius: 10, marginTop: 12, padding: 14 },
  confirmText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center" },
  pickerHeader: { backgroundColor: "#FFFFFF", padding: 16 },
});
