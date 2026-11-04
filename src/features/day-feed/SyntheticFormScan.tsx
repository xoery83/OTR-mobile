import { useEffect, useRef, useState } from "react";
import { Keyboard, Modal, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { UiFormRow, UiChoiceChip } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
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
    evidence?: Readonly<Record<string, readonly { raw: string }[] | undefined>>;
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

type ScanSource = CaptureSelection["source"];
type ScanAvailability = typeof import("@/native/p3FormScan").getP3SourceScanAvailability;

// Source eligibility stays narrower than the generic native material picker.
export function FormScanEntry({
  disabled = false,
  onPick,
  sourceMode = true,
  availability,
}: {
  disabled?: boolean;
  onPick?(source: ScanSource): void;
  sourceMode?: boolean;
  availability?: ScanAvailability;
}) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);
  return (
    <>
      <UiFormRow
        variant="action"
        compact
        label={t("formAutofill.scan")}
        value={t("formAutofill.subtitle")}
        leading={
          <AppIcon name="doc.text.viewfinder" color={styles.icon.color} size={26} />
        }
        trailing={
          <AppIcon name="chevron.right" color={styles.secondary.color} size={16} />
        }
        disabled={disabled}
        onPress={() => {
          if (!disabled) {
            Keyboard.dismiss();
            setOpen(true);
          }
        }}
      />
      <Modal
        visible={open && !disabled}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaProvider style={styles.chooserHost}>
          <View style={styles.chooser}>
            <SheetHeader
              category="picker"
              safeTop={false}
              title={t("formAutofill.chooseSource")}
              onLeft={() => setOpen(false)}
            />
            <SafeAreaView edges={["bottom"]} style={styles.choices}>
              {!onPick ? (
                <UiText style={styles.text}>{t("formAutofill.unavailable")}</UiText>
              ) : null}
              {(
                [
                  ["camera", "ui.camera"],
                  ["photos", "formAutofill.photos"],
                  ["files", "formAutofill.files"],
                ] as const
              ).map(([source, key]) => {
                const available =
                  !!onPick && (!sourceMode || availability?.(source).available === true);
                return (
                  <UiButton
                    key={source}
                    label={t(key)}
                    variant="text"
                    disabled={disabled || !available}
                    onPress={() => {
                      if (
                        disabled ||
                        !available ||
                        (sourceMode && availability?.(source).available !== true)
                      )
                        return;
                      setOpen(false);
                      return onPick?.(source);
                    }}
                  />
                );
              })}
            </SafeAreaView>
          </View>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

export function SyntheticFormScan<
  Fields,
  Key extends string,
  Result extends SyntheticFormResult,
>({
  scan,
  context,
  fields,
  currentFields,
  disabled,
  onApply,
  apply,
  labels,
  validateResult,
  emptyMessage,
  sourceMode = false,
  availability,
}: {
  scan?: FormScanConsumer<Result>;
  validateResult?(result: unknown): boolean;
  emptyMessage?(result: Result): string;
  sourceMode?: boolean;
  availability?: ScanAvailability;
  context(): StaySuggestionBinding | null;
  fields(): Fields | null;
  currentFields?: Fields;
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
  const styles = useThemedStyles(createStyles);
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
  const pick = async (source: ScanSource) => {
    if (sourceMode && availability?.(source).available !== true) return;
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
      if (!picked.length) return;
      if (sourceMode && availability?.(source, picked).available !== true) {
        release(picked);
        setError(scanErrors.needsInput);
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
    if (
      sourceMode &&
      availability?.(materialRef.current[0].source, materialRef.current).available !==
        true
    ) {
      discardMaterial();
      setError(scanErrors.needsInput);
      return;
    }
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
        !(validateResult
          ? validateResult(result)
          : formScanResponseSchema.safeParse(result).success) ||
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
    <View>
      <FormScanEntry
        disabled={disabled || loading || selecting}
        onPick={scan ? pick : undefined}
        sourceMode={sourceMode}
        availability={availability}
      />
      {(scan && !sourceMode) ||
      material.length ||
      review ||
      loading ||
      selecting ||
      error !== null ? (
        <UiSection>
          {scan && !sourceMode ? (
            <UiButton
              label={t("formAutofill.sample")}
              variant="text"
              disabled={disabled || loading || selecting}
              onPress={() => {
                if (disabled || loading || selecting || !context()) return;
                clear();
                discardMaterial();
                setError(null);
                const sample: readonly CaptureSelection[] = [
                  {
                    source: "files",
                    temporaryUri: null,
                    name: t("formAutofill.sample"),
                    typeHint: null,
                  },
                ];
                materialRef.current = sample;
                setMaterial(sample);
              }}
            />
          ) : null}
          {material.map((item, index) => (
            <UiText style={styles.text} key={index}>
              {item.name ?? t("formAutofill.selected")}
            </UiText>
          ))}
          {scan ? (
            <UiButton
              label={t("formAutofill.scan")}
              disabled={disabled || loading || selecting || !material.length}
              onPress={start}
            />
          ) : null}
          {loading || selecting ? (
            <UiText style={styles.text}>{t("formAutofill.loading")}</UiText>
          ) : null}
          {review && !review.result.candidates.length ? (
            <UiText style={styles.text}>
              {emptyMessage?.(review.result) ?? t("formAutofill.empty")}
            </UiText>
          ) : null}
          {review && review.result.candidates.length > 1 ? (
            <>
              <UiText style={styles.text}>{t("formAutofill.choose")}</UiText>
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
                  {wrongTarget ? (
                    <UiText style={styles.text}>{t("formAutofill.wrongTarget")}</UiText>
                  ) : null}
                  {sourceMode && wrongTarget && !candidate.targetItemId ? (
                    <UiButton
                      label={t("formAutofill.confirmStayTarget")}
                      variant="secondary"
                      disabled={disabled}
                      onPress={() => {
                        if (
                          active.current !== review ||
                          disabled ||
                          !sameBinding(review.result.binding, context())
                        )
                          return;
                        const next = {
                          ...review,
                          result: {
                            ...review.result,
                            candidates: review.result.candidates.map((entry) =>
                              entry.id === candidate.id
                                ? { ...entry, targetItemId: review.result.binding.itemId }
                                : entry,
                            ),
                          },
                        };
                        active.current = next;
                        setReview(next);
                      }}
                    />
                  ) : null}
                  {keys
                    .filter(
                      (key) =>
                        Object.hasOwn(candidate.fields, key) &&
                        candidate.fields[key] !== undefined,
                    )
                    .map((key) => {
                      const selected =
                        review.selected[candidate.id]?.includes(key) ?? false;
                      const clearValue = candidate.fields[key] === null;
                      const [parent, detail] = key.split(".");
                      const source = currentFields as Record<string, unknown> | undefined;
                      const currentValue = detail
                        ? (source?.[parent] as Record<string, unknown> | undefined)?.[
                            detail
                          ]
                        : source?.[key];
                      return (
                        <View key={key}>
                          {sourceMode && candidate.evidence?.[key]?.[0] ? (
                            <UiText style={styles.text} numberOfLines={2}>
                              {t("formAutofill.sourceText", {
                                value: candidate.evidence[key]![0].raw,
                              })}
                            </UiText>
                          ) : null}
                          {currentValue !== undefined &&
                          currentValue !== null &&
                          currentValue !== "" ? (
                            <UiText style={styles.text} numberOfLines={2}>
                              {t("formAutofill.current", {
                                field: labels[key](),
                                value:
                                  typeof currentValue === "boolean"
                                    ? t(currentValue ? "common.yes" : "common.no")
                                    : String(currentValue),
                              })}
                            </UiText>
                          ) : null}
                          <UiButton
                            variant={selected ? "primary" : "secondary"}
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
                                    ? t(
                                        candidate.fields[key]
                                          ? "common.yes"
                                          : "common.no",
                                      )
                                    : String(candidate.fields[key] ?? ""),
                              },
                            )}
                            disabled={disabled || wrongTarget}
                            onPress={() => {
                              if (active.current !== review || disabled || wrongTarget)
                                return;
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
                        </View>
                      );
                    })}
                  {Object.keys(candidate.fields)
                    .filter((key) => !keys.includes(key as Key))
                    .map((field) => (
                      <UiText style={styles.text} key={field}>
                        {t("formAutofill.unsupported", { field })}
                      </UiText>
                    ))}
                  {candidate.unsupported?.map((item) => (
                    <UiText style={styles.text} key={item.field}>
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
          {error !== null ? (
            <UiText style={styles.text}>{errorCopy[error]()}</UiText>
          ) : null}
          {error === scanErrors.failed && scan && material.length ? (
            <UiButton label={t("common.tryAgain")} disabled={disabled} onPress={start} />
          ) : null}
          {review || loading || selecting || material.length ? (
            <UiButton label={t("common.cancel")} onPress={cancel} />
          ) : null}
        </UiSection>
      ) : null}
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    text: { color: colors.textPrimary },
    icon: { color: colors.accent },
    secondary: { color: colors.textSecondary },
    chooserHost: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
    chooser: { backgroundColor: colors.background },
    choices: {
      backgroundColor: colors.background,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
  });
