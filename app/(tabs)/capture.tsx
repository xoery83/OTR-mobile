import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import {
  listCaptureTripPriors,
  readCaptureTripPrior,
} from "@/features/capture/captureTripPrior";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { router, useFocusEffect, useIsFocused, useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute, type NavigationProp, type NavigationState } from "expo-router/react-navigation";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, View } from "react-native";
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
import { activeImportSheetPage } from "@/features/capture/importSheetNavigation";
import { createCaptureStaging } from "@/features/capture/captureStaging";
import { pickCaptureMaterial } from "@/native/capturePicker";
import { CaptureContent } from "@/features/capture/CaptureContent";
import { releaseImportManualFallback, stageImportManualFallback } from "@/features/capture/hostedImportManual";
import { hostedManualItineraryEnabled } from "@/features/day-feed/hostedManualItinerary";
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
    activityPositions: Record<string, number>;
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
export default function CaptureRoute({ overlay = false, hosted = false, hostedChild = false, onHostedClose, canUseHostedSource }: {
  overlay?: boolean; hosted?: boolean; hostedChild?: boolean; onHostedClose?: () => void;
  canUseHostedSource?: () => boolean;
} = {}) {
  const { jobId, origin, originGeneration, tripId } = useLocalSearchParams<{
    tripId?: string;
    jobId?: string;
    origin?: string;
    originGeneration?: string;
  }>();
  const navigation = useNavigation<Omit<NavigationProp<{
    capture: { tripId?: string; jobId?: string; origin?: string; originGeneration?: string };
  }>, "getState"> & { getState(): NavigationState | undefined }>();
  const route = useRoute();
  useUiLocale();
  const focused = useIsFocused();
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
  const openingHostedReview = useRef(false);
  const activityPositionsRef = useRef<Record<string, number>>({});
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let visibleStaging: ReturnType<typeof createCaptureStaging> | null = null;
      let stopSaving: (() => void) | undefined;
      openingHostedReview.current = false;
      if (!hosted) setAdmission(null);
      setChecked(null);
      setDraftWarning(false);
      void withAccountApplyGate(readLocalSession)
        .then(async (session) => {
          if (!active || getAccountGeneration() !== generation || canUseHostedSource?.() === false) return;
          const accountId = session?.identity?.userId;
          if (accountId) {
            const next = { accountId, generation };
            assertAccountRequestGeneration({ ...next, tripId: "" });
            const prior =
              typeof tripId === "string" && tripId
                ? await readCaptureTripPrior(tripId, next)
                : null;
            if (!active || generation !== getAccountGeneration() || canUseHostedSource?.() === false) return;
            if (tripId && !prior) throw new Error("CAPTURE_PRIOR_UNAVAILABLE");
            const owner = { accountId, tripPrior: prior?.id ?? null };
            const lease = () => {
              try {
                assertAccountRequestGeneration({ ...next, tripId: "" });
                return active && next.generation === getAccountGeneration() && canUseHostedSource?.() !== false;
              } catch {
                return false;
              }
            };
            if (retained.current?.accountId !== accountId) {
              retained.current?.drafts.forEach((draft) => draft.cancel());
              retained.current = { accountId, drafts: new Map(), activityPositions: {} };
            }
            activityPositionsRef.current = retained.current.activityPositions;
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
          } else if (hosted) setAdmission(null);
          setChecked(generation);
        })
        .catch(() => {
          if (!active) return;
          if (hosted) setAdmission(null);
          setChecked(generation);
        });
      return () => {
        stopSaving?.();
        active = false;
        // Dependency cleanup must not erase a newer focused invocation.
        const parent = hosted ? navigation.getState() : navigation.getParent()?.getState() ?? navigation.getState();
        const destination = parent?.routes[parent.index];
        const openingReview =
          (hosted && (openingHostedReview.current || destination?.name === "review")) ||
          destination?.name === "import-review" ||
          Boolean(destination?.params && "importJobId" in destination.params &&
            typeof destination.params.importJobId === "string");
        if (hosted || !openingReview) visibleStaging?.hide();
        if (!hosted && !openingReview) setAdmission(null);
        if (!overlay && !navigation.isFocused() && !openingReview)
          navigation.setParams({
            tripId: undefined,
            jobId: undefined,
            origin: undefined,
            originGeneration: undefined,
          });
      };
    }, [generation, navigation, tripId, retained, overlay, hosted, canUseHostedSource]),
  );
  const isCurrent = () => {
    if (
      !admission ||
      (hosted && admission.tripPrior !== (tripId || null)) ||
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
  // An unfocused transparent overlay must not leak stale admission copy behind its destination.
  if (overlay && !hosted && !focused) return <></>;
  const admitted = admission?.generation === generation && (!hosted || admission.tripPrior === (tripId || null));
  const body = admitted ? (
        <CaptureContent
          key={`${generation}:${jobId ?? ""}${admission.tripPrior ? `:${admission.tripPrior}` : ""}`}
          jobId={typeof jobId === "string" ? jobId : undefined}
          embeddedComposer={overlay}
          hostedComposer={hosted}
          hostedChild={hostedChild}
          onHostedBack={hostedChild && onHostedClose ? () => {
            if (isCurrent()) onHostedClose();
          } : undefined}
          onOpenManualFallback={hosted && hostedManualItineraryEnabled ? request => {
            const state = activeImportSheetPage(navigation, route.key);
            if (!state || !isCurrent() || canUseHostedSource?.() === false) return;
            const sourceKey = route.key;
            const fallback = stageImportManualFallback({ ...request, generation, sourceKey });
            if (!fallback) return;
            navigation.dispatch({
              type: "PUSH", target: state.key, source: sourceKey,
              payload: { name: "manual", params: { fallback, editorKey: sourceKey } },
            });
            const next = navigation.getState();
            const top = next?.routes[next.index];
            if (next?.key !== state.key || top?.name !== "manual" ||
                next.routes[next.index - 1]?.key !== sourceKey ||
                !top.params || !("fallback" in top.params) || top.params.fallback !== fallback)
              releaseImportManualFallback(fallback);
          } : undefined}
          activityPositionsRef={activityPositionsRef}
          activityScope={hosted ? admission.current : undefined}
          onOpenAcceptedItem={(target) => {
            if (!isCurrent() || !target.family || !/^P[1-6]$/.test(target.family)) return;
            router.push({
              pathname: `/p${target.family.slice(1)}-detail`,
              params: {
                tripId: target.tripId,
                itemId: target.itemId,
                importJobId: target.jobId ?? jobId,
              },
            } as never);
          }}
          onReturnToTrip={(view, resultTripId, resultJobId) => {
            if (isCurrent())
              router.push({
                pathname: "/trip-home",
                params: { tripId: resultTripId, view, importJobId: resultJobId },
              });
          }}
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
          onOpenRelatedUpdates={hosted ? ({ batchId, jobId, tripId }) => {
            const state = activeImportSheetPage(navigation, route.key);
            if (!state || !isCurrent() || canUseHostedSource?.() === false) return;
            navigation.dispatch({
              type: "PUSH", target: state.key, source: route.key,
              payload: {
                name: "updates",
                params: {
                  activityId: batchId, activityJobId: jobId, activityTripId: tripId,
                  originGeneration: String(generation), originKey: route.key,
                },
              },
            });
          } : undefined}
          onOpenReview={(id) => {
            if (!isCurrent()) return;
            if (hosted) {
              const state = activeImportSheetPage(navigation, route.key);
              if (openingHostedReview.current || !state || canUseHostedSource?.() === false) return;
              openingHostedReview.current = true;
              navigation.dispatch({
                type: "PUSH", target: state.key, source: route.key,
                payload: { name: "review", params: { jobId: id, originGeneration: String(generation), originKey: route.key } },
              });
            } else {
              navigation.setParams({ jobId: id });
              router.push({ pathname: "/import-review", params: { jobId: id } });
            }
          }}
          onCancel={() => {
            const target = captureOriginPath(
              origin,
              originGeneration,
              getAccountGeneration(),
            );
            if (!isCurrent()) return;
            if (onHostedClose) onHostedClose();
            else if (overlay && router.canGoBack()) router.back();
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
      );
  if (hosted) {
    return admitted ? <View style={styles.hosted}>{body}</View> : (
      <SheetRoutePanel
        title={t("capture.composer.title")}
        onBack={hostedChild ? (onHostedClose ?? (() => router.back())) : undefined}
      >
        {body}
      </SheetRoutePanel>
    );
  }
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.body, overlay && styles.overlay]}>
      {body}
    </SafeAreaView>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    overlay: { backgroundColor: colors.transparent },
  hosted: { flex: 1 },
    message: {
      padding: visual.space.page,
      color: colors.textSecondary,
      ...visual.type.row,
    },
  });
