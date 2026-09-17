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
  TextInput,
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

import { AppIcon } from "./AppIcon";
import { isApprovedDevIdentity, journeyRoleLabel, maskEmail } from "./globalMenuModel";

type LocalAccount = AccountIdentity & { active: boolean };

export function AccountManagementScreen({ authBoundary = false }) {
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
        if (active) setError("Accounts could not be loaded.");
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
      setError(
        "The account could not be switched. Your previous account is still active.",
      );
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = (account: LocalAccount) =>
    Alert.alert(
      "Remove account from this device?",
      `${account.displayName} will need to sign in again on this device.`,
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Remove",
          onPress: () => {
            setBusy(true);
            void removeLocalAccount(account.userId)
              .then(load)
              .catch(() => setError("The remembered account could not be removed."))
              .finally(() => setBusy(false));
          },
        },
      ],
    );

  const authenticate = async () => {
    if (process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT !== "dev") {
      Alert.alert(
        "Sign-in unavailable",
        "This build does not have an authentication provider configured.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await authenticateDevAccount(email.trim(), password);
      if (devSelector && (!session.identity || !isApprovedDevIdentity(session.identity)))
        throw new Error("This is not an approved test account.");
      await accountSwitch.activateSession(session);
      setPassword("");
      router.replace(returnTo as never);
    } catch (caught) {
      setPassword("");
      setError(
        caught instanceof Error && caught.message.includes("approved test account")
          ? caught.message
          : "Sign-in failed. Check the account details and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const logout = () =>
    Alert.alert("Sign out?", "Local trip data will remain available on this device.", [
      { style: "cancel", text: "Cancel" },
      {
        style: "destructive",
        text: "Sign out",
        onPress: () => {
          setBusy(true);
          void accountSwitch
            .logout()
            .then(() => router.replace("/foundation"))
            .catch(() => setError("Sign out failed. Please try again."))
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
        <ActivityIndicator accessibilityLabel="Loading accounts" />
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
          {devSelector ? "Test accounts" : "Accounts"}
        </Text>

        {active ? (
          <AccountSection title="Active account">
            <AccountRow
              account={active}
              active
              displayName={actorDisplayName}
              role={role}
            />
          </AccountSection>
        ) : null}

        <AccountSection
          title={devSelector ? "Approved test accounts" : "Remembered accounts"}
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
            <Text style={styles.empty}>
              No other accounts are remembered on this device.
            </Text>
          )}
        </AccountSection>

        <View style={styles.actions}>
          <ActionRow
            icon="person.badge.plus"
            label="Add / Login another account"
            onPress={() => setShowLogin((visible) => !visible)}
          />
          {active ? (
            <ActionRow destructive icon="arrow.right" label="Sign out" onPress={logout} />
          ) : null}
        </View>

        {showLogin ? (
          <View style={styles.login}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Login another account
            </Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              style={styles.input}
              value={email}
            />
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              onChangeText={setPassword}
              onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
              onSubmitEditing={Keyboard.dismiss}
              placeholder="Password"
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
                {busy ? "Signing in…" : "Login"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
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
  const detail = [journeyRoleLabel(role ?? null), maskEmail(account.email)]
    .filter(Boolean)
    .join(" · ");
  const name = displayName ?? account.displayName;
  return (
    <View style={styles.accountRow}>
      <Pressable
        accessibilityLabel={`${active ? "Active account" : "Switch to"} ${name}${detail ? `, ${detail}` : ""}`}
        accessibilityRole={active ? "text" : "button"}
        accessibilityState={{ disabled, selected: active }}
        disabled={active || disabled}
        onPress={onPress}
        style={styles.accountMain}
      >
        <AppIcon
          color={active ? "#0F766E" : "#475569"}
          name="person.crop.circle"
          size={24}
        />
        <View style={styles.accountCopy}>
          <Text style={styles.accountName}>{name}</Text>
          {detail ? <Text style={styles.accountDetail}>{detail}</Text> : null}
        </View>
        <Text style={active ? styles.activeLabel : styles.switchLabel}>
          {active ? "Active" : "Switch"}
        </Text>
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityLabel={`Remove ${account.displayName} from this device`}
          accessibilityRole="button"
          disabled={disabled}
          onPress={onRemove}
          style={styles.removeButton}
        >
          <Text style={styles.removeLabel}>Remove</Text>
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
  const color = destructive ? "#B42318" : "#0F766E";
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.actionRow}>
      <AppIcon color={color} name={icon} size={20} />
      <Text style={[styles.actionLabel, destructive && styles.destructive]}>{label}</Text>
      <AppIcon color="#64748B" name="chevron.right" size={14} />
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { gap: 22, padding: 20, paddingBottom: 40 },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
  sectionWrap: { gap: 8 },
  sectionTitle: { color: "#475569", fontSize: 14, fontWeight: "700" },
  group: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE7",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  accountRow: {
    borderBottomColor: "#E5E7EB",
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
  accountName: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  accountDetail: { color: "#64748B", fontSize: 13, marginTop: 2 },
  activeLabel: { color: "#0F766E", fontSize: 13, fontWeight: "700" },
  switchLabel: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  removeButton: {
    alignItems: "center",
    borderTopColor: "#E5E7EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 44,
  },
  removeLabel: { color: "#B42318", fontSize: 14, fontWeight: "600" },
  empty: { color: "#64748B", fontSize: 15, padding: 14 },
  actions: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE7",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  actionRow: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  actionLabel: { color: "#0F766E", flex: 1, fontSize: 16, fontWeight: "600" },
  destructive: { color: "#B42318" },
  login: { gap: 12 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  primaryButtonLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  error: { color: "#B42318", fontSize: 14 },
});
