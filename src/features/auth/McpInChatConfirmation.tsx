import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { UiButton, UiSection } from "@/ui/controls";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { createMcpInChatBridge } from "@/data/auth/mcpInChatBridge";
import type { InChatContext } from "@/data/api/mcpInChatConfirmationContracts";
export function McpInChatConfirmation() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [context, setContext] = useState<InChatContext>(),
    [bridge, setBridge] = useState<ReturnType<typeof createMcpInChatBridge>>(),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState(false),
    [now, setNow] = useState(Date.now);
  useEffect(() => {
    let active = true;
    const b = createMcpInChatBridge(
      (v) => {
        if (active) setContext(v);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    setBridge(b);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(timer);
      b.close();
    };
  }, []);
  const expired = !!context && Date.parse(context.preview.expiresAt) <= now;
  async function decide(decision: "APPROVE" | "DECLINE") {
    if (!context || !bridge || busy || status || expired || failed) return;
    setBusy(true);
    try {
      const result = await bridge.decide(context, decision);
      if (
        result.operationId !== context.preview.operationId ||
        result.previewDigest !== context.previewDigest ||
        result.businessWriterEnabled !== false ||
        !["PROTOTYPE_APPROVED_NOT_APPLIED", "PROTOTYPE_DECLINED"].includes(result.outcome)
      )
        throw Error();
      setStatus(result.outcome);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.page}>
      <Text accessibilityRole="header" style={styles.title}>
        {t("inChatConfirmation.title")}
      </Text>
      <UiSection>
        <Text style={styles.body}>{t("inChatConfirmation.prototype")}</Text>
        {context ? (
          <>
            <Text style={styles.body}>
              {t("inChatConfirmation.target", { value: context.preview.tripId })}
            </Text>
            <Text style={styles.body}>
              {t("operationApproval.before", { name: context.preview.before.name })}
            </Text>
            <Text style={styles.body}>
              {t("operationApproval.after", { name: context.preview.after.name })}
            </Text>
            <Text style={styles.meta}>
              {t("inChatConfirmation.revision", {
                value: String(context.preview.expectedMetadataRevision),
              })}
            </Text>
            <Text style={styles.meta}>{t("inChatConfirmation.scope")}</Text>
            <Text style={styles.meta}>
              {t("inChatConfirmation.expiry", {
                value: new Date(context.preview.expiresAt).toLocaleTimeString(),
              })}
            </Text>
            <UiButton
              label={t("operationApproval.approve")}
              disabled={busy || !!status || expired || failed}
              onPress={() => void decide("APPROVE")}
            />
            <UiButton
              label={t("oauthConsent.decline")}
              variant="secondary"
              disabled={busy || !!status || expired || failed}
              onPress={() => void decide("DECLINE")}
            />
          </>
        ) : (
          <Text style={styles.meta}>{t("inChatConfirmation.waiting")}</Text>
        )}
        {status ? (
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            {t(
              status === "PROTOTYPE_APPROVED_NOT_APPLIED"
                ? "inChatConfirmation.approved"
                : "inChatConfirmation.declined",
            )}
          </Text>
        ) : null}
        {failed || expired ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {t("inChatConfirmation.closed")}
          </Text>
        ) : null}
      </UiSection>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    page: {
      padding: visual.space.section,
      gap: visual.space.section,
      backgroundColor: colors.background,
    },
    title: { ...visual.type.section, color: colors.textPrimary },
    body: { ...visual.type.row, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.row, color: colors.destructive },
  });
