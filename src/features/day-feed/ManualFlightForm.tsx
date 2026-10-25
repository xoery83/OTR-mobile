import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { ManualEditorPresentation } from "./ManualEditorPresentation";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  readLocalManualFlightRepository,
  type LocalManualFlightRepository,
  type ManualFlightDraft,
} from "@/data/repositories/localManualFlightRepository";
import { FlightSegmentFields } from "./FlightSegmentFields";
import {
  emptyFlightSegment,
  flightSegmentFromRead,
  sparseFlightSavePlan,
  type FlightSegmentDraft,
} from "./manualFlightFormFields";
import { readTripPreparationSetupRepository } from "@/data/repositories/tripPreparationSetupRepository";
export function ManualFlightForm({
  tripId,
  initialDate,
  tripStartDate,
  itemId,
  expectedRevision,
  onDirtyChange,
  onSavingChange,
  onSaved,
  saveActionRef,
  onSaveEnabledChange,
  isIntentCurrent,
}: {
  tripId: string;
  initialDate?: string | null;
  tripStartDate?: string | null;
  itemId?: string;
  expectedRevision?: number;
  onDirtyChange(dirty: boolean): void;
  onSavingChange(saving: boolean): void;
  onSaved(itemId: string): Promise<void>;
  saveActionRef?: RefObject<(() => void) | null>;
  onSaveEnabledChange?(enabled: boolean): void;
  isIntentCurrent?(): boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const initial = [
    emptyFlightSegment("flight-1", initialDate ? validateCalendarDate(initialDate) : ""),
  ];
  const [segments, setSegments] = useState<FlightSegmentDraft[]>(initial),
    [full, setFull] = useState(Boolean(itemId)),
    [participantOptions, setParticipantOptions] = useState<
      readonly { personId: string; displayName: string }[]
    >([]),
    [picking, setPicking] = useState(false),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [attemptStarted, setAttemptStarted] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0),
    [error, setError] = useState<Error | null>(null);
  const pickers = useRef(new Set<string>());
  const fields = useRef(initial),
    nextKey = useRef(1),
    readyRef = useRef(false),
    repository = useRef<LocalManualFlightRepository | null>(null),
    draft = useRef<ManualFlightDraft | null>(null),
    alive = useRef(false),
    busy = useRef(false),
    attemptLocked = useRef(false),
    generation = useRef(getAccountGeneration()),
    lease = useRef<symbol | null>(null);
  const current = () =>
    alive.current &&
    generation.current === getAccountGeneration() &&
    (isIntentCurrent?.() ?? true);
  const mutable = () =>
    current() && !busy.current && !attemptLocked.current && (!itemId || readyRef.current);
  const publish = (next: FlightSegmentDraft[]) => {
    if (!mutable()) return;
    fields.current = next;
    setSegments(next);
    setError(null);
    onDirtyChange(true);
    onSaveEnabledChange?.(
      readyRef.current &&
        !pickers.current.size &&
        sparseFlightSavePlan(next, Boolean(itemId)).kind === "READY",
    );
  };
  useLayoutEffect(() => {
    alive.current = true;
    onDirtyChange(Boolean(initialDate && !itemId));
    return () => {
      alive.current = false;
      lease.current = null;
    };
    // The editor mounts a new Form for each Trip/Item identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const owner = Symbol("manual-flight-form");
    lease.current = owner;
    const active = () => current() && lease.current === owner;
    void (async () => {
      try {
        const repo = await readLocalManualFlightRepository();
        if (!active()) return;
        if (itemId) {
          const read = await repo.readForForm(tripId, itemId, expectedRevision);
          if (!active()) return;
          fields.current = [flightSegmentFromRead(read)];
          setSegments(fields.current);
        } else {
          const identity = await repo.createDraft(tripId);
          if (!active()) return;
          draft.current = identity;
        }
        repository.current = repo;
        readyRef.current = true;
        setReady(true);
        onSaveEnabledChange?.(
          !pickers.current.size &&
            sparseFlightSavePlan(fields.current, Boolean(itemId)).kind === "READY",
        );
        const setup = await readTripPreparationSetupRepository()
          .then((source) => source.read(tripId))
          .catch(() => null);
        if (active() && setup?.members.state === "AVAILABLE")
          setParticipantOptions(setup.members.people);
      } catch {
        if (active()) {
          setError(new Error());
          onSaveEnabledChange?.(false);
        }
      }
    })();
    return () => {
      if (lease.current === owner) lease.current = null;
    };
    // Callbacks report status; only the guarded Trip/Item/explicit retry changes the read intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, itemId, expectedRevision, loadAttempt]);
  const save = useCallback(async () => {
    const repo = repository.current,
      identity = draft.current,
      owner = lease.current;
    const active = () =>
      alive.current &&
      generation.current === getAccountGeneration() &&
      (isIntentCurrent?.() ?? true) &&
      lease.current === owner;
    const plan = sparseFlightSavePlan(fields.current, Boolean(itemId));
    if (
      !repo ||
      !identity ||
      !readyRef.current ||
      busy.current ||
      pickers.current.size > 0 ||
      !active() ||
      plan.kind !== "READY"
    )
      return;
    busy.current = true;
    attemptLocked.current = true;
    setAttemptStarted(true);
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      const result = await repo.save(identity, plan.fields, active);
      if (active() && result.status === "LOCAL_COMMITTED") await onSaved(result.itemId);
    } catch (reason) {
      if (active()) setError(reason instanceof Error ? reason : new Error());
    } finally {
      busy.current = false;
      if (active()) {
        onSaveEnabledChange?.(
          !pickers.current.size &&
            sparseFlightSavePlan(fields.current, Boolean(itemId)).kind === "READY",
        );
        setSaving(false);
        onSavingChange(false);
      }
    }
  }, [itemId, onSaved, onSavingChange, isIntentCurrent, onSaveEnabledChange]);
  useLayoutEffect(() => {
    if (!saveActionRef) return;
    const action = () => void save();
    saveActionRef.current = action;
    return () => {
      if (saveActionRef.current === action) saveActionRef.current = null;
    };
  }, [saveActionRef, save]);
  const pickerChanged = (key: string, field: string, open: boolean) => {
    if (!current() || (open && !mutable())) return;
    const token = `${key}:${field}`;
    if (open) pickers.current.add(token);
    else pickers.current.delete(token);
    setPicking(pickers.current.size > 0);
    onSaveEnabledChange?.(
      readyRef.current &&
        !busy.current &&
        !pickers.current.size &&
        sparseFlightSavePlan(fields.current, Boolean(itemId)).kind === "READY",
    );
  };
  const plan = sparseFlightSavePlan(segments, Boolean(itemId));
  const frozen = saving || attemptStarted || Boolean(itemId && !ready);
  const remove = (key: string) => {
    if (!mutable() || fields.current.length < 2) return;
    Alert.alert(t("manualFlight.removeTitle"), t("manualFlight.removeHint"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("manualFlight.removeFlight"),
        style: "destructive",
        onPress: () => {
          if (mutable() && fields.current.length > 1) {
            for (const token of pickers.current)
              if (token.startsWith(`${key}:`)) pickers.current.delete(token);
            setPicking(pickers.current.size > 0);
            publish(fields.current.filter((segment) => segment.key !== key));
          }
        },
      },
    ]);
  };
  return (
    <View style={styles.form}>
      {itemId && !ready ? (
        <UiText style={styles.meta}>
          {t(error ? "manualFlight.readUnavailable" : "dayFeed.loading")}
        </UiText>
      ) : (
        segments.map((segment, index) => (
          <View key={segment.key} style={styles.segment}>
            {segments.length > 1 ? (
              <UiText style={styles.segmentTitle}>
                {t("manualFlight.segment", { number: index + 1 })}
              </UiText>
            ) : null}
            <FlightSegmentFields
              value={segment}
              full={full}
              disabled={frozen}
              participantOptions={participantOptions}
              initialNavigationDate={tripStartDate}
              onPickerChange={(field, open) => pickerChanged(segment.key, field, open)}
              onChange={(changes) =>
                publish(
                  fields.current.map((entry) =>
                    entry.key === segment.key
                      ? { ...entry, ...changes, key: entry.key }
                      : entry,
                  ),
                )
              }
            />
            {segments.length > 1 ? (
              <UiButton
                label={t("manualFlight.removeFlight")}
                variant="text"
                disabled={frozen}
                onPress={() => remove(segment.key)}
              />
            ) : null}
          </View>
        ))
      )}
      {!full ? (
        <>
          <UiText style={styles.meta}>{t("manualFlight.lookupUnavailable")}</UiText>
          <UiButton
            label={t("manualFlight.manualDetails")}
            variant="secondary"
            disabled={frozen}
            onPress={() => {
              if (mutable()) setFull(true);
            }}
          />
        </>
      ) : null}
      <UiButton
        label={t("manualFlight.addFlight")}
        variant="text"
        disabled={frozen}
        onPress={() => {
          if (mutable())
            publish([
              ...fields.current,
              emptyFlightSegment(`flight-${++nextKey.current}`, initialDate ?? ""),
            ]);
        }}
      />
      {plan.kind === "CORE_PENDING" ? (
        <UiText accessibilityRole="alert" style={styles.meta}>
          {t(
            plan.reason === "EDIT"
              ? "manualFlight.editPending"
              : plan.reason === "JOURNEY"
                ? "manualFlight.journeyPending"
                : "manualFlight.detailsPending",
          )}
        </UiText>
      ) : null}
      {plan.kind === "INVALID" &&
      segments.some((segment) => segment.flightNumberLiteral || segment.departureDate) ? (
        <UiText style={styles.meta}>{t("manualFlight.invalid")}</UiText>
      ) : null}
      {error ? (
        <>
          <UiText accessibilityRole="alert" style={styles.meta}>
            {t(
              error.message === "LOCAL_CLAIM_COVERAGE_UNKNOWN"
                ? "manualFlight.claimUnavailable"
                : itemId
                  ? "manualFlight.readUnavailable"
                  : !ready
                    ? "manualFlight.loadUnavailable"
                    : "manualFlight.saveUnavailable",
            )}
          </UiText>
          {!ready ? (
            <UiButton
              label={t("common.tryAgain")}
              variant="text"
              onPress={() => {
                if (current() && !busy.current) {
                  setError(null);
                  setLoadAttempt(loadAttempt + 1);
                }
              }}
            />
          ) : null}
        </>
      ) : null}
      {!saveActionRef ? (
        <UiButton
          label={t("tripCreate.saveItem")}
          disabled={!ready || saving || picking || plan.kind !== "READY"}
          onPress={() => void save()}
        />
      ) : null}
    </View>
  );
}
export function ManualFlightEditor({
  tripId,
  initialDate,
  tripStartDate,
  itemId,
  expectedRevision,
  onClose,
  onSaved,
  registerDismissHandler,
}: {
  tripId: string;
  initialDate: string | null;
  tripStartDate?: string | null;
  itemId?: string;
  expectedRevision?: number;
  onClose(): void;
  onSaved(itemId: string): void;
  registerDismissHandler?: (handler: () => void) => () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useRef(getAccountGeneration());
  const closed = useRef(false);
  const dirty = useRef(false),
    busy = useRef(false),
    alive = useRef(true);
  const [saving, setSaving] = useState(false),
    [canSave, setCanSave] = useState(false);
  const saveAction = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const current = () =>
    alive.current && !closed.current && generation.current === getAccountGeneration();
  const close = () => {
    if (!current() || busy.current) return;
    if (!dirty.current) {
      closed.current = true;
      saveAction.current = null;
      onClose();
      return;
    }
    Alert.alert(t("actionIsland.unsavedTitle"), t("actionIsland.unsavedHint"), [
      { text: t("actionIsland.stay"), style: "cancel" },
      {
        text: t("actionIsland.discard"),
        style: "destructive",
        onPress: () => {
          if (current() && !busy.current) {
            closed.current = true;
            saveAction.current = null;
            onClose();
          }
        },
      },
    ]);
  };
  return (
    <ManualEditorPresentation
      embedded
      onClose={close}
      registerDismissHandler={registerDismissHandler}
    >
      <SafeAreaProvider style={styles.body}>
        <SheetHeader
          category="form"
          title={t(itemId ? "manualFlight.editFlight" : "manualFlight.newFlight")}
          rightLabel={t("ui.save")}
          rightDisabled={!canSave || saving}
          onRight={() => saveAction.current?.()}
          leftLabel={t("common.cancel")}
          leftDisabled={saving}
          onLeft={close}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          style={styles.body}
          contentContainerStyle={styles.content}
        >
          <ManualFlightForm
            key={JSON.stringify([tripId, itemId ?? null])}
            itemId={itemId}
            expectedRevision={expectedRevision}
            isIntentCurrent={current}
            saveActionRef={saveAction}
            onSaveEnabledChange={setCanSave}
            tripId={tripId}
            initialDate={initialDate}
            tripStartDate={tripStartDate}
            onDirtyChange={(value) => {
              dirty.current = value;
            }}
            onSavingChange={(value) => {
              busy.current = value;
              if (current()) setSaving(value);
            }}
            onSaved={async (itemId) => {
              if (current()) onSaved(itemId);
            }}
          />
        </ScrollView>
      </SafeAreaProvider>
    </ManualEditorPresentation>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    form: { gap: visual.space.section },
    segment: { gap: visual.space.heading },
    segmentTitle: { ...visual.type.section, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    content: { padding: visual.space.page, gap: visual.space.card },
  });
