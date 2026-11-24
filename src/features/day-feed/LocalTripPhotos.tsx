import { router } from "expo-router";
import {
  hostedTripPhotosEnabled,
  readTripPhotosSheet, releaseTripPhotosSheet, stageTripPhotosSheet, updateTripPhotosSheet,
} from "./hostedTripPhotos";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Image, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import * as ImagePicker from "expo-image-picker";
import {
  readLocalTripPhotoRepository,
  type TripPhoto,
} from "@/data/repositories/tripPhotoRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiFormRow } from "@/ui/forms";
import { UiButton, UiSection } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export function LocalTripPhotos({
  tripId,
  registerAdd,
  onSaved,
  onOpenGallery,
  compact = false,
  readOnly = false,
}: {
  tripId: string;
  registerAdd?: (add: (() => void) | null) => void;
  onSaved?: () => void;
  onOpenGallery?: () => void;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  return (
    <LocalTripPhotoContent
      key={JSON.stringify([generation, tripId])}
      tripId={tripId}
      registerAdd={registerAdd}
      onSaved={onSaved}
      onOpenGallery={onOpenGallery}
      compact={compact}
      readOnly={readOnly}
    />
  );
}

function LocalTripPhotoContent({
  tripId,
  registerAdd,
  onSaved,
  onOpenGallery,
  compact = false,
  readOnly = false,
}: {
  tripId: string;
  registerAdd?: (add: (() => void) | null) => void;
  onSaved?: () => void;
  onOpenGallery?: () => void;
  compact?: boolean;
  readOnly?: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = getAccountGeneration();
  const alive = useRef(true);
  const request = useRef(0);
  const busy = useRef(false);
  const invocation = useRef<string>(undefined);
  const latestReadOnly = useRef(readOnly);
  useLayoutEffect(() => { latestReadOnly.current = readOnly; }, [readOnly]);
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [status, setStatus] = useState<"LOADING" | "READY" | "UNAVAILABLE">("LOADING");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
      releaseTripPhotosSheet(invocation.current);
    };
  }, [load]);
  const add = useCallback(async (invocationId?: string) => {
    const valid = () => current() && !latestReadOnly.current &&
      (!invocationId || Boolean(readTripPhotosSheet(invocationId)));
    if (readOnly || busy.current || !valid() || status !== "READY") return;
    busy.current = true;
    setAdding(true);
    setAddError(false);
    try {
      const choice = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 1,
        base64: false,
        exif: false,
      });
      if (!valid() || choice.canceled) return;
      const repo = await readLocalTripPhotoRepository();
      for (const asset of choice.assets) {
        if (!valid()) return;
        const uri = asset.uri;
        if (!uri?.startsWith("file://"))
          throw new Error("TRIP_PHOTO_PICKER_FILE_UNAVAILABLE");
        await repo.addTripPhoto(tripId, uri);
      }
      if (valid() && choice.assets.length) onSaved?.();
      if (valid()) await load();
    } catch {
      if (valid()) {
        setAddError(true);
        await load();
      }
    } finally {
      busy.current = false;
      if (current()) setAdding(false);
    }
  }, [current, tripId, load, status, onSaved, readOnly]);
  useEffect(() => {
    registerAdd?.(
      !readOnly && status === "READY"
        ? () => {
            void add();
          }
        : null,
    );
    return () => registerAdd?.(null);
  }, [registerAdd, status, add, readOnly]);
  const content = (invocationId?: string) => (
    <>
      {!readOnly ? (
        <UiButton
          label={t("tripPhotos.choose")}
          disabled={adding || status !== "READY"}
          onPress={() => void add(invocationId)}
        />
      ) : null}
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
                accessible
                accessibilityRole="image"
                accessibilityLabel={t("tripPhotos.photoNumber", {
                  number: index + 1,
                })}
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
    </>
  );
  const gallery = (id: string) => <View style={styles.gallery}>{content(id)}</View>;
  useLayoutEffect(() => {
    if (invocation.current) updateTripPhotosSheet(invocation.current, gallery(invocation.current));
  });
  if (!compact) return <UiSection title={t("tripPhotos.title")}>{content()}</UiSection>;
  const close = () => setExpanded(false);
  return (
    <>
      {(!readOnly || status === "READY") ? (
        <UiFormRow
          label={t("tripPhotos.title")}
          value={status === "READY" ? String(photos.length) : ""}
          onPress={() => {
            if (!current()) return;
            if (hostedTripPhotosEnabled && (busy.current || readTripPhotosSheet(invocation.current)))
              return;
            onOpenGallery?.();
            if (hostedTripPhotosEnabled) {
              const id = stageTripPhotosSheet({
                content: null,
                isCurrent: current,
                isBusy: () => busy.current,
              });
              invocation.current = id;
              updateTripPhotosSheet(id, gallery(id));
              router.push({ pathname: "/trip-photos-sheet", params: { invocation: id } });
              if (status !== "READY") void load();
              return;
            }
            setExpanded(true);
            if (status !== "READY") void load();
          }}
        />
      ) : null}
      {addError && !expanded ? (
        <Text accessibilityRole="alert" style={styles.status}>{t("tripPhotos.addFailed")}</Text>
      ) : null}
      {expanded ? (
        <Modal
          visible
          presentationStyle="pageSheet"
          animationType="slide"
          onRequestClose={close}
        >
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <SheetHeader
              category="action"
              safeTop={false}
              title={t("tripPhotos.title")}
              onLeft={close}
              wrapActions
            />
            <ScrollView contentContainerStyle={styles.gallery}>
              {content()}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      ) : null}
    </>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: colors.surface },
    gallery: { padding: visual.space.page, gap: visual.space.card },
    photo: { width: "100%", height: 220, borderRadius: visual.radius.card },
    status: { color: colors.textSecondary, ...visual.type.meta },
  });
