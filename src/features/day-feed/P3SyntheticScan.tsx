import { getP3SourceScanAvailability } from "@/native/p3FormScan";
import type { ComponentProps } from "react";
import { t } from "@/ui/locale";
import { SyntheticFormScan } from "./SyntheticFormScan";
import {
  applyStaySuggestions,
  type StaySuggestionKey,
  type SyntheticStayResult,
} from "./p3FormSuggestions";
import {
  applySourceStaySuggestions,
  isSourceStayResult,
  type SourceStayResult,
} from "./p3SourceSuggestions";
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
      typeof SyntheticFormScan<
        ManualStayFields,
        StaySuggestionKey,
        SyntheticStayResult | SourceStayResult
      >
    >,
    "apply" | "labels"
  >,
) {
  return (
    <SyntheticFormScan
      {...props}
      availability={props.sourceMode ? getP3SourceScanAvailability : undefined}
      validateResult={props.sourceMode ? isSourceStayResult : undefined}
      emptyMessage={(result) =>
        t(
          result.kind === "SOURCE_STAY_SUGGESTIONS" &&
            (result.interpretation.providerOutcome === "UNKNOWN" ||
              result.interpretation.status === "EXECUTION_OUTCOME_UNKNOWN")
            ? "capture.ai.task.UNKNOWN"
            : "formAutofill.empty",
        )
      }
      apply={(result, ...args) =>
        result.kind === "SOURCE_STAY_SUGGESTIONS"
          ? applySourceStaySuggestions(result, ...args)
          : applyStaySuggestions(result, ...args)
      }
      labels={labels}
    />
  );
}
