import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { UiTextInput } from "@/ui/forms";
import { systemMessage } from "@/ui/domainLabels";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  getDefaultLedgerExpenseConflictRepository,
  type ExpenseConflictChainResponse,
  type ExpenseConflictChainResolutionRequest,
} from "@/data/repositories/ledgerExpenseConflictRepository";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { kickLedgerOperationalSync } from "@/data/operations/kickLedgerSync";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { useLedgerActiveSync } from "@/hooks/useLedgerActiveSync";
import {
  canonicalConflictLines,
  conflictChoices,
  conflictIntentLines,
  resolutionStatus,
} from "./expenseConflictPresentation";

type ResolutionResult = Awaited<
  ReturnType<
    Awaited<
      ReturnType<typeof getDefaultLedgerExpenseConflictRepository>
    >["getResolutionResult"]
  >
>;
export function ExpenseConflictResolutionScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [chain, setChain] = useState<ExpenseConflictChainResponse | null>(null);
  const [journeyId, setJourneyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [covered, setCovered] = useState<string[]>([]);
  const [reasonDraft, setReasonDraft] = useState<{
    selection: string | null;
    value: string;
  }>({ selection: null, value: "" });
  const reason = reasonDraft.selection === selected ? reasonDraft.value : "";
  const [result, setResult] = useState<ResolutionResult>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const focused = useRef(false);
  const generation = getAccountGeneration();
  const current = useCallback(
    () => focused.current && generation === getAccountGeneration(),
    [generation],
  );
  const adopt = useCallback(
    (value: ExpenseConflictChainResponse) => {
      if (!current()) return;
      setChain(value);
      const open = value.conflicts.filter((c) => c.lifecycle === "OPEN");
      setSelected((previous) =>
        open.some((c) => c.conflictId === previous)
          ? previous
          : (open.at(-1)?.conflictId ?? null),
      );
      setCovered((previous) =>
        previous.filter((id) => open.some((c) => c.conflictId === id)),
      );
    },
    [current],
  );
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const repository = await getDefaultLedgerExpenseConflictRepository();
      const next = await repository.refresh(id);
      adopt(next);
      if (current()) setMessage(null);
    } catch {
      if (current()) setMessage(t("ledgerMigration.copy33"));
    } finally {
      if (current()) {
        setBusy(false);
        setLoading(false);
      }
    }
  }, [id, adopt, current]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void (async () => {
        try {
          const [repository, expenses, settlements, reporting] = await Promise.all([
            getDefaultLedgerExpenseConflictRepository(),
            getDefaultLedgerExpenseRepository(),
            getDefaultLedgerSettlementRepository(),
            getDefaultLedgerReportingRepository(),
          ]);
          const expense = await expenses.getExpense(id);
          if (!current()) return;
          if (!expense) {
            setLoading(false);
            setMessage(t("ledgerMigration.copy34"));
            return;
          }
          setJourneyId(expense.journeyId);
          const [cache, last, locked, actor, options] = await Promise.all([
            repository.readCached(id),
            repository.getResolutionResult(id),
            settlements.isExpenseFinalized(expense.journeyId, id, expense.serverId),
            reporting.getActorContext(expense.journeyId),
            reporting.listFilterOptions(expense.journeyId),
          ]);
          if (!current()) return;
          if (cache) adopt(cache);
          setResult(last);
          setFrozen(locked);
          setMemberNames(Object.fromEntries(options.members.map((m) => [m.id, m.label])));
          setAllowed(
            actor?.role === "owner" ||
              (actor?.role === "group_member" &&
                actor.memberId === expense.creatorMemberId),
          );
          await refresh();
        } catch {
          if (current()) {
            setLoading(false);
            setMessage(t("ledgerMigration.copy34"));
          }
        }
      })();
      return () => {
        focused.current = false;
      };
    }, [id, current, adopt, refresh]),
  );
  const onChanged = useCallback(async () => {
    const repository = await getDefaultLedgerExpenseConflictRepository();
    const next = await repository.getResolutionResult(id);
    if (current()) setResult(next);
  }, [id, current]);
  useLedgerActiveSync(journeyId, onChanged);
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      void getDefaultLedgerExpenseConflictRepository()
        .then((r) => r.getResolutionResult(id))
        .then((next) => {
          if (!active || !current()) return;
          setResult((previous) => {
            if (next?.responseJson && !previous?.responseJson) void refresh();
            return next;
          });
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, current, refresh]);
  const open = chain?.conflicts.filter((c) => c.lifecycle === "OPEN") ?? [];
  const primary = open.find((c) => c.conflictId === selected);
  const pending =
    !!result &&
    !result.responseJson &&
    ["PENDING", "PROCESSING", "RETRYABLE", "DEPENDENCY_BLOCKED"].includes(result.status);
  const lastDecision = result
    ? (JSON.parse(result.payloadJson) as ExpenseConflictChainResolutionRequest)
    : null;
  const staleReview =
    result?.status === "CONFLICT" &&
    ["REVISION_CONFLICT", "CONFLICT_CHAIN_DRIFT"].includes(result.errorCode ?? "") &&
    lastDecision?.currentServerRevision === chain?.canonical.revision &&
    lastDecision?.expectedChainDigest === chain?.chainDigest;
  const choose = async (choice: ExpenseConflictChainResolutionRequest["choice"]) => {
    if (!chain || !primary || busy || pending || staleReview) return;
    setBusy(true);
    try {
      const repository = await getDefaultLedgerExpenseConflictRepository();
      await repository.queueResolution(id, {
        contractVersion: 2,
        commandId: primary.commandId,
        intentType: primary.commandType,
        submittedIntent: primary.submittedIntent ?? { type: "UPDATE", patch: {} },
        observedBaseRevision: primary.observedBaseRevision,
        currentServerRevision: chain.canonical.revision,
        coveredConflictIds: [...new Set([primary.conflictId, ...covered])],
        expectedChainDigest: chain.chainDigest,
        choice,
        reason: reason.trim(),
      });
      if (current()) {
        setResult(await repository.getResolutionResult(id));
        setMessage(null);
      }
      kickLedgerOperationalSync();
    } catch (error) {
      if (current())
        setMessage(error instanceof Error ? error.message : t("ledgerMigration.copy35"));
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <>
      <Stack.Screen options={{ title: t("ui.reviewChanges") }} />
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator accessibilityLabel={t("ledgerMigration.copy36")} />
        ) : null}
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {systemMessage(message)}
          </Text>
        ) : null}
        {result ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {resolutionStatus(result)}
          </Text>
        ) : null}
        {frozen ? (
          <Text style={styles.notice}>{t("ledgerMigration.copy37")}</Text>
        ) : !allowed ? (
          <Text style={styles.notice}>{t("ledgerMigration.copy38")}</Text>
        ) : null}
        {chain ? (
          <View style={styles.card}>
            <Text style={styles.heading}>{t("ledgerMigration.copy39")}</Text>
            {canonicalConflictLines(chain.canonical, memberNames).map((line, i) => (
              <Text key={i} style={styles.body}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.heading}>
          {t(open.length === 1 ? "conflict.savedCountOne" : "conflict.savedCountMany", {
            count: open.length,
          })}
        </Text>
        <Text style={styles.body}>{t("ledgerMigration.copy40")}</Text>
        {chain?.conflicts.map((conflict) => (
          <View
            key={conflict.conflictId}
            style={[
              styles.card,
              primary?.conflictId === conflict.conflictId && styles.selected,
            ]}
          >
            {conflict.lifecycle === "OPEN" ? (
              <Pressable
                style={styles.choiceRow}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: primary?.conflictId === conflict.conflictId,
                  disabled: pending,
                }}
                disabled={pending}
                onPress={() => {
                  setSelected(conflict.conflictId);
                  setCovered((ids) => ids.filter((id) => id !== conflict.conflictId));
                }}
              >
                <Text style={styles.heading}>
                  {t(
                    primary?.conflictId === conflict.conflictId
                      ? "conflict.needsReviewSelected"
                      : "conflict.needsReview",
                    {
                      kind:
                        conflict.commandType === "DELETE"
                          ? t("ledgerMigration.copy41")
                          : conflict.commandType === "RESTORE"
                            ? t("conflict.restore")
                            : conflict.commandType === "APPLY_VALUATION"
                              ? t("ledgerMigration.copy42")
                              : t("ledgerMigration.copy43"),
                    },
                  )}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.heading}>
                {conflict.lifecycle === "RESOLVED"
                  ? t("ledgerMigration.copy44")
                  : t("ledgerMigration.copy45")}
              </Text>
            )}
            {conflictIntentLines(conflict, chain.canonical, memberNames).map(
              (line, i) => (
                <Text key={i} style={styles.body}>
                  {line}
                </Text>
              ),
            )}
            {conflict.reason && !/^[A-Z][A-Z_]+$/.test(conflict.reason) ? (
              <Text style={styles.body}>{conflict.reason}</Text>
            ) : null}
            {conflict.lifecycle === "OPEN" && conflict.conflictId !== selected ? (
              <Pressable
                style={styles.choiceRow}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: covered.includes(conflict.conflictId),
                  disabled: pending,
                }}
                disabled={pending}
                onPress={() =>
                  setCovered((ids) =>
                    ids.includes(conflict.conflictId)
                      ? ids.filter((id) => id !== conflict.conflictId)
                      : [...ids, conflict.conflictId],
                  )
                }
              >
                <Text style={styles.link}>
                  {covered.includes(conflict.conflictId)
                    ? t("ledgerMigration.copy46")
                    : t("ledgerMigration.copy47")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {primary ? (
          <>
            <Text style={styles.heading}>{t("ledgerMigration.copy48")}</Text>
            <UiTextInput
              accessibilityLabel={t("ledgerMigration.copy48")}
              multiline
              value={reason}
              onChangeText={(value) => setReasonDraft({ selection: selected, value })}
              placeholder={t("ledgerMigration.copy49")}
              style={styles.input}
              editable={!pending}
              maxLength={2000}
            />
            <Text style={styles.body}>
              {t("conflict.replaceSummary", {
                count: new Set([primary.conflictId, ...covered]).size,
                remaining: open.length - new Set([primary.conflictId, ...covered]).size,
              })}
            </Text>
            {conflictChoices(primary, chain?.canonical).map(({ choice, label }) => (
              <Pressable
                key={choice}
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    busy ||
                    pending ||
                    staleReview ||
                    frozen ||
                    !allowed ||
                    !reason.trim(),
                }}
                disabled={
                  busy || pending || staleReview || frozen || !allowed || !reason.trim()
                }
                onPress={() => void choose(choice)}
                style={[
                  styles.button,
                  (busy ||
                    pending ||
                    staleReview ||
                    frozen ||
                    !allowed ||
                    !reason.trim()) &&
                    styles.disabled,
                ]}
              >
                <Text style={styles.buttonText}>{label}</Text>
              </Pressable>
            ))}
          </>
        ) : !loading ? (
          <Text style={styles.body}>{t("ledgerMigration.copy50")}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void refresh()}
          style={styles.card}
        >
          <Text style={styles.link}>
            {busy ? t("ledgerMigration.copy51") : t("ledgerMigration.copy52")}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, gap: 16, paddingBottom: 44 },
    heading: { ...visual.type.row, fontSize: 17, color: colors.textPrimary },
    choiceRow: { minHeight: 44, justifyContent: "center" },
    body: { fontSize: 16, lineHeight: 23, color: colors.textSecondary },
    card: {
      padding: 16,
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.separator,
    },
    selected: { borderColor: colors.accent },
    notice: {
      fontSize: 16,
      lineHeight: 23,
      padding: 14,
      backgroundColor: colors.warningSurface,
      borderRadius: 12,
      color: colors.warning,
    },
    link: { fontSize: 16, fontWeight: "600", color: colors.accent, paddingVertical: 8 },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 14,
      minHeight: 90,
      fontSize: 16,
      textAlignVertical: "top",
    },
    button: { backgroundColor: colors.accent, borderRadius: 12, padding: 16 },
    disabled: { opacity: 0.45 },
    buttonText: {
      color: colors.onAccent,
      fontSize: 17,
      fontWeight: "600",
      textAlign: "center",
    },
  });
