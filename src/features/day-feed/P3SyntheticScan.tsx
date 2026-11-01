import { useRef, useState } from "react";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import type { ManualStayFields } from "@/data/repositories/manualStayRepository";
import {
  applyStaySuggestions,
  staySuggestionKeys,
  type StaySuggestionBinding,
  type StaySuggestionKey,
  type SyntheticStayResult,
} from "./p3FormSuggestions";

const labels = {
  title: () => t("tripCreate.stayName"),
  location: () => t("tripCreate.stayLocation"),
  startDate: () => t("formAutofill.checkinDate"),
  endDate: () => t("formAutofill.checkoutDate"),
  startTime: () => t("tripCreate.stayCheckinTime"),
  endTime: () => t("tripCreate.stayCheckoutTime"),
  description: () => t("tripCreate.stayNotes"),
} as const;

type Review = {
  result: SyntheticStayResult;
  selected: Record<string, StaySuggestionKey[]>;
};
export function P3SyntheticScan({
  scan,
  context,
  fields,
  disabled,
  onApply,
}: {
  scan(binding: StaySuggestionBinding): SyntheticStayResult;
  context(): StaySuggestionBinding | null;
  fields(): ManualStayFields | null;
  disabled: boolean;
  onApply(next: ManualStayFields): void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const active = useRef<Review | null>(null);
  const [invalid, setInvalid] = useState(false);
  const clear = () => {
    active.current = null;
    setReview(null);
  };
  return (
    <UiSection title={t("formAutofill.scan")}>
      <UiText>{t("capture.ai.fixture")}</UiText>
      <UiButton
        label={t("formAutofill.scan")}
        disabled={disabled}
        onPress={() => {
          const binding = context();
          if (!binding || disabled) return;
          let result: SyntheticStayResult;
          try {
            result = scan({ ...binding });
          } catch {
            clear();
            setInvalid(true);
            return;
          }
          const next = { result: structuredClone(result), selected: {} };
          active.current = next;
          setReview(next);
          setInvalid(false);
        }}
      />
      {review?.result.candidates.map((candidate) => (
        <UiSection key={candidate.id} title={candidate.fields.title ?? candidate.id}>
          {staySuggestionKeys
            .filter((key) => Object.hasOwn(candidate.fields, key))
            .map((key) => {
              const selected = review.selected[candidate.id]?.includes(key) ?? false;
              return (
                <UiButton
                  key={key}
                  label={t(selected ? "formAutofill.use" : "formAutofill.keep", {
                    field: labels[key](),
                    value: String(candidate.fields[key] ?? ""),
                  })}
                  disabled={disabled}
                  onPress={() => {
                    if (active.current !== review || disabled) return;
                    const keys = review.selected[candidate.id] ?? [];
                    const next = {
                      ...review,
                      selected: {
                        ...review.selected,
                        [candidate.id]: selected
                          ? keys.filter((value) => value !== key)
                          : [...keys, key],
                      },
                    };
                    active.current = next;
                    setReview(next);
                  }}
                />
              );
            })}
          <UiButton
            label={t("ui.apply")}
            disabled={disabled || !review.selected[candidate.id]?.length}
            onPress={() => {
              if (active.current !== review || disabled) return;
              const binding = context();
              const value = fields();
              const next =
                binding &&
                value &&
                applyStaySuggestions(
                  review.result,
                  binding,
                  candidate.id,
                  review.selected[candidate.id] ?? [],
                  value,
                );
              if (!next) {
                setInvalid(true);
                clear();
                return;
              }
              clear();
              onApply(next);
            }}
          />
        </UiSection>
      ))}
      {review ? <UiButton label={t("common.cancel")} onPress={clear} /> : null}
      {invalid ? <UiText>{t("flightLookup.stale")}</UiText> : null}
    </UiSection>
  );
}
