import {
  listCaptureTripPriors,
  readCaptureTripPrior,
} from "@/features/capture/captureTripPrior";
import { useCallback, useState, useSyncExternalStore } from "react";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text } from "react-native";
import { readLocalSession } from "@/data/auth/authRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  assertAccountRequestGeneration,
  withAccountApplyGate,
} from "@/data/auth/accountRequestContext";
import { captureOriginPath } from "@/features/capture/captureOriginPath";
import { createCaptureStaging } from "@/features/capture/captureStaging";
import { pickCaptureMaterial } from "@/native/capturePicker";
import { CaptureContent } from "@/features/capture/CaptureContent";
import { UiButton } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

type Admission = {
  generation: number;
  accountId: string;
  staging: ReturnType<typeof createCaptureStaging>;
  tripPrior: string | null;
  tripName?: string;
  current: () => boolean;
};
// Only overlay invocations outlive their route. Purge on every account-generation change.
type RetainedDrafts = {
  current: {
    accountId: string;
    drafts: Map<string | null, ReturnType<typeof createCaptureStaging>>;
  } | null;
};
const overlayRetained: RetainedDrafts = { current: null };
const tabRetained: RetainedDrafts = { current: null };
subscribeAccountGeneration(() => {
  for (const retained of [overlayRetained, tabRetained]) {
    retained.current?.drafts.forEach((draft) => draft.cancel());
    retained.current = null;
  }
});
export default function CaptureRoute({ overlay = false }: { overlay?: boolean } = {}) {
  const { jobId, origin, originGeneration, tripId } = useLocalSearchParams<{
    tripId?: string;
    jobId?: string;
    origin?: string;
    originGeneration?: string;
  }>();
  const navigation = useNavigation<{
    isFocused(): boolean;
    getParent():
      { getState(): { index: number; routes: { name: string }[] } } | undefined;
    setParams(params: {
      tripId?: string;
      jobId?: string;
      origin?: string;
      originGeneration?: string;
    }): void;
  }>();
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const retained = overlay ? overlayRetained : tabRetained;
  const [admission, setAdmission] = useState<Admission | null>(null);
  const [checked, setChecked] = useState<number | null>(null);
  const [draftWarning, setDraftWarning] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let visibleStaging: ReturnType<typeof createCaptureStaging> | null = null;
      let stopSaving: (() => void) | undefined;
      setAdmission(null);
      setChecked(null);
      setDraftWarning(false);
      void withAccountApplyGate(readLocalSession)
        .then(async (session) => {
          if (!active || getAccountGeneration() !== generation) return;
          const accountId = session?.identity?.userId;
          if (accountId) {
            const next = { accountId, generation };
            assertAccountRequestGeneration({ ...next, tripId: "" });
            const prior =
              typeof tripId === "string" && tripId
                ? await readCaptureTripPrior(tripId, next)
                : null;
            if (!active || generation !== getAccountGeneration()) return;
            if (tripId && !prior) throw new Error("CAPTURE_PRIOR_UNAVAILABLE");
            const owner = { accountId, tripPrior: prior?.id ?? null };
            const lease = () => {
              try {
                assertAccountRequestGeneration({ ...next, tripId: "" });
                return active && next.generation === getAccountGeneration();
              } catch {
                return false;
              }
            };
            if (retained.current?.accountId !== accountId) {
              retained.current?.drafts.forEach((draft) => draft.cancel());
              retained.current = { accountId, drafts: new Map() };
            }
            let staging = retained.current.drafts.get(owner.tripPrior);
            if (staging) staging.resume(owner, lease);
            else {
              const draftFiles =
                process.env.EXPO_PUBLIC_OTR_UNIVERSAL_LOCAL_FIRST_ENABLED === "true"
                  ? await import("@/data/repositories/captureDraftRepository")
                  : null;
              if (!lease()) return;
              staging = createCaptureStaging(
                async (source, current) => {
                  const selections = await pickCaptureMaterial(source, current);
                  if (!draftFiles) return selections;
                  const retainedSelections = [];
                  try {
                    for (const selection of selections) {
                      if (!current?.()) break;
                      retainedSelections.push(
                        await draftFiles.retainCaptureDraftSelection(
                          accountId,
                          selection,
                        ),
                      );
                    }
                    return retainedSelections;
                  } catch (error) {
                    selections.forEach((selection) => selection.release?.());
                    throw error;
                  }
                },
                lease,
                owner,
              );
              if (draftFiles) {
                try {
                  const saved = await draftFiles.readCaptureDraft(owner);
                  if (!lease()) return;
                  if (
                    saved?.tripTarget &&
                    !(await readCaptureTripPrior(saved.tripTarget.id, next))
                  ) {
                    setDraftWarning(true);
                  } else if (saved) staging.restore(saved);
                } catch {
                  if (lease()) setDraftWarning(true);
                }
              }
              if (!lease()) return;
              retained.current.drafts.set(owner.tripPrior, staging);
            }
            visibleStaging = staging;
            if (process.env.EXPO_PUBLIC_OTR_UNIVERSAL_LOCAL_FIRST_ENABLED === "true") {
              const draftFiles =
                await import("@/data/repositories/captureDraftRepository");
              if (!lease()) return;
              const currentStaging = staging;
              stopSaving = staging.subscribe(() => {
                if (!lease() || !currentStaging.isVisible()) return;
                try {
                  draftFiles.saveCaptureDraft(owner, currentStaging.getDraftSnapshot());
                } catch {
                  setDraftWarning(true);
                }
              });
            }
            setAdmission({
              ...next,
              staging,
              tripPrior: owner.tripPrior,
              tripName: prior?.name,
              current: lease,
            });
          }
          setChecked(generation);
        })
        .catch(() => {
          if (active) setChecked(generation);
        });
      return () => {
        stopSaving?.();
        active = false;
        visibleStaging?.hide();
        setAdmission(null);
        // Dependency cleanup must not erase a newer focused invocation.
        const parent = navigation.getParent()?.getState();
        const openingReview = parent?.routes[parent.index]?.name === "import-review";
        if (!overlay && !navigation.isFocused() && !openingReview)
          navigation.setParams({
            tripId: undefined,
            jobId: undefined,
            origin: undefined,
            originGeneration: undefined,
          });
      };
    }, [generation, navigation, tripId, retained, overlay]),
  );
  const isCurrent = () => {
    if (
      !admission ||
      !admission.current() ||
      admission.generation !== getAccountGeneration()
    )
      return false;
    try {
      assertAccountRequestGeneration({ ...admission, tripId: "" });
      return true;
    } catch {
      return false;
    }
  };
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.body, overlay && styles.overlay]}
    >
      {admission?.generation === generation ? (
        <CaptureContent
          key={`${generation}:${jobId ?? ""}${admission.tripPrior ? `:${admission.tripPrior}` : ""}`}
          jobId={typeof jobId === "string" ? jobId : undefined}
          embeddedComposer={overlay}
          isCurrent={isCurrent}
          draftStaging={admission.staging}
          draftPersistenceError={draftWarning}
          accountId={admission.accountId}
          tripName={admission.tripName}
          tripPrior={admission.tripPrior}
          readTripTargets={async () => {
            if (!isCurrent()) throw new Error("CAPTURE_CONTEXT_STALE");
            const trips = await listCaptureTripPriors(admission);
            if (!isCurrent()) throw new Error("CAPTURE_CONTEXT_STALE");
            return trips;
          }}
          validateTripPrior={async (id) => {
            if (!isCurrent()) return false;
            return Boolean(await readCaptureTripPrior(id, admission)) && isCurrent();
          }}
          onReopenJob={(id) => navigation.setParams({ jobId: id })}
          onOpenReview={(id) => {
            if (!isCurrent()) return;
            navigation.setParams({ jobId: id });
            router.push({ pathname: "/import-review", params: { jobId: id } });
          }}
          onCancel={() => {
            const target = captureOriginPath(
              origin,
              originGeneration,
              getAccountGeneration(),
            );
            if (!isCurrent()) return;
            if (overlay && router.canGoBack()) router.back();
            else if (target) router.navigate(target as never);
            else if (admission.tripPrior)
              router.navigate({
                pathname: "/trip",
                params: { tripId: admission.tripPrior, view: "home" },
              });
            else if (router.canGoBack()) router.back();
            else router.navigate("/");
          }}
        />
      ) : (
        <>
          <Text style={styles.message}>
            {t(
              checked === generation
                ? tripId
                  ? "actionIsland.tripCaptureUnavailable"
                  : "capture.signIn"
                : "capture.checking",
            )}
          </Text>
          {checked === generation ? (
            <UiButton
              label={t("navigation.signIn")}
              onPress={() => router.push("/foundation")}
            />
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    overlay: { backgroundColor: colors.transparent },
    message: {
      padding: visual.space.page,
      color: colors.textSecondary,
      ...visual.type.row,
    },
  });
