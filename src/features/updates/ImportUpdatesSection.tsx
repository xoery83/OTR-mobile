import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View } from "react-native";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  readDefaultUniversalImportUpdates,
  reopenDefaultUniversalImportUpdate,
  type UniversalImportUpdate,
} from "@/data/operations/universalImportUpdates";
import type { UpdatesFilter } from "@/domain/updates/updatesInbox";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";

export function ImportUpdatesSection({
  filter,
  generation,
  onOpen,
}: {
  filter: UpdatesFilter;
  generation: number;
  onOpen(jobId: string, originGeneration: number): void;
}) {
  const visible =
    !filter.unreadOnly && (filter.category === "ALL" || filter.category === "ACTIVITY");
  const scope = `${generation}:${filter.currentTripId ?? "ACCOUNT"}`;
  const [observed, setObserved] = useState<{
    scope: string;
    cards: UniversalImportUpdate[];
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
            if (current(ticket)) setObserved({ scope, cards, context });
          },
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
    }, [visible, filter.currentTripId, generation, refresh]),
  );
  if (!visible) return null;
  const loaded = observed?.scope === scope ? observed : null;
  const open = async (card: UniversalImportUpdate) => {
    if (!loaded || opening.current === epoch.current || !current(epoch.current)) return;
    const ticket = epoch.current;
    opening.current = ticket;
    setBusy(true);
    try {
      const job = await reopenDefaultUniversalImportUpdate(loaded.context, card);
      if (current(ticket)) onOpen(job.batch.jobId, loaded.context.generation);
    } catch {
      if (current(ticket)) setFailed(true);
    } finally {
      if (opening.current === ticket) opening.current = null;
      if (current(ticket)) setBusy(false);
    }
  };
  const query = filter.query.trim().toLocaleLowerCase();
  const cards =
    loaded?.cards.filter((card) =>
      `${t("updates.importActivity")} ${t(`capture.ai.task.${card.state}`)}`
        .toLocaleLowerCase()
        .includes(query),
    ) ?? [];
  return (
    <UiSection title={t("updates.importActivity")}>
      <UiText>{t("updates.importCoverage")}</UiText>
      {loading ? (
        <UiText accessibilityLiveRegion="polite">{t("common.loading")}</UiText>
      ) : null}
      {failed ? (
        <UiText accessibilityRole="alert">{t("updates.unavailable")}</UiText>
      ) : null}
      {cards.map((card) => (
        <View key={card.id}>
          <UiText>
            {formatUiDate(new Date(card.updatedAt), {
              // ui-foundation-exception: string -- Intl stored server-time presentation
              dateStyle: "medium",
              // ui-foundation-exception: string -- Intl stored server-time presentation
              timeStyle: "medium",
            })}
          </UiText>
          <UiButton
            label={t(`capture.ai.task.${card.state}`)}
            variant="text"
            disabled={busy}
            onPress={() => void open(card)}
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
