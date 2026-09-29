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

import { AppIcon } from "@/components/AppIcon";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { ledgerCurrencyRepository } from "@/data/repositories/ledgerCurrencyRepository";
import type { JourneyCurrencyPreview } from "@/data/repositories/ledgerCurrencyRepository";
import { chooseJourneyEntry } from "@/domain/ledger/journeyContext";
import { createLocalId } from "@/domain/localId";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";
import { currencyName } from "@/features/ledger/currencyPickerData";
import { ExchangeRateLookup } from "@/features/ledger/ExchangeRateLookup";
import { LedgerSheetHeader } from "@/features/ledger/LedgerSheetHeader";

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
  const [helpOpen, setHelpOpen] = useState(false);
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
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const entry = chooseJourneyEntry(journeys, today, selectedId, params.journeyId);
        const activeJourneyId = entry.kind === "JOURNEY" ? entry.journeyId : null;
        const selected =
          journeys.find((item) => item.journeyId === activeJourneyId) ?? null;
        setJourney(selected);
        if (selected) {
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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <Text
            accessibilityRole="header"
            style={[styles.sectionTitle, styles.inlineTitle]}
          >
            Journey Currency
          </Text>
          <Pressable
            accessibilityLabel="About Journey Currency"
            accessibilityRole="button"
            accessibilityState={{ expanded: helpOpen }}
            onPress={() => setHelpOpen(!helpOpen)}
            style={styles.infoButton}
          >
            <AppIcon color="#0F766E" name="info.circle" size={18} />
          </Pressable>
        </View>
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
                  {chinese ? "汇总、余额和结算货币" : "Totals, balances and settlement"}
                </Text>
                {locked ? (
                  <Text style={styles.detail}>
                    {chinese ? "已最终结算 · 货币锁定" : "Locked after final settlement"}
                  </Text>
                ) : null}
                {!canChange && !locked ? (
                  <Text style={styles.detail}>
                    {chinese ? "仅组织者可更改" : "Organizer only"}
                  </Text>
                ) : null}
                {!online ? (
                  <Text style={styles.detail}>
                    {chinese ? "连接网络后可更改" : "Reconnect to change"}
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
        {journey ? (
          <ExchangeRateLookup
            journeyId={journey.journeyId}
            key={`${journey.journeyId}:${journey.settlementCurrency}`}
            online={online}
            settlementCurrency={journey.settlementCurrency}
          />
        ) : null}
        {message ? <Text style={styles.error}>{message}</Text> : null}
      </ScrollView>
      {helpOpen ? (
        <View style={styles.helpOverlay}>
          <Pressable
            accessibilityLabel="Close Journey Currency explanation"
            accessibilityRole="button"
            onPress={() => setHelpOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.helpPopover}>
            <Text style={styles.helpText}>
              {chinese
                ? "旅行结算货币用于汇总消费、成员余额和最终结算。每笔消费保留原始金额和币种；跨币种消费在符合条件的历史参考汇率可用并被接受后，按消费日期估值。没有可用汇率的消费暂不计入已确认的换算汇总。只有组织者在线预览并确认后才能更改；未完成的结算或冲突会阻止更改。只要有最终结算记录，此货币便永久锁定。"
                : "Journey Currency is used for spending totals, member balances and final settlement. Each Expense keeps its original amount and currency. Eligible cross-currency Expenses are valued using an accepted historical reference rate for the Expense date; those without an available rate remain unresolved. Only the organizer can change this online after preview and confirmation. Open settlements or conflicts block the change. Any finalized settlement locks this currency permanently."}
            </Text>
          </View>
        </View>
      ) : null}
      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
        presentationStyle="pageSheet"
        visible={pickerOpen}
      >
        <LedgerSheetHeader
          leftLabel={chinese ? "关闭" : "Close"}
          onLeft={() => setPickerOpen(false)}
          title={chinese ? "选择货币" : "Choose currency"}
        />
        <CurrencyPicker
          selected={journey?.settlementCurrency ?? "NZD"}
          suggestions={[journey?.settlementCurrency ?? "NZD", "EUR", "USD"]}
          onSelect={(code) => void selectCurrency(code)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  headingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginBottom: 7,
    marginTop: 18,
  },
  inlineTitle: { marginBottom: 0, marginTop: 0 },
  infoButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    minWidth: 36,
  },
  helpOverlay: { ...StyleSheet.absoluteFill, zIndex: 10 },
  helpPopover: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    left: 16,
    padding: 14,
    position: "absolute",
    right: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    top: 80,
    zIndex: 10,
  },
  helpText: { color: "#334155", fontSize: 14, lineHeight: 21 },
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
});
