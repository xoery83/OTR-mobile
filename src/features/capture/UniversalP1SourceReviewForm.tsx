import { useEffect, useState } from "react";
import type { UniversalImportResult } from "@/data/api/universalImportContracts";
import {
  sourceReviewCivilDate,
  type UniversalP1SourceReview,
} from "@/domain/trip/universalP1SourceReview";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export function UniversalP1SourceReviewForm({
  result,
  candidate,
  readTripTargets,
  disabled,
  isCurrent,
  onConfirm,
  readOriginal,
}: {
  result: UniversalImportResult;
  candidate: UniversalImportResult["candidates"][number];
  readTripTargets?: () => Promise<readonly { id: string; name: string }[]>;
  disabled: boolean;
  isCurrent(): boolean;
  readOriginal(): Promise<string>;
  onConfirm(review: UniversalP1SourceReview): void;
}) {
  useUiLocale();
  const [original, setOriginal] = useState<string | null>(null),
    [originalError, setOriginalError] = useState(false);
  const [tripName, setTripName] = useState<string | null>(null),
    [originalReviewed, setOriginalReviewed] = useState(false),
    [newSelected, setNewSelected] = useState(false);
  useEffect(() => {
    let active = true;
    if (readTripTargets)
      void readTripTargets()
        .then((rows) => {
          if (active && isCurrent())
            setTripName(rows.find((r) => r.id === result.tripId)?.name ?? null);
        })
        .catch(() => {
          if (active) setTripName(null);
        });
    return () => {
      active = false;
    };
  }, [readTripTargets, result.tripId, isCurrent]);
  const names = candidate.fields.filter((f) =>
      ["activity.name", "title"].includes(f.path),
    ),
    dates = candidate.fields.filter((f) =>
      ["activity.date", "schedule.start.local_date"].includes(f.path),
    ),
    sources = result.sourceBindings.filter((b) =>
      [...names, ...dates].some((f) => f.sourceId === b.alias),
    );
  let localDate: string | null = null;
  try {
    localDate = sourceReviewCivilDate(dates[0]?.raw ?? "");
  } catch {
    /* Evidence stays visible; no Save without supported date. */
  }
  if (
    candidate.subtype !== "ACTIVITY" ||
    candidate.bookingTokens.length ||
    candidate.ticketTokens.length ||
    !names.length ||
    !dates.length ||
    !localDate ||
    !sources.length ||
    new Set(sources.map((s) => s.sourceId)).size !== 1
  )
    return null;
  return (
    <>
      <UiText>{t("capture.ai.p1ReviewTrip", { name: tripName ?? result.tripId })}</UiText>
      <UiText>
        {t("capture.ai.p1ReviewValues", {
          title: names[0].raw,
          raw: dates[0].raw,
          date: localDate,
        })}
      </UiText>
      <UiButton
        label={t("capture.ai.p1OpenOriginal")}
        disabled={disabled || !isCurrent()}
        onPress={() => {
          void readOriginal()
            .then((text) => {
              if (isCurrent()) {
                setOriginal(text);
                setOriginalError(false);
              }
            })
            .catch(() => {
              if (isCurrent()) {
                setOriginal(null);
                setOriginalError(true);
                setOriginalReviewed(false);
                setNewSelected(false);
              }
            });
        }}
      />
      {original !== null ? <UiText selectable>{original}</UiText> : null}
      {originalError ? <UiText>{t("capture.ai.p1Unavailable")}</UiText> : null}
      <UiButton
        variant="secondary"
        disabled={disabled || !tripName || original === null}
        label={t(
          originalReviewed ? "capture.ai.p1Reviewed" : "capture.ai.p1ReviewOriginal",
        )}
        onPress={() => setOriginalReviewed((v) => !v)}
      />
      <UiButton
        variant="secondary"
        disabled={disabled || !originalReviewed}
        label={t(newSelected ? "capture.ai.p1NewSelected" : "capture.ai.p1SelectNew")}
        onPress={() => setNewSelected((v) => !v)}
      />
      <UiButton
        disabled={
          disabled ||
          !isCurrent() ||
          !tripName ||
          original === null ||
          !originalReviewed ||
          !newSelected
        }
        label={t("capture.ai.p1Confirm")}
        onPress={() => {
          if (
            !isCurrent() ||
            !tripName ||
            original === null ||
            !originalReviewed ||
            !newSelected
          )
            return;
          onConfirm({
            version: "otr.universal.p1-source-review/1",
            decision: "NEW",
            sourceRevision: sources[0].revision,
            title: names[0].raw,
            localDate,
            originalReviewed: true,
            tripReviewed: true,
          });
        }}
      />
    </>
  );
}
