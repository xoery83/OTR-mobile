import { useState } from "react";
import {
  ActivityIndicator,
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { ItinerarySyncStatus } from "@/domain/itinerary/types";
import {
  phase2BJourneyAId,
  phase2BJourneyBId,
  useItinerarySlice,
} from "@/hooks/useItinerarySlice";

const syncStatusLabels: Record<ItinerarySyncStatus, string> = {
  PENDING_CREATE: "Pending",
  SYNCING: "Syncing",
  SYNCED: "Synced",
  FAILED: "Failed",
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function ItinerarySliceScreen() {
  const [journeyId, setJourneyId] = useState(phase2BJourneyAId);
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(todayIsoDate);
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const {
    createItineraryItem,
    error,
    failNextDemoSync,
    isLoading,
    isSaving,
    items,
    runDemoSync,
  } = useItinerarySlice(journeyId);

  const save = async () => {
    const created = await createItineraryItem({
      title,
      scheduledDate,
      startTime,
      location,
      notes,
    });

    if (created) {
      setTitle("");
      setStartTime("");
      setLocation("");
      setNotes("");
    }
  };

  const canSave =
    Boolean(title.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) && !isSaving;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Trip</Text>
        <Text style={styles.subtitle}>Itinerary create validation slice</Text>

        <View style={styles.journeyControls}>
          <Pressable
            onPress={() => setJourneyId(phase2BJourneyAId)}
            style={[
              styles.journeyButton,
              journeyId === phase2BJourneyAId && styles.activeJourney,
            ]}
          >
            <Text style={styles.journeyLabel}>Journey A</Text>
          </Pressable>
          <Pressable
            onPress={() => setJourneyId(phase2BJourneyBId)}
            style={[
              styles.journeyButton,
              journeyId === phase2BJourneyBId && styles.activeJourney,
            ]}
          >
            <Text style={styles.journeyLabel}>Journey B</Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <TextInput
            accessibilityLabel="Itinerary title"
            onChangeText={setTitle}
            placeholder="Title"
            style={styles.input}
            value={title}
          />
          <TextInput
            accessibilityLabel="Itinerary date"
            onChangeText={setScheduledDate}
            placeholder="YYYY-MM-DD"
            style={styles.input}
            value={scheduledDate}
          />
          <TextInput
            accessibilityLabel="Itinerary start time"
            onChangeText={setStartTime}
            placeholder="Start time (optional)"
            style={styles.input}
            value={startTime}
          />
          <TextInput
            accessibilityLabel="Itinerary location"
            onChangeText={setLocation}
            placeholder="Location (optional)"
            style={styles.input}
            value={location}
          />
          <TextInput
            accessibilityLabel="Itinerary notes"
            multiline
            onChangeText={setNotes}
            placeholder="Notes (optional)"
            style={[styles.input, styles.notesInput]}
            value={notes}
          />
          <Button
            disabled={!canSave}
            onPress={() => void save()}
            title="Save itinerary"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {isLoading ? <ActivityIndicator /> : null}
        {!isLoading && items.length === 0 ? (
          <Text style={styles.empty}>No itinerary items in this journey.</Text>
        ) : null}

        {items.map((item) => (
          <View key={item.id} style={styles.item}>
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemMeta}>
                {item.scheduledDate}
                {item.startTime ? ` at ${item.startTime}` : ""}
                {item.location ? ` · ${item.location}` : ""}
              </Text>
            </View>
            <Text style={styles.status}>{syncStatusLabels[item.syncStatus]}</Text>
          </View>
        ))}

        <View style={styles.developmentTools}>
          <Text style={styles.toolsLabel}>Stage 2 sync harness</Text>
          <Button onPress={() => void runDemoSync()} title="Run itinerary sync" />
          <Pressable onPress={failNextDemoSync} style={styles.failureButton}>
            <Text style={styles.failureButtonText}>Fail next itinerary sync</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { gap: 16, padding: 20 },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#475569", fontSize: 15 },
  journeyControls: { flexDirection: "row", gap: 10 },
  journeyButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  activeJourney: { backgroundColor: "#CCFBF1", borderColor: "#0F766E" },
  journeyLabel: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  form: { gap: 10, paddingVertical: 6 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 6,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  notesInput: { minHeight: 78, paddingTop: 12, textAlignVertical: "top" },
  error: { color: "#B91C1C", fontSize: 14 },
  empty: { color: "#64748B", fontSize: 15, paddingVertical: 16 },
  item: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
  },
  itemCopy: { flex: 1, paddingRight: 12 },
  itemTitle: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  itemMeta: { color: "#475569", fontSize: 14, marginTop: 4 },
  status: { color: "#0F766E", fontSize: 13, fontWeight: "700" },
  developmentTools: {
    borderColor: "#CBD5E1",
    borderRadius: 6,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 12,
  },
  toolsLabel: { color: "#475569", fontSize: 13, fontWeight: "700" },
  failureButton: { alignItems: "center", minHeight: 40, justifyContent: "center" },
  failureButtonText: { color: "#B45309", fontSize: 15, fontWeight: "700" },
});
