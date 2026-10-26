import { ManualEditorPresentation } from "./ManualEditorPresentation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import {
  PlaceSearchSheet,
  type PlaceSearchResult,
} from "@/features/place-search/PlaceSearchSheet";
import type { PlaceSearchBinding } from "@/data/places/applePlaceProvider";
import { captureAccountScope } from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  createDefaultManualRentalRepository,
  type ManualRentalDraft,
  type ManualRentalFields,
  type ManualRentalRepository,
} from "@/data/repositories/manualRentalRepository";
import { UiButton, UiText as Text } from "@/ui/controls";
import { UiDatePicker, UiFormRow, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { TripCalendarRangeField } from "./TripCalendarRangeField";

type Opened = { repository: ManualRentalRepository; draft: ManualRentalDraft };

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

export function P4RentalEditor({
  tripId,
  embedded = false,
  registerDismissHandler,
  itemId,
  initialDate,
  tripStartDate,
  opened,
  onClose,
  onSaved,
  onChoosePlan,
  onChooseTransport,
}: {
  tripId: string;
  embedded?: boolean;
  registerDismissHandler?: (handler: () => void) => () => void;
  itemId?: string;
  initialDate?: string | null;
  tripStartDate?: string | null;
  opened?: Opened;
  onClose(): void;
  onSaved(itemId: string): void;
  onChoosePlan?(): void;
  onChooseTransport?(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = getAccountGeneration();
  const identity = useRef({ tripId, itemId, opened });
  useLayoutEffect(() => {
    identity.current = { tripId, itemId, opened };
  }, [tripId, itemId, opened]);
  const alive = useRef(true);
  const closedRef = useRef(false);
  const [source, setSource] = useState<Opened | null>(opened ?? null);
  const [fields, setFields] = useState<ManualRentalFields | null>(
    opened ? structuredClone(opened.draft.fields) : null,
  );
  const fieldsRef = useRef(fields);
  const initialRef = useRef(opened ? JSON.stringify(opened.draft.fields) : "");
  const busyRef = useRef(false);
  const frozenRef = useRef(false);
  const firstAttemptRef = useRef<ManualRentalFields | null>(null);
  const [status, setStatus] = useState<"LOADING" | "READY" | "ERROR" | "UNAVAILABLE">(
    opened ? "READY" : "LOADING",
  );
  const [saving, setSaving] = useState(false);
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    alive.current = true;
    if (!opened) {
      void (async () => {
        try {
          const repository = await createDefaultManualRentalRepository();
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
    alive.current &&
    !closedRef.current &&
    generation === getAccountGeneration() &&
    identity.current.tripId === tripId &&
    identity.current.itemId === itemId &&
    identity.current.opened === opened;
  const change = (next: Partial<ManualRentalFields>) => {
    if (!current() || frozenRef.current || busyRef.current || !fieldsRef.current) return;
    const value = { ...fieldsRef.current, ...next };
    fieldsRef.current = value;
    setFields(value);
  };
  const changeRentalDetail = (
    key: "supplier" | "reservedCategory" | "actualVehicleModel" | "verifiedPlate",
    value: string,
  ) => {
    if (!fieldsRef.current) return;
    change({
      rentalDetails: {
        ...fieldsRef.current.rentalDetails,
        [key]: value || null,
      },
    });
  };
  const placeRequest = useRef(0);
  const [placeError, setPlaceError] = useState(false);
  const [placeSearch, setPlaceSearch] = useState<{
    binding: PlaceSearchBinding;
    target: "pickupLocation" | "returnLocation";
    query: string;
  } | null>(null);
  const closePlaceSearch = () => {
    placeRequest.current++;
    setPlaceSearch(null);
  };
  const openPlaceSearch = async (target: "pickupLocation" | "returnLocation") => {
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
        query: snapshot[target],
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
    if (
      text === undefined ||
      text === null ||
      text.length > 500 ||
      (result.kind !== "MANUAL" && !text.trim())
    )
      return;
    const target = placeSearch.target;
    closePlaceSearch();
    // A selection supplies authored address text, never a qualified Core Place proof.
    change({ [target]: text });
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
  const formScroll = useRef<ScrollView>(null);
  const notesFocused = useRef(false);
  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      if (notesFocused.current) formScroll.current?.scrollToEnd({ animated: true });
    });
    return () => subscription.remove();
  }, []);
  const valid =
    !!fields?.title.trim() &&
    !!fields.startDate &&
    !!fields.startTime &&
    !!fields.pickupLocation.trim() &&
    !!fields.endDate &&
    !!fields.endTime &&
    !!fields.returnLocation.trim() &&
    fields.endDate >= fields.startDate &&
    !(fields.endDate === fields.startDate && fields.endTime < fields.startTime);
  return (
    <ManualEditorPresentation
      embedded={embedded}
      registerDismissHandler={registerDismissHandler}
      onClose={() => close()}
    >
      <SafeAreaProvider style={styles.body}>
        <SheetHeader
          title={t(itemId ? "tripCreate.editRental" : "tripCreate.newRental")}
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
                {t("tripCreate.rentalUnavailable")}
              </Text>
            ) : null}
            {status === "ERROR" ? (
              <Text accessibilityRole="alert" style={styles.meta}>
                {t("tripCreate.rentalRetrySame")}
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
                    <Text style={styles.caption}>{t("tripCreate.rentalName")}</Text>
                    <UiTextInput
                      accessibilityLabel={t("tripCreate.rentalName")}
                      placeholder={t("tripCreate.rentalName")}
                      value={fields.title}
                      maxLength={200}
                      editable={!saving && !frozen}
                      onChangeText={(title) => change({ title })}
                    />
                  </View>
                  <View onTouchEnd={Keyboard.dismiss}>
                    <TripCalendarRangeField
                      label={t("tripCreate.rentalDates")}
                      presentation="field"
                      value={{ start: fields.startDate, end: fields.endDate ?? "" }}
                      initialNavigationDate={tripStartDate}
                      markToday
                      disabled={saving || frozen}
                      onChange={({ start, end }) =>
                        change({ startDate: start, endDate: end })
                      }
                    />
                  </View>
                  <TimeField
                    label={t("tripCreate.rentalPickupTime")}
                    value={fields.startTime}
                    disabled={saving || frozen}
                    onChange={(startTime) => change({ startTime: startTime ?? "" })}
                  />
                  <View style={styles.field}>
                    <Text style={styles.caption}>
                      {t("tripCreate.rentalPickupPlace")}
                    </Text>
                    <UiTextInput
                      accessibilityLabel={t("tripCreate.rentalPickupPlace")}
                      placeholder={t("tripCreate.rentalPickupPlace")}
                      onFocus={() => void openPlaceSearch("pickupLocation")}
                      value={fields.pickupLocation}
                      maxLength={500}
                      editable={!saving && !frozen}
                      onChangeText={(pickupLocation) => change({ pickupLocation })}
                    />
                  </View>
                  <TimeField
                    label={t("tripCreate.rentalReturnTime")}
                    value={fields.endTime}
                    disabled={saving || frozen}
                    onChange={(endTime) => change({ endTime: endTime ?? "" })}
                  />
                  <View style={styles.field}>
                    <Text style={styles.caption}>
                      {t("tripCreate.rentalReturnPlace")}
                    </Text>
                    <UiTextInput
                      accessibilityLabel={t("tripCreate.rentalReturnPlace")}
                      placeholder={t("tripCreate.rentalReturnPlace")}
                      onFocus={() => void openPlaceSearch("returnLocation")}
                      value={fields.returnLocation}
                      maxLength={500}
                      editable={!saving && !frozen}
                      onChangeText={(returnLocation) => change({ returnLocation })}
                    />
                  </View>
                  {placeError ? (
                    <Text accessibilityRole="alert" style={styles.meta}>
                      {t("placeSearch.contextUnavailable")}
                    </Text>
                  ) : null}
                  {!valid ? (
                    <Text style={styles.meta}>
                      {t("tripCreate.rentalFieldsRequired")}
                    </Text>
                  ) : null}
                  {itemId ? (
                    <>
                      {(
                        [
                          ["supplier", "rentalSupplier"],
                          ["reservedCategory", "rentalReservedCategory"],
                          ["actualVehicleModel", "rentalActualModel"],
                          ["verifiedPlate", "rentalVerifiedPlate"],
                        ] as const
                      ).map(([field, label]) => (
                        <View key={field} style={styles.field}>
                          <Text style={styles.caption}>{t(`tripCreate.${label}`)}</Text>
                          <UiTextInput
                            accessibilityLabel={t(`tripCreate.${label}`)}
                            placeholder={t(`tripCreate.${label}`)}
                            value={fields.rentalDetails[field] ?? ""}
                            maxLength={field === "verifiedPlate" ? 64 : 500}
                            editable={!saving && !frozen}
                            onChangeText={(value) => changeRentalDetail(field, value)}
                          />
                        </View>
                      ))}
                    </>
                  ) : null}
                  <View style={styles.field}>
                    <Text style={styles.caption}>{t("tripCreate.rentalNotes")}</Text>
                    <UiTextInput
                      accessibilityLabel={t("tripCreate.rentalNotes")}
                      placeholder={t("tripCreate.rentalNotes")}
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
    notes: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 },
    timeHost: { flex: 1 },
    timeBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: colors.overlay,
    },
    timeSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      overflow: "hidden",
    },
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
