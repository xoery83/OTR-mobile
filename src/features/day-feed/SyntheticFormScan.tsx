import { useEffect, useRef, useState } from "react";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import type { StaySuggestionBinding } from "./p3FormSuggestions";

export type SyntheticFormResult = {
  kind: string;
  binding: StaySuggestionBinding;
  candidates: readonly {
    id: string;
    targetItemId?: string;
    fields: Readonly<Record<string, unknown>>;
  }[];
};

export function SyntheticFormScan<
  Fields,
  Key extends string,
  Result extends SyntheticFormResult,
>({
  scan,
  context,
  fields,
  disabled,
  onApply,
  apply,
  labels,
}: {
  scan(binding: StaySuggestionBinding, signal: AbortSignal): Result | Promise<Result>;
  context(): StaySuggestionBinding | null;
  fields(): Fields | null;
  disabled: boolean;
  onApply(next: Fields): void;
  apply(
    result: Result,
    current: StaySuggestionBinding,
    candidateId: string,
    selected: readonly Key[],
    fields: Fields,
  ): Fields | null;
  labels: Record<Key, () => string>;
}) {
  const keys = Object.keys(labels) as Key[];
  const [review, setReview] = useState<{
    result: Result;
    selected: Record<string, Key[]>;
  } | null>(null);
  const active = useRef<{ result: Result; selected: Record<string, Key[]> } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current++;
      controller.current?.abort();
      active.current = null;
    },
    [],
  );
  const clear = () => {
    request.current++;
    controller.current?.abort();
    setLoading(false);
    active.current = null;
    setReview(null);
  };
  return (
    <UiSection title={t("formAutofill.scan")}>
      <UiText>{t("capture.ai.fixture")}</UiText>
      <UiButton
        label={t("formAutofill.scan")}
        disabled={disabled || loading}
        onPress={async () => {
          const binding = context();
          if (!binding || disabled || loading) return;
          clear();
          const owner = request.current;
          const abort = new AbortController();
          controller.current = abort;
          setLoading(true);
          setInvalid(false);
          try {
            const pending = scan({ ...binding }, abort.signal);
            const result = pending instanceof Promise ? await pending : pending;
            if (request.current !== owner || abort.signal.aborted) return;
            const current = context();
            if (
              !current ||
              Object.keys(binding).some(
                (key) =>
                  binding[key as keyof StaySuggestionBinding] !==
                  current[key as keyof StaySuggestionBinding],
              )
            ) {
              clear();
              setInvalid(true);
              return;
            }
            const next = { result: structuredClone(result), selected: {} };
            active.current = next;
            setReview(next);
          } catch {
            if (request.current === owner) {
              clear();
              setInvalid(true);
            }
          } finally {
            if (request.current === owner) setLoading(false);
          }
        }}
      />
      {review?.result.candidates.map((candidate) => (
        <UiSection
          key={candidate.id}
          title={String(candidate.fields.title ?? candidate.id)}
        >
          {keys
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
                apply(
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
      {review || loading ? <UiButton label={t("common.cancel")} onPress={clear} /> : null}
      {invalid ? <UiText>{t("flightLookup.stale")}</UiText> : null}
    </UiSection>
  );
}
