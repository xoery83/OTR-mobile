import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { UiButton, UiSection } from "@/ui/controls";
import { UiTextInput } from "@/ui/textInput";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import {
  McpConsentError,
  type McpConsentView,
  type createMcpOAuthConsentRepository,
} from "@/data/auth/mcpOAuthConsentRepository";

export function McpOAuthConsent({
  repository,
  navigate,
}: {
  repository?: ReturnType<typeof createMcpOAuthConsentRepository>;
  navigate(url: string): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [email, setEmail] = useState(""),
    [code, setCode] = useState("");
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false);
  const [view, setView] = useState<McpConsentView>();
  const [error, setError] = useState<McpConsentError["code"] | undefined>(
    repository ? undefined : "CLOSED",
  );
  const [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(Date.now);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      void repository?.close().catch(() => undefined);
    };
  }, [repository]);
  useEffect(() => {
    if (!sent) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sent]);
  async function run(work: () => Promise<void>) {
    if (busy || !repository) return;
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (failure) {
      const code: McpConsentError["code"] =
        failure instanceof McpConsentError ? failure.code : "UNAVAILABLE";
      if (active.current) setError(code);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function finish(result: McpConsentView) {
    if (!active.current) return;
    if (result.kind === "REDIRECT") {
      await repository!.close();
      if (active.current) navigate(result.url);
    } else setView(result);
  }
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <Text style={styles.meta}>{t("oauthConsent.dev")}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {t("oauthConsent.title")}
        </Text>
        <UiSection>
          <Text style={styles.body}>{t("oauthConsent.explanation")}</Text>
          {!view && repository ? (
            <>
              <UiTextInput
                accessibilityLabel={t("oauthConsent.email")}
                placeholder={t("oauthConsent.email")}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setCode("");
                  setSent(false);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!busy}
              />
              {sent ? (
                <UiTextInput
                  accessibilityLabel={t("oauthConsent.code")}
                  placeholder={t("oauthConsent.code")}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={8}
                  editable={!busy}
                />
              ) : null}
              {sent ? (
                <UiButton
                  label={t("oauthConsent.verify")}
                  disabled={busy || !/^\d{8}$/.test(code)}
                  onPress={() =>
                    void run(async () => {
                      const result = await repository.verifyCode(email.trim(), code);
                      if (active.current) setView(result);
                    })
                  }
                />
              ) : null}
              <UiButton
                variant={sent ? "secondary" : "primary"}
                disabled={busy || !emailValid || seconds > 0}
                label={
                  seconds > 0
                    ? t("oauthConsent.wait", { seconds })
                    : t(sent ? "oauthConsent.resend" : "oauthConsent.send")
                }
                onPress={() =>
                  void run(async () => {
                    await repository.requestCode(email.trim());
                    if (active.current) {
                      setSent(true);
                      setCode("");
                      setRetryAt(Date.now() + 60000);
                      setNow(Date.now());
                    }
                  })
                }
              />
            </>
          ) : null}
          {view?.kind === "CONSENT" ? (
            <>
              <Text style={styles.body}>
                {t("oauthConsent.request", { client: view.clientName })}
              </Text>
              <Text style={styles.body}>{t("oauthConsent.scope")}</Text>
              <UiButton
                label={t("oauthConsent.allow")}
                disabled={busy}
                onPress={() =>
                  void run(async () => finish(await repository!.decide(true)))
                }
              />
              <UiButton
                label={t("oauthConsent.decline")}
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  void run(async () => finish(await repository!.decide(false)))
                }
              />
            </>
          ) : null}
          {view?.kind === "REDIRECT" ? (
            <UiButton
              label={t("oauthConsent.continue")}
              disabled={busy}
              onPress={() => void run(async () => finish(view))}
            />
          ) : null}
          {busy ? (
            <Text accessibilityLiveRegion="polite" style={styles.meta}>
              {t("oauthConsent.busy")}
            </Text>
          ) : null}
          {error ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={styles.error}
            >
              {t(`oauthConsent.${error}`)}
            </Text>
          ) : null}
        </UiSection>
      </View>
    </ScrollView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    page: {
      flexGrow: 1,
      backgroundColor: colors.background,
      padding: visual.space.section,
    },
    content: {
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
      gap: visual.space.section,
    },
    title: { ...visual.type.metric, color: colors.textPrimary },
    body: { ...visual.type.row, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.row, color: colors.destructive },
  });
