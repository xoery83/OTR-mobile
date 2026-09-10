import { useState } from "react";
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFoundationDiagnostics } from "@/hooks/useFoundationDiagnostics";

export function FoundationDiagnosticsScreen() {
  const { diagnostics, error, signIn, signOut, transportMode } =
    useFoundationDiagnostics();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const submitSignIn = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await signIn(email.trim(), password);
      setPassword("");
    } catch {
      setAuthError("Dev sign-in failed.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Foundation Diagnostics</Text>
        {error ? <Text style={styles.value}>{error}</Text> : null}
        {diagnostics ? (
          <View style={styles.list}>
            <Text style={styles.value}>
              DB initialized: {diagnostics.dbInitialized ? "yes" : "no"}
            </Text>
            <Text style={styles.value}>Schema version: {diagnostics.schemaVersion}</Text>
            <Text style={styles.value}>Auth: {diagnostics.authState}</Text>
            <Text style={styles.value}>Network: {diagnostics.networkState}</Text>
            <Text style={styles.value}>Pending sync: {diagnostics.pendingSyncCount}</Text>
            <Text style={styles.value}>
              Pending itinerary create: {diagnostics.pendingItineraryCreateCount}
            </Text>
            <Text style={styles.value}>Sync transport: {transportMode}</Text>
          </View>
        ) : (
          <Text style={styles.value}>Loading diagnostics...</Text>
        )}

        {__DEV__ && transportMode === "dev" ? (
          <View style={styles.authHarness}>
            <Text style={styles.sectionTitle}>Dev authentication</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Dev email"
              style={styles.input}
              value={email}
            />
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Dev password"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {authError ? <Text style={styles.error}>{authError}</Text> : null}
            <Button
              disabled={!email.trim() || !password || isAuthenticating}
              onPress={() => void submitSignIn()}
              title={isAuthenticating ? "Signing in..." : "Sign in to Dev"}
            />
            <Button onPress={() => void signOut()} title="Clear local Dev session" />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { gap: 24, padding: 24 },
  title: { color: "#0F172A", fontSize: 24, fontWeight: "700" },
  list: { gap: 10 },
  value: { color: "#334155", fontSize: 16 },
  authHarness: {
    borderTopColor: "#CBD5E1",
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 20,
  },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "700" },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 6,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  error: { color: "#B91C1C", fontSize: 14 },
});
