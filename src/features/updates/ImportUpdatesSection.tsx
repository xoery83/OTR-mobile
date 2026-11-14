import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View } from "react-native";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  readDefaultUniversalImportUpdates,
  reopenDefaultUniversalImportUpdate,
  type UniversalImportUpdate,
  markDefaultUniversalImportUpdateRead,
  importUpdateReadVersion,
} from "@/data/operations/universalImportUpdates";
import type { UpdatesFilter } from "@/domain/updates/updatesInbox";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";

export function ImportUpdatesSection({
  filter,
  generation,
  onOpen,
  batchId,
  jobId,
  onActivity,
  onReadControls,
}: {
  filter: UpdatesFilter;
  generation: number;
  onOpen(jobId: string, originGeneration: number, destination?: "REVIEW"): void;
  batchId?: string;
  jobId?: string;
  onActivity?(): void;
  onReadControls?(count: number, mark: () => Promise<void>, total: number | null): void;
}) {
  const visible = filter.category !== "MESSAGES";
  const scope = `${generation}:${filter.currentTripId ?? "ACCOUNT"}:${batchId ?? "ALL"}`;
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [observed, setObserved] = useState<{
    scope: string;
    cards: UniversalImportUpdate[];
    localJobs: readonly CaptureJobReadModel[];
    context: AccountRequestContext;
  } | null>(null);
  const [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const active = useRef(false),
    epoch = useRef(0),
    opening = useRef<number | null>(null);
  const current = (ticket: number) =>
    active.current && epoch.current === ticket && generation === getAccountGeneration();
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      const ticket = ++epoch.current;
      setBusy(false);
      if (visible) {
        setObserved(null);
        setLoading(true);
        setFailed(false);
        void readDefaultUniversalImportUpdates(
          filter.currentTripId,
          () => current(ticket),
          (cards, context) => {
            if (current(ticket))
              setObserved((previous) => ({
                scope,
                cards,
                context,
                localJobs: previous?.scope === scope ? previous.localJobs : [],
              }));
          },
          (localJobs, context) => {
            if (current(ticket)) setObserved({ scope, cards: [], localJobs, context });
          },
          batchId && jobId ? { batchId, jobId } : undefined,
        )
          .catch(() => {
            if (current(ticket)) setFailed(true);
          })
          .finally(() => {
            if (current(ticket)) setLoading(false);
          });
      }
      return () => {
        active.current = false;
        epoch.current++;
        opening.current = null;
      };
      // Query/unread presentation never starts extra remote work per keystroke.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, filter.currentTripId, generation, refresh, batchId, jobId]),
  );
  const loaded = observed?.scope === scope ? observed : null;
  const open = async (
    card: Pick<
      UniversalImportUpdate,
      "accountId" | "tripId" | "batchId" | "jobId" | "attention"
    >,
    notice?: UniversalImportUpdate,
  ) => {
    if (!loaded || opening.current === epoch.current || !current(epoch.current)) return;
    const ticket = epoch.current;
    opening.current = ticket;
    setBusy(true);
    try {
      const job = await reopenDefaultUniversalImportUpdate(loaded.context, card);
      if (notice && current(ticket)) {
        try {
          await markDefaultUniversalImportUpdateRead(loaded.context, notice);
          if (current(ticket))
            setSeen((value) => ({
              ...value,
              [`${scope}:${notice.id}`]: importUpdateReadVersion(notice),
            }));
        } catch {
          if (current(ticket)) setFailed(true);
        }
      }
      if (current(ticket))
        onOpen(
          job.batch.jobId,
          loaded.context.generation,
          "attention" in card && card.attention === "REVIEW" ? "REVIEW" : undefined,
        );
    } catch {
      if (current(ticket)) setFailed(true);
    } finally {
      if (opening.current === ticket) opening.current = null;
      if (current(ticket)) setBusy(false);
    }
  };
  const label = (card: UniversalImportUpdate) =>
    card.activity
      ? t(
          card.attention === "FAILURE"
            ? "activity.failed"
            : `capture.activityStatus.${card.activity.state}`,
        )
      : card.savedItemCount
        ? t("updates.importSaved", { count: card.savedItemCount })
        : t(`capture.ai.task.${card.state}`);
  const query = filter.query.trim().toLocaleLowerCase();
  const localTitle = (job: CaptureJobReadModel) =>
    (job.batch.inputs?.length === 1 && job.batch.inputs[0].originalFilename) ||
    t("capture.progress.batchTitle", { count: job.counts.selected });
  const localJobs =
    loaded?.localJobs.filter(
      (job) =>
        filter.category !== "NEEDS_ATTENTION" &&
        !filter.unreadOnly &&
        job.allInputsAccepted &&
        (!batchId || job.batch.batchId === batchId) &&
        !loaded.cards.some((card) => card.batchId === job.batch.batchId) &&
        localTitle(job).toLocaleLowerCase().includes(query),
    ) ?? [];
  const unread = (card: UniversalImportUpdate) =>
    card.unread !== false &&
    seen[`${scope}:${card.id}`] !== importUpdateReadVersion(card);
  const cards =
    loaded?.cards.filter(
      (card) =>
        (!batchId || card.batchId === batchId) &&
        (filter.category !== "NEEDS_ATTENTION" || !!card.attention) &&
        (!filter.unreadOnly || unread(card)) &&
        `${t("updates.importActivity")} ${label(card)} ${card.sourceDisplayName ?? ""} ${card.submittedText ? t("capture.ai.submittedText") : ""}`
          .toLocaleLowerCase()
          .includes(query),
    ) ?? [];
  const mark = async (selected: readonly UniversalImportUpdate[]) => {
    if (!visible || !loaded || !current(epoch.current)) return;
    const ticket = epoch.current;
    for (const card of selected) {
      if (!current(ticket)) return;
      await markDefaultUniversalImportUpdateRead(loaded.context, card);
      if (current(ticket))
        setSeen((value) => ({
          ...value,
          [`${scope}:${card.id}`]: importUpdateReadVersion(card),
        }));
    }
  };
  useEffect(() => {
    onReadControls?.(
      visible ? cards.filter(unread).length : 0,
      () => mark(cards.filter(unread)),
      !visible ? 0 : loading || failed ? null : cards.length + localJobs.length,
    );
  });
  if (!visible) return null;
  return (
    <UiSection title={t("updates.importActivity")}>
      <UiText>{t("updates.importCoverage")}</UiText>
      {onActivity ? (
        <UiButton
          label={t("documents.activityTab")}
          variant="text"
          onPress={onActivity}
        />
      ) : null}
      {loading && !loaded ? (
        <UiText accessibilityLiveRegion="polite">{t("common.loading")}</UiText>
      ) : null}
      {failed ? (
        <UiText accessibilityRole="alert">{t("updates.unavailable")}</UiText>
      ) : null}
      {localJobs.map((job) => (
        <View key={job.batch.batchId}>
          <UiText>{localTitle(job)}</UiText>
          <UiText>{t("capture.progress.registered")}</UiText>
          <UiButton
            label={t("capture.jobView", { summary: localTitle(job) })}
            variant="text"
            disabled={busy || !job.availableActions.canReopen}
            onPress={() => {
              const tripId = job.batch.context.tripPrior?.id ?? job.assignedTripId;
              if (tripId)
                void open({
                  accountId: job.batch.accountId,
                  tripId,
                  batchId: job.batch.batchId,
                  jobId: job.batch.jobId,
                });
            }}
          />
        </View>
      ))}
      {cards.map((card) => (
        <View key={card.id}>
          {card.sourceDisplayName || card.submittedText ? (
            <UiText>{card.sourceDisplayName ?? t("capture.ai.submittedText")}</UiText>
          ) : null}
          {card.submittedAt ? (
            <View>
              <UiText>{t("capture.progress.registered")}</UiText>
              <UiText>
                {formatUiDate(new Date(card.submittedAt), {
                  // ui-foundation-exception: string -- Intl stored submission-time presentation
                  dateStyle: "medium",
                  // ui-foundation-exception: string -- Intl stored submission-time presentation
                  timeStyle: "medium",
                })}
              </UiText>
            </View>
          ) : null}
          <UiText>
            {formatUiDate(new Date(card.updatedAt), {
              // ui-foundation-exception: string -- Intl stored server-time presentation
              dateStyle: "medium",
              // ui-foundation-exception: string -- Intl stored server-time presentation
              timeStyle: "medium",
            })}
          </UiText>
          {card.savedItemCount !== undefined ? (
            <UiText>{t("activity.savedObjects", { count: card.savedItemCount })}</UiText>
          ) : null}
          {unread(card) ? (
            <UiButton
              label={t("updates.markRead")}
              variant="text"
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void mark([card])
                  .catch(() => {
                    if (current(epoch.current)) setFailed(true);
                  })
                  .finally(() => {
                    if (current(epoch.current)) setBusy(false);
                  });
              }}
            />
          ) : null}
          <UiButton
            label={label(card)}
            variant="text"
            disabled={busy}
            onPress={() => void open(card, card)}
          />
        </View>
      ))}
      <UiButton
        label={t("updates.refresh")}
        variant="text"
        disabled={loading || busy}
        onPress={() => setRefresh((value) => value + 1)}
      />
    </UiSection>
  );
}
