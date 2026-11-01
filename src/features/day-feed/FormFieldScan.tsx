import { SyntheticFormScan } from "./SyntheticFormScan";
import { applyFormFieldSuggestions, type FormFieldResult } from "./formFieldSuggestions";
import type { StaySuggestionBinding } from "./p3FormSuggestions";
import { t } from "@/ui/locale";

const labels = {
  P2: {
    flightNumberLiteral: () => t("manualFlight.number"),
    departureDate: () => t("tripCreate.departureDate"),
    originCode: () => t("manualFlight.originAirport"),
    destinationCode: () => t("manualFlight.destinationAirport"),
    departureTime: () => t("tripCreate.departureTime"),
    arrivalDate: () => t("tripCreate.arrivalDate"),
    arrivalTime: () => t("tripCreate.arrivalTime"),
  },
  P4: {
    title: () => t("tripCreate.rentalName"),
    startDate: () => t("tripCreate.rentalPickupDate"),
    endDate: () => t("tripCreate.rentalReturnDate"),
    startTime: () => t("tripCreate.rentalPickupTime"),
    endTime: () => t("tripCreate.rentalReturnTime"),
    pickupLocation: () => t("tripCreate.rentalPickupPlace"),
    returnLocation: () => t("tripCreate.rentalReturnPlace"),
    description: () => t("tripCreate.rentalNotes"),
  },
  P5: {
    title: () => t("tripCreate.transportName"),
    transportType: () => t("tripCreate.transportType"),
    departureDate: () => t("tripCreate.departureDate"),
    departureTime: () => t("tripCreate.departureTime"),
    departureLocation: () => t("tripCreate.departurePlace"),
    arrivalDate: () => t("tripCreate.arrivalDate"),
    arrivalTime: () => t("tripCreate.arrivalTime"),
    arrivalLocation: () => t("tripCreate.arrivalPlace"),
    description: () => t("tripCreate.transportNotes"),
  },
  P6: {
    title: () => t("p6.form.name"),
    location: () => t("p6.form.venue"),
    startDate: () => t("tripCreate.itemDate"),
    endDate: () => t("tripCreate.endDate"),
    startTime: () => t("p6.form.startTime"),
    endTime: () => t("p6.form.endTime"),
    description: () => t("p6.form.notes"),
  },
};

export function FormFieldScan<Fields extends object>({
  family,
  ...props
}: {
  family: FormFieldResult["family"];
  scan(
    binding: StaySuggestionBinding,
    signal: AbortSignal,
  ): FormFieldResult | Promise<FormFieldResult>;
  context(): StaySuggestionBinding | null;
  fields(): Fields | null;
  disabled: boolean;
  onApply(next: Fields): void;
}) {
  return (
    <SyntheticFormScan
      {...props}
      labels={labels[family] as Record<string, () => string>}
      apply={(result, current, candidateId, selected, fields) =>
        applyFormFieldSuggestions(family, result, current, candidateId, selected, fields)
      }
    />
  );
}
