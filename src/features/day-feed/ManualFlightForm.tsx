import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { ManualEditorPresentation } from "./ManualEditorPresentation";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { UiButton, UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  readLocalManualFlightRepository,
  type LocalManualFlightRepository,
  type ManualFlightDraft,
} from "@/data/repositories/localManualFlightRepository";
import { CalendarField } from "./TripCalendarField";
export function ManualFlightForm({
  tripId,
  initialDate,
  tripStartDate,
  onDirtyChange,
  onSavingChange,
  onSaved,
}: {
  tripId: string;
  initialDate?: string | null;
  tripStartDate?: string | null;
  onDirtyChange(dirty: boolean): void;
  onSavingChange(saving: boolean): void;
  onSaved(itemId: string): Promise<void>;
}) {
  useUiLocale();
  const [number, setNumber] = useState(""),
    [date, setDate] = useState(initialDate ? validateCalendarDate(initialDate) : "");
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [attemptStarted, setAttemptStarted] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const repository = useRef<LocalManualFlightRepository | null>(null),
    draft = useRef<ManualFlightDraft | null>(null),
    alive = useRef(false),
    busy = useRef(false),
    attemptLocked = useRef(false),
    generation = useRef(getAccountGeneration()),
    lease = useRef<symbol | null>(null);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      lease.current = null;
    };
  }, []);
  useEffect(() => {
    onDirtyChange(Boolean(number || date));
  }, [number, date, onDirtyChange]);
  useEffect(() => {
    const owner = Symbol("manual-flight-form");
    lease.current = owner;
    const current = () =>
      alive.current &&
      lease.current === owner &&
      generation.current === getAccountGeneration();
    void (async () => {
      try {
        const repo = await readLocalManualFlightRepository();
        if (!current()) return;
        const identity = await repo.createDraft(tripId);
        if (!current()) return;
        repository.current = repo;
        draft.current = identity;
        setReady(true);
      } catch {
        if (current()) setError(new Error());
      }
    })();
    return () => {
      if (lease.current === owner) lease.current = null;
    };
  }, [tripId]);
  const save = async () => {
    const repo = repository.current,
      identity = draft.current,
      owner = lease.current;
    const current = () =>
      alive.current &&
      lease.current === owner &&
      generation.current === getAccountGeneration();
    if (!repo || !identity || !ready || busy.current || !current()) return;
    busy.current = true;
    attemptLocked.current = true;
    setAttemptStarted(true);
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      const result = await repo.save(
        identity,
        { flightNumberLiteral: number, departureDate: date },
        current,
      );
      if (current() && result.status === "LOCAL_COMMITTED") await onSaved(result.itemId);
    } catch (e) {
      if (current()) setError(e instanceof Error ? e : new Error());
    } finally {
      busy.current = false;
      if (current()) {
        setSaving(false);
        onSavingChange(false);
      }
    }
  };
  return (
    <View>
      <UiTextInput
        accessibilityLabel={t("manualFlight.number")}
        placeholder={t("manualFlight.number")}
        value={number}
        onChangeText={(value) => {
          if (
            !attemptLocked.current &&
            alive.current &&
            generation.current === getAccountGeneration()
          ) {
            setNumber(value);
            onDirtyChange(Boolean(value || date));
          }
        }}
        maxLength={255}
        editable={!saving && !attemptStarted}
      />
      <CalendarField
        label={t("manualFlight.departureDate")}
        value={date}
        initialNavigationDate={tripStartDate}
        onChange={(value) => {
          if (
            !attemptLocked.current &&
            alive.current &&
            generation.current === getAccountGeneration()
          ) {
            setDate(value);
            onDirtyChange(Boolean(number || value));
          }
        }}
        disabled={saving || attemptStarted}
      />
      {error ? (
        <UiText accessibilityRole="alert">
          {error.message === "LOCAL_CLAIM_COVERAGE_UNKNOWN"
            ? t("manualFlight.claimUnavailable")
            : t("manualFlight.saveUnavailable")}
        </UiText>
      ) : null}
      <UiButton
        label={t("tripCreate.saveItem")}
        disabled={!ready || saving || !number.trim() || !date}
        onPress={() => void save()}
      />
    </View>
  );
}

export function ManualFlightEditor({
  tripId,
  initialDate,
  tripStartDate,
  onClose,
  onSaved,
  registerDismissHandler,
}: {
  tripId: string;
  initialDate: string | null;
  tripStartDate?: string | null;
  onClose(): void;
  onSaved(itemId: string): void;
  registerDismissHandler?: (handler: () => void) => () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useRef(getAccountGeneration());
  const dirty = useRef(false),
    busy = useRef(false),
    alive = useRef(true);
  const [saving, setSaving] = useState(false);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const current = () => alive.current && generation.current === getAccountGeneration();
  const close = () => {
    if (!current() || busy.current) return;
    if (!dirty.current) {
      onClose();
      return;
    }
    Alert.alert(t("actionIsland.unsavedTitle"), t("actionIsland.unsavedHint"), [
      { text: t("actionIsland.stay"), style: "cancel" },
      {
        text: t("actionIsland.discard"),
        style: "destructive",
        onPress: () => {
          if (current() && !busy.current) onClose();
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
          title={t("manualFlight.newFlight")}
          leftLabel={t("common.cancel")}
          leftDisabled={saving}
          onLeft={close}
        />
        <ScrollView style={styles.body} contentContainerStyle={styles.content}>
          <ManualFlightForm
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
    content: { padding: visual.space.page, gap: visual.space.card },
  });
