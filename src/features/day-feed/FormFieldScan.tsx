import { SyntheticFormScan } from "./SyntheticFormScan";
import { applyFormFieldSuggestions, type FormFieldResult } from "./formFieldSuggestions";
import type { StaySuggestionBinding } from "./p3FormSuggestions";
import { t } from "@/ui/locale";

const labels = {
  P2: {
    originTerminal: () => t("formAutofill.departureTerminal"),
    destinationTerminal: () => t("formAutofill.arrivalTerminal"),
    departureZone: () => t("manualFlight.departureZone"),
    arrivalZone: () => t("manualFlight.arrivalZone"),
    flightNumberLiteral: () => t("manualFlight.number"),
    departureDate: () => t("tripCreate.departureDate"),
    originCode: () => t("manualFlight.originAirport"),
    destinationCode: () => t("manualFlight.destinationAirport"),
    departureTime: () => t("tripCreate.departureTime"),
    arrivalDate: () => t("tripCreate.arrivalDate"),
    arrivalTime: () => t("tripCreate.arrivalTime"),
  },
  P4: {
    "rentalDetails.supplier": () => t("tripCreate.rentalSupplier"),
    "rentalDetails.reservedCategory": () => t("tripCreate.rentalReservedCategory"),
    "rentalDetails.orSimilar": () => t("formAutofill.orSimilar"),
    "rentalDetails.actualVehicleModel": () => t("tripCreate.rentalActualModel"),
    "rentalDetails.verifiedPlate": () => t("tripCreate.rentalVerifiedPlate"),
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
    "activityDetails.sessionLabel": () => t("p6.form.sessionLabel"),
    "activityDetails.admissionNote": () => t("p6.form.admissionNote"),
    "activityDetails.entryLocation": () => t("p6.form.entryLocation"),
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
  scan?: import("./formScanResponse").FormScanConsumer<FormFieldResult>;
  context(): StaySuggestionBinding | null;
  fields(): Fields | null;
  currentFields?: Fields;
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
