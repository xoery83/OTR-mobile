import { useState } from "react";
import { Keyboard, View } from "react-native";
import { UiButton } from "@/ui/controls";
import { UiDatePicker, UiFormRow } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { useHostedItineraryClock } from "./itineraryClockPicker";
export const calendarDate = (value: Date) =>
  [
    String(value.getFullYear()).padStart(4, "0"),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
const pickerDate = (value: string, initialNavigationDate?: string | null) => {
  const candidate = value || initialNavigationDate;
  if (candidate) {
    try {
      validateCalendarDate(candidate);
      return new Date(
        +candidate.slice(0, 4),
        +candidate.slice(5, 7) - 1,
        +candidate.slice(8, 10),
        12,
      );
    } catch {
      // Navigation is a weak hint, never a stored Plan date.
    }
  }
  return new Date();
};
const displayDate = (value: string) =>
  formatUiDate(new Date(`${value}T12:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
export function CalendarField({
  label,
  value,
  onChange,
  disabled = false,
  initialNavigationDate,
  variant,
  onEditingChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  initialNavigationDate?: string | null;
  variant?: "field";
  onEditingChange?(open: boolean): void;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(pickerDate(value, initialNavigationDate));
  const openHostedDate = useHostedItineraryClock({
    label,
    disabled,
    mode: "date",
    apply: next => onChange(calendarDate(next)),
    clear: () => onChange(""),
    onClose: () => onEditingChange?.(false),
  });
  return (
    <View>
      <UiFormRow
        label={label}
        value={value ? displayDate(value) : t("tripCreate.notSet")}
        stacked={variant !== "field"}
        variant={variant}
        disabled={disabled}
        onPress={() => {
          const initial = pickerDate(value, initialNavigationDate);
          onEditingChange?.(true);
          if (openHostedDate) {
            Keyboard.dismiss();
            openHostedDate(initial);
            return;
          }
          setSelected(initial);
          setOpen(true);
        }}
      />
      {open ? (
        <View>
          <UiDatePicker
            value={selected}
            mode="date"
            display="spinner"
            onChange={(_, date) => {
              if (date) setSelected(date);
            }}
            accessibilityLabel={label}
          />
          <UiButton
            label={t("common.done")}
            onPress={() => {
              onChange(calendarDate(selected));
              setOpen(false);
              onEditingChange?.(false);
            }}
          />
          <UiButton
            label={t("tripCreate.clearDate")}
            variant="text"
            onPress={() => {
              onChange("");
              setOpen(false);
              onEditingChange?.(false);
            }}
          />
          <UiButton
            label={t("common.cancel")}
            variant="text"
            onPress={() => {
              setOpen(false);
              onEditingChange?.(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
