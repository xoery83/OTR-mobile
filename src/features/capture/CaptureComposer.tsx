import { SheetHeader } from "@/components/SheetHeader";
import { AppIcon } from "@/components/AppIcon";
import { OverlayDismissAction } from "@/components/OverlayDismissAction";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
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
import { UiGlassSurface } from "@/ui/UiGlassSurface";
import { CaptureConnections } from "./CaptureConnections";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { CaptureDraftSnapshot } from "./captureStaging";
import { useImportDictation } from "./useImportDictation";

type Props = {
  snapshot: CaptureDraftSnapshot;
  count: number;
  tripName?: string;
  duplicate: boolean;
  content?: ReactNode;
  title?: string;
  contextLabel?: string;
  errorMessage?: string;
  renderImagePaste?(enabled: boolean): ReactNode;
  readTripTargets?(): Promise<readonly { id: string; name: string }[]>;
  onTripTarget?(
    target: { id: string; name: string } | null,
    isCurrent: () => boolean,
  ): Promise<boolean>;
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
  readTripTargets,
  renderImagePaste,
  onTripTarget,
  onClose,
  onFiles,
  onPhotos,
  onCamera,
  onRemove,
  onText,
  onSubmit,
}: Props) {
  const locale = useUiLocale();
  const voice = useImportDictation(onText);
  const locked = snapshot.selecting || voice.busy;
  const closeVoice = voice.close;
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets(),
    { height, fontScale } = useWindowDimensions();
  const [page, setPage] = useState<"composer" | "email" | "ai" | "context">("composer");
  const [menu, setMenu] = useState(false);
  const targetEpoch = useRef(0);
  const [trips, setTrips] = useState<readonly { id: string; name: string }[]>([]);
  const [targetBusy, setTargetBusy] = useState(false);
  const [targetError, setTargetError] = useState(false);
  useEffect(() => {
    if (page !== "context") return;
    let active = true;
    void (
      readTripTargets
        ? readTripTargets()
        : Promise.reject(new Error("CAPTURE_TARGET_READER_UNAVAILABLE"))
    )
      .then((value) => {
        if (active) setTrips(value);
      })
      .catch(() => {
        if (active) setTargetError(true);
      })
      .finally(() => {
        if (active) setTargetBusy(false);
      });
    return () => {
      active = false;
      targetEpoch.current += 1;
    };
  }, [page, readTripTargets]);
  const chooseTrip = async (target: { id: string; name: string } | null) => {
    if (targetBusy || !onTripTarget) return;
    setTargetBusy(true);
    setTargetError(false);
    const epoch = targetEpoch.current;
    const current = () => epoch === targetEpoch.current;
    try {
      const selected = await onTripTarget(target, current);
      if (current()) {
        if (selected) setPage("composer");
        else setTargetError(true);
      }
    } catch {
      if (current()) setTargetError(true);
    } finally {
      if (current()) setTargetBusy(false);
    }
  };
  const maxInputHeight = 6 * 22 * Math.max(1, fontScale) + 16;
  const mixed =
    !!snapshot.editorText.trim() ||
    snapshot.items.some((i) => i.source === "magic_input" || i.source === "clipboard");
  const sendDisabled = locked || !count || mixed;
  const context =
    contextLabel ??
    (tripName
      ? t("capture.context", { name: tripName })
      : t("capture.composer.unassigned"));
  const close = () => {
    if (page === "composer" || content != null) {
      voice.close();
      onClose();
    } else setPage("composer");
  };
  useEffect(() => {
    if (content != null || page !== "composer") closeVoice();
  }, [content, page, closeVoice]);
  const attachments = () => {
    if (!locked) setMenu((value) => !value);
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            style={StyleSheet.absoluteFill}
            onPress={() => (menu ? setMenu(false) : close())}
          />
          <View
            style={[
              styles.sheet,
              {
                maxHeight: Math.max(44, height - insets.top - 16),
                paddingBottom: insets.bottom,
              },
            ]}
          >
            <SheetHeader
              category="composer"
              safeTop={false}
              title={header}
              onLeft={close}
            />
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
            ) : page === "email" || page === "ai" ? (
              <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
                <CaptureConnections page={page} onBack={() => setPage("composer")} />
              </ScrollView>
            ) : page === "context" ? (
              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.child}
                keyboardShouldPersistTaps="handled"
              >
                {targetBusy ? (
                  <UiText accessibilityLiveRegion="polite" style={styles.secondary}>
                    {t("capture.checking")}
                  </UiText>
                ) : null}
                {targetError ? (
                  <UiText accessibilityRole="alert" style={styles.error}>
                    {t("capture.connections.targetError")}
                  </UiText>
                ) : null}
                <UiButton
                  variant="text"
                  label={t("capture.composer.unassigned")}
                  disabled={targetBusy}
                  onPress={() => void chooseTrip(null)}
                />
                {trips.map((trip) => (
                  <Pressable
                    key={trip.id}
                    accessibilityRole="button"
                    disabled={targetBusy}
                    onPress={() => void chooseTrip(trip)}
                    style={styles.tripRow}
                  >
                    <UiText style={styles.bodyText}>{trip.name}</UiText>
                  </Pressable>
                ))}
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
                  disabled={voice.busy}
                  onPress={() => {
                    setTargetBusy(true);
                    setTargetError(false);
                    setPage("context");
                  }}
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
                                onPress={locked ? undefined : action.press}
                                accessibilityState={{
                                  disabled: locked || !action.press,
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
                        onPress={voice.busy ? undefined : () => setPage("email")}
                      >
                        {t("capture.composer.emailInstruction")}
                      </UiText>
                      <UiText
                        style={styles.instruction}
                        accessibilityRole="link"
                        onPress={voice.busy ? undefined : () => setPage("ai")}
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
                </ScrollView>
                <UiGlassSurface style={styles.composer}>
                  <UiTextInput
                    variant="bare"
                    value={snapshot.editorText}
                    onChangeText={onText}
                    editable={!locked}
                    multiline
                    placeholder={t(
                      snapshot.items.length
                        ? "capture.composer.messagePlaceholder"
                        : "capture.composer.placeholder",
                    )}
                    accessibilityLabel={t("capture.composer.magic")}
                    style={[styles.input, { maxHeight: maxInputHeight }]}
                  />
                  <View style={styles.footer}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("capture.composer.addAttachments")}
                      accessibilityState={{ disabled: locked }}
                      disabled={locked}
                      style={styles.target}
                      onPress={attachments}
                    >
                      <AppIcon name="plus" size={25} color={colors.textPrimary} />
                    </Pressable>
                    {renderImagePaste?.(!locked)}
                    <View style={styles.spacer} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        voice.busy ? "capture.voice.stop" : "capture.voice.start",
                      )}
                      accessibilityState={{
                        disabled:
                          snapshot.selecting ||
                          voice.state.status === "starting" ||
                          voice.state.status === "finishing",
                      }}
                      disabled={
                        snapshot.selecting ||
                        voice.state.status === "starting" ||
                        voice.state.status === "finishing"
                      }
                      onPress={() =>
                        voice.busy
                          ? voice.stop()
                          : voice.start(
                              snapshot.editorText,
                              locale === "zh-Hans" ? "zh-CN" : "en-US",
                            )
                      }
                      style={styles.target}
                    >
                      <AppIcon
                        name={voice.busy ? "stop.fill" : "mic"}
                        size={22}
                        color={snapshot.selecting ? colors.disabled : colors.accent}
                      />
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
                </UiGlassSurface>
                {mixed ? (
                  <UiText style={styles.submitHelp}>
                    {t("capture.composer.textSubmitUnavailable")}
                  </UiText>
                ) : null}
                {voice.state.status !== "idle" ? (
                  <View style={styles.voiceStatus}>
                    <UiText accessibilityLiveRegion="polite" style={styles.secondary}>
                      {t(
                        voice.state.status === "error"
                          ? `capture.voice.error.${voice.state.error ?? "failed"}`
                          : `capture.voice.${voice.state.status}`,
                      )}
                    </UiText>
                    {voice.state.status === "error" && voice.diagnostic ? (
                      <UiText style={styles.secondary}>
                        {t("capture.voice.diagnostic", {
                          phase: voice.diagnostic.phase,
                          domain: voice.diagnostic.domain,
                          code: voice.diagnostic.code ?? "?",
                        })}
                      </UiText>
                    ) : null}
                    {voice.busy ? (
                      <UiButton
                        variant="text"
                        label={t("capture.voice.cancel")}
                        onPress={voice.cancel}
                      />
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
          </View>
          {menu && page === "composer" && content == null ? (
            <UiGlassSurface
              style={[styles.attachmentMenu, { bottom: insets.bottom + 60 }]}
            >
              {[
                {
                  icon: "camera" as const,
                  label: t("capture.composer.camera"),
                  press: onCamera,
                },
                {
                  icon: "photo" as const,
                  label: t("capture.composer.photos"),
                  press: onPhotos,
                },
                {
                  icon: "paperclip" as const,
                  label: t("capture.composer.files"),
                  press: onFiles,
                },
              ].map((item) => (
                <Pressable
                  key={item.icon}
                  accessibilityRole="button"
                  disabled={!item.press || locked}
                  onPress={() => {
                    setMenu(false);
                    item.press?.();
                  }}
                  style={styles.menuRow}
                >
                  <View style={styles.menuIcon}>
                    <AppIcon name={item.icon} size={23} color={colors.textPrimary} />
                  </View>
                  <UiText style={styles.bodyText}>{item.label}</UiText>
                </Pressable>
              ))}
            </UiGlassSurface>
          ) : null}
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
    instruction: { ...visual.type.meta, color: c.textSecondary, lineHeight: 24 },
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
      paddingHorizontal: visual.space.card,
      paddingVertical: 10,
    },
    voiceStatus: { paddingHorizontal: visual.space.page, gap: 4 },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 6,
      paddingVertical: 4,
      gap: 8,
    },
    target: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    spacer: { flex: 1 },
    send: { borderRadius: visual.radius.pill, backgroundColor: c.accent },
    sendDisabled: { backgroundColor: c.controlTrack },
    secondary: { ...visual.type.meta, color: c.textSecondary },
    error: { ...visual.type.meta, color: c.destructive },
    composer: {
      marginHorizontal: visual.space.page,
      marginTop: 6,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      shadowColor: c.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    attachmentMenu: {
      position: "absolute",
      left: visual.space.page,
      width: 240,
      maxWidth: "90%",
      borderRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      padding: 8,
      shadowColor: c.shadow,
      shadowOpacity: 0.14,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    menuRow: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 8,
    },
    menuIcon: {
      width: 40,
      height: 40,
      borderRadius: visual.radius.pill,
      backgroundColor: c.controlTrack,
      alignItems: "center",
      justifyContent: "center",
    },
    tripRow: {
      minHeight: 44,
      justifyContent: "center",
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    submitHelp: {
      ...visual.type.meta,
      color: c.textSecondary,
      paddingHorizontal: visual.space.page,
      paddingTop: 4,
    },
    child: { padding: visual.space.page, gap: visual.space.card, minHeight: 180 },
    bodyText: { ...visual.type.row, fontWeight: "400", color: c.textPrimary },
  });
