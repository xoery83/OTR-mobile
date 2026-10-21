import { AppIcon } from "@/components/AppIcon";
import { OverlayDismissAction } from "@/components/OverlayDismissAction";
import { useState, type ReactNode } from "react";
import {
  ActionSheetIOS,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { UiButton, UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { CaptureDraftSnapshot } from "./captureStaging";

type Props = {
  snapshot: CaptureDraftSnapshot;
  count: number;
  tripName?: string;
  duplicate: boolean;
  content?: ReactNode;
  title?: string;
  contextLabel?: string;
  errorMessage?: string;
  onClose(): void;
  onFiles(): void;
  onPhotos(): void;
  onCamera?(): void;
  onRemove(id: number): void;
  onText(text: string): void;
  onAddText(): void;
  onClear(): void;
  onSubmit(): void;
  onActivity(): void;
};

export function CaptureComposer({
  snapshot,
  count,
  tripName,
  duplicate,
  content,
  title,
  contextLabel,
  errorMessage,
  onClose,
  onFiles,
  onPhotos,
  onCamera,
  onRemove,
  onText,
  onSubmit,
}: Props) {
  useUiLocale();
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets(),
    { height, fontScale } = useWindowDimensions();
  const [page, setPage] = useState<"composer" | "email" | "ai" | "context">("composer");
  const maxInputHeight = 6 * 22 * Math.max(1, fontScale) + 16;
  const mixed =
    !!snapshot.editorText.trim() ||
    snapshot.items.some((i) => i.source === "magic_input");
  const sendDisabled = snapshot.selecting || !count || mixed;
  const context =
    contextLabel ??
    (tripName
      ? t("capture.context", { name: tripName })
      : t("capture.composer.unassigned"));
  const close = () =>
    page === "composer" || content != null ? onClose() : setPage("composer");
  const attachments = () => {
    const choose = (index: number) => {
      if (snapshot.selecting) return;
      if (index === 0) onCamera?.();
      if (index === 1) onPhotos();
      if (index === 2) onFiles();
    };
    if (Platform.OS !== "ios") {
      Alert.alert(
        t("capture.composer.addAttachments"),
        undefined,
        [
          ...(onCamera
            ? [{ text: t("capture.composer.camera"), onPress: () => choose(0) }]
            : []),
          { text: t("capture.composer.photos"), onPress: () => choose(1) },
          { text: t("capture.composer.files"), onPress: () => choose(2) },
        ],
        { cancelable: true },
      );
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t("capture.composer.addAttachments"),
        options: [
          t("capture.composer.camera"),
          t("capture.composer.photos"),
          t("capture.composer.files"),
          t("common.cancel"),
        ],
        cancelButtonIndex: 3,
        disabledButtonIndices: onCamera ? [] : [0],
      },
      choose,
    );
  };
  const header =
    page === "email"
      ? t("capture.composer.emailTitle")
      : page === "ai"
        ? t("capture.composer.aiTitle")
        : page === "context"
          ? t("capture.composer.contextTitle")
          : (title ?? t("capture.composer.title"));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.viewport}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.sheet,
              {
                maxHeight: Math.max(44, height - insets.top - 16),
                paddingBottom: insets.bottom,
              },
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.heading}>
              <UiText accessibilityRole="header" style={styles.title}>
                {header}
              </UiText>
              <OverlayDismissAction label={t("common.close")} onPress={close} />
            </View>
            {content != null ? (
              <>
                <UiText style={styles.context}>{context}</UiText>
                {errorMessage ? (
                  <UiText accessibilityRole="alert" style={styles.error}>
                    {errorMessage}
                  </UiText>
                ) : null}
                <View style={styles.contentViewport}>{content}</View>
              </>
            ) : page !== "composer" ? (
              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.child}
                keyboardShouldPersistTaps="handled"
              >
                <UiText style={styles.bodyText}>
                  {page === "context"
                    ? context
                    : t(
                        page === "email"
                          ? "capture.composer.emailUnavailable"
                          : "capture.composer.aiUnavailable",
                      )}
                </UiText>
                {page === "context" ? (
                  <UiText style={styles.secondary}>
                    {t("capture.composer.contextUnavailable")}
                  </UiText>
                ) : null}
                <UiButton
                  variant="text"
                  label={t("common.back")}
                  onPress={() => setPage("composer")}
                />
              </ScrollView>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("capture.composer.contextTitle")}
                  onPress={() => setPage("context")}
                  style={styles.contextTarget}
                >
                  <UiText style={styles.contextText} numberOfLines={1}>
                    {context}
                  </UiText>
                  <AppIcon name="chevron.down" size={12} color={colors.textSecondary} />
                </Pressable>
                <ScrollView
                  style={styles.body}
                  contentContainerStyle={styles.content}
                  keyboardShouldPersistTaps="handled"
                >
                  {snapshot.items.length ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.tray}
                    >
                      {snapshot.items.map((item) => {
                        const name =
                          item.source === "magic_input"
                            ? item.text
                            : (item.name ?? t("capture.unnamed"));
                        const photo =
                          item.source !== "magic_input" &&
                          item.typeHint?.startsWith("image/") &&
                          item.temporaryUri;
                        return (
                          <View key={item.stagingId} style={styles.tile}>
                            {photo ? (
                              <Image
                                source={{ uri: photo }}
                                style={styles.thumbnail}
                                resizeMode="cover"
                                accessibilityLabel={name}
                              />
                            ) : (
                              <AppIcon
                                name={
                                  item.source === "magic_input" ? "text.alignleft" : "doc"
                                }
                                size={28}
                                color={colors.accent}
                              />
                            )}
                            <UiText
                              numberOfLines={1}
                              style={styles.filename}
                              accessibilityLabel={name}
                            >
                              {name}
                            </UiText>
                            <View style={styles.remove}>
                              <OverlayDismissAction
                                label={t("capture.remove", { name })}
                                onPress={() => onRemove(item.stagingId)}
                              />
                            </View>
                            {item.source !== "magic_input" &&
                            item.availability === "unavailable" ? (
                              <UiText style={styles.tileError}>
                                {t("capture.unavailable")}
                              </UiText>
                            ) : null}
                          </View>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={styles.instructions}>
                      <UiText style={styles.instruction}>
                        {t("capture.composer.sourcesInstruction", {
                          camera: "\uE000",
                          photos: "\uE001",
                          files: "\uE002",
                        })
                          .split(/([\uE000-\uE002])/)
                          .map((part, index) => {
                            const action =
                              part === "\uE000"
                                ? { label: t("capture.composer.camera"), press: onCamera }
                                : part === "\uE001"
                                  ? {
                                      label: t("capture.composer.photos"),
                                      press: onPhotos,
                                    }
                                  : part === "\uE002"
                                    ? {
                                        label: t("capture.composer.files"),
                                        press: onFiles,
                                      }
                                    : null;
                            return action ? (
                              <UiText
                                key={index}
                                accessibilityRole="link"
                                style={styles.link}
                                onPress={snapshot.selecting ? undefined : action.press}
                                accessibilityState={{
                                  disabled: snapshot.selecting || !action.press,
                                }}
                              >
                                {action.label}
                              </UiText>
                            ) : (
                              part
                            );
                          })}
                      </UiText>
                      <UiText
                        style={styles.instruction}
                        accessibilityRole="link"
                        onPress={() => setPage("email")}
                      >
                        {t("capture.composer.emailInstruction")}
                      </UiText>
                      <UiText
                        style={styles.instruction}
                        accessibilityRole="link"
                        onPress={() => setPage("ai")}
                      >
                        {t("capture.composer.aiInstruction")}
                      </UiText>
                    </View>
                  )}
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
                  {errorMessage ? (
                    <UiText accessibilityRole="alert" style={styles.error}>
                      {errorMessage}
                    </UiText>
                  ) : null}
                  <UiTextInput
                    variant="bare"
                    value={snapshot.editorText}
                    onChangeText={onText}
                    editable={!snapshot.selecting}
                    multiline
                    placeholder={t(
                      snapshot.items.length
                        ? "capture.composer.messagePlaceholder"
                        : "capture.composer.placeholder",
                    )}
                    accessibilityLabel={t("capture.composer.magic")}
                    style={[styles.input, { maxHeight: maxInputHeight }]}
                  />
                  {mixed ? (
                    <UiText style={styles.secondary}>
                      {t("capture.composer.textSubmitUnavailable")}
                    </UiText>
                  ) : null}
                </ScrollView>
                <View style={styles.footer}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("capture.composer.addAttachments")}
                    accessibilityState={{ disabled: snapshot.selecting }}
                    disabled={snapshot.selecting}
                    style={styles.target}
                    onPress={attachments}
                  >
                    <AppIcon name="plus" size={25} color={colors.textPrimary} />
                  </Pressable>
                  <View style={styles.spacer} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("capture.composer.voiceUnavailable")}
                    accessibilityState={{ disabled: true }}
                    disabled
                    style={styles.target}
                  >
                    <AppIcon name="mic" size={22} color={colors.disabled} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("capture.composer.submit")}
                    accessibilityState={{ disabled: sendDisabled }}
                    disabled={sendDisabled}
                    onPress={onSubmit}
                    style={[
                      styles.target,
                      styles.send,
                      sendDisabled && styles.sendDisabled,
                    ]}
                  >
                    <AppIcon
                      name="arrow.up"
                      size={23}
                      color={sendDisabled ? colors.disabled : colors.onAccent}
                    />
                  </Pressable>
                </View>
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
      borderTopLeftRadius: visual.radius.hero,
      borderTopRightRadius: visual.radius.hero,
      overflow: "hidden",
    },
    handle: {
      alignSelf: "center",
      width: 32,
      height: 4,
      marginTop: 8,
      borderRadius: visual.radius.pill,
      backgroundColor: c.separator,
    },
    heading: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: visual.space.page,
    },
    title: { ...visual.type.section, color: c.textPrimary, flex: 1 },
    contextTarget: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      paddingHorizontal: visual.space.page,
      gap: 6,
      maxWidth: "100%",
    },
    contextText: { ...visual.type.meta, color: c.textSecondary, flexShrink: 1 },
    context: {
      ...visual.type.meta,
      color: c.textSecondary,
      paddingHorizontal: visual.space.page,
    },
    body: { flexShrink: 1 },
    content: { paddingHorizontal: visual.space.page, gap: 6 },
    contentViewport: { flexShrink: 1, minHeight: 44 },
    instructions: { paddingVertical: 4 },
    instruction: { ...visual.type.meta, color: c.textSecondary, lineHeight: 44 },
    link: { color: c.accent, textDecorationLine: "underline" },
    tray: { gap: visual.space.card, paddingVertical: 8, paddingRight: 12 },
    tile: {
      width: 72,
      height: 76,
      borderRadius: visual.radius.control,
      backgroundColor: c.background,
      alignItems: "center",
      justifyContent: "center",
      overflow: "visible",
    },
    thumbnail: { ...StyleSheet.absoluteFill, borderRadius: visual.radius.control },
    filename: {
      ...visual.type.navigation,
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 3,
      paddingVertical: 3,
      color: c.textPrimary,
      backgroundColor: c.surface,
      borderBottomLeftRadius: visual.radius.control,
      borderBottomRightRadius: visual.radius.control,
    },
    remove: { position: "absolute", top: -10, right: -10 },
    tileError: {
      ...visual.type.navigation,
      color: c.destructive,
      backgroundColor: c.surface,
    },
    input: {
      ...visual.type.row,
      lineHeight: 22,
      fontWeight: "400",
      minHeight: 44,
      textAlignVertical: "top",
      borderRadius: visual.radius.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      paddingHorizontal: visual.space.card,
      paddingVertical: 10,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: visual.space.page,
      paddingVertical: 4,
      gap: 8,
    },
    target: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    spacer: { flex: 1 },
    send: { borderRadius: visual.radius.pill, backgroundColor: c.accent },
    sendDisabled: { backgroundColor: c.controlTrack },
    secondary: { ...visual.type.meta, color: c.textSecondary },
    error: { ...visual.type.meta, color: c.destructive },
    child: { padding: visual.space.page, gap: visual.space.card, minHeight: 180 },
    bodyText: { ...visual.type.row, fontWeight: "400", color: c.textPrimary },
  });
