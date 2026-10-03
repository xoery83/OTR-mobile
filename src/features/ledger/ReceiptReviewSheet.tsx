import { systemMessage, domainLabel } from "@/ui/domainLabels";
import { t } from "@/ui/locale";
import { UiTextInput as TextInput } from "@/ui/forms";
import { useUiTheme, useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { OverlayDismissAction } from "@/components/OverlayDismissAction";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { currencyScale } from "@/domain/ledger/currency";
import { CurrencyPicker } from "./CurrencyPicker";
import { SheetHeader } from "@/components/SheetHeader";
import {
  currencyAmountInput,
  currencyAmountHint,
  parseCurrencyAmount,
} from "./expenseDraft";
import type { ReceiptReviewResult, ReceiptReviewState } from "./receiptReview";
import {
  confirmReceiptReview,
  receiptAmountCurrencyMismatch,
  editReceiptReviewField,
  selectReceiptReviewAmount,
  selectReceiptReviewTitle,
} from "./receiptReview";
import type { ReceiptScanSession } from "./receiptScanSession";
import { ReceiptCandidateTags, type ReceiptTag } from "./ReceiptCandidateTags";
import {
  activeReceiptId,
  amountTagSelected,
  isReceiptCollapseSwipe,
  receiptCards,
  receiptCurrencyTags,
  reviewPaneWidths,
} from "./receiptReviewPresentation";

type Props = {
  visible: boolean;
  session: ReceiptScanSession;
  review: ReceiptReviewState;
  journeyCurrency: string;
  defaultCurrency: string;
  onChange: (review: ReceiptReviewState) => void;
  onCancel: () => void;
  onConfirm: (result: ReceiptReviewResult, sessionRevision: number) => void;
  onRetry: (documentId: string) => void;
  onRemove: (documentId: string) => void;
  onScanAnother: () => void;
  canScanAnother: boolean;
  scanBusy: boolean;
  sourceChooser?: ReactNode;
};

export function ReceiptReviewSheet({
  visible,
  session,
  review,
  journeyCurrency,
  defaultCurrency,
  onChange,
  onCancel,
  onConfirm,
  onRetry,
  onRemove,
  onScanAnother,
  canScanAnother,
  scanBusy,
  sourceChooser,
}: Props) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);

  const window = useWindowDimensions();
  const landscape = window.width > window.height;
  const [workspaceWidth, setWorkspaceWidth] = useState(window.width);
  const [currencyPicker, setCurrencyPicker] = useState(false);
  const [overflow, setOverflow] = useState<"Title" | "Amount" | "Currency" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [landscapeCollapsed, setLandscapeCollapsed] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset] = useState(() => new Animated.Value(workspaceWidth));
  const swipeStart = useRef({ x: 0, y: 0 });
  const cards = receiptCards(session);
  const activeId = activeReceiptId(session, selectedReceipt);
  const active = cards.find((part) => part.documentId === activeId);
  const compare = Boolean(active && (expanded || (landscape && !landscapeCollapsed)));
  const panes = reviewPaneWidths(workspaceWidth, landscape, compare);
  const currencyTags = receiptCurrencyTags(review, journeyCurrency);
  const scale = currencyScale(review.currency.value);
  const amountInvalid = Boolean(
    review.amount.value.trim() &&
    (scale === null || parseCurrencyAmount(review.amount.value, scale) === null),
  );

  useEffect(() => {
    Animated.timing(offset, {
      toValue: compare ? 0 : Math.ceil(workspaceWidth * 0.58),
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [compare, offset, workspaceWidth]);

  const change = (field: "title" | "amount" | "currency", value: string) => {
    setError(null);
    onChange(editReceiptReviewField(review, field, value));
  };
  const openCurrency = () => {
    Keyboard.dismiss();
    setCurrencyPicker(true);
  };
  const closeReceipt = () => {
    Keyboard.dismiss();
    setExpanded(false);
    setLandscapeCollapsed(true);
  };
  const openReceipt = (id: string) => {
    Keyboard.dismiss();
    setSelectedReceipt(id);
    setExpanded(true);
    setLandscapeCollapsed(false);
  };
  const confirm = () => {
    try {
      onConfirm(confirmReceiptReview(review, session), session.revision);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("ui.checkTheReviewFields"));
    }
  };
  const cancel = () => {
    Keyboard.dismiss();
    setCurrencyPicker(false);
    setOverflow(null);
    closeReceipt();
    setError(null);
    onCancel();
  };
  const titleTags: ReceiptTag[] = review.suggestions.titles.map((title) => ({
    key: title,
    label: title,
    selected: review.title.value === title,
    onPress: () => {
      setError(null);
      onChange(selectReceiptReviewTitle(review, title));
      setOverflow(null);
    },
  }));
  const amountTags: ReceiptTag[] = review.suggestions.amounts.map((candidate) => ({
    key: `${candidate.decimal}:${candidate.currency ?? "?"}`,
    label: `${candidate.decimal}${candidate.currency && candidate.currency !== review.currency.value ? ` ${candidate.currency}` : ""}`,
    selected: amountTagSelected(review, candidate),
    onPress: () => {
      setError(null);
      onChange(selectReceiptReviewAmount(review, candidate));
      setOverflow(null);
    },
  }));
  const currencyOptions: ReceiptTag[] = currencyTags.map((code) => ({
    key: code,
    label: code,
    selected: review.currency.value === code,
    onPress: () => {
      change("currency", code);
      setOverflow(null);
    },
  }));
  const overflowTags =
    overflow === "Title"
      ? titleTags
      : overflow === "Amount"
        ? amountTags
        : currencyOptions;
  const usedSlots = session.existingAttachmentDraftIds.length + cards.length;

  return (
    <Modal
      animationType="slide"
      supportedOrientations={["portrait", "landscape-left", "landscape-right"]}
      onOrientationChange={() => setLandscapeCollapsed(false)}
      onRequestClose={
        currencyPicker
          ? () => setCurrencyPicker(false)
          : overflow
            ? () => setOverflow(null)
            : cancel
      }
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={styles.flex}>
        <View
          style={styles.flex}
          pointerEvents={currencyPicker ? "none" : "auto"}
          accessibilityElementsHidden={currencyPicker}
          importantForAccessibility={currencyPicker ? "no-hide-descendants" : "auto"}
        >
          <SheetHeader
            leftLabel={t("ui.cancel")}
            onLeft={cancel}
            onRight={confirm}
            rightLabel={t("ui.confirm")}
            title={t("ui.reviewReceipt")}
          />
          <View style={styles.scanRow}>
            <Pressable
              accessibilityLabel={t("ui.scanAnotherPart")}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canScanAnother }}
              disabled={!canScanAnother}
              onPress={onScanAnother}
              style={[styles.scan, !canScanAnother && styles.muted]}
            >
              <Text style={styles.actionText}>{t("ui.scanAnotherPart2")}</Text>
            </Pressable>
            <Text style={styles.capacity}>
              {usedSlots} {t("ui.of3")}
            </Text>
          </View>
          <View
            onLayout={(event) => setWorkspaceWidth(event.nativeEvent.layout.width)}
            style={styles.workspace}
          >
            <ScrollView
              automaticallyAdjustKeyboardInsets
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.content, compare && styles.compareContent]}
              style={{ width: panes.form }}
            >
              {compare ? (
                <Pressable
                  accessibilityLabel={t("ui.closeReceiptDrawer")}
                  accessibilityRole="button"
                  onPress={closeReceipt}
                  style={styles.formEdge}
                >
                  <AppIcon
                    name="rectangle.righthalf.inset.filled.arrow.right"
                    color={colors.textSecondary}
                    size={18}
                  />
                  <Text style={styles.collapseText}>{t("ui.hideImage")}</Text>
                </Pressable>
              ) : null}
              <View style={styles.field}>
                <Text style={styles.label}>{t("ui.title")}</Text>
                <TextInput
                  accessibilityLabel={t("ui.receiptReviewTitle")}
                  onChangeText={(value) => change("title", value)}
                  placeholder={t("ui.whatWasIt")}
                  style={styles.input}
                  value={review.title.value}
                  multiline={compare}
                />
                {compare ? (
                  <CandidateDropdown
                    tags={titleTags}
                    label={t("ui.title")}
                    onPress={() => {
                      Keyboard.dismiss();
                      setOverflow("Title");
                    }}
                  />
                ) : (
                  <ReceiptCandidateTags
                    tags={titleTags}
                    label={t("ui.title")}
                    onOverflow={() => {
                      Keyboard.dismiss();
                      setOverflow("Title");
                    }}
                  />
                )}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t("ui.amount")}</Text>
                <TextInput
                  accessibilityLabel={t("ui.receiptReviewAmount")}
                  inputMode={scale === 0 ? "numeric" : "decimal"}
                  keyboardType={scale === 0 ? "number-pad" : "decimal-pad"}
                  onChangeText={(value) =>
                    change(
                      "amount",
                      currencyAmountInput(review.amount.value, value, scale ?? 2),
                    )
                  }
                  placeholder={t("ui.0")}
                  style={styles.input}
                  value={review.amount.value}
                />
                {amountInvalid ? (
                  <Text style={styles.error}>
                    {currencyAmountHint(review.currency.value, scale ?? 2)}
                  </Text>
                ) : null}
                {receiptAmountCurrencyMismatch(review) ? (
                  <Text style={styles.error}>
                    {systemMessage(receiptAmountCurrencyMismatch(review) ?? "")}
                  </Text>
                ) : null}
                {compare ? (
                  <CandidateDropdown
                    tags={amountTags}
                    label={t("ui.amount")}
                    onPress={() => {
                      Keyboard.dismiss();
                      setOverflow("Amount");
                    }}
                  />
                ) : (
                  <ReceiptCandidateTags
                    tags={amountTags}
                    label={t("ui.amount")}
                    onOverflow={() => {
                      Keyboard.dismiss();
                      setOverflow("Amount");
                    }}
                  />
                )}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t("ui.currency")}</Text>
                <Pressable
                  accessibilityLabel={t("receipt.currency", {
                    currency: review.currency.value,
                  })}
                  accessibilityRole="button"
                  onPress={openCurrency}
                  style={styles.inputButton}
                >
                  <Text style={styles.currencyValue}>{review.currency.value}</Text>
                  <Text style={styles.actionText}>⌄</Text>
                </Pressable>
                {compare ? (
                  <CandidateDropdown
                    tags={currencyOptions}
                    label={t("ui.currency")}
                    onPress={() => {
                      Keyboard.dismiss();
                      setOverflow("Currency");
                    }}
                  />
                ) : (
                  <ReceiptCandidateTags
                    tags={currencyOptions}
                    label={t("ui.currency")}
                    onOverflow={openCurrency}
                    alwaysOverflow
                  />
                )}
              </View>
              {error ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {systemMessage(error)}
                </Text>
              ) : null}
            </ScrollView>
            {!compare ? (
              <View style={styles.stack}>
                {[...cards].reverse().map((part, index) => (
                  <Pressable
                    key={part.documentId}
                    accessibilityLabel={t("receipt.open", { number: part.number })}
                    accessibilityRole="button"
                    hitSlop={{ left: 8 }}
                    onPress={() => openReceipt(part.documentId)}
                    style={[styles.card, { top: 16 + index * 68, zIndex: index }]}
                  >
                    <Image
                      source={{ uri: part.draft.localUri }}
                      resizeMode="cover"
                      style={styles.cardImage}
                    />
                    <Text style={styles.cardNumber}>{part.number}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {active ? (
              <Animated.View
                pointerEvents={compare ? "auto" : "none"}
                accessibilityElementsHidden={!compare}
                importantForAccessibility={compare ? "auto" : "no-hide-descendants"}
                style={[
                  styles.receiptPane,
                  {
                    width: Math.round(workspaceWidth * (landscape ? 0.54 : 0.58)),
                    transform: [{ translateX: offset }],
                  },
                ]}
              >
                <View style={landscape ? styles.landscapeReceiptToolbar : undefined}>
                  <View
                    onTouchStart={(event) => {
                      swipeStart.current = {
                        x: event.nativeEvent.pageX,
                        y: event.nativeEvent.pageY,
                      };
                    }}
                    onTouchEnd={(event) => {
                      if (
                        isReceiptCollapseSwipe(
                          event.nativeEvent.pageX - swipeStart.current.x,
                          event.nativeEvent.pageY - swipeStart.current.y,
                        )
                      )
                        closeReceipt();
                    }}
                    style={[
                      styles.receiptHeader,
                      landscape && styles.landscapeReceiptHeader,
                    ]}
                  >
                    <Text style={styles.receiptIdentity}>
                      {t("expense.receiptNumber", { position: active.number })}
                    </Text>
                    <Pressable
                      accessibilityLabel={t("receipt.remove", { number: active.number })}
                      accessibilityRole="button"
                      onPress={() => onRemove(active.documentId)}
                      style={styles.smallAction}
                    >
                      <AppIcon name="trash" color={colors.destructive} size={16} />
                    </Pressable>
                    {compare ? (
                      <Pressable
                        accessibilityLabel={t("ui.closeReceiptDrawer")}
                        accessibilityRole="button"
                        onPress={closeReceipt}
                        style={styles.smallAction}
                      >
                        <Text style={styles.actionText}>×</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.receiptTabs}>
                    {cards.map((part) => (
                      <Pressable
                        key={part.documentId}
                        accessibilityLabel={t("receipt.open", { number: part.number })}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activeId === part.documentId }}
                        onPress={() => openReceipt(part.documentId)}
                        style={[
                          styles.tab,
                          activeId === part.documentId && styles.selectedTab,
                        ]}
                      >
                        <Text style={styles.actionText}>{part.number}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      accessibilityLabel={t("receipt.reread", { number: active.number })}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: scanBusy }}
                      disabled={scanBusy}
                      onPress={() => onRetry(active.documentId)}
                      style={[styles.smallAction, scanBusy && styles.muted]}
                    >
                      <Text style={styles.actionText}>{t("ui.reread")}</Text>
                    </Pressable>
                  </View>
                </View>
                <ReceiptImage key={active.documentId} uri={active.draft.localUri} />
              </Animated.View>
            ) : null}
          </View>
          {overflow ? (
            <View
              accessibilityViewIsModal
              style={[styles.overflowOverlay, compare && styles.compareOverflowOverlay]}
            >
              <Pressable
                accessibilityLabel={t("receipt.closeOptions", {
                  label: domainLabel(overflow ?? ""),
                })}
                accessibilityRole="button"
                onPress={() => setOverflow(null)}
                style={StyleSheet.absoluteFill}
              />
              <View
                accessibilityViewIsModal
                style={[styles.overflowSheet, compare && styles.compareOverflowSheet]}
              >
                <View style={styles.overflowHeader}>
                  <OverlayDismissAction
                    label={t("receipt.closeOptions", {
                      label: domainLabel(overflow ?? ""),
                    })}
                    onPress={() => setOverflow(null)}
                  />
                </View>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.overflowList}
                >
                  {overflowTags.map((tag) => (
                    <Pressable
                      key={tag.key}
                      accessibilityLabel={t("receipt.useSuggestion", {
                        label: domainLabel(overflow ?? ""),
                        value: tag.label,
                      })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: tag.selected }}
                      onPress={tag.onPress}
                      style={[
                        styles.overflowOption,
                        compare && styles.compareOverflowOption,
                      ]}
                    >
                      <Text style={styles.optionText}>
                        {tag.selected ? "✓ " : ""}
                        {tag.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          ) : null}
        </View>
        {currencyPicker ? (
          <View accessibilityViewIsModal style={styles.currencyOverlay}>
            <SheetHeader
              leftLabel={t("ui.back")}
              onLeft={() => setCurrencyPicker(false)}
              title={t("ui.currency")}
            />
            <CurrencyPicker
              selected={review.currency.value}
              suggestions={[review.currency.value, ...currencyTags, defaultCurrency]}
              onSelect={(code) => {
                change("currency", code);
                setCurrencyPicker(false);
              }}
            />
          </View>
        ) : null}
      </View>
      {sourceChooser}
    </Modal>
  );
}

function CandidateDropdown({
  tags,
  label,
  onPress,
}: {
  tags: ReceiptTag[];
  label: string;
  onPress: () => void;
}) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  if (!tags.length) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("receipt.suggestionsDescription", {
        label: domainLabel(label),
        count: tags.length,
      })}
      onPress={onPress}
      style={styles.candidateDropdown}
    >
      <Text style={styles.dropdownLabel}>
        {t("receipt.suggestions", { count: tags.length })}
      </Text>
      <Text style={styles.actionText}>⌄</Text>
    </Pressable>
  );
}

function ReceiptImage({ uri }: { uri: string }) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  const [frame, setFrame] = useState({ width: 0, height: 0 });
  return (
    <View
      onLayout={(event) =>
        setFrame({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
      style={styles.imageFrame}
    >
      <ScrollView
        minimumZoomScale={1}
        maximumZoomScale={5}
        bouncesZoom
        centerContent
        pinchGestureEnabled={Platform.OS === "ios"}
        contentContainerStyle={{ width: frame.width, height: frame.height }}
      >
        <Image
          accessible
          accessibilityLabel={t("ui.receiptImagePinchToZoomAndDragToInspect")}
          resizeMode="contain"
          source={{ uri }}
          style={{ width: frame.width, height: frame.height }}
        />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    workspace: { flex: 1, overflow: "hidden" },
    scanRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
    },
    scan: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 12,
      backgroundColor: colors.accentSurface,
      borderRadius: 10,
    },
    capacity: { color: colors.textSecondary, fontSize: 12 },
    muted: { opacity: 0.4 },
    content: { gap: 16, padding: 16, paddingTop: 4, paddingBottom: 40 },
    compareContent: { paddingHorizontal: 10 },
    field: { gap: 6 },
    label: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      color: colors.textPrimary,
      fontSize: 17,
      minHeight: 48,
      paddingHorizontal: 10,
      paddingVertical: 10,
      textAlign: "left",
    },
    inputButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 48,
      paddingHorizontal: 10,
    },
    currencyValue: { color: colors.textPrimary, fontSize: 17 },
    actionText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
    error: { color: colors.destructive, fontSize: 14 },
    formEdge: {
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    collapseText: { color: colors.textTertiary, fontSize: 13, fontWeight: "600" },
    candidateDropdown: {
      minHeight: 44,
      padding: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.accentSurface,
      borderRadius: 8,
      gap: 4,
    },
    dropdownLabel: { color: colors.accent, fontSize: 13, flexShrink: 1 },
    currencyOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.background,
    },
    stack: { position: "absolute", right: 0, top: 0, bottom: 0, width: 44 },
    card: {
      position: "absolute",
      left: 8,
      width: 108,
      height: 170,
      borderRadius: 8,
      borderColor: colors.separator,
      borderWidth: 1,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    cardImage: { width: 108, height: 170, opacity: 0.65 },
    cardNumber: {
      position: "absolute",
      top: 8,
      left: 0,
      width: 34,
      textAlign: "center",
      paddingVertical: 8,
      backgroundColor: colors.accentSurface,
      color: colors.accent,
      fontSize: 15,
      fontWeight: "700",
    },
    receiptPane: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: colors.separator,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.disabled,
    },
    landscapeReceiptToolbar: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
    },
    landscapeReceiptHeader: { flex: 1, minWidth: 156 },
    receiptHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 8,
      justifyContent: "space-between",
      minHeight: 44,
    },
    receiptIdentity: { fontSize: 12, color: colors.textTertiary, flexShrink: 1 },
    receiptTabs: { flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: 6 },
    tab: {
      width: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 8,
      backgroundColor: colors.surface,
    },
    selectedTab: {
      borderColor: colors.accent,
      borderWidth: 1,
      backgroundColor: colors.accentSurface,
    },
    smallAction: {
      minWidth: 44,
      minHeight: 44,
      paddingHorizontal: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    imageFrame: { flex: 1, margin: 6, overflow: "hidden" },
    overflowOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },
    compareOverflowOverlay: { backgroundColor: colors.transparent },
    overflowSheet: {
      maxHeight: "65%",
      backgroundColor: colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 16,
      paddingBottom: 32,
    },
    compareOverflowSheet: { backgroundColor: colors.overlay },
    overflowHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    overflowList: { gap: 4 },
    overflowOption: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      minHeight: 48,
      padding: 12,
      justifyContent: "center",
    },
    compareOverflowOption: {
      backgroundColor: colors.transparent,
      experimental_backgroundImage: `linear-gradient(90deg, ${colors.surface} 0%, ${colors.surface} 28%, ${colors.transparent} 52%, ${colors.transparent} 100%)`,
    },
    optionText: { color: colors.accent, fontSize: 16 },
  });
