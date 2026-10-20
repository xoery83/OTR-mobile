import { useState } from "react";
import { View } from "react-native";
import { UiButton } from "@/ui/controls";
import { UiDatePicker, UiFormRow } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
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
}: {
  label: string;
  value: string;
  disabled?: boolean;
  initialNavigationDate?: string | null;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(pickerDate(value, initialNavigationDate));
  return (
    <View>
      <UiFormRow
        label={label}
        value={value ? displayDate(value) : t("tripCreate.notSet")}
        stacked
        disabled={disabled}
        onPress={() => {
          setSelected(pickerDate(value, initialNavigationDate));
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
            }}
          />
          <UiButton
            label={t("tripCreate.clearDate")}
            variant="text"
            onPress={() => {
              onChange("");
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
