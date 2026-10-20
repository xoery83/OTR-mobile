import { useEffect, useRef, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  createDefaultManualStayRepository,
  type ManualStayDraft,
  type ManualStayFields,
  type ManualStayRepository,
} from "@/data/repositories/manualStayRepository";
import { UiButton, UiSection, UiText as Text } from "@/ui/controls";
import { UiChoiceChip, UiDatePicker, UiFormRow, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { CalendarField } from "./TripCalendarField";

type Opened = { repository: ManualStayRepository; draft: ManualStayDraft };

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
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Date());
  return (
    <View>
      <UiFormRow
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
      {open ? (
        <View>
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
            label={t("common.done")}
            onPress={() => {
              onChange(
                `${String(selected.getHours()).padStart(2, "0")}:${String(selected.getMinutes()).padStart(2, "0")}`,
              );
              setOpen(false);
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
          <UiButton
            label={t("common.cancel")}
            variant="text"
            onPress={() => setOpen(false)}
          />
        </View>
      ) : null}
    </View>
  );
}

export function P3StayEditor({
  tripId,
  itemId,
  initialDate,
  tripStartDate,
  opened,
  onClose,
  onSaved,
  onChoosePlan,
  onChooseRental,
  onFindPlace,
}: {
  tripId: string;
  itemId?: string;
  initialDate?: string | null;
  tripStartDate?: string | null;
  opened?: Opened;
  onClose(): void;
  onSaved(itemId: string): void;
  onChoosePlan?(): void;
  onChooseRental?(): void;
  onFindPlace?(current: string): void;
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
  const initialRef = useRef(opened ? JSON.stringify(opened.draft.fields) : "");
  const busyRef = useRef(false);
  const frozenRef = useRef(false);
  const firstAttemptRef = useRef<ManualStayFields | null>(null);
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
    const value = { ...fieldsRef.current, ...next };
    fieldsRef.current = value;
    setFields(value);
  };
  const changeStayTime = (
    key: "permittedCheckinFrom" | "permittedCheckinUntil" | "permittedCheckoutBy",
    value: string | null,
  ) => {
    if (!fieldsRef.current) return;
    change({ stayDetails: { ...fieldsRef.current.stayDetails, [key]: value } });
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
    !!fields.endDate &&
    fields.endDate >= fields.startDate &&
    (!fields.endTime || !!fields.endDate) &&
    !(
      fields.endDate === fields.startDate &&
      fields.startTime &&
      fields.endTime &&
      fields.endTime < fields.startTime
    );
  return (
    <Modal visible animationType="slide" onRequestClose={() => close()}>
      <SafeAreaProvider style={styles.body}>
        <SheetHeader
          title={t(itemId ? "tripCreate.editStay" : "tripCreate.newStay")}
          leftLabel={t("common.cancel")}
          leftDisabled={saving}
          onLeft={() => close()}
        />
        <ScrollView style={styles.body} contentContainerStyle={styles.content}>
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
              <UiSection title={t(itemId ? "tripCreate.editStay" : "tripCreate.newStay")}>
                <UiTextInput
                  accessibilityLabel={t("tripCreate.stayName")}
                  placeholder={t("tripCreate.stayName")}
                  value={fields.title}
                  maxLength={200}
                  editable={!saving && !frozen}
                  onChangeText={(title) => change({ title })}
                />
                <CalendarField
                  label={t("tripCreate.checkin")}
                  value={fields.startDate}
                  initialNavigationDate={tripStartDate}
                  disabled={saving || frozen}
                  onChange={(startDate) => change({ startDate })}
                />
                {!fields.startDate ? (
                  <Text style={styles.meta}>{t("tripCreate.stayDatesRequired")}</Text>
                ) : null}
                <TimeField
                  label={t("tripCreate.stayCheckinTime")}
                  value={fields.startTime}
                  disabled={saving || frozen}
                  onChange={(startTime) => change({ startTime })}
                />
                <CalendarField
                  label={t("tripCreate.checkout")}
                  value={fields.endDate ?? ""}
                  initialNavigationDate={fields.startDate || tripStartDate}
                  disabled={saving || frozen}
                  onChange={(endDate) =>
                    change({
                      endDate,
                      ...(endDate ? {} : { endTime: null }),
                    })
                  }
                />
                {!fields.endDate ? (
                  <Text style={styles.meta}>{t("tripCreate.stayDatesRequired")}</Text>
                ) : null}
                {fields.endDate ? (
                  <TimeField
                    label={t("tripCreate.stayCheckoutTime")}
                    value={fields.endTime}
                    disabled={saving || frozen}
                    onChange={(endTime) => change({ endTime })}
                  />
                ) : null}
                {itemId ? (
                  <>
                    <TimeField
                      label={t("tripCreate.stayArrivalFrom")}
                      value={fields.stayDetails.permittedCheckinFrom}
                      disabled={saving || frozen}
                      onChange={(value) => changeStayTime("permittedCheckinFrom", value)}
                    />
                    <TimeField
                      label={t("tripCreate.stayArrivalUntil")}
                      value={fields.stayDetails.permittedCheckinUntil}
                      disabled={saving || frozen}
                      onChange={(value) => changeStayTime("permittedCheckinUntil", value)}
                    />
                    <TimeField
                      label={t("tripCreate.stayCheckoutBy")}
                      value={fields.stayDetails.permittedCheckoutBy}
                      disabled={saving || frozen}
                      onChange={(value) => changeStayTime("permittedCheckoutBy", value)}
                    />
                  </>
                ) : null}
                <UiTextInput
                  accessibilityLabel={t("tripCreate.stayLocation")}
                  placeholder={t("tripCreate.stayLocation")}
                  value={fields.location ?? ""}
                  maxLength={500}
                  editable={!saving && !frozen}
                  onChangeText={(location) => change({ location: location || null })}
                />
                {onFindPlace ? (
                  <UiButton
                    label={t("tripCreate.findPlace")}
                    variant="text"
                    disabled={saving || frozen}
                    onPress={() => {
                      if (!busyRef.current && !frozenRef.current)
                        onFindPlace(fieldsRef.current?.location ?? "");
                    }}
                  />
                ) : null}
                <Text style={styles.meta}>{t("tripCreate.planManualPlace")}</Text>
                <UiTextInput
                  accessibilityLabel={t("tripCreate.stayNotes")}
                  placeholder={t("tripCreate.stayNotes")}
                  value={fields.description ?? ""}
                  maxLength={5000}
                  multiline
                  editable={!saving && !frozen}
                  onChangeText={(description) =>
                    change({ description: description || null })
                  }
                />
              </UiSection>
              <UiSection title={t("tripCreate.planParticipants")}>
                <UiChoiceChip
                  label={t("tripCreate.planEveryone")}
                  selected={fields.participation.mode === "WHOLE_GROUP"}
                  onPress={() =>
                    change({
                      participation: {
                        mode: "WHOLE_GROUP",
                        people: [],
                        selfPersonId: null,
                      },
                    })
                  }
                />
                {fields.participation.selfPersonId ? (
                  <UiChoiceChip
                    label={t("tripCreate.planOnlyMe")}
                    selected={fields.participation.mode === "SELF"}
                    onPress={() =>
                      change({
                        participation: {
                          mode: "SELF",
                          people: [],
                          selfPersonId: fields.participation.selfPersonId,
                        },
                      })
                    }
                  />
                ) : null}
                {source.draft.participantOptions.length ? (
                  <UiChoiceChip
                    label={t("tripCreate.planChooseMembers")}
                    selected={fields.participation.mode === "SELECTED_MEMBERS"}
                    onPress={() =>
                      change({
                        participation: {
                          mode: "SELECTED_MEMBERS",
                          people: fields.participation.people,
                          selfPersonId: null,
                        },
                      })
                    }
                  />
                ) : null}
                {fields.participation.mode === "SELECTED_MEMBERS"
                  ? source.draft.participantOptions.map((person) => (
                      <UiChoiceChip
                        key={person.personId}
                        label={person.displayName}
                        selected={fields.participation.people.includes(person.personId)}
                        onPress={() =>
                          change({
                            participation: {
                              mode: "SELECTED_MEMBERS",
                              people: fields.participation.people.includes(
                                person.personId,
                              )
                                ? fields.participation.people.filter(
                                    (id) => id !== person.personId,
                                  )
                                : [...fields.participation.people, person.personId],
                              selfPersonId: null,
                            },
                          })
                        }
                      />
                    ))
                  : null}
                {fields.participation.mode === "SELECTED_MEMBERS" &&
                fields.participation.people.length === 0 ? (
                  <Text style={styles.meta}>{t("tripCreate.planChooseOne")}</Text>
                ) : null}
              </UiSection>
              <UiButton
                label={t(itemId ? "tripCreate.saveChanges" : "tripCreate.saveItem")}
                disabled={!valid || saving || (frozen && status !== "ERROR")}
                onPress={() => void save()}
              />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaProvider>
    </Modal>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
