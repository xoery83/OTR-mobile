import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Image, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  readLocalTripPhotoRepository,
  type TripPhoto,
} from "@/data/repositories/tripPhotoRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export function LocalTripPhotos({ tripId }: { tripId: string }) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  return (
    <LocalTripPhotoContent key={JSON.stringify([generation, tripId])} tripId={tripId} />
  );
}

function LocalTripPhotoContent({ tripId }: { tripId: string }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = getAccountGeneration();
  const alive = useRef(true);
  const request = useRef(0);
  const busy = useRef(false);
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [status, setStatus] = useState<"LOADING" | "READY" | "UNAVAILABLE">("LOADING");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const current = useCallback(
    () => alive.current && generation === getAccountGeneration(),
    [generation],
  );
  const load = useCallback(async () => {
    const ticket = ++request.current;
    try {
      const repo = await readLocalTripPhotoRepository();
      const rows = await repo.listTripPhotos(tripId);
      if (!current() || ticket !== request.current) return;
      setPhotos(rows);
      setBroken(new Set());
      setStatus("READY");
    } catch {
      if (!current() || ticket !== request.current) return;
      setPhotos([]);
      setStatus("UNAVAILABLE");
    }
  }, [current, tripId]);
  useEffect(() => {
    alive.current = true;
    void Promise.resolve().then(load);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      alive.current = false;
      request.current += 1;
      listener.remove();
    };
  }, [load]);
  const add = async () => {
    if (busy.current || !current()) return;
    busy.current = true;
    setAdding(true);
    setAddError(false);
    try {
      const choice = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 1,
        base64: false,
        exif: false,
      });
      if (!current() || choice.canceled) return;
      const uri = choice.assets[0]?.uri;
      if (!uri?.startsWith("file://"))
        throw new Error("TRIP_PHOTO_PICKER_FILE_UNAVAILABLE");
      const repo = await readLocalTripPhotoRepository();
      if (!current()) return;
      await repo.addTripPhoto(tripId, uri);
      if (current()) await load();
    } catch {
      if (current()) setAddError(true);
    } finally {
      busy.current = false;
      if (current()) setAdding(false);
    }
  };
  return (
    <UiSection title={t("tripPhotos.title")}>
      <UiButton
        label={t("tripPhotos.choose")}
        disabled={adding || status !== "READY"}
        onPress={() => void add()}
      />
      {addError ? (
        <Text accessibilityRole="alert" style={styles.status}>
          {t("tripPhotos.addFailed")}
        </Text>
      ) : null}
      {status !== "READY" ? (
        <Text style={styles.status}>
          {t(status === "LOADING" ? "dayFeed.loading" : "tripPhotos.unavailable")}
        </Text>
      ) : photos.length === 0 ? (
        <Text style={styles.status}>{t("tripPhotos.empty")}</Text>
      ) : (
        photos.map((photo, index) => (
          <View key={photo.assetId}>
            {photo.localUri && !broken.has(photo.assetId) ? (
              <Image
                source={{ uri: photo.localUri }}
                style={styles.photo}
                resizeMode="contain"
                accessibilityLabel={t("tripPhotos.photoNumber", { number: index + 1 })}
                onError={() =>
                  setBroken((previous) => new Set(previous).add(photo.assetId))
                }
              />
            ) : (
              <Text style={styles.status}>{t("tripPhotos.missing")}</Text>
            )}
          </View>
        ))
      )}
    </UiSection>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    photo: { width: "100%", height: 220, borderRadius: visual.radius.card },
    status: { color: colors.textSecondary, ...visual.type.meta },
  });
