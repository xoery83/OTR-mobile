import { useEffect, useRef, useState } from "react";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { t } from "@/ui/locale";
import type { CaptureSelection } from "@/features/capture/captureStaging";
import type { StaySuggestionBinding } from "./p3FormSuggestions";
import type { FormScanConsumer } from "./formScanResponse";
import { formScanResponseSchema } from "./formScanResponse";

export type SyntheticFormResult = {
  kind: string;
  binding: StaySuggestionBinding;
  candidates: readonly {
    id: string;
    targetItemId?: string;
    fields: Readonly<Record<string, unknown>>;
    unsupported?: readonly { field: string; state: "UNSUPPORTED" | "NEEDS_INPUT" }[];
  }[];
};
const scanErrors = { failed: 0, stale: 1, needsInput: 2 } as const;
const errorCopy = [
  () => t("formAutofill.failed"),
  () => t("formAutofill.stale"),
  () => t("formAutofill.manualInputNeeded"),
] as const;
const sameBinding = (a: StaySuggestionBinding, b: StaySuggestionBinding | null) =>
  b !== null &&
  Object.keys(a).every(
    (key) =>
      a[key as keyof StaySuggestionBinding] === b[key as keyof StaySuggestionBinding],
  );
const release = (items: readonly CaptureSelection[]) =>
  items.forEach((item) => {
    try {
      item.release?.();
    } catch {
      /* A provider cleanup cannot change the Form draft. */
    }
  });

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
  scan?: FormScanConsumer<Result>;
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
  type Review = { result: Result; selected: Record<string, Key[]> };
  const [review, setReview] = useState<Review | null>(null);
  const active = useRef<Review | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<0 | 1 | 2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [material, setMaterial] = useState<readonly CaptureSelection[]>([]);
  const materialRef = useRef<readonly CaptureSelection[]>([]);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current++;
      controller.current?.abort();
      active.current = null;
      release(materialRef.current);
      materialRef.current = [];
    },
    [],
  );
  const clear = () => {
    request.current++;
    controller.current?.abort();
    setLoading(false);
    setSelecting(false);
    active.current = null;
    setReview(null);
    setChosen(null);
  };
  const discardMaterial = () => {
    release(materialRef.current);
    materialRef.current = [];
    setMaterial([]);
  };
  const pick = async (source: "files" | "photos") => {
    const binding = context();
    if (!scan || disabled || loading || selecting || !binding) return;
    clear();
    setError(null);
    discardMaterial();
    setSelecting(true);
    const owner = request.current;
    const current = () => owner === request.current && sameBinding(binding, context());
    try {
      const { pickCaptureMaterial } = await import("@/native/capturePicker");
      if (!current()) return;
      const picked = await pickCaptureMaterial(source, current);
      if (!current()) {
        release(picked);
        return;
      }
      materialRef.current = picked;
      setMaterial(picked);
    } catch {
      if (current()) setError(scanErrors.failed);
    } finally {
      if (owner === request.current) setSelecting(false);
    }
  };
  const start = async () => {
    const binding = context();
    if (
      !scan ||
      !binding ||
      disabled ||
      loading ||
      selecting ||
      !materialRef.current.length
    )
      return;
    clear();
    setError(null);
    const owner = request.current;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    try {
      const pending = scan({ ...binding }, abort.signal, materialRef.current);
      const result = pending instanceof Promise ? await pending : pending;
      if (request.current !== owner || abort.signal.aborted) return;
      if (!sameBinding(binding, context())) {
        clear();
        setError(scanErrors.stale);
        return;
      }
      if (
        !formScanResponseSchema.safeParse(result).success ||
        !sameBinding(binding, result.binding)
      ) {
        clear();
        setError(scanErrors.failed);
        return;
      }
      const next = { result: structuredClone(result), selected: {} };
      active.current = next;
      setReview(next);
      setChosen(result.candidates.length === 1 ? result.candidates[0].id : null);
    } catch {
      if (request.current === owner) {
        clear();
        setError(scanErrors.failed);
      }
    } finally {
      if (request.current === owner) setLoading(false);
    }
  };
  const cancel = () => {
    clear();
    discardMaterial();
    setError(null);
  };
  return (
    <UiSection title={t("formAutofill.scan")}>
      <UiText>{t(scan ? "capture.ai.fixture" : "formAutofill.unavailable")}</UiText>
      <UiButton
        label={t("formAutofill.files")}
        variant="text"
        disabled={!scan || disabled || loading || selecting}
        onPress={() => pick("files")}
      />
      <UiButton
        label={t("formAutofill.photos")}
        variant="text"
        disabled={!scan || disabled || loading || selecting}
        onPress={() => pick("photos")}
      />
      {material.map((item, index) => (
        <UiText key={index}>{item.name ?? t("formAutofill.selected")}</UiText>
      ))}
      {scan ? (
        <UiButton
          label={t("formAutofill.scan")}
          disabled={disabled || loading || selecting || !material.length}
          onPress={start}
        />
      ) : null}
      {loading || selecting ? <UiText>{t("formAutofill.loading")}</UiText> : null}
      {review && !review.result.candidates.length ? (
        <UiText>{t("formAutofill.empty")}</UiText>
      ) : null}
      {review && review.result.candidates.length > 1 ? (
        <>
          <UiText>{t("formAutofill.choose")}</UiText>
          {review.result.candidates.map((candidate) => (
            <UiChoiceChip
              key={candidate.id}
              label={String(candidate.fields.title ?? candidate.id)}
              selected={chosen === candidate.id}
              onPress={() => {
                if (active.current === review && !disabled) setChosen(candidate.id);
              }}
            />
          ))}
        </>
      ) : null}
      {review?.result.candidates
        .filter((candidate) => candidate.id === chosen)
        .map((candidate) => {
          const wrongTarget =
            review.result.binding.mode === "EDIT" &&
            candidate.targetItemId !== review.result.binding.itemId;
          return (
            <UiSection
              key={candidate.id}
              title={String(candidate.fields.title ?? candidate.id)}
            >
              {wrongTarget ? <UiText>{t("formAutofill.wrongTarget")}</UiText> : null}
              {keys
                .filter(
                  (key) =>
                    Object.hasOwn(candidate.fields, key) &&
                    candidate.fields[key] !== undefined,
                )
                .map((key) => {
                  const selected = review.selected[candidate.id]?.includes(key) ?? false;
                  const clearValue = candidate.fields[key] === null;
                  return (
                    <UiButton
                      key={key}
                      label={t(
                        clearValue
                          ? selected
                            ? "formAutofill.clear"
                            : "formAutofill.keepClear"
                          : selected
                            ? "formAutofill.use"
                            : "formAutofill.keep",
                        {
                          field: labels[key](),
                          value:
                            typeof candidate.fields[key] === "boolean"
                              ? t(candidate.fields[key] ? "common.yes" : "common.no")
                              : String(candidate.fields[key] ?? ""),
                        },
                      )}
                      disabled={disabled || wrongTarget}
                      onPress={() => {
                        if (active.current !== review || disabled || wrongTarget) return;
                        const selectedKeys = review.selected[candidate.id] ?? [];
                        const next = {
                          ...review,
                          selected: {
                            ...review.selected,
                            [candidate.id]: selected
                              ? selectedKeys.filter((value) => value !== key)
                              : [...selectedKeys, key],
                          },
                        };
                        active.current = next;
                        setReview(next);
                      }}
                    />
                  );
                })}
              {Object.keys(candidate.fields)
                .filter((key) => !keys.includes(key as Key))
                .map((field) => (
                  <UiText key={field}>{t("formAutofill.unsupported", { field })}</UiText>
                ))}
              {candidate.unsupported?.map((item) => (
                <UiText key={item.field}>
                  {t(
                    item.state === "UNSUPPORTED"
                      ? "formAutofill.unsupported"
                      : "formAutofill.needsInput",
                    { field: item.field },
                  )}
                </UiText>
              ))}
              <UiButton
                label={t("ui.apply")}
                disabled={
                  disabled || wrongTarget || !review.selected[candidate.id]?.length
                }
                onPress={() => {
                  if (
                    active.current !== review ||
                    disabled ||
                    wrongTarget ||
                    !review.selected[candidate.id]?.length
                  )
                    return;
                  const binding = context(),
                    value = fields();
                  const next =
                    binding &&
                    value &&
                    apply(
                      review.result,
                      binding,
                      candidate.id,
                      review.selected[candidate.id],
                      value,
                    );
                  if (!next) {
                    clear();
                    setError(
                      !binding || !sameBinding(review.result.binding, binding)
                        ? scanErrors.stale
                        : scanErrors.needsInput,
                    );
                    return;
                  }
                  cancel();
                  onApply(next);
                }}
              />
            </UiSection>
          );
        })}
      {error !== null ? <UiText>{errorCopy[error]()}</UiText> : null}
      {error === scanErrors.failed && scan && material.length ? (
        <UiButton label={t("common.tryAgain")} disabled={disabled} onPress={start} />
      ) : null}
      {review || loading || selecting || material.length ? (
        <UiButton label={t("common.cancel")} onPress={cancel} />
      ) : null}
    </UiSection>
  );
}
