import { useSyncExternalStore } from "react";
import { ScrollView } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import {
  OrganizerClaimResolutionContent,
  type OrganizerClaimResolutionCopy,
} from "./OrganizerClaimResolutionContent";
import type { createClaimResolutionController } from "./claimResolutionController";

type Controller = ReturnType<typeof createClaimResolutionController>;

// The route owns load/dispose; Auth owns the controlled state and all commands.
export function OrganizerClaimResolutionScreen({
  controller,
}: {
  controller: Controller;
}) {
  useUiLocale();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  if (generation !== controller.context.generation) return null;
  const current = () =>
    controller.getSnapshot() === state &&
    getAccountGeneration() === controller.context.generation;
  if (state.needsMemberReadback)
    return (
      <UiSection title={t("people.claimResolution.title")}>
        <UiText accessibilityLiveRegion="polite">
          {t("people.claimResolution.memberReadbackPending")}
        </UiText>
        <UiButton
          label={t("people.claimResolution.check")}
          variant="secondary"
          disabled={state.phase === "BUSY" || state.phase === "LOADING"}
          onPress={() => {
            if (current() && state.phase !== "BUSY" && state.phase !== "LOADING")
              void controller.checkOriginal();
          }}
        />
      </UiSection>
    );
  if (!state.view)
    return (
      <UiSection title={t("people.claimResolution.title")}>
        <UiText>
          {t(
            state.phase === "LOADING"
              ? "people.claimResolution.loading"
              : state.phase === "UNKNOWN"
                ? "people.claimResolution.unknown"
                : "people.claimResolution.unavailable",
          )}
        </UiText>
        {state.phase === "UNKNOWN" && state.operationId ? (
          <UiButton
            label={t("people.claimResolution.check")}
            variant="secondary"
            onPress={() => {
              if (current()) void controller.checkOriginal();
            }}
          />
        ) : null}
      </UiSection>
    );
  const snapshot = state.view.snapshot;
  const people = state.people.map((person) => ({
    ...person,
    displayName: person.displayName.trim()
      ? person.displayName
      : t("people.claimResolution.unnamed"),
  }));
  const claimedPerson =
    people.find((person) => person.personId === snapshot.originalPersonId) ?? null;
  const phase =
    state.phase === "LOADING"
      ? "BUSY"
      : state.phase === "NOT_VISIBLE"
        ? "UNAVAILABLE"
        : state.phase;
  const copy: OrganizerClaimResolutionCopy = {
    title: t("people.claimResolution.title"),
    choices: {
      CONFIRM: t("people.claimResolution.confirm"),
      CHOOSE_ANOTHER: t("people.claimResolution.chooseAnother"),
      CREATE_NEW: t("people.claimResolution.createNew"),
      REJECT: t("people.claimResolution.reject"),
    },
    newPersonName: t("people.claimResolution.newName"),
    emptyPeople: t("people.claimResolution.empty"),
    submit: t("people.claimResolution.submit"),
    confirmReject: t("people.claimResolution.confirmReject"),
    rejectHint: t("people.claimResolution.rejectHint"),
    checkOriginal: t("people.claimResolution.check"),
    busy: t("people.claimResolution.busy"),
    unknown: t("people.claimResolution.unknown"),
    offline: t("people.claimResolution.offline"),
    unavailable: t(
      snapshot.state === "LINKED"
        ? "people.claimResolution.processed"
        : snapshot.state === "REJECTED"
          ? "people.claimResolution.rejected"
          : snapshot.state === "EXPIRED"
            ? "people.claimResolution.expired"
            : snapshot.state === "AWAITING_CONSENT"
              ? "people.claimResolution.awaitingConsent"
              : "people.claimResolution.unavailable",
    ),
  };
  if (state.view.canConsent) {
    // A pending claimant must not acquire a full Member reader merely to preview a correction.
    const proposalName =
      snapshot.proposal.kind === "NEW_PERSON"
        ? snapshot.proposal.create.displayName
        : state.view.proposalPreview?.personId === snapshot.proposal.personId
          ? state.view.proposalPreview.displayName
          : null;
    return (
      <ScrollView keyboardShouldPersistTaps="handled">
        <UiSection title={t("people.claimResolution.consentTitle")}>
          <UiText>{t("people.claimResolution.consentHint")}</UiText>
          {state.phase !== "READY" ? (
            <UiText accessibilityLiveRegion="polite">
              {state.phase === "UNKNOWN"
                ? copy.unknown
                : state.phase === "BUSY" || state.phase === "LOADING"
                  ? copy.busy
                  : copy.unavailable}
            </UiText>
          ) : null}
          {proposalName ? (
            <>
              <UiText>{t("people.claimResolution.proposedTraveler")}</UiText>
              <UiText>{proposalName}</UiText>
            </>
          ) : (
            <UiText>{t("people.claimResolution.proposalPreviewRequired")}</UiText>
          )}
          <UiButton
            label={t("people.claimResolution.consent")}
            disabled={state.phase !== "READY" || !proposalName}
            onPress={() => {
              if (current() && state.phase === "READY" && proposalName)
                void controller.consent();
            }}
          />
          {state.phase === "UNKNOWN" ? (
            <UiButton
              label={copy.checkOriginal}
              variant="secondary"
              onPress={() => {
                if (current()) void controller.checkOriginal();
              }}
            />
          ) : null}
        </UiSection>
      </ScrollView>
    );
  }
  return (
    <OrganizerClaimResolutionContent
      context={controller.context}
      review={{
        context: controller.context,
        claimRequestId: state.view.requestId,
        claimantName: t("people.claimResolution.requestingAccount"),
        claimedPerson,
        people,
      }}
      state={phase}
      eligibleActions={state.eligibleActions}
      choice={state.choice}
      selectedPersonId={state.selectedPersonId}
      newPersonName={state.newPersonName}
      copy={copy}
      onChoose={controller.choose}
      onSelectPerson={controller.selectPerson}
      onChangeName={controller.changeName}
      onSubmit={() => {
        if (current()) void controller.submit();
      }}
      onCheckOriginal={() => {
        if (current()) void controller.checkOriginal();
      }}
    />
  );
}
