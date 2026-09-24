import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useNetworkState } from "expo-network";

import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { ledgerCurrencyRepository } from "@/data/repositories/ledgerCurrencyRepository";
import type { JourneyCurrencyPreview } from "@/data/repositories/ledgerCurrencyRepository";
import { createLocalId } from "@/domain/localId";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";
import { currencyName } from "@/features/ledger/currencyPickerData";

type JourneySetting = { journeyId: string; settlementCurrency: string; title: string };

export default function CurrencyRoute() {
  const params = useLocalSearchParams<{ journeyId?: string }>();
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
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
        const [selectedId, journeys] = await Promise.all([
          repository.getSelectedJourneyId(),
          repository.listJourneys(),
        ]);
        const activeJourneyId = params.journeyId ?? selectedId;
        const selected =
          journeys.find((item) => item.journeyId === activeJourneyId) ?? null;
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
      .catch(() => setMessage("Currency could not be loaded."))
      .finally(() => setLoading(false));
  }, [params.journeyId]);

  const selectCurrency = async (currency: string) => {
    setPickerOpen(false);
    setPreview(null);
    setOperationId(null);
    if (!journey || !online || currency === journey.settlementCurrency) return;
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
          Journey Currency
        </Text>
        <View style={styles.group}>
          {journey ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: locked || !canChange || !online || working,
              }}
              disabled={locked || !canChange || !online || working}
              onPress={() => setPickerOpen(true)}
              style={styles.row}
            >
              <View style={styles.grow}>
                <Text style={styles.label}>{journey.title}</Text>
                <Text style={styles.detail}>
                  {chinese
                    ? "用于本次旅行的汇总、成员余额和结算。"
                    : "Used for totals, balances and settlement."}
                </Text>
                {locked ? (
                  <Text style={styles.detail}>
                    {chinese
                      ? "已有最终结算，此旅行的结算货币已永久锁定。"
                      : "Finalized settlement permanently locks this Journey Currency."}
                  </Text>
                ) : null}
                {!canChange && !locked ? (
                  <Text style={styles.detail}>
                    {chinese
                      ? "只有旅行组织者可以更改此货币。"
                      : "Only the Journey organizer can change this currency."}
                  </Text>
                ) : null}
                {!online ? (
                  <Text style={styles.detail}>
                    {chinese
                      ? "离线时仍可查看；重新连接后可更改。"
                      : "Available offline. Reconnect to change it."}
                  </Text>
                ) : null}
              </View>
              <View style={styles.currencyValue}>
                <Text style={styles.currencyCode}>{journey.settlementCurrency}</Text>
                <Text style={styles.currencyName}>
                  {currencyName(journey.settlementCurrency, chinese ? "zh-Hans" : "en")}
                </Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.label}>
                {chinese ? "未选择旅行" : "No Journey selected"}
              </Text>
              <Text style={styles.detail}>
                {chinese
                  ? "请先在 Ledger 中选择一个旅行。"
                  : "Choose a Journey in Ledger to view its currency."}
              </Text>
            </View>
          )}
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
  currencyValue: { alignItems: "flex-end", maxWidth: "42%" },
  currencyCode: { color: "#111827", fontSize: 16, fontWeight: "700" },
  currencyName: { color: "#64748B", fontSize: 12, marginTop: 2, textAlign: "right" },
  emptyState: { minHeight: 82, padding: 14 },
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
