import { useState } from "react";
import { View } from "react-native";
import type { z } from "zod";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { universalV3Candidate } from "@/data/api/universalV3Contracts";
import {
  openUniversalV3Review,
  universalV3ReviewFields,
  universalV3NewDecision,
  type UniversalV3Decision,
} from "@/data/operations/universalV3Review";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { manualItineraryTypes } from "@/features/day-feed/manualItineraryTypes";

type Candidate = z.infer<typeof universalV3Candidate>;
type Review = Awaited<ReturnType<typeof openUniversalV3Review>>;
type Result = Awaited<ReturnType<Review["check"]>>;
export function UniversalV3Review({
  model,
  candidate,
  isCurrent,
}: {
  model: CaptureJobReadModel;
  candidate: Candidate;
  isCurrent(): boolean;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [status, setStatus] = useState<Result>("UNCONFIRMED");
  const [decision, setDecision] = useState<UniversalV3Decision | null>(null);
  const [mode, setMode] = useState<"LINK" | "UPDATE" | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const { title, start, end, startTime, endTime, place, endPlace } =
    universalV3ReviewFields(candidate);
  const family = manualItineraryTypes.find(({ id }) => candidate.kind === id);
  const targets = review?.targets(candidate) ?? [];
  const actions = review?.actions(candidate);
  const unsaved = [
    "room.type",
    "guest.name",
    "driver.name",
    "activity.category",
    "operating_flight",
    "platform",
  ].flatMap((key) =>
    candidate.fields[key] === undefined ? [] : [String(candidate.fields[key])],
  );
  const possibleMatch =
    title &&
    targets.some(
      (target) => target.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase(),
    );
  const statusLabel = {
    UNCONFIRMED: "capture.ai.reviewable",
    PENDING: "capture.ai.v3.pending",
    VERIFIED: "capture.ai.v3.verified",
    REVIEW_REQUIRED: "capture.ai.v3.changed",
    ITEM_VERIFIED_RELATION_PENDING: "capture.ai.v3.itemVerifiedRelationPending",
    ITEM_VERIFIED_RELATION_REVIEW: "capture.ai.v3.itemVerifiedRelationReview",
  } as const;
  const selected =
    decision && "itemId" in decision
      ? targets.find(({ id }) => id === decision.itemId)
      : undefined;
  const chooseNew = () => {
    setMode(null);
    setDecision(universalV3NewDecision);
  };
  const chooseLink = () => {
    setMode("LINK");
    setDecision(null);
  };
  const chooseUpdate = () => {
    setMode("UPDATE");
    setDecision(null);
  };
  async function check() {
    if (!isCurrent()) return;
    setBusy(true);
    setUnavailable(false);
    try {
      const owner = await openUniversalV3Review(model);
      const current = await owner.check(candidate);
      if (isCurrent()) {
        setReview(owner);
        setStatus(current);
        setDecision(null);
      }
    } catch {
      if (isCurrent()) setUnavailable(true);
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  async function confirm() {
    if (!review || !decision || !isCurrent()) return;
    setBusy(true);
    setUnavailable(false);
    try {
      const result = await review.confirm(candidate, decision);
      if (isCurrent()) setStatus(result);
    } catch {
      if (isCurrent()) setUnavailable(true);
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  return (
    <View>
      <UiText>{title ?? (family ? t(family.labelKey) : t("capture.unnamed"))}</UiText>
      {start ? (
        <UiText>
          {start}
          {end ? " – " + end : ""}
        </UiText>
      ) : null}
      {startTime ? (
        <UiText>
          {startTime}
          {endTime ? " – " + endTime : ""}
        </UiText>
      ) : null}
      {place ? (
        <UiText>
          {place}
          {endPlace ? " → " + endPlace : ""}
        </UiText>
      ) : null}
      <UiText>
        {t("capture.ai.v3.documents", { count: candidate.documentIds.length })}
      </UiText>
      <UiText>{t("capture.ai.v3.saveSupported")}</UiText>
      {unsaved.length ? (
        <UiText>{t("capture.ai.v3.notSaved", { details: unsaved.join(" · ") })}</UiText>
      ) : null}
      {review && candidate.kind === "P2" && !actions?.flightDetails ? (
        <UiText>{t("capture.ai.v3.flightSparse")}</UiText>
      ) : null}
      {unavailable ? <UiText>{t("capture.ai.v3.unresolved")}</UiText> : null}
      {status !== "UNCONFIRMED" ? (
        <UiText accessibilityLiveRegion="polite">{t(statusLabel[status])}</UiText>
      ) : null}
      {!review || status !== "UNCONFIRMED" ? (
        <UiButton
          label={t(review ? "capture.ai.check" : "capture.ai.reviewable")}
          disabled={busy}
          variant="secondary"
          onPress={() => void check()}
        />
      ) : (
        <>
          {possibleMatch ? <UiText>{t("capture.ai.v3.possibleMatch")}</UiText> : null}
          {actions?.NEW ? (
            <UiButton
              label={t("capture.ai.v3.new")}
              variant="secondary"
              disabled={busy}
              onPress={chooseNew}
            />
          ) : null}
          {targets.length ? (
            <UiButton
              label={t("capture.ai.v3.link")}
              variant="secondary"
              disabled={busy}
              onPress={chooseLink}
            />
          ) : null}
          {actions?.UPDATE && targets.length ? (
            <UiButton
              label={t("capture.ai.v3.update")}
              variant="secondary"
              disabled={busy}
              onPress={chooseUpdate}
            />
          ) : null}
          {mode && !decision
            ? targets.map((target) => (
                <UiButton
                  key={target.id}
                  label={target.title}
                  variant="text"
                  disabled={busy}
                  onPress={() =>
                    setDecision({
                      action: mode,
                      itemId: target.id,
                      revision: target.revision,
                    })
                  }
                />
              ))
            : null}
          {selected ? (
            <UiText>
              {selected.title}
              {decision?.action === "UPDATE" ? " → " + title : ""}
            </UiText>
          ) : null}
          {decision ? (
            <UiButton
              label={t("capture.ai.v3.confirm")}
              disabled={busy}
              onPress={() => void confirm()}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
