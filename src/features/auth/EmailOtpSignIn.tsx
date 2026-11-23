import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { GoogleSignInButton, GoogleSignInPill } from "./GoogleSignInButton";
import { AppleSignInButton } from "./AppleSignInButton";

import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";

const loginRowHeight = 52;
const sendTargetSize = 44;

export function EmailOtpSignIn({
  onAuthenticated,
  onBusyChange,
  onCancel,
  hosted = false,
  isExitPending,
  isCurrent,
}: {
  onAuthenticated(session: LocalSession, generation: number): Promise<void>;
  onBusyChange(busy: boolean): void;
  onCancel(): void;
  hosted?: boolean;
  isExitPending?(): boolean;
  isCurrent?(): boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const flow = useMemo(() => createDevProvisionalSignIn(), []);
  const generation = useRef(getAccountGeneration()).current;
  const alive = useRef(true);
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  const [email, setEmail] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [errorKey, setErrorKey] = useState<
    | "auth.requestFailed"
    | "auth.invalidCode"
    | "auth.rateLimited"
    | "auth.adoptionPending"
    | "auth.nativeUpdateRequired"
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

  async function submit(
    verify: boolean,
    provider: "email_otp" | "google" | "apple" = "email_otp",
  ) {
    if (completed || pending.current || isExitPending?.() || isCurrent?.() === false) return;
    if (provider === "email_otp") {
      if (verify && (!challenge || !/^\d{8}$/.test(code.trim()))) return;
      if (!verify && !(challenge ?? email).trim()) return;
    }
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setErrorKey(null);
    try {
      if (process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT !== "dev")
        throw new Error("AUTH_PROVIDER_UNAVAILABLE");
      if (provider === "google" || provider === "apple") {
        const result = await flow.verify({ provider });
        if (!alive.current || isExitPending?.() || isCurrent?.() === false || result.status === "CANCELLED") return;
        if (result.status === "UNAVAILABLE") {
          setErrorKey("auth.nativeUpdateRequired");
          return;
        }
        setInstalling(true);
        await onAuthenticated(result.session, generation);
        if (hosted && alive.current) setCompleted(true);
      } else if (verify && challenge) {
        const result = await flow.verify({
          provider: "email_otp",
          email: challenge,
          code,
        });
        if (!alive.current || isExitPending?.() || isCurrent?.() === false || result.status === "CANCELLED") return;
        if (result.status !== "VERIFIED") throw new Error("AUTH_PROVIDER_UNAVAILABLE");
        setInstalling(true);
        await onAuthenticated(result.session, generation);
        if (hosted && alive.current) setCompleted(true);
      } else {
        const controller = new AbortController();
        request.current = controller;
        const address = (challenge ?? email).trim();
        await requestSupabaseDevEmailOtp(address, { signal: controller.signal });
        if (!alive.current || controller.signal.aborted || isExitPending?.() || isCurrent?.() === false) return;
        if (hosted && !challenge) Keyboard.dismiss();
        setChallenge(address);
        setCode("");
      }
    } catch (caught) {
      if (
        caught instanceof Error &&
        ["GOOGLE_SIGN_IN_CANCELLED", "APPLE_SIGN_IN_CANCELLED"].includes(caught.message)
      )
        return;
      if (alive.current) {
        Keyboard.dismiss();
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
      }
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
    if (installing) return;
    request.current?.abort();
    flow.cancel();
    if (hosted) Keyboard.dismiss();
    onCancel();
  }

  useEffect(() => {
    if (completed) onCancel();
  }, [completed, onCancel]);

  const errorMessage = errorKey ? (
    <UiText accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
      {t(errorKey)}
    </UiText>
  ) : null;
  const clearChallenge = () => {
    Keyboard.dismiss();
    flow.cancel();
    setChallenge(null);
    setCode("");
    setErrorKey(null);
  };
  const codeFields = challenge ? (
    <>
      <UiText style={styles.body}>{t("auth.codeSent", { email: challenge })}</UiText>
      <UiTextInput
        accessibilityLabel={t("auth.code")}
        placeholder={t("auth.code")}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        keyboardType="number-pad"
        autoFocus={hosted}
        maxLength={8}
        editable={!busy}
        value={code}
        onChangeText={setCode}
      />
      <UiButton
        label={busy ? t("account.signingIn") : t("auth.verify")}
        disabled={busy || !/^\d{8}$/.test(code.trim())}
        onPress={() => void submit(true)}
      />
      <UiButton label={t("auth.resend")} variant="text" disabled={busy} onPress={() => void submit(false)} />
      <UiButton label={t("auth.changeEmail")} variant="text" disabled={busy} onPress={clearChallenge} />
    </>
  ) : null;

  if (hosted) {
    const showSubmit = emailFocused || !!email.length;
    const canSend = !busy && !!email.trim();
    return (
      <SheetRoutePanel
        title={t("auth.emailTitle")}
        leadingDisabled={installing}
        overlay={challenge && !completed ? (
          <Modal animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel}>
            <SafeAreaProvider style={styles.fullscreen}>
              <SafeAreaView style={styles.fullscreen}>
                <SheetHeader
                  title={t("auth.verifyTitle")}
                  safeTop={false}
                  leftLabel={t("account.cancel")}
                  leftDisabled={installing}
                  onLeft={cancel}
                />
                <KeyboardAvoidingView style={styles.fullscreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
                    <View style={styles.form}>
                      {errorMessage}
                      {codeFields}
                    </View>
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </SafeAreaProvider>
          </Modal>
        ) : undefined}
      >
        <View style={styles.content}>
          <View style={styles.form}>
            {!challenge ? errorMessage : null}
            <GoogleSignInPill minHeight={loginRowHeight} disabled={busy} onPress={() => void submit(true, "google")} />
            <AppleSignInButton pill height={loginRowHeight} disabled={busy} onPress={() => void submit(true, "apple")} />
            <View style={styles.emailField}>
              <UiTextInput
                accessibilityLabel={t("account.email")}
                placeholder={t("account.email")}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="send"
                submitBehavior="submit"
                variant="bare"
                editable={!busy}
                value={email}
                style={styles.emailInput}
                onChangeText={setEmail}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onSubmitEditing={() => void submit(false)}
              />
              {showSubmit ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("auth.sendCode")}
                  accessibilityState={{ disabled: !canSend, busy }}
                  disabled={!canSend}
                  style={[styles.send, !canSend && styles.disabledSend]}
                  onPress={() => void submit(false)}
                >
                  <AppIcon name="arrow.right" color={canSend ? colors.surface : colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </SheetRoutePanel>
    );
  }

  return (
    <UiSection title={t("auth.emailTitle")}>
      {errorMessage}
      {!challenge ? (
        <>
          <AppleSignInButton disabled={busy} onPress={() => void submit(true, "apple")} />
          <GoogleSignInButton
            disabled={busy}
            onPress={() => void submit(true, "google")}
          />
        </>
      ) : null}
      {challenge ? codeFields : (
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
    fullscreen: { flex: 1, backgroundColor: colors.surface },
    content: { padding: visual.space.page },
    form: { alignSelf: "center", width: "100%", maxWidth: 480, gap: visual.space.card },
    emailField: {
      alignItems: "center", flexDirection: "row", borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.disabled, borderRadius: visual.radius.pill, minHeight: loginRowHeight,
      paddingEnd: visual.space.row,
    },
    emailInput: {
      flex: 1, minWidth: 0, minHeight: loginRowHeight,
      paddingHorizontal: visual.space.page, backgroundColor: colors.transparent,
    },
    send: {
      minWidth: sendTargetSize, minHeight: sendTargetSize, alignItems: "center", justifyContent: "center",
      borderRadius: visual.radius.pill, backgroundColor: colors.textPrimary,
    },
    disabledSend: { backgroundColor: colors.groupedBackground },
    body: { ...visual.type.row, color: colors.textPrimary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
