import { useState } from "react";
import {
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { currencyScale } from "@/domain/ledger/currency";
import { CurrencyPicker } from "./CurrencyPicker";
import { LedgerSheetHeader } from "./LedgerSheetHeader";
import {
  currencyAmountInput,
  currencyAmountHint,
  parseCurrencyAmount,
} from "./expenseDraft";
import type { ReceiptReviewResult, ReceiptReviewState } from "./receiptReview";
import {
  confirmReceiptReview,
  editReceiptReviewField,
  resetReceiptReviewField,
  selectReceiptReviewAmount,
  selectReceiptReviewTitle,
} from "./receiptReview";
import type { ReceiptScanSession } from "./receiptScanSession";

type Props = {
  visible: boolean;
  session: ReceiptScanSession;
  review: ReceiptReviewState;
  journeyCurrency: string;
  defaultCurrency: string;
  debugMode: boolean;
  onChange: (review: ReceiptReviewState) => void;
  onCancel: () => void;
  onConfirm: (result: ReceiptReviewResult, sessionRevision: number) => void;
  onRetry: (documentId: string) => void;
  onRemove: (documentId: string) => void;
  onScanAnother: () => void;
  canScanAnother: boolean;
  scanBusy: boolean;
};

export function ReceiptReviewSheet({
  visible,
  session,
  review,
  journeyCurrency,
  defaultCurrency,
  debugMode,
  onChange,
  onCancel,
  onConfirm,
  onRetry,
  onRemove,
  onScanAnother,
  canScanAnother,
  scanBusy,
}: Props) {
  const [currencyPicker, setCurrencyPicker] = useState(false);
  const [showAllTitles, setShowAllTitles] = useState(false);
  const [showAllAmounts, setShowAllAmounts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scale = currencyScale(review.currency.value);
  const amountInvalid = Boolean(
    review.amount.value.trim() &&
    (scale === null || parseCurrencyAmount(review.amount.value, scale) === null),
  );
  const status = session.documents.some((part) => part.status === "recognizing")
    ? "recognizing"
    : session.documents.some((part) => part.status === "pending")
      ? "pending"
      : session.documents.some((part) => part.status === "completed")
        ? "completed"
        : session.documents.some((part) => part.status === "failed")
          ? "failed"
          : "no-text";
  const statusText =
    session.documents.length === 0
      ? "No receipt image. Scan another part or enter the details manually."
      : status === "recognizing" || status === "pending"
        ? "Reading receipt… You can edit all fields now."
        : status === "no-text"
          ? "No text found. Enter the details manually."
          : status === "failed"
            ? "Receipt could not be read. Enter the details manually."
            : "Check the detected details before continuing.";
  const change = (field: "title" | "amount" | "currency", value: string) => {
    setError(null);
    onChange(editReceiptReviewField(review, field, value));
  };
  const reset = (field: "title" | "amount" | "currency") => {
    setError(null);
    onChange(
      resetReceiptReviewField(review, field, session, journeyCurrency, defaultCurrency),
    );
  };
  const confirm = () => {
    try {
      onConfirm(confirmReceiptReview(review, session), session.revision);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the review fields.");
    }
  };
  const cancel = () => {
    Keyboard.dismiss();
    setCurrencyPicker(false);
    setShowAllTitles(false);
    setShowAllAmounts(false);
    setError(null);
    onCancel();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={currencyPicker ? () => setCurrencyPicker(false) : cancel}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        {currencyPicker ? (
          <>
            <LedgerSheetHeader
              leftLabel="Back"
              onLeft={() => setCurrencyPicker(false)}
              onRight={() => setCurrencyPicker(false)}
              title="Currency"
            />
            <CurrencyPicker
              selected={review.currency.value}
              suggestions={[
                review.currency.value,
                ...review.suggestions.currencyAlternatives,
                ...review.suggestions.languageCurrencyAlternatives,
                journeyCurrency,
                defaultCurrency,
              ]}
              onSelect={(code) => {
                change("currency", code);
                setCurrencyPicker(false);
              }}
            />
          </>
        ) : (
          <>
            <LedgerSheetHeader
              leftLabel="Cancel"
              onLeft={cancel}
              onRight={confirm}
              rightLabel="Confirm"
              title="Review receipt"
              titleBold
            />
            <ScrollView
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              <Text accessibilityLabel={`Receipt review ${status}`} style={styles.hint}>
                {statusText}
              </Text>
              <Text style={styles.label}>
                {session.documents.length} receipt{" "}
                {session.documents.length === 1 ? "image" : "images"}
              </Text>
              {session.documents.map((part, index) => (
                <View key={part.documentId} style={styles.partRow}>
                  <Text style={styles.hint}>
                    Part {index + 1} · {part.status}
                  </Text>
                  {!scanBusy ? (
                    <Pressable
                      accessibilityLabel={`Read part ${index + 1} again`}
                      accessibilityRole="button"
                      onPress={() => onRetry(part.documentId)}
                    >
                      <Text style={styles.choose}>Read</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel={`Remove part ${index + 1}`}
                    accessibilityRole="button"
                    onPress={() => onRemove(part.documentId)}
                  >
                    <Text style={styles.error}>Remove</Text>
                  </Pressable>
                </View>
              ))}
              {canScanAnother ? (
                <Pressable
                  accessibilityLabel="Scan another part"
                  accessibilityRole="button"
                  onPress={onScanAnother}
                  style={styles.option}
                >
                  <Text style={styles.optionText}>+ Scan another part</Text>
                </Pressable>
              ) : null}
              <View style={styles.field}>
                <View style={styles.partRow}>
                  <Text style={styles.label}>Title</Text>
                  {review.title.owner === "USER_EDITED" ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reset Title suggestion"
                      onPress={() => reset("title")}
                    >
                      <Text style={styles.choose}>Use suggestion</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  accessibilityLabel="Receipt Review Title"
                  onChangeText={(value) => change("title", value)}
                  placeholder="What was it?"
                  style={styles.input}
                  value={review.title.value}
                />
                {review.suggestions.titles.length ? (
                  <View style={styles.options}>
                    {(showAllTitles
                      ? review.suggestions.titles
                      : review.suggestions.titles.slice(0, 3)
                    ).map((title) => (
                      <Pressable
                        accessibilityLabel={`Use Title ${title}`}
                        accessibilityRole="button"
                        key={title}
                        onPress={() => {
                          setError(null);
                          onChange(selectReceiptReviewTitle(review, title));
                        }}
                        style={styles.option}
                      >
                        <Text style={styles.optionText}>{title}</Text>
                      </Pressable>
                    ))}
                    {review.suggestions.titles.length > 3 ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setShowAllTitles(!showAllTitles)}
                        style={styles.option}
                      >
                        <Text style={styles.optionText}>
                          {showAllTitles ? "Show fewer titles" : "More titles"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {review.selectedTitleCandidate &&
                !review.suggestions.titles.includes(review.selectedTitleCandidate) ? (
                  <Text style={styles.hint}>
                    Selected Title is no longer detected. Use suggestion to reset.
                  </Text>
                ) : null}
              </View>
              <View style={styles.field}>
                <View style={styles.partRow}>
                  <Text style={styles.label}>Amount</Text>
                  {review.amount.owner === "USER_EDITED" ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reset Amount suggestion"
                      onPress={() => reset("amount")}
                    >
                      <Text style={styles.choose}>Use suggestion</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  accessibilityLabel="Receipt Review Amount"
                  inputMode={scale === 0 ? "numeric" : "decimal"}
                  keyboardType={scale === 0 ? "number-pad" : "decimal-pad"}
                  onChangeText={(value) =>
                    change(
                      "amount",
                      currencyAmountInput(review.amount.value, value, scale ?? 2),
                    )
                  }
                  placeholder="0"
                  style={styles.input}
                  value={review.amount.value}
                />
                {amountInvalid ? (
                  <Text style={styles.error}>
                    {currencyAmountHint(review.currency.value, scale ?? 2)}
                  </Text>
                ) : null}
                {review.selectedAmountCurrency &&
                review.selectedAmountCurrency !== review.currency.value ? (
                  <Text style={styles.error}>
                    Selected amount is marked {review.selectedAmountCurrency}. Check
                    Currency.
                  </Text>
                ) : null}
                {review.suggestions.amounts.length ? (
                  <View style={styles.options}>
                    {(showAllAmounts
                      ? review.suggestions.amounts
                      : review.suggestions.amounts.slice(0, 3)
                    ).map((candidate) => (
                      <Pressable
                        accessibilityLabel={`Use Amount ${candidate.decimal}${candidate.currency ? ` ${candidate.currency}` : ""}`}
                        accessibilityRole="button"
                        key={`${candidate.decimal}:${candidate.currency ?? "?"}`}
                        onPress={() => {
                          setError(null);
                          onChange(selectReceiptReviewAmount(review, candidate));
                        }}
                        style={styles.option}
                      >
                        <Text style={styles.optionText}>
                          {candidate.decimal}
                          {candidate.currency ? ` ${candidate.currency}` : ""}
                        </Text>
                      </Pressable>
                    ))}
                    {review.suggestions.amounts.length > 3 ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setShowAllAmounts(!showAllAmounts)}
                        style={styles.option}
                      >
                        <Text style={styles.optionText}>
                          {showAllAmounts ? "Show fewer amounts" : "More amounts"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {review.selectedAmountCandidate &&
                !review.suggestions.amounts.some(
                  (candidate) =>
                    candidate.decimal === review.selectedAmountCandidate?.decimal &&
                    candidate.currency === review.selectedAmountCandidate?.currency,
                ) ? (
                  <Text style={styles.hint}>
                    Selected Amount is no longer detected. Use suggestion to reset.
                  </Text>
                ) : null}
              </View>
              <View style={styles.field}>
                <View style={styles.partRow}>
                  <Text style={styles.label}>Currency</Text>
                  {review.currency.owner === "USER_EDITED" ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reset Currency suggestion"
                      onPress={() => reset("currency")}
                    >
                      <Text style={styles.choose}>Use suggestion</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  accessibilityLabel={`Receipt Review Currency ${review.currency.value}`}
                  accessibilityRole="button"
                  onPress={() => {
                    Keyboard.dismiss();
                    setCurrencyPicker(true);
                  }}
                  style={styles.inputButton}
                >
                  <Text style={styles.currencyValue}>{review.currency.value}</Text>
                  <Text style={styles.choose}>Choose</Text>
                </Pressable>
                {review.suggestions.currencyAlternatives.length &&
                (review.suggestions.currency !== "STRONG_SUGGESTION" ||
                  !review.suggestions.currencyAlternatives.includes(
                    review.currency.value,
                  )) ? (
                  <Text style={styles.hint}>
                    Receipt currency to check:{" "}
                    {review.suggestions.currencyAlternatives.join(", ")}. Choose to
                    confirm.
                  </Text>
                ) : null}
                {review.suggestions.languageCurrencyAlternatives.length ? (
                  <Text style={styles.hint}>
                    Text may suggest{" "}
                    {review.suggestions.languageCurrencyAlternatives.join(", ")}; confirm
                    from the receipt.
                  </Text>
                ) : null}
                {review.suggestions.currencySource === "journey" ? (
                  <Text style={styles.hint}>Journey currency default</Text>
                ) : null}
              </View>
              {error ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              ) : null}
              {debugMode ? (
                <Text style={styles.debug}>
                  {`OCR ${session.documents.reduce((total, part) => total + (part.ocrDocument?.observations.length ?? 0), 0)} · ${session.combined?.parserVersion ?? "pending"} · Title ${review.suggestions.titles.length}/${review.suggestions.title} · Amount ${review.suggestions.amounts.length}/${review.suggestions.amount} · Currency ${review.suggestions.currency}`}
                </Text>
              ) : null}
            </ScrollView>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F6F7F9" },
  content: { gap: 18, padding: 16, paddingBottom: 56 },
  hint: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  field: { gap: 8 },
  partRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 16 },
  label: { color: "#0F172A", fontSize: 17, fontWeight: "700" },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: "#0F172A",
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  inputButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 14,
  },
  currencyValue: { color: "#0F172A", fontSize: 17 },
  choose: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  optionText: { color: "#0F766E", fontSize: 15, fontWeight: "600" },
  error: { color: "#B91C1C", fontSize: 15 },
  debug: { color: "#64748B", fontSize: 12, lineHeight: 18 },
});
