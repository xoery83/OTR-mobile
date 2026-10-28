import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { LocalSession } from "@/domain/auth/localSession";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { createDevProvisionalSignIn } from "@/data/auth/devProvisionalSignIn";
import {
  requestSupabaseDevEmailOtp,
  SupabaseDevAuthError,
} from "@/data/auth/devSupabaseAuth";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export function EmailOtpSignIn({
  onAuthenticated,
  onBusyChange,
  onCancel,
}: {
  onAuthenticated(session: LocalSession, generation: number): Promise<void>;
  onBusyChange(busy: boolean): void;
  onCancel(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const flow = useMemo(() => createDevProvisionalSignIn(), []);
  const generation = useRef(getAccountGeneration()).current;
  const alive = useRef(true);
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [errorKey, setErrorKey] = useState<
    | "auth.requestFailed"
    | "auth.invalidCode"
    | "auth.rateLimited"
    | "auth.adoptionPending"
    | "account.loginFailed"
    | null
  >(null);

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        request.current?.abort();
        flow.cancel();
        onBusyChange(false);
      };
    }, [flow, onBusyChange]),
  );

  async function submit(verify: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setErrorKey(null);
    try {
      if (process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT !== "dev")
        throw new Error("AUTH_PROVIDER_UNAVAILABLE");
      if (verify && challenge) {
        const result = await flow.verify({
          provider: "email_otp",
          email: challenge,
          code,
        });
        if (!alive.current || result.status === "CANCELLED") return;
        if (result.status !== "VERIFIED") throw new Error("AUTH_PROVIDER_UNAVAILABLE");
        setInstalling(true);
        await onAuthenticated(result.session, generation);
      } else {
        const controller = new AbortController();
        request.current = controller;
        const address = (challenge ?? email).trim();
        await requestSupabaseDevEmailOtp(address, { signal: controller.signal });
        if (!alive.current || controller.signal.aborted) return;
        setChallenge(address);
        setCode("");
      }
    } catch (caught) {
      if (alive.current)
        setErrorKey(
          caught instanceof SupabaseDevAuthError && caught.kind === "rate_limited"
            ? "auth.rateLimited"
            : caught instanceof SupabaseDevAuthError && caught.kind === "invalid_code"
              ? "auth.invalidCode"
              : caught instanceof Error &&
                  caught.message === "GUEST_ADOPTION_PREFLIGHT_REQUIRED"
                ? "auth.adoptionPending"
                : verify
                  ? "account.loginFailed"
                  : "auth.requestFailed",
        );
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        setInstalling(false);
        onBusyChange(false);
      }
    }
  }

  function cancel() {
    request.current?.abort();
    flow.cancel();
    onCancel();
  }

  return (
    <UiSection title={t("auth.emailTitle")}>
      {challenge ? (
        <>
          <UiText style={styles.body}>{t("auth.codeSent", { email: challenge })}</UiText>
          <UiTextInput
            accessibilityLabel={t("auth.code")}
            placeholder={t("auth.code")}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            keyboardType="number-pad"
            maxLength={8}
            editable={!busy}
            value={code}
            onChangeText={setCode}
          />
          <UiButton
            label={busy ? t("account.signingIn") : t("auth.verify")}
            disabled={busy || !/^\d{6,8}$/.test(code.trim())}
            onPress={() => void submit(true)}
          />
          <UiButton
            label={t("auth.resend")}
            variant="text"
            disabled={busy}
            onPress={() => void submit(false)}
          />
          <UiButton
            label={t("auth.changeEmail")}
            variant="text"
            disabled={busy}
            onPress={() => {
              flow.cancel();
              setChallenge(null);
              setCode("");
              setErrorKey(null);
            }}
          />
        </>
      ) : (
        <>
          <UiTextInput
            accessibilityLabel={t("account.email")}
            placeholder={t("account.email")}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!busy}
            value={email}
            onChangeText={setEmail}
          />
          <UiButton
            label={busy ? t("account.signingIn") : t("auth.sendCode")}
            disabled={busy || !email.trim()}
            onPress={() => void submit(false)}
          />
        </>
      )}
      {errorKey ? (
        <UiText
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.error}
        >
          {t(errorKey)}
        </UiText>
      ) : null}
      <View>
        <UiButton
          label={t("account.cancel")}
          variant="text"
          disabled={installing}
          onPress={cancel}
        />
      </View>
    </UiSection>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { ...visual.type.row, color: colors.textPrimary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
