import { ManualEditorPresentation } from "./ManualEditorPresentation";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  createDefaultManualActivityRepository,
  manualActivityFieldsSchema,
  type ManualActivityDraft,
  type ManualActivityFields,
  type ManualActivityRepository,
} from "@/data/repositories/manualActivityRepository";
import { UiButton, UiText as Text } from "@/ui/controls";
import { UiDatePicker, UiFormRow, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { TripCalendarRangeField } from "./TripCalendarRangeField";
import { PlanParticipantsField } from "./PlanParticipantsField";
import {
  PlaceSearchSheet,
  type PlaceSearchResult,
} from "@/features/place-search/PlaceSearchSheet";
import type { PlaceSearchBinding } from "@/data/places/applePlaceProvider";
import { captureAccountScope } from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";

type Opened = { repository: ManualActivityRepository; draft: ManualActivityDraft };

function TimeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onChange(value: string | null): void;
}) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Date());
  return (
    <View>
      <UiFormRow
        variant="field"
        label={label}
        value={value || t("tripCreate.notSet")}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          const date = new Date();
          if (value) date.setHours(+value.slice(0, 2), +value.slice(3, 5), 0, 0);
          setSelected(date);
          setOpen(true);
        }}
      />
      <Modal
        visible={open && !disabled}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaProvider style={styles.timeHost}>
          <View style={styles.timeBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
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
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              />
            </SafeAreaView>
          </View>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

export function P6ActivityEditor({
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
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = getAccountGeneration();
  const alive = useRef(true);
  const closedRef = useRef(false);
  const [source, setSource] = useState<Opened | null>(opened ?? null);
  const [fields, setFields] = useState<ManualActivityFields | null>(
    opened ? structuredClone(opened.draft.fields) : null,
  );
  const fieldsRef = useRef(fields);
  const initialRef = useRef(opened ? JSON.stringify(opened.draft.fields) : "");
  const busyRef = useRef(false);
  const frozenRef = useRef(false);
  const firstAttemptRef = useRef<ManualActivityFields | null>(null);
  const [status, setStatus] = useState<"LOADING" | "READY" | "ERROR" | "UNAVAILABLE">(
    opened ? "READY" : "LOADING",
  );
  const [showAdmission, setShowAdmission] = useState(false);
  const [saving, setSaving] = useState(false);
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    alive.current = true;
    if (!opened) {
      void (async () => {
        try {
          const repository = await createDefaultManualActivityRepository();
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
  const change = (next: Partial<ManualActivityFields>) => {
    if (!current() || frozenRef.current || busyRef.current || !fieldsRef.current) return;
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
    if (!source || !fieldsRef.current || busyRef.current || !current()) return;
    const attempt = firstAttemptRef.current ?? structuredClone(fieldsRef.current);
    firstAttemptRef.current = attempt;
    busyRef.current = true;
    frozenRef.current = true;
    setSaving(true);
    setFrozen(true);
    setStatus("READY");
    try {
      const result = await source.repository.save(source.draft, attempt);
      if (current()) onSaved(result.itemId);
    } catch (error) {
      if (current()) {
        const code = error instanceof Error ? error.message : "";
        setStatus(
          [
            "MANUAL_PLAN_UNAVAILABLE",
            "MANUAL_PLAN_SCOPE_CHANGED",
            "MANUAL_PLAN_CONFLICT",
            "MANUAL_PLAN_RETRY_MISMATCH",
            "MANUAL_PLAN_DRAFT_FROZEN",
            "REVISION_CONFLICT",
            "NOT_VISIBLE",
            "CROSS_TRIP_PERSON",
            "CORE_ACCESS_REVOKED",
          ].includes(code)
            ? "UNAVAILABLE"
            : "ERROR",
        );
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
  const placeRequest = useRef(0);
  const [placeError, setPlaceError] = useState(false);
  const [placeSearch, setPlaceSearch] = useState<{
    binding: PlaceSearchBinding;
    target: "location" | "entryLocation";
    query: string;
  } | null>(null);
  const closePlaceSearch = () => {
    placeRequest.current++;
    setPlaceSearch(null);
  };
  const openPlaceSearch = async (target: "location" | "entryLocation") => {
    const snapshot = fieldsRef.current;
    if (!snapshot || !source || !current() || busyRef.current || frozenRef.current)
      return;
    Keyboard.dismiss();
    const ticket = ++placeRequest.current;
    setPlaceError(false);
    try {
      const account = await captureAccountScope(requireActiveUserId);
      const isCurrent = () =>
        current() &&
        account.generation === getAccountGeneration() &&
        ticket === placeRequest.current &&
        fieldsRef.current === snapshot &&
        !busyRef.current &&
        !frozenRef.current;
      if (!isCurrent()) return;
      setPlaceSearch({
        target,
        query:
          (target === "location"
            ? snapshot.location
            : snapshot.activityDetails.entryLocation) ?? "",
        binding: {
          accountId: account.accountId,
          tripId,
          editorId: source.draft.itemId,
          accountGeneration: account.generation,
          isCurrent,
        },
      });
    } catch {
      if (current() && ticket === placeRequest.current) setPlaceError(true);
    }
  };
  const confirmPlace = (result: PlaceSearchResult) => {
    if (!placeSearch?.binding.isCurrent()) return;
    const text = result.kind === "MANUAL" ? result.text : result.place.address;
    if (text == null || text.length > 500 || (result.kind !== "MANUAL" && !text.trim()))
      return;
    const target = placeSearch.target;
    closePlaceSearch();
    // Selected address is authored text, not a qualified Core Place proof.
    if (target === "location") change({ location: text || null });
    else if (fieldsRef.current)
      change({
        activityDetails: {
          ...fieldsRef.current.activityDetails,
          entryLocation: text || null,
        },
      });
  };
  const valid = manualActivityFieldsSchema.safeParse(fields).success;
  const detail = (key: keyof ManualActivityFields["activityDetails"], text: string) => {
    if (fieldsRef.current)
      change({
        activityDetails: { ...fieldsRef.current.activityDetails, [key]: text || null },
      });
  };
  return (
    <ManualEditorPresentation
      embedded={embedded}
      registerDismissHandler={registerDismissHandler}
      onClose={() => close()}
    >
      <SafeAreaProvider style={styles.body}>
        <SheetHeader
          title={t(itemId ? "p6.edit" : "p6.form.new")}
          category="form"
          rightLabel={t("ui.save")}
          rightDisabled={
            !valid || saving || status === "UNAVAILABLE" || (frozen && status !== "ERROR")
          }
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
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onLayout={() => {
              if (notesFocused.current)
                formScroll.current?.scrollToEnd({ animated: true });
            }}
            style={styles.body}
            contentContainerStyle={styles.content}
          >
            {status === "LOADING" ? (
              <Text style={styles.meta}>{t("dayFeed.loading")}</Text>
            ) : null}
            {status === "UNAVAILABLE" ? (
              <Text accessibilityRole="alert" style={styles.meta}>
                {t("p6.form.unavailable")}
              </Text>
            ) : null}
            {status === "ERROR" ? (
              <Text accessibilityRole="alert" style={styles.meta}>
                {t("p6.form.retry")}
              </Text>
            ) : null}
            {fields && source ? (
              <>
                <View style={styles.form}>
                  <View style={styles.field}>
                    <Text style={styles.caption}>{t("p6.form.name")}</Text>
                    <UiTextInput
                      accessibilityLabel={t("p6.form.name")}
                      placeholder={t("p6.form.name")}
                      value={fields.title}
                      maxLength={200}
                      editable={!saving && !frozen}
                      onChangeText={(title) => change({ title })}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.caption}>{t("p6.form.venue")}</Text>
                    <UiTextInput
                      accessibilityLabel={t("p6.form.venue")}
                      placeholder={t("p6.form.venue")}
                      value={fields.location ?? ""}
                      maxLength={500}
                      editable={!saving && !frozen}
                      onFocus={() => void openPlaceSearch("location")}
                      onChangeText={(location) => change({ location: location || null })}
                    />
                  </View>
                  <TripCalendarRangeField
                    presentation="field"
                    label={t("tripCreate.itemDate")}
                    value={{ start: fields.startDate, end: fields.endDate ?? "" }}
                    initialNavigationDate={tripStartDate}
                    referenceRange={{
                      start: tripStartDate ?? "",
                      end: tripEndDate ?? "",
                    }}
                    disabled={saving || frozen}
                    onChange={({ start, end }) =>
                      change({
                        startDate: start,
                        endDate: end || null,
                        ...(!end ? { endTime: null } : {}),
                      })
                    }
                  />
                  <View style={styles.dateTime}>
                    <View style={styles.timeField}>
                      <TimeField
                        label={t("p6.form.startTime")}
                        value={fields.startTime}
                        disabled={saving || frozen}
                        onChange={(startTime) => change({ startTime })}
                      />
                    </View>
                    {fields.endDate ? (
                      <View style={styles.timeField}>
                        <TimeField
                          label={t("p6.form.endTime")}
                          value={fields.endTime}
                          disabled={saving || frozen}
                          onChange={(endTime) => change({ endTime })}
                        />
                      </View>
                    ) : null}
                  </View>
                  <UiButton
                    label={t("p6.admissionDetails")}
                    variant="text"
                    disabled={saving || frozen}
                    onPress={() => setShowAdmission(!showAdmission)}
                  />
                  {showAdmission ||
                  Object.values(fields.activityDetails).some(Boolean) ? (
                    <View style={styles.form}>
                      {(["sessionLabel", "admissionNote", "entryLocation"] as const).map(
                        (key) => (
                          <View key={key} style={styles.field}>
                            <Text style={styles.caption}>{t(`p6.form.${key}`)}</Text>
                            <UiTextInput
                              accessibilityLabel={t(`p6.form.${key}`)}
                              placeholder={t(`p6.form.${key}`)}
                              value={fields.activityDetails[key] ?? ""}
                              maxLength={key === "admissionNote" ? 2000 : 500}
                              editable={!saving && !frozen}
                              onFocus={
                                key === "entryLocation"
                                  ? () => void openPlaceSearch("entryLocation")
                                  : undefined
                              }
                              onChangeText={(text) => detail(key, text)}
                            />
                          </View>
                        ),
                      )}
                    </View>
                  ) : null}
                  {placeError ? (
                    <Text accessibilityRole="alert" style={styles.meta}>
                      {t("tripCreate.planManualPlace")}
                    </Text>
                  ) : null}
                  <PlanParticipantsField
                    compact
                    value={fields.participation}
                    options={source.draft.participantOptions}
                    disabled={saving || frozen}
                    onChange={(participation) => change({ participation })}
                  />
                  <View style={styles.field}>
                    <Text style={styles.caption}>{t("p6.form.notes")}</Text>
                    <UiTextInput
                      accessibilityLabel={t("p6.form.notes")}
                      placeholder={t("p6.form.notes")}
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
                </View>
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
        {placeSearch ? (
          <PlaceSearchSheet
            binding={placeSearch.binding}
            initialQuery={placeSearch.query}
            onCancel={closePlaceSearch}
            onConfirm={confirmPlace}
            nameChoice={false}
            selectionMode="immediate"
          />
        ) : null}
      </SafeAreaProvider>
    </ManualEditorPresentation>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    form: { gap: visual.space.section },
    field: { gap: visual.space.heading },
    caption: { ...visual.type.action, color: colors.textPrimary },
    heading: { ...visual.type.section, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    endpoint: {
      gap: visual.space.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      paddingTop: visual.space.section,
    },
    dateTime: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.card },
    dateField: { flexGrow: 2, flexBasis: 180, minWidth: 0 },
    timeField: { flexGrow: 1, flexBasis: 130, minWidth: 0 },
    notes: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 },
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
  });
