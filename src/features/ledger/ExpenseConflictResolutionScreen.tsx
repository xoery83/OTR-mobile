import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
      if (current())
        setMessage(
          "The latest value is unavailable. Your saved changes remain here; connect to continue reviewing.",
        );
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
            setMessage("This Expense could not be loaded.");
            return;
          }
          setJourneyId(expense.journeyId);
          const [cache, last, locked, actor, options] = await Promise.all([
            repository.readCached(id),
            repository.getResolutionResult(id),
            settlements.isExpenseFinalized(expense.journeyId, id),
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
            setMessage("This Expense could not be loaded.");
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
        setMessage(
          error instanceof Error ? error.message : "Your choice could not be saved.",
        );
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <>
      <Stack.Screen options={{ title: "Review changes" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? <ActivityIndicator accessibilityLabel="Loading changes" /> : null}
        <Text style={styles.title} accessibilityRole="header">
          Review changes
        </Text>
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {message}
          </Text>
        ) : null}
        {result ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {resolutionStatus(result)}
          </Text>
        ) : null}
        {frozen ? (
          <Text style={styles.notice}>
            This Expense belongs to a confirmed Settlement. It cannot be changed here.
          </Text>
        ) : !allowed ? (
          <Text style={styles.notice}>
            Only the Expense creator or Journey organizer can make this decision.
          </Text>
        ) : null}
        {chain ? (
          <View style={styles.card}>
            <Text style={styles.heading}>Latest value</Text>
            {canonicalConflictLines(chain.canonical, memberNames).map((line, i) => (
              <Text key={i} style={styles.body}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.heading}>
          {open.length} saved change{open.length === 1 ? " needs" : "s need"} review
        </Text>
        <Text style={styles.body}>
          Choose the change you want to keep. Include another change only if this decision
          should replace it.
        </Text>
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
                  {conflict.commandType === "DELETE"
                    ? "Deletion"
                    : conflict.commandType === "RESTORE"
                      ? "Restore"
                      : conflict.commandType === "APPLY_VALUATION"
                        ? "Valuation"
                        : "Saved changes"}{" "}
                  · Needs review
                  {primary?.conflictId === conflict.conflictId ? " · Selected" : ""}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.heading}>
                {conflict.lifecycle === "RESOLVED"
                  ? "Decision saved"
                  : "Replaced by a decision"}
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
                    ? "✓ Replace this change with my decision"
                    : "Also replace this change"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {primary ? (
          <>
            <Text style={styles.heading}>Note for your group</Text>
            <TextInput
              accessibilityLabel="Note for your group"
              multiline
              value={reason}
              onChangeText={(value) => setReasonDraft({ selection: selected, value })}
              placeholder="Explain the choice for your group"
              style={styles.input}
              editable={!pending}
              maxLength={2000}
            />
            <Text style={styles.body}>
              This decision replaces {new Set([primary.conflictId, ...covered]).size}{" "}
              saved change(s).{" "}
              {open.length - new Set([primary.conflictId, ...covered]).size} still need
              review.
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
          <Text style={styles.body}>These changes no longer need a decision.</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void refresh()}
          style={styles.card}
        >
          <Text style={styles.link}>
            {busy ? "Checking latest value…" : "Check latest value"}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 44 },
  title: { fontSize: 24, fontWeight: "700", color: "#17272F" },
  heading: { fontSize: 17, fontWeight: "600", color: "#17272F" },
  choiceRow: { minHeight: 44, justifyContent: "center" },
  body: { fontSize: 16, lineHeight: 23, color: "#475569" },
  card: {
    padding: 16,
    gap: 8,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  selected: { borderColor: "#0F766E" },
  notice: {
    fontSize: 16,
    lineHeight: 23,
    padding: 14,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    color: "#713F12",
  },
  link: { fontSize: 16, fontWeight: "600", color: "#0F766E", paddingVertical: 8 },
  input: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 14,
    minHeight: 90,
    fontSize: 16,
    textAlignVertical: "top",
  },
  button: { backgroundColor: "#0F766E", borderRadius: 12, padding: 16 },
  disabled: { opacity: 0.45 },
  buttonText: { color: "white", fontSize: 17, fontWeight: "600", textAlign: "center" },
});
