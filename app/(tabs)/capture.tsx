import { useCallback, useRef, useState, useSyncExternalStore } from "react";
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
};
export default function CaptureRoute() {
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const navigation = useNavigation<{ setParams(params: { jobId?: string }): void }>();
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const retained = useRef<{
    accountId: string;
    staging: ReturnType<typeof createCaptureStaging>;
  } | null>(null);
  const [admission, setAdmission] = useState<Admission | null>(null);
  const [checked, setChecked] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let visibleStaging: ReturnType<typeof createCaptureStaging> | null = null;
      setAdmission(null);
      setChecked(null);
      void withAccountApplyGate(readLocalSession)
        .then((session) => {
          if (!active || getAccountGeneration() !== generation) return;
          const accountId = session?.identity?.userId;
          if (accountId) {
            const next = { accountId, generation };
            assertAccountRequestGeneration({ ...next, tripId: "" });
            const owner = { accountId, tripPrior: null };
            const lease = () => {
              try {
                assertAccountRequestGeneration({ ...next, tripId: "" });
                return next.generation === getAccountGeneration();
              } catch {
                return false;
              }
            };
            if (retained.current?.accountId === accountId)
              retained.current.staging.resume(owner, lease);
            else
              retained.current = {
                accountId,
                staging: createCaptureStaging(pickCaptureMaterial, lease, owner),
              };
            visibleStaging = retained.current.staging;
            setAdmission({ ...next, staging: visibleStaging });
          }
          setChecked(generation);
        })
        .catch(() => {
          if (active) setChecked(generation);
        });
      return () => {
        active = false;
        visibleStaging?.hide();
        setAdmission(null);
        // Historical deep links are one invocation; the authenticated unsubmitted draft stays retained.
        navigation.setParams({ jobId: undefined });
      };
    }, [generation, navigation]),
  );
  const isCurrent = () => {
    if (!admission || admission.generation !== getAccountGeneration()) return false;
    try {
      assertAccountRequestGeneration({ ...admission, tripId: "" });
      return true;
    } catch {
      return false;
    }
  };
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.body}>
      {admission?.generation === generation ? (
        <CaptureContent
          key={`${generation}:${jobId ?? ""}`}
          jobId={typeof jobId === "string" ? jobId : undefined}
          isCurrent={isCurrent}
          draftStaging={jobId ? undefined : admission.staging}
          onReopenJob={(id) => navigation.setParams({ jobId: id })}
          onCancel={() => {
            if (router.canGoBack()) router.back();
            else router.navigate("/");
          }}
        />
      ) : (
        <>
          <Text style={styles.message}>
            {t(checked === generation ? "capture.signIn" : "capture.checking")}
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
    message: {
      padding: visual.space.page,
      color: colors.textSecondary,
      ...visual.type.row,
    },
  });
