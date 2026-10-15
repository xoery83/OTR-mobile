import { AppIcon } from "@/components/AppIcon";
import { useState, type ReactNode } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { OverlayDismissAction } from "@/components/OverlayDismissAction";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { CaptureDraftSnapshot } from "./captureStaging";

export function CaptureComposer({
  snapshot,
  count,
  tripName,
  onClose,
  onFiles,
  onPhotos,
  onRemove,
  onText,
  onAddText,
  onClear,
  onSubmit,
  duplicate,
  content,
  title,
  contextLabel,
  errorMessage,
}: {
  snapshot: CaptureDraftSnapshot;
  count: number;
  tripName?: string;
  duplicate: boolean;
  content?: ReactNode;
  title?: string;
  contextLabel?: string;
  errorMessage?: string;
  onClose: () => void;
  onFiles: () => void;
  onPhotos: () => void;
  onRemove: (id: number) => void;
  onText: (text: string) => void;
  onAddText: () => void;
  onClear: () => void;
  onSubmit: () => void;
  onActivity: () => void;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles),
    insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [tab, setTab] = useState<"capture" | "connections">("capture");
  const mixed =
    snapshot.items.some((item) => item.source === "magic_input") ||
    !!snapshot.editorText.trim();
  const clear = () =>
    Alert.alert(t("capture.composer.clear"), t("capture.composer.clearHint"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("capture.composer.clear"), style: "destructive", onPress: onClear },
    ]);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.viewport}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "height" : undefined}
        >
          <View
            style={[
              styles.sheet,
              {
                maxHeight: Math.max(44, (height - insets.top - insets.bottom) * 0.88),
                paddingBottom: insets.bottom,
              },
            ]}
          >
            <View style={styles.heading}>
              <UiText accessibilityRole="header" style={styles.title}>
                {title ?? t("capture.composer.title")}
              </UiText>
              <OverlayDismissAction label={t("common.close")} onPress={onClose} />
            </View>
            <UiText style={styles.context}>
              {contextLabel ??
                (tripName
                  ? t("capture.context", { name: tripName })
                  : t("capture.composer.unassigned"))}
            </UiText>
            {errorMessage ? (
              <UiText accessibilityRole="alert" style={styles.error}>
                {errorMessage}
              </UiText>
            ) : null}
            {content != null ? (
              <View style={styles.contentViewport}>{content}</View>
            ) : (
              <>
                <View style={styles.tabs}>
                  <UiChoiceChip
                    compact
                    label={t("capture.composer.capture")}
                    selected={tab === "capture"}
                    onPress={() => setTab("capture")}
                  />
                  <UiChoiceChip
                    compact
                    label={t("capture.composer.connections")}
                    selected={tab === "connections"}
                    onPress={() => setTab("connections")}
                  />
                </View>
                <ScrollView
                  style={styles.body}
                  contentContainerStyle={styles.content}
                  keyboardShouldPersistTaps="handled"
                >
                  {tab === "connections" ? (
                    <View style={styles.content}>
                      {(["forward", "inbox", "chatgpt", "claude"] as const).map((key) => (
                        <View key={key} style={styles.connection}>
                          <UiText style={styles.name}>
                            {t(`capture.composer.${key}`)}
                          </UiText>
                          <UiText style={styles.secondary}>
                            {t("capture.composer.connectionUnavailable")}
                          </UiText>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <>
                      <View style={styles.actions}>
                        <UiButton
                          label={t("capture.composer.files")}
                          variant="secondary"
                          disabled={snapshot.selecting}
                          onPress={onFiles}
                        />
                        <UiButton
                          label={t("capture.composer.photos")}
                          variant="secondary"
                          disabled={snapshot.selecting}
                          onPress={onPhotos}
                        />
                        <UiButton
                          label={t("capture.composer.camera")}
                          variant="secondary"
                          disabled
                          onPress={() => {}}
                        />
                      </View>
                      {snapshot.selecting ? (
                        <UiText accessibilityLiveRegion="polite" style={styles.secondary}>
                          {t("capture.selecting")}
                        </UiText>
                      ) : null}
                      {snapshot.error ? (
                        <UiText accessibilityRole="alert" style={styles.error}>
                          {t("capture.pickerError")}
                        </UiText>
                      ) : null}
                      {duplicate ? (
                        <UiText accessibilityLiveRegion="polite" style={styles.secondary}>
                          {t("capture.composer.alreadyAdded")}
                        </UiText>
                      ) : null}
                      <View style={styles.composer}>
                        {snapshot.items.length ? (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator
                            contentContainerStyle={styles.tray}
                          >
                            {snapshot.items.map((item) => {
                              const name =
                                item.source === "magic_input"
                                  ? item.text
                                  : (item.name ?? t("capture.unnamed"));
                              return (
                                <View key={item.stagingId} style={styles.card}>
                                  {item.source === "photos" && item.temporaryUri ? (
                                    <Image
                                      source={{ uri: item.temporaryUri }}
                                      style={styles.thumbnail}
                                      resizeMode="cover"
                                      accessibilityLabel={name}
                                    />
                                  ) : (
                                    <AppIcon
                                      name={
                                        item.source === "magic_input"
                                          ? "text.alignleft"
                                          : "doc"
                                      }
                                      color={colors.textSecondary}
                                    />
                                  )}
                                  <View style={styles.cardCopy}>
                                    <UiText
                                      style={styles.name}
                                      numberOfLines={2}
                                      accessibilityLabel={name}
                                    >
                                      {name}
                                    </UiText>
                                    <UiText style={styles.secondary}>
                                      {t(
                                        item.source === "magic_input"
                                          ? "capture.composer.magic"
                                          : item.source === "files"
                                            ? "capture.sourceFiles"
                                            : "capture.sourcePhotos",
                                      )}
                                    </UiText>
                                    {item.source !== "magic_input" &&
                                    item.availability === "unavailable" ? (
                                      <UiText style={styles.error}>
                                        {t("capture.unavailable")}
                                      </UiText>
                                    ) : null}
                                  </View>
                                  <OverlayDismissAction
                                    label={t("capture.remove", { name })}
                                    onPress={() => onRemove(item.stagingId)}
                                  />
                                </View>
                              );
                            })}
                          </ScrollView>
                        ) : null}
                        <View style={styles.editor}>
                          <UiTextInput
                            variant="bare"
                            value={snapshot.editorText}
                            onChangeText={onText}
                            editable={!snapshot.selecting}
                            multiline={false}
                            placeholder={t("capture.composer.placeholder")}
                            accessibilityLabel={t("capture.composer.magic")}
                            style={styles.input}
                          />
                          {snapshot.editorText.trim() ? (
                            <UiButton
                              label={t("capture.composer.add")}
                              variant="text"
                              disabled={snapshot.selecting}
                              onPress={onAddText}
                            />
                          ) : null}
                        </View>
                      </View>
                    </>
                  )}
                </ScrollView>
                {tab === "capture" && count > 0 ? (
                  <View style={styles.footer}>
                    <UiText style={styles.secondary}>
                      {t(count === 1 ? "capture.countOne" : "capture.countOther", {
                        count,
                      })}
                    </UiText>
                    {mixed ? (
                      <UiText style={styles.secondary}>
                        {t("capture.composer.textSubmitUnavailable")}
                      </UiText>
                    ) : null}
                    <UiButton
                      label={t("capture.composer.clear")}
                      variant="text"
                      disabled={snapshot.selecting}
                      onPress={clear}
                    />
                    <UiButton
                      label={t("capture.composer.submit")}
                      disabled={snapshot.selecting || mixed}
                      onPress={onSubmit}
                    />
                  </View>
                ) : null}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    viewport: { flex: 1, backgroundColor: c.overlay },
    keyboard: { flex: 1, justifyContent: "flex-end" },
    sheet: {
      flexShrink: 1,
      backgroundColor: c.surface,
      borderTopLeftRadius: visual.radius.card,
      borderTopRightRadius: visual.radius.card,
      overflow: "hidden",
    },
    heading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: visual.space.page,
    },
    title: { ...visual.type.section, color: c.textPrimary, flex: 1 },
    context: {
      ...visual.type.meta,
      color: c.textSecondary,
      paddingHorizontal: visual.space.page,
    },
    tabs: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      backgroundColor: c.controlTrack,
      borderRadius: visual.radius.control,
      marginHorizontal: visual.space.card,
      marginTop: visual.space.heading,
    },
    actions: {
      justifyContent: "space-between",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: visual.space.heading,
      padding: visual.space.heading,
    },
    contentViewport: {
      flexGrow: 0,
      flexShrink: 1,
      overflow: "hidden",
      backgroundColor: c.surface,
    },
    body: { flexGrow: 0, flexShrink: 1, backgroundColor: c.surface },
    content: { padding: visual.space.card, gap: visual.space.row },
    connection: { gap: visual.space.heading },
    secondary: { ...visual.type.meta, color: c.textSecondary },
    name: { ...visual.type.row, color: c.textPrimary },
    error: { ...visual.type.row, color: c.destructive },
    composer: { gap: visual.space.heading },
    tray: { gap: visual.space.heading },
    card: {
      width: 230,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.heading,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      borderRadius: visual.radius.control,
      padding: visual.space.heading,
    },
    cardCopy: { flex: 1, minWidth: 0 },
    thumbnail: { width: 40, height: 40, borderRadius: visual.radius.control },
    editor: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      borderRadius: visual.radius.control,
      backgroundColor: c.elevatedSurface,
      flexDirection: "row",
      alignItems: "center",
      padding: visual.space.heading,
      gap: visual.space.heading,
    },
    input: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      backgroundColor: c.elevatedSurface,
      ...visual.type.meta,
    },
    footer: {
      gap: visual.space.heading,
      padding: visual.space.card,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "flex-end",
    },
  });
