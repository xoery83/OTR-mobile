import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import type { TripPersonEditorDraftPort } from "@/data/repositories/tripPersonEditorDraft";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";
import { loadTripPersonEditorDraft } from "@/native/tripPersonEditorDraft";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { AddTravelerSheet, type AddTravelerInput } from "./AddTravelerSheet";

export function ScopedAddTravelerSheet({
  context,
  onClose,
  onSave,
}: {
  context: AccountRequestContext;
  onClose(): void;
  onSave?(input: AddTravelerInput): Promise<void>;
}) {
  useUiLocale();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const { accountId, tripId, generation: openingGeneration } = context;
  const key = JSON.stringify([accountId, tripId, openingGeneration]);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    draft?: TripPersonEditorDraftPort;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const origin = Object.freeze({ accountId, tripId, generation: openingGeneration });
    const valid = () => active && getAccountGeneration() === origin.generation;
    void (async () => {
      const repository = await readLocalTripRepository();
      const trip = await repository.getTrip(origin.tripId);
      if (!valid()) return;
      if (!trip) throw Error("PERSON_DRAFT_LOCAL_TRIP_REQUIRED");
      const draft = await loadTripPersonEditorDraft(origin);
      if (!valid()) return;
      if (
        draft.context.accountId !== origin.accountId ||
        draft.context.tripId !== origin.tripId ||
        draft.context.generation !== origin.generation
      )
        throw Error("PERSON_DRAFT_CONTEXT_MISMATCH");
      setLoaded({ key, draft });
    })().catch(() => {
      if (valid()) setLoaded({ key });
    });
    return () => {
      active = false;
    };
  }, [accountId, tripId, openingGeneration, key, retry]);
  if (generation !== context.generation) return null;
  const current = loaded?.key === key ? loaded : null;
  if (current?.draft)
    return (
      <AddTravelerSheet
        visible
        draft={current.draft}
        submissionEnabled={!!onSave}
        onClose={onClose}
        onSave={
          onSave ??
          (async () => {
            throw Error("PERSON_SUBMISSION_UNAVAILABLE");
          })
        }
      />
    );
  return (
    <UiSection>
      {current ? (
        <>
          <UiText accessibilityRole="alert">{t("people.draftLoadFailed")}</UiText>
          <UiButton
            label={t("common.tryAgain")}
            onPress={() => {
              setLoaded(null);
              setRetry((value) => value + 1);
            }}
          />
        </>
      ) : (
        <ActivityIndicator accessibilityLabel={t("common.loading")} />
      )}
      <UiButton label={t("common.close")} variant="secondary" onPress={onClose} />
    </UiSection>
  );
}
