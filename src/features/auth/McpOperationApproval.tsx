import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { UiButton, UiSection } from "@/ui/controls";
import { UiTextInput } from "@/ui/textInput";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import type { createMcpOperationApprovalRepository } from "@/data/auth/mcpOperationApprovalRepository";
import type { OperationApprovalView } from "@/data/api/mcpOperationApprovalContracts";
export function McpOperationApproval({
  repository,
}: {
  repository?: ReturnType<typeof createMcpOperationApprovalRepository>;
}) {
  const locale = useUiLocale(),
    styles = useThemedStyles(createStyles),
    active = useRef(true);
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(!repository),
    [cleanupFailed, setCleanupFailed] = useState(false),
    [view, setView] = useState<OperationApprovalView>(),
    [finished, setFinished] = useState<"APPROVED" | "DECLINED">(),
    [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(Date.now);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      void repository?.close().catch(() => undefined);
    };
  }, [repository]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function run(work: () => Promise<void>) {
    if (busy || !repository) return;
    setBusy(true);
    setError(false);
    try {
      await work();
    } catch {
      if (active.current) setError(true);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function finish(state: "APPROVED" | "DECLINED") {
    setFinished(state);
    try {
      await repository!.close();
    } catch {
      if (active.current) setCleanupFailed(true);
    }
  }
  const deletion = view?.kind === "TRIP_DELETE";
  const beforeName =
    view && "before" in view.call.request
      ? view.call.request.before.name
      : (view?.targetName ?? "");
  const afterName =
    view && "after" in view.call.request ? view.call.request.after.name : "";
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000)),
    expired = view?.expiresAt ? Date.parse(view.expiresAt) <= now : false;
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t("operationApproval.title")}
        </Text>
        <UiSection>
          <Text style={styles.body}>{t("operationApproval.explanation")}</Text>
          {!view && !finished && repository ? (
            <>
              <UiTextInput
                accessibilityLabel={t("oauthConsent.email")}
                placeholder={t("oauthConsent.email")}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                editable={!busy}
                onChangeText={(value) => {
                  setEmail(value);
                  setSent(false);
                  setCode("");
                }}
              />
              {sent ? (
                <>
                  <UiTextInput
                    accessibilityLabel={t("oauthConsent.code")}
                    placeholder={t("oauthConsent.code")}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={8}
                    value={code}
                    editable={!busy}
                    onChangeText={setCode}
                  />
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
                </>
              ) : null}
              <UiButton
                label={
                  seconds > 0
                    ? t("oauthConsent.wait", { seconds })
                    : t(sent ? "oauthConsent.resend" : "oauthConsent.send")
                }
                disabled={
                  busy || seconds > 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                }
                onPress={() =>
                  void run(async () => {
                    await repository.requestCode(email.trim());
                    if (active.current) {
                      setSent(true);
                      setCode("");
                      setRetryAt(Date.now() + 60000);
                    }
                  })
                }
              />
            </>
          ) : null}
          {view && !finished ? (
            <>
              <Text style={styles.body}>
                {t("operationApproval.client", { client: view.clientName })}
              </Text>
              <Text style={styles.meta}>
                {t("operationApproval.trip", { name: beforeName })}
              </Text>
              {deletion ? (
                <>
                  <Text style={styles.error}>{t("operationApproval.deleteScope")}</Text>
                  <Text style={styles.meta}>
                    {t("operationApproval.targetId", { id: view.tripId })}
                  </Text>
                  <Text style={styles.meta}>
                    {t("inChatConfirmation.revision", {
                      value: String(
                        "expectedMetadataRevision" in view.call.request
                          ? view.call.request.expectedMetadataRevision
                          : "",
                      ),
                    })}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.body}>
                    {t("operationApproval.before", { name: beforeName })}
                  </Text>
                  <Text style={styles.body}>
                    {t("operationApproval.after", { name: afterName })}
                  </Text>
                </>
              )}
              {view.expiresAt ? (
                <Text style={styles.meta}>
                  {t("operationApproval.expires", {
                    time: new Date(view.expiresAt).toLocaleTimeString(locale),
                  })}
                </Text>
              ) : null}
              {view.state === "PENDING" && !expired && !view.completed ? (
                <>
                  <UiButton
                    label={t(
                      deletion
                        ? "operationApproval.approveDelete"
                        : "operationApproval.approve",
                    )}
                    variant={deletion ? "destructive" : "primary"}
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        const result = await repository!.decide(true);
                        if (active.current && result.state === "APPROVED")
                          await finish("APPROVED");
                        else throw Error();
                      })
                    }
                  />
                  <UiButton
                    label={t("oauthConsent.decline")}
                    variant="secondary"
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        const result = await repository!.decide(false);
                        if (active.current && result.state === "DECLINED")
                          await finish("DECLINED");
                        else throw Error();
                      })
                    }
                  />
                </>
              ) : (
                <Text style={styles.body}>
                  {t(
                    view.completed
                      ? "operationApproval.completed"
                      : view.state === "APPROVED"
                        ? "operationApproval.approved"
                        : view.state === "DECLINED"
                          ? "operationApproval.declined"
                          : "operationApproval.expired",
                  )}
                </Text>
              )}
              <UiButton
                label={t("operationApproval.check")}
                variant="text"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const result = await repository!.load();
                    if (active.current) setView(result);
                  })
                }
              />
            </>
          ) : null}
          {finished ? (
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              {t(
                finished === "APPROVED"
                  ? "operationApproval.approved"
                  : "operationApproval.declined",
              )}
            </Text>
          ) : null}
          {busy ? <Text style={styles.meta}>{t("oauthConsent.busy")}</Text> : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t("operationApproval.unavailable")}
            </Text>
          ) : null}
          {cleanupFailed ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t("operationApproval.cleanup")}
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
