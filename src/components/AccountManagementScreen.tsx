import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { systemMessage } from "@/ui/domainLabels";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import {
  listLocalAccounts,
  removeLocalAccount,
  type AccountIdentity,
} from "@/data/auth/authRepository";
import { createDefaultAccountSwitchCoordinator } from "@/data/auth/defaultAccountSwitchCoordinator";
import { authenticateDevAccount } from "@/data/auth/devAccountAuthentication";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";

import { UiTextInput as TextInput } from "@/ui/forms";

import { AppIcon } from "./AppIcon";
import { isApprovedDevIdentity, maskEmail } from "./globalMenuModel";

type LocalAccount = AccountIdentity & { active: boolean };

export function AccountManagementScreen({ authBoundary = false }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const scrollRef = useRef<ScrollView>(null);
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ mode?: string; returnTo?: string }>();
  const devSelector = params.mode === "dev";
  const returnTo = safeReturnPath(params.returnTo);
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [actorDisplayName, setActorDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showLogin, setShowLogin] = useState(authBoundary);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const accountSwitch = useMemo(
    () =>
      createDefaultAccountSwitchCoordinator({
        clearInMemoryState: () => queryClient.clear(),
        bootstrapAccount: async () => undefined,
      }),
    [queryClient],
  );

  const load = async () => {
    const next = await readAccountView();
    setAccounts(next.accounts);
    setActorDisplayName(next.displayName);
    setRole(next.role);
    if (!next.accounts.some((account) => account.active) && authBoundary)
      setShowLogin(true);
  };

  useEffect(() => {
    let active = true;
    void readAccountView()
      .then((next) => {
        if (!active) return;
        setAccounts(next.accounts);
        setActorDisplayName(next.displayName);
        setRole(next.role);
        if (!next.accounts.some((account) => account.active) && authBoundary)
          setShowLogin(true);
      })
      .catch(() => {
        if (active) setError(t("account.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authBoundary]);

  useEffect(() => {
    if (!showLogin) return;
    const listener = Keyboard.addListener("keyboardDidShow", () =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
    return () => listener.remove();
  }, [showLogin]);

  const switchAccount = async (account: LocalAccount) => {
    setBusy(true);
    setError(null);
    try {
      await accountSwitch.switchAccount(account.userId);
      router.replace(returnTo as never);
    } catch {
      setError(t("account.switchFailed"));
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = (account: LocalAccount) =>
    Alert.alert(
      t("account.removeQuestion"),
      t("account.removeBody", { name: account.displayName }),
      [
        { style: "cancel", text: t("account.cancel") },
        {
          style: "destructive",
          text: t("account.remove"),
          onPress: () => {
            setBusy(true);
            void removeLocalAccount(account.userId)
              .then(load)
              .catch(() => setError(t("account.removeFailed")))
              .finally(() => setBusy(false));
          },
        },
      ],
    );

  const authenticate = async () => {
    if (process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT !== "dev") {
      Alert.alert(t("account.unavailable"), t("account.providerMissing"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await authenticateDevAccount(email.trim(), password);
      if (devSelector && (!session.identity || !isApprovedDevIdentity(session.identity)))
        // ui-foundation-exception: string -- internal authentication sentinel matched below; localized only when rendered
        throw new Error("This is not an approved test account.");
      await accountSwitch.activateSession(session);
      setPassword("");
      router.replace(returnTo as never);
    } catch (caught) {
      setPassword("");
      setError(
        caught instanceof Error && caught.message.includes("approved test account")
          ? caught.message
          : t("account.loginFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const logout = () =>
    Alert.alert(t("account.signoutQuestion"), t("account.localData"), [
      { style: "cancel", text: t("account.cancel") },
      {
        style: "destructive",
        text: t("account.signout"),
        onPress: () => {
          setBusy(true);
          void accountSwitch
            .logout()
            .then(() => router.replace("/foundation"))
            .catch(() => setError(t("account.signoutFailed")))
            .finally(() => setBusy(false));
        },
      },
    ]);

  const active = accounts.find((account) => account.active);
  const remembered = accounts.filter(
    (account) => !account.active && (!devSelector || isApprovedDevIdentity(account)),
  );

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel={t("account.loading")} />
      </View>
    );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
      >
        <Text accessibilityRole="header" style={styles.title}>
          {devSelector ? t("account.testAccounts") : t("account.accounts")}
        </Text>

        {active ? (
          <AccountSection title={t("account.activeAccount")}>
            <AccountRow
              account={active}
              active
              displayName={actorDisplayName}
              role={role}
            />
          </AccountSection>
        ) : null}

        <AccountSection
          title={devSelector ? t("account.approved") : t("account.remembered")}
        >
          {remembered.length ? (
            remembered.map((account) => (
              <AccountRow
                account={account}
                disabled={busy}
                key={account.userId}
                onPress={() => void switchAccount(account)}
                onRemove={() => removeAccount(account)}
              />
            ))
          ) : (
            <Text style={styles.empty}>{t("account.empty")}</Text>
          )}
        </AccountSection>

        <View style={styles.actions}>
          <ActionRow
            icon="person.badge.plus"
            label={t("account.addLogin")}
            onPress={() => setShowLogin((visible) => !visible)}
          />
          {active ? (
            <ActionRow
              destructive
              icon="arrow.right"
              label={t("account.signout")}
              onPress={logout}
            />
          ) : null}
        </View>

        {showLogin ? (
          <View style={styles.login}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {t("account.loginAnother")}
            </Text>
            <TextInput
              accessibilityLabel={t("account.email")}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder={t("account.email")}
              style={styles.input}
              value={email}
            />
            <TextInput
              accessibilityLabel={t("account.password")}
              autoCapitalize="none"
              onChangeText={setPassword}
              onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
              onSubmitEditing={Keyboard.dismiss}
              placeholder={t("account.password")}
              returnKeyType="done"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!email.trim() || !password || busy}
              onPress={() => void authenticate()}
              style={({ pressed }) => [
                styles.primaryButton,
                (!email.trim() || !password || busy) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>
                {busy ? t("account.signingIn") : t("account.login")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {systemMessage(error)}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AccountSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.sectionWrap}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function AccountRow({
  account,
  active = false,
  disabled = false,
  displayName,
  onPress,
  onRemove,
  role,
}: {
  account: LocalAccount;
  active?: boolean;
  disabled?: boolean;
  displayName?: string | null;
  onPress?: () => void;
  onRemove?: () => void;
  role?: string | null;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const detail = [
    role ? t(role === "owner" ? "role.organizer" : "role.member") : null,
    maskEmail(account.email),
  ]
    .filter(Boolean)
    .join(" · ");
  const name = displayName ?? account.displayName;
  return (
    <View style={styles.accountRow}>
      <Pressable
        accessibilityLabel={t("account.rowAccessibility", {
          action: active ? t("account.activeAccount") : t("account.switchTo"),
          name,
          detail: detail ? `, ${detail}` : "",
        })}
        accessibilityRole={active ? "text" : "button"}
        accessibilityState={{ disabled, selected: active }}
        disabled={active || disabled}
        onPress={onPress}
        style={styles.accountMain}
      >
        <AppIcon
          color={active ? colors.accent : colors.textSecondary}
          name="person.crop.circle"
          size={24}
        />
        <View style={styles.accountCopy}>
          <Text style={styles.accountName}>{name}</Text>
          {detail ? <Text style={styles.accountDetail}>{detail}</Text> : null}
        </View>
        <Text style={active ? styles.activeLabel : styles.switchLabel}>
          {active ? t("account.active") : t("account.switch")}
        </Text>
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityLabel={t("account.removeAccessibility", {
            name: account.displayName,
          })}
          accessibilityRole="button"
          disabled={disabled}
          onPress={onRemove}
          style={styles.removeButton}
        >
          <Text style={styles.removeLabel}>{t("account.remove")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ActionRow({
  destructive = false,
  icon,
  label,
  onPress,
}: {
  destructive?: boolean;
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  onPress: () => void;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const color = destructive ? colors.destructive : colors.accent;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.actionRow}>
      <AppIcon color={color} name={icon} size={20} />
      <Text style={[styles.actionLabel, destructive && styles.destructive]}>{label}</Text>
      <AppIcon color={colors.textTertiary} name="chevron.right" size={14} />
    </Pressable>
  );
}

function safeReturnPath(value?: string) {
  return value === "/expenses" ||
    value === "/trip" ||
    value === "/capture" ||
    value === "/settings"
    ? value
    : "/";
}

async function readAccountView() {
  const accounts = await listLocalAccounts();
  if (!accounts.some((account) => account.active))
    return { accounts, displayName: null, role: null };
  try {
    const repository = await getDefaultLedgerReportingRepository();
    const journeyId = await repository.getSelectedJourneyId();
    const actor = journeyId ? await repository.getActorContext(journeyId) : null;
    return {
      accounts,
      displayName: actor?.displayName ?? null,
      role: actor?.role ?? null,
    };
  } catch {
    return { accounts, displayName: null, role: null };
  }
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: {
      backgroundColor: colors.background,
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
    content: { gap: 22, padding: 20, paddingBottom: 40 },
    title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
    sectionWrap: { gap: 8 },
    sectionTitle: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
    group: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    accountRow: {
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    accountMain: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: 64,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    accountCopy: { flex: 1 },
    accountName: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    accountDetail: { color: colors.textTertiary, fontSize: 13, marginTop: 2 },
    activeLabel: { color: colors.accent, fontSize: 13, fontWeight: "700" },
    switchLabel: { color: colors.accent, fontSize: 14, fontWeight: "700" },
    removeButton: {
      alignItems: "center",
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      justifyContent: "center",
      minHeight: 44,
    },
    removeLabel: { color: colors.destructive, fontSize: 14, fontWeight: "600" },
    empty: { color: colors.textTertiary, fontSize: 15, padding: 14 },
    actions: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    actionRow: {
      alignItems: "center",
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 14,
    },
    actionLabel: { color: colors.accent, flex: 1, fontSize: 16, fontWeight: "600" },
    destructive: { color: colors.destructive },
    login: { gap: 12 },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 8,
      borderWidth: 1,
      color: colors.textPrimary,
      fontSize: 16,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 16,
    },
    primaryButtonLabel: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.75 },
    error: { color: colors.destructive, fontSize: 14 },
  });
