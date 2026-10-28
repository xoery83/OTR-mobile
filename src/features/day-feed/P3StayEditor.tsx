import { ManualEditorPresentation } from "./ManualEditorPresentation";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  createDefaultManualStayRepository,
  manualStayFieldsSchema,
  type ManualStayDraft,
  type ManualStayFields,
  type ManualStayRepository,
} from "@/data/repositories/manualStayRepository";
import { UiButton, UiText as Text } from "@/ui/controls";
import { UiDatePicker, UiFormRow, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { TripCalendarRangeField } from "./TripCalendarRangeField";
import { PlanParticipantsField } from "./PlanParticipantsField";
import { P3StayLocationField } from "./P3StayLocationField";
import {
  p3PlaceSelectionDraft,
  currentP3PlaceSelection,
  type P3PlaceSelectionDraft,
} from "./p3PlaceSelectionDraft";

type Opened = { repository: ManualStayRepository; draft: ManualStayDraft };

function TimeField({
  label,
  value,
  defaultTime,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  defaultTime: string;
  disabled: boolean;
  onChange(value: string | null): void;
}) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Date());
  return (
    <View style={styles.timeField}>
      <UiFormRow
        stacked
        horizontalInset={0}
        label={label}
        value={value ?? t("tripCreate.notSet")}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          const date = new Date();
          const clock = value ?? defaultTime;
          date.setHours(+clock.slice(0, 2), +clock.slice(3, 5), 0, 0);
          setSelected(date);
          setOpen(true);
        }}
      />
      <Modal
        visible={open && !disabled}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaProvider style={styles.timeHost}>
          <View style={styles.timeBackdrop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
              style={StyleSheet.absoluteFill}
              onPress={() => setOpen(false)}
            />
            <SafeAreaView edges={["bottom", "left", "right"]} style={styles.timeSheet}>
              <SheetHeader
                category="picker"
                safeTop={false}
                title={label}
                onLeft={() => setOpen(false)}
                onRight={() => {
                  if (!disabled)
                    onChange(
                      `${String(selected.getHours()).padStart(2, "0")}:${String(selected.getMinutes()).padStart(2, "0")}`,
                    );
                  setOpen(false);
                }}
                rightDisabled={disabled}
              />
              <ScrollView
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
                keyboardDismissMode="interactive"
                style={styles.timeScroll}
              >
                <UiDatePicker
                  mode="time"
                  display="spinner"
                  value={selected}
                  accessibilityLabel={label}
                  onChange={(_, date) => {
                    if (date) setSelected(date);
                  }}
                />
                <UiButton
                  label={t("tripCreate.clearTime")}
                  variant="text"
                  disabled={disabled}
                  onPress={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                />
              </ScrollView>
            </SafeAreaView>
          </View>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

export function P3StayEditor({
  tripId,
  embedded = false,
  registerDismissHandler,
  itemId,
  initialDate,
  tripStartDate,
  tripEndDate,
  opened,
  onClose,
  onSaved,
  onChoosePlan,
  onChooseRental,
  onChooseTransport,
}: {
  tripId: string;
  embedded?: boolean;
  registerDismissHandler?: (handler: () => void) => () => void;
  itemId?: string;
  initialDate?: string | null;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  opened?: Opened;
  onClose(): void;
  onSaved(itemId: string): void;
  onChoosePlan?(): void;
  onChooseRental?(): void;
  onChooseTransport?(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = getAccountGeneration();
  const alive = useRef(true);
  const closedRef = useRef(false);
  const [source, setSource] = useState<Opened | null>(opened ?? null);
  const [fields, setFields] = useState<ManualStayFields | null>(
    opened ? structuredClone(opened.draft.fields) : null,
  );
  const fieldsRef = useRef(fields);
  const locationInputRevision = useRef(0);
  const selectedPlaceDraft = useRef<P3PlaceSelectionDraft | null>(null);
  const initialRef = useRef(opened ? JSON.stringify(opened.draft.fields) : "");
  const busyRef = useRef(false);
  const frozenRef = useRef(false);
  const firstAttemptRef = useRef<ManualStayFields | null>(null);
  const firstPlaceAttemptRef = useRef<P3PlaceSelectionDraft | null>(null);
  const unavailableRef = useRef(false);
  const [status, setStatus] = useState<"LOADING" | "READY" | "ERROR" | "UNAVAILABLE">(
    opened ? "READY" : "LOADING",
  );
  const [tripRange, setTripRange] = useState({
    start: tripStartDate ?? "",
    end: tripEndDate ?? "",
  });
  useEffect(() => {
    let active = true;
    if (tripStartDate === undefined || tripEndDate === undefined) {
      void readLocalTripRepository()
        .then((repository) => repository.getTrip(tripId))
        .then((trip) => {
          if (active && generation === getAccountGeneration())
            setTripRange({
              start: tripStartDate ?? trip?.startDate ?? "",
              end: tripEndDate ?? trip?.endDate ?? "",
            });
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [tripId, tripStartDate, tripEndDate, generation]);
  const [nameQuery, setNameQuery] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    alive.current = true;
    if (!opened) {
      void (async () => {
        try {
          const repository = await createDefaultManualStayRepository();
          const draft = itemId
            ? await repository.read(tripId, itemId)
            : await repository.createDraft(tripId);
          if (!alive.current || generation !== getAccountGeneration()) return;
          const value = structuredClone(draft.fields);
          if (!itemId && initialDate) value.startDate = initialDate;
          setSource({ repository, draft });
          fieldsRef.current = value;
          setFields(value);
          initialRef.current = JSON.stringify(value);
          setStatus("READY");
        } catch {
          if (alive.current && generation === getAccountGeneration())
            setStatus("UNAVAILABLE");
        }
      })();
    }
    return () => {
      alive.current = false;
    };
  }, [tripId, itemId, initialDate, opened, generation]);
  const current = () =>
    alive.current && !closedRef.current && generation === getAccountGeneration();
  const change = (next: Partial<ManualStayFields>) => {
    if (!current() || frozenRef.current || busyRef.current || !fieldsRef.current) return;
    if (Object.hasOwn(next, "location")) {
      locationInputRevision.current++;
      selectedPlaceDraft.current = null;
    }
    const value = { ...fieldsRef.current, ...next };
    fieldsRef.current = value;
    setFields(value);
  };
  const close = (then = onClose) => {
    if (!current() || busyRef.current) return;
    const dirty =
      fieldsRef.current !== null &&
      JSON.stringify(fieldsRef.current) !== initialRef.current;
    if (!dirty && !frozenRef.current) {
      closedRef.current = true;
      then();
      return;
    }
    Alert.alert(t("actionIsland.unsavedTitle"), t("actionIsland.unsavedHint"), [
      { text: t("actionIsland.stay"), style: "cancel" },
      {
        text: t("actionIsland.discard"),
        style: "destructive",
        onPress: () => {
          if (current() && !busyRef.current) {
            closedRef.current = true;
            then();
          }
        },
      },
    ]);
  };
  const save = async () => {
    if (
      !source ||
      !fieldsRef.current ||
      busyRef.current ||
      !current() ||
      unavailableRef.current ||
      !manualStayFieldsSchema.safeParse(fieldsRef.current).success
    )
      return;
    if (firstAttemptRef.current === null)
      firstPlaceAttemptRef.current = currentP3PlaceSelection(selectedPlaceDraft.current, {
        tripId,
        itemId: source.draft.itemId,
        accountGeneration: generation,
        inputRevision: locationInputRevision.current,
        location: fieldsRef.current.location,
      });
    const attempt = firstAttemptRef.current ?? structuredClone(fieldsRef.current);
    firstAttemptRef.current = attempt;
    busyRef.current = true;
    frozenRef.current = true;
    setSaving(true);
    setFrozen(true);
    setStatus("READY");
    try {
      const placeAttempt = firstPlaceAttemptRef.current;
      const result = placeAttempt
        ? await source.repository.save(source.draft, attempt, {
            intent: "ACCEPT_SELECTED_APPLE_PLACE_V1",
            draft: placeAttempt,
          })
        : await source.repository.save(source.draft, attempt);
      if (current()) onSaved(result.itemId);
    } catch (error) {
      if (current()) {
        const code = error instanceof Error ? error.message : "";
        unavailableRef.current = [
          "MANUAL_PLAN_UNAVAILABLE",
          "MANUAL_PLAN_SCOPE_CHANGED",
          "MANUAL_PLAN_CONFLICT",
          "MANUAL_PLAN_RETRY_MISMATCH",
          "MANUAL_PLAN_DRAFT_UNAVAILABLE",
          "MANUAL_PLAN_DRAFT_FROZEN",
          "REVISION_CONFLICT",
          "NOT_VISIBLE",
          "CROSS_TRIP_PERSON",
          "CORE_ACCESS_REVOKED",
        ].includes(code);
        setStatus(unavailableRef.current ? "UNAVAILABLE" : "ERROR");
      }
    } finally {
      busyRef.current = false;
      if (current()) setSaving(false);
    }
  };
  const formScroll = useRef<ScrollView>(null);
  const notesFocused = useRef(false);
  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      if (notesFocused.current) formScroll.current?.scrollToEnd({ animated: true });
    });
    return () => subscription.remove();
  }, []);
  const valid = manualStayFieldsSchema.safeParse(fields).success;
  const saveDisabled =
    !valid || saving || status === "UNAVAILABLE" || (frozen && status !== "ERROR");
  return (
    <ManualEditorPresentation
      embedded={embedded}
      registerDismissHandler={registerDismissHandler}
      onClose={() => close()}
    >
      <SafeAreaProvider style={styles.body}>
        <SheetHeader
          title={t(itemId ? "tripCreate.editStay" : "tripCreate.newStay")}
          category="form"
          rightLabel={t("ui.save")}
          rightDisabled={saveDisabled}
          onRight={() => void save()}
          leftLabel={t("common.cancel")}
          leftDisabled={saving}
          onLeft={() => close()}
        />
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            ref={formScroll}
            onLayout={() => {
              if (notesFocused.current)
                formScroll.current?.scrollToEnd({ animated: true });
            }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            style={styles.body}
            contentContainerStyle={styles.content}
          >
            {status === "LOADING" ? (
              <Text style={styles.meta}>{t("dayFeed.loading")}</Text>
            ) : null}
            {status === "UNAVAILABLE" ? (
              <Text accessibilityRole="alert" style={styles.meta}>
                {t("tripCreate.stayUnavailable")}
              </Text>
            ) : null}
            {status === "ERROR" ? (
              <Text accessibilityRole="alert" style={styles.meta}>
                {t("tripCreate.stayRetrySame")}
              </Text>
            ) : null}
            {fields && source ? (
              <>
                {onChoosePlan ? (
                  <UiButton
                    label={t("tripCreate.activity")}
                    variant="text"
                    disabled={saving}
                    onPress={() => close(onChoosePlan)}
                  />
                ) : null}
                {onChooseRental ? (
                  <UiButton
                    label={t("tripCreate.rental")}
                    variant="text"
                    disabled={saving}
                    onPress={() => close(onChooseRental)}
                  />
                ) : null}
                {onChooseTransport ? (
                  <UiButton
                    label={t("tripCreate.transport")}
                    variant="text"
                    disabled={saving}
                    onPress={() => close(onChooseTransport)}
                  />
                ) : null}
                <View style={styles.form}>
                  <View style={styles.field}>
                    <Text style={styles.caption}>{t("tripCreate.stayName")}</Text>
                    <UiTextInput
                      accessibilityLabel={t("tripCreate.stayName")}
                      placeholder={t("tripCreate.stayName")}
                      value={fields.title}
                      maxLength={200}
                      editable={!saving && !frozen}
                      onChangeText={(title) => {
                        if (!current() || busyRef.current || frozenRef.current) return;
                        change({ title });
                        setNameQuery(title);
                      }}
                    />
                  </View>
                  <P3StayLocationField
                    tripId={tripId}
                    editorId={source.draft.itemId}
                    title={fields.title}
                    nameQuery={nameQuery}
                    value={fields.location}
                    disabled={saving || frozen || status === "UNAVAILABLE"}
                    isCurrent={() =>
                      current() &&
                      !busyRef.current &&
                      !frozenRef.current &&
                      !unavailableRef.current
                    }
                    onChange={(location) => change({ location })}
                    onKeepName={() => setNameQuery(null)}
                    onPlaceSelected={(place) => {
                      if (
                        !current() ||
                        busyRef.current ||
                        frozenRef.current ||
                        !source ||
                        !fieldsRef.current
                      )
                        return;
                      selectedPlaceDraft.current = p3PlaceSelectionDraft(place, {
                        tripId,
                        itemId: source.draft.itemId,
                        accountGeneration: generation,
                        inputRevision: locationInputRevision.current,
                        location: fieldsRef.current.location,
                      });
                    }}
                    onSelectHotel={(title, location) => {
                      if (!current() || busyRef.current || frozenRef.current) return;
                      change({ title, location });
                      setNameQuery(null);
                    }}
                  />
                  <View onTouchEnd={Keyboard.dismiss}>
                    <TripCalendarRangeField
                      label={t("tripCreate.stayDates")}
                      presentation="field"
                      value={{ start: fields.startDate, end: fields.endDate ?? "" }}
                      referenceRange={{
                        start: tripStartDate ?? tripRange.start,
                        end: tripEndDate ?? tripRange.end,
                      }}
                      initialNavigationDate={tripStartDate ?? tripRange.start}
                      markToday
                      startWithCheckin
                      disabled={saving || frozen}
                      onChange={({ start, end }) =>
                        change({
                          startDate: start,
                          endDate: end || undefined,
                          ...(end ? {} : { endTime: null }),
                        })
                      }
                    />
                  </View>
                  {!fields.startDate || !fields.endDate ? (
                    <Text style={styles.meta}>{t("tripCreate.stayDatesRequired")}</Text>
                  ) : null}
                  <View style={styles.times}>
                    <TimeField
                      label={t("tripCreate.stayCheckinTime")}
                      defaultTime="17:00"
                      value={fields.startTime}
                      disabled={saving || frozen}
                      onChange={(startTime) => change({ startTime })}
                    />
                    <TimeField
                      label={t("tripCreate.stayCheckoutTime")}
                      defaultTime="10:00"
                      value={fields.endTime}
                      disabled={saving || frozen || !fields.endDate}
                      onChange={(endTime) => change({ endTime })}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.caption}>{t("tripCreate.stayNotes")}</Text>
                    <UiTextInput
                      accessibilityLabel={t("tripCreate.stayNotes")}
                      placeholder={t("tripCreate.addNote")}
                      value={fields.description ?? ""}
                      maxLength={5000}
                      multiline
                      style={styles.notes}
                      onFocus={() => {
                        notesFocused.current = true;
                        formScroll.current?.scrollToEnd({ animated: true });
                      }}
                      onBlur={() => {
                        notesFocused.current = false;
                      }}
                      editable={!saving && !frozen}
                      onChangeText={(description) =>
                        change({ description: description || null })
                      }
                    />
                  </View>
                  <PlanParticipantsField
                    compact
                    value={fields.participation}
                    options={source.draft.participantOptions}
                    disabled={saving || frozen}
                    onChange={(participation) => change({ participation })}
                  />
                </View>
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </ManualEditorPresentation>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    form: { gap: visual.space.section },
    field: { gap: visual.space.heading },
    caption: { ...visual.type.action, color: colors.textPrimary },
    times: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.card },
    timeField: { flexGrow: 1, flexBasis: 140, minWidth: 0 },
    timeHost: { flex: 1 },
    timeBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: colors.overlay,
    },
    timeSheet: {
      backgroundColor: colors.surface,
      maxHeight: "90%",
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      overflow: "hidden",
    },
    timeScroll: { flexGrow: 0, flexShrink: 1 },
    notes: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 },
  });
