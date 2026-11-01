import type { ComponentProps } from "react";
import { t } from "@/ui/locale";
import { SyntheticFormScan } from "./SyntheticFormScan";
import {
  applyStaySuggestions,
  type StaySuggestionKey,
  type SyntheticStayResult,
} from "./p3FormSuggestions";
import type { ManualStayFields } from "@/data/repositories/manualStayRepository";

const labels = {
  title: () => t("tripCreate.stayName"),
  location: () => t("tripCreate.stayLocation"),
  startDate: () => t("formAutofill.checkinDate"),
  endDate: () => t("formAutofill.checkoutDate"),
  startTime: () => t("tripCreate.stayCheckinTime"),
  endTime: () => t("tripCreate.stayCheckoutTime"),
  description: () => t("tripCreate.stayNotes"),
} as const;

export function P3SyntheticScan(
  props: Omit<
    ComponentProps<
      typeof SyntheticFormScan<ManualStayFields, StaySuggestionKey, SyntheticStayResult>
    >,
    "apply" | "labels"
  >,
) {
  return <SyntheticFormScan {...props} apply={applyStaySuggestions} labels={labels} />;
}
