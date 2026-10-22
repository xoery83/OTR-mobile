import {
  PlaceSearchSheet,
  type PlaceSearchResult,
} from "@/features/place-search/PlaceSearchSheet";
import type { PlaceSearchBinding } from "@/data/places/applePlaceProvider";
import { captureAccountScope } from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { ManualEditorPresentation } from "./ManualEditorPresentation";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  createDefaultManualPlanRepository,
  type ManualPlanDraft,
  type ManualPlanFields,
  type ManualPlanRepository,
} from "@/data/repositories/manualPlanRepository";
import { UiButton, UiText as Text } from "@/ui/controls";
import { UiDatePicker, UiFormRow, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { TripCalendarRangeField } from "./TripCalendarRangeField";
import { PlanParticipantsField } from "./PlanParticipantsField";
import { AppIcon } from "@/components/AppIcon";

type Opened = { repository: ManualPlanRepository; draft: ManualPlanDraft };

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
    <View style={styles.timeField}>
      <UiFormRow
        variant="field"
        label={label}
        value={value ?? t("tripCreate.notSet")}
        disabled={disabled}
        onPress={() => {
          const date = new Date();
          if (value) date.setHours(+value.slice(0, 2), +value.slice(3, 5), 0, 0);
          setSelected(date);
          setOpen(true);
        }}
      />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView edges={["bottom"]} style={styles.timeSheet}>
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
            disabled={disabled}
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function P1PlanEditor({
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
  onChooseStay,
  onChooseRental,
  onChooseTransport,
  onFindPlace,
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
  onChooseStay?(): void;
  onChooseRental?(): void;
  onChooseTransport?(): void;
  onFindPlace?(current: string): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const generation = getAccountGeneration();
  const alive = useRef(true);
  const closedRef = useRef(false);
  const [source, setSource] = useState<Opened | null>(opened ?? null);
  const [fields, setFields] = useState<ManualPlanFields | null>(
    opened ? structuredClone(opened.draft.fields) : null,
  );
  const fieldsRef = useRef(fields);
  const initialRef = useRef(opened ? JSON.stringify(opened.draft.fields) : "");
  const busyRef = useRef(false);
  const frozenRef = useRef(false);
  const firstAttemptRef = useRef<ManualPlanFields | null>(null);
  const [status, setStatus] = useState<"LOADING" | "READY" | "ERROR" | "UNAVAILABLE">(
    opened ? "READY" : "LOADING",
  );
  const placeRequest = useRef({ ticket: 0 });
  const [placeSearch, setPlaceSearch] = useState<{
    binding: PlaceSearchBinding;
    query: string;
    target: "FIND_PLACE" | "LOCATION";
    fields: ManualPlanFields;
  } | null>(null);
  const [placeError, setPlaceError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    const placeRequests = placeRequest.current;
    alive.current = true;
    if (!opened) {
      void (async () => {
        try {
          const repository = await createDefaultManualPlanRepository();
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
      placeRequests.ticket++;
    };
  }, [tripId, itemId, initialDate, opened, generation]);
  const current = () =>
    alive.current && !closedRef.current && generation === getAccountGeneration();
  const change = (next: Partial<ManualPlanFields>) => {
    if (!current() || frozenRef.current || busyRef.current || !fieldsRef.current) return;
    const value = { ...fieldsRef.current, ...next };
    fieldsRef.current = value;
    setFields(value);
  };
  const closePlaceSearch = () => {
    placeRequest.current.ticket++;
    setPlaceSearch(null);
  };
  const openPlaceSearch = async (target: "FIND_PLACE" | "LOCATION") => {
    const snapshot = fieldsRef.current;
    if (!snapshot || !source || !current() || busyRef.current || frozenRef.current)
      return;
    const ticket = ++placeRequest.current.ticket;
    setPlaceError(false);
    try {
      const account = await captureAccountScope(requireActiveUserId);
      if (
        !current() ||
        account.generation !== generation ||
        ticket !== placeRequest.current.ticket ||
        fieldsRef.current !== snapshot ||
        busyRef.current ||
        frozenRef.current
      )
        return;
      const binding: PlaceSearchBinding = Object.freeze({
        accountId: account.accountId,
        tripId,
        editorId: source.draft.itemId,
        accountGeneration: generation,
        isCurrent: () =>
          current() &&
          ticket === placeRequest.current.ticket &&
          fieldsRef.current === snapshot &&
          !busyRef.current &&
          !frozenRef.current,
      });
      setPlaceSearch({
        binding,
        target,
        query: snapshot.location || snapshot.title,
        fields: snapshot,
      });
    } catch {
      if (current() && ticket === placeRequest.current.ticket) setPlaceError(true);
    }
  };
  const confirmPlace = (result: PlaceSearchResult) => {
    const search = placeSearch;
    if (!search || !search.binding.isCurrent() || fieldsRef.current !== search.fields)
      return;
    if (result.kind === "MANUAL") {
      if (result.text.length > 500) return;
      closePlaceSearch();
      change({ location: result.text || null });
    } else {
      if (!result.place.address?.trim() || result.place.address.length > 500) return;
      closePlaceSearch();
      change({ location: result.place.address });
    }
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
            "MANUAL_PLAN_DRAFT_UNAVAILABLE",
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
  const valid =
    !!fields?.title.trim() &&
    !!fields.startDate &&
    (fields.participation.mode !== "SELECTED_MEMBERS" ||
      fields.participation.people.length > 0) &&
    (!fields.endDate || fields.endDate >= fields.startDate) &&
    (!fields.endTime || !!fields.endDate) &&
    !(
      fields.endDate === fields.startDate &&
      fields.startTime &&
      fields.endTime &&
      fields.endTime < fields.startTime
    );
  return (
    <ManualEditorPresentation
      embedded={embedded}
      registerDismissHandler={registerDismissHandler}
      onClose={() => close()}
    >
      <SafeAreaProvider style={styles.body}>
        <SheetHeader
          category="form"
          title={t(itemId ? "tripCreate.editPlan" : "tripCreate.newPlan")}
          rightLabel={t(itemId ? "tripCreate.saveChanges" : "tripCreate.createPlan")}
          rightDisabled={!valid || saving || (frozen && status !== "ERROR")}
          onRight={() => void save()}
          leftLabel={t("common.cancel")}
          leftDisabled={saving}
          onLeft={() => close()}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.body}
          contentContainerStyle={styles.content}
        >
          {status === "LOADING" ? (
            <Text style={styles.meta}>{t("dayFeed.loading")}</Text>
          ) : null}
          {status === "UNAVAILABLE" ? (
            <Text accessibilityRole="alert" style={styles.meta}>
              {t("tripCreate.planUnavailable")}
            </Text>
          ) : null}
          {status === "ERROR" ? (
            <Text accessibilityRole="alert" style={styles.meta}>
              {t("tripCreate.planRetrySame")}
            </Text>
          ) : null}
          {fields && source ? (
            <>
              {onChooseStay ? (
                <UiButton
                  label={t("tripCreate.stay")}
                  variant="text"
                  disabled={saving}
                  onPress={() => close(onChooseStay)}
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
                  <Text style={styles.caption}>{t("tripCreate.planName")}</Text>
                  <UiTextInput
                    accessibilityLabel={t("tripCreate.planName")}
                    placeholder={t("tripCreate.planName")}
                    value={fields.title}
                    maxLength={200}
                    editable={!saving && !frozen}
                    onChangeText={(title) => change({ title })}
                  />
                </View>
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.caption}>{t("tripCreate.planLocation")}</Text>
                    <UiButton
                      label={t("tripCreate.findPlace")}
                      variant="text"
                      disabled={saving || frozen}
                      onPress={() => {
                        Keyboard.dismiss();
                        if (onFindPlace)
                          onFindPlace(
                            fieldsRef.current?.location || fieldsRef.current?.title || "",
                          );
                        else void openPlaceSearch("LOCATION");
                      }}
                    />
                  </View>
                  <View>
                    <UiTextInput
                      accessibilityLabel={t("tripCreate.planLocation")}
                      placeholder={t("tripCreate.planLocation")}
                      value={fields.location ?? ""}
                      maxLength={500}
                      editable={!saving && !frozen}
                      style={styles.locationInput}
                      onFocus={() => {
                        Keyboard.dismiss();
                        void openPlaceSearch("LOCATION");
                      }}
                      onChangeText={(location) => change({ location: location || null })}
                    />
                    {fields.location ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("tripCreate.clearLocation")}
                        disabled={saving || frozen}
                        onPress={() => change({ location: null })}
                        style={styles.clearLocation}
                      >
                        <AppIcon name="xmark.circle.fill" color={colors.textSecondary} />
                      </Pressable>
                    ) : null}
                  </View>
                  {placeError ? (
                    <Text accessibilityRole="alert" style={styles.meta}>
                      {t("placeSearch.contextUnavailable")}
                    </Text>
                  ) : null}
                </View>
                <TripCalendarRangeField
                  label={t("tripCreate.itemDate")}
                  presentation="field"
                  value={{ start: fields.startDate, end: fields.endDate ?? "" }}
                  referenceRange={{ start: tripStartDate ?? "", end: tripEndDate ?? "" }}
                  initialNavigationDate={tripStartDate}
                  disabled={saving || frozen}
                  onChange={({ start, end }) =>
                    change({
                      startDate: start,
                      endDate: end || null,
                      ...(end ? {} : { endTime: null }),
                    })
                  }
                />
                {!fields.startDate ? (
                  <Text style={styles.meta}>{t("tripCreate.planStartRequired")}</Text>
                ) : null}
                <View style={styles.times}>
                  <TimeField
                    label={t("tripCreate.startTime")}
                    value={fields.startTime}
                    disabled={saving || frozen}
                    onChange={(startTime) => change({ startTime })}
                  />
                  <TimeField
                    label={t("tripCreate.endTime")}
                    value={fields.endTime}
                    disabled={saving || frozen || !fields.startDate}
                    onChange={(endTime) =>
                      change({
                        endTime,
                        ...(endTime && !fields.endDate
                          ? { endDate: fields.startDate }
                          : {}),
                      })
                    }
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.caption}>{t("tripCreate.planNotes")}</Text>
                  <UiTextInput
                    accessibilityLabel={t("tripCreate.planNotes")}
                    placeholder={t("tripCreate.addNote")}
                    value={fields.description ?? ""}
                    maxLength={5000}
                    multiline
                    style={styles.notes}
                    editable={!saving && !frozen}
                    onChangeText={(description) =>
                      change({ description: description || null })
                    }
                  />
                </View>
                <PlanParticipantsField
                  value={fields.participation}
                  options={source.draft.participantOptions}
                  disabled={saving || frozen}
                  onChange={(participation) => change({ participation })}
                />
              </View>
            </>
          ) : null}
        </ScrollView>
        {placeSearch &&
        placeSearch.binding.tripId === tripId &&
        placeSearch.binding.editorId === source?.draft.itemId &&
        placeSearch.binding.accountGeneration === generation ? (
          <PlaceSearchSheet
            binding={placeSearch.binding}
            initialQuery={placeSearch.query}
            nameChoice={false}
            selectionMode="immediate"
            onCancel={closePlaceSearch}
            onConfirm={confirmPlace}
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
    meta: { ...visual.type.meta, color: colors.textSecondary },
    form: { gap: visual.space.section },
    field: { gap: visual.space.heading },
    caption: { ...visual.type.action, color: colors.textPrimary },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
    },
    locationInput: { paddingRight: 48 },
    clearLocation: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    times: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.card },
    timeField: { flexGrow: 1, flexBasis: 140, minWidth: 0 },
    timeSheet: { backgroundColor: colors.surface, flex: 1 },
    notes: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 },
  });
