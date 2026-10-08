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
import { CaptureContent } from "@/features/capture/CaptureContent";
import { UiButton } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

type Admission = { generation: number; accountId: string };
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
  const [admission, setAdmission] = useState<Admission | null>(null);
  const [checked, setChecked] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setAdmission(null);
      setChecked(null);
      void withAccountApplyGate(readLocalSession)
        .then((session) => {
          if (!active || getAccountGeneration() !== generation) return;
          const accountId = session?.identity?.userId;
          if (accountId) {
            const next = { accountId, generation };
            assertAccountRequestGeneration({ ...next, tripId: "" });
            setAdmission(next);
          }
          setChecked(generation);
        })
        .catch(() => {
          if (active) setChecked(generation);
        });
      return () => {
        active = false;
        setAdmission(null);
        // Historical deep links are one invocation; ordinary return opens a fresh tray.
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
          onCancel={() => router.navigate("/")}
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
