import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { readLocalSession } from "@/data/auth/authRepository";
import { linkAppleToCurrentAccount } from "@/data/auth/linkAppleAccount";
import { loadNativeApple } from "@/data/auth/appleSignIn";
import { UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { AppleSignInButton } from "./AppleSignInButton";

export function AppleAccountConnection() {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const [account, setAccount] = useState<{ id: string; generation: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    let active = true;
    const sdk = loadNativeApple();
    if (sdk) {
      void sdk
        .isAvailableAsync()
        .then(async (available) => {
          if (!active || !available) return;
          const session = await readLocalSession();
          if (active && session?.identity?.userId) {
            setAccount({ id: session.identity.userId, generation });
            setStatus("idle");
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      alive.current = false;
      pending.current?.abort();
      pending.current = null;
    };
  }, [generation]);
  if (account?.generation !== generation) return null;
  async function connect() {
    if (!alive.current || pending.current || getAccountGeneration() !== generation)
      return;
    const controller = new AbortController();
    pending.current = controller;
    setStatus("busy");
    try {
      await linkAppleToCurrentAccount(controller.signal);
      if (
        alive.current &&
        !controller.signal.aborted &&
        getAccountGeneration() === generation
      )
        setStatus("done");
    } catch (error) {
      if (
        alive.current &&
        !controller.signal.aborted &&
        getAccountGeneration() === generation
      )
        setStatus(
          error instanceof Error && error.message === "APPLE_SIGN_IN_CANCELLED"
            ? "idle"
            : "failed",
        );
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  return (
    <UiSection title={t("auth.appleLinkTitle")}>
      <UiText>{t("auth.appleLinkExplanation")}</UiText>
      <AppleSignInButton
        disabled={status === "busy" || status === "done"}
        onPress={() => {
          Alert.alert(t("auth.appleLinkTitle"), t("auth.appleLinkConfirmation"), [
            { text: t("account.cancel"), style: "cancel" },
            { text: t("auth.appleLinkConfirm"), onPress: () => void connect() },
          ]);
        }}
      />
      {status === "failed" ? (
        <UiText accessibilityRole="alert">{t("account.loginFailed")}</UiText>
      ) : null}
      {status === "done" ? <UiText>{t("auth.appleLinked")}</UiText> : null}
    </UiSection>
  );
}
