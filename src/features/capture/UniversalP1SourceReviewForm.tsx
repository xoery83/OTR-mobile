import type { UniversalP2SourceReview } from "@/domain/trip/universalP2SourceReview";
import { useEffect, useState } from "react";
import type { UniversalImportResult } from "@/data/api/universalImportContracts";
import {
  sourceReviewCivilDate,
  type UniversalItemSourceReview,
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
  onConfirm(review: UniversalItemSourceReview | UniversalP2SourceReview): void;
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
  const stay = candidate.kind === "P3",
    flight = candidate.kind === "P2",
    rental = candidate.kind === "P4",
    transport = candidate.kind === "P5";
  const names = candidate.fields.filter((f) =>
      (transport
        ? candidate.fields.some((f) => f.path === "service")
          ? ["service"]
          : ["service.number"]
        : flight
          ? ["service", "flight_number", "marketing_flight"]
          : stay
            ? ["property.name", "title"]
            : rental
              ? candidate.fields.some((f) => f.path === "title")
                ? ["title"]
                : ["rental.company", "agency.name"]
              : ["activity.name", "title"]
      ).includes(f.path),
    ),
    dates = candidate.fields.filter((f) =>
      (flight || transport
        ? ["origin.local_date"]
        : stay
          ? ["check_in.date", "schedule.start.local_date"]
          : rental
            ? ["pickup.date", "schedule.start.local_date"]
            : ["activity.date", "schedule.start.local_date"]
      ).includes(f.path),
    ),
    endDates =
      stay || rental
        ? candidate.fields.filter((f) =>
            (rental
              ? ["return.date", "schedule.end.local_date"]
              : ["check_out.date", "schedule.end.local_date"]
            ).includes(f.path),
          )
        : [],
    sources = result.sourceBindings.filter((b) =>
      [...names, ...dates, ...endDates].some((f) => f.sourceId === b.alias),
    );
  let localDate: string | null = null,
    endLocalDate: string | null = null;
  try {
    localDate = sourceReviewCivilDate(dates[0]?.raw ?? "");
    if (stay || (rental && endDates.length))
      endLocalDate = sourceReviewCivilDate(endDates[0]?.raw ?? "");
  } catch {
    /* Evidence stays visible; no Save without supported date. */
  }
  if (
    candidate.subtype !==
      (transport
        ? "TRAIN"
        : flight
          ? "FLIGHT"
          : stay
            ? "ACCOMMODATION"
            : rental
              ? "RENTAL_CAR"
              : "ACTIVITY") ||
    (transport &&
      (candidate.fields.filter((f) => f.path === "transport_subtype").length !== 1 ||
        candidate.fields.find((f) => f.path === "transport_subtype")?.raw !== "TRAIN")) ||
    ((flight || transport) &&
      (dates[0]?.raw !== localDate ||
        new Set(names.map((f) => f.raw)).size !== 1 ||
        new Set(dates.map((f) => f.raw)).size !== 1 ||
        [...names, ...dates].some((f) => f.uncertainty))) ||
    (!stay &&
      !rental &&
      !transport &&
      (candidate.bookingTokens.length > 0 || candidate.ticketTokens.length > 0)) ||
    (stay && (!endLocalDate || !localDate || endLocalDate <= localDate)) ||
    (rental &&
      endDates.length > 0 &&
      (!endLocalDate || !localDate || endLocalDate < localDate)) ||
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
        {t(
          transport
            ? "capture.ai.p5ReviewValues"
            : flight
              ? "capture.ai.p2ReviewValues"
              : stay
                ? "capture.ai.p3ReviewValues"
                : rental
                  ? endLocalDate
                    ? "capture.ai.p4ReviewReturnValues"
                    : "capture.ai.p4ReviewValues"
                  : "capture.ai.p1ReviewValues",
          {
            title: names[0].raw,
            raw: dates[0].raw,
            date: localDate,
            ...(stay || (rental && endLocalDate)
              ? { endRaw: endDates[0].raw, endDate: endLocalDate! }
              : {}),
          },
        )}
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
        label={t(
          newSelected
            ? "capture.ai.p1NewSelected"
            : transport
              ? "capture.ai.p5SelectNew"
              : flight
                ? "capture.ai.p2SelectNew"
                : stay
                  ? "capture.ai.p3SelectNew"
                  : rental
                    ? "capture.ai.p4SelectNew"
                    : "capture.ai.p1SelectNew",
        )}
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
        label={t(
          transport
            ? "capture.ai.p5Confirm"
            : flight
              ? "capture.ai.p2Confirm"
              : stay
                ? "capture.ai.p3Confirm"
                : rental
                  ? "capture.ai.p4Confirm"
                  : "capture.ai.p1Confirm",
        )}
        onPress={() => {
          if (
            !isCurrent() ||
            !tripName ||
            original === null ||
            !originalReviewed ||
            !newSelected
          )
            return;
          if (flight) {
            onConfirm({
              version: "otr.universal.p2-source-review/1",
              decision: "NEW",
              sourceRevision: sources[0].revision,
              flightNumberLiteral: names[0].raw,
              departureDate: localDate,
              originalReviewed: true,
              tripReviewed: true,
            });
            return;
          }
          onConfirm({
            ...(stay
              ? {
                  version: "otr.universal.p3-source-review/1" as const,
                  endLocalDate: endLocalDate!,
                }
              : rental
                ? {
                    version: "otr.universal.p4-source-review/1" as const,
                    ...(endLocalDate ? { endLocalDate } : {}),
                  }
                : transport
                  ? { version: "otr.universal.p5-source-review/1" as const }
                  : { version: "otr.universal.p1-source-review/1" as const }),
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
