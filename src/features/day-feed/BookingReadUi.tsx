import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { ReadFactTag } from "./P1Row";
import {
  participationLabel,
  readableDocuments,
  type BookingAssociations,
  type ReadDocument,
} from "./bookingReadPresentation";
export function BookingCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const s = useThemedStyles(bookingReadStyles);
  return (
    <View style={s.card}>
      {title ? <UiText style={s.section}>{title}</UiText> : null}
      {children}
    </View>
  );
}
export function BookingGlyph({
  kind,
  onPress,
}: {
  kind: "detail" | "map" | "navigate" | "contact";
  onPress: () => void;
}) {
  const s = useThemedStyles(bookingReadStyles),
    c = useUiTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        kind === "detail"
          ? "p1r.richerDetails"
          : kind === "contact"
            ? "p3.contact"
            : kind === "map"
              ? "fidelity.map"
              : "fidelity.navigate",
      )}
      onPress={onPress}
      style={s.glyphTarget}
    >
      <AppIcon
        name={
          kind === "detail"
            ? "arrow.up.left.and.arrow.down.right"
            : kind === "map"
              ? "map"
              : kind === "navigate"
                ? "location"
                : "phone"
        }
        size={18}
        color={c.accent}
      />
    </Pressable>
  );
}
export function BookingInsert({
  side,
  onPress,
}: {
  side: "BEFORE" | "AFTER";
  onPress: () => void;
}) {
  const s = useThemedStyles(bookingReadStyles),
    c = useUiTheme();
  return (
    <View style={s.insertSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          side === "BEFORE" ? "fidelity.addAbove" : "fidelity.addBelow",
        )}
        onPress={onPress}
        style={s.insertTarget}
      >
        <AppIcon name="plus" size={15} color={c.textSecondary} />
      </Pressable>
    </View>
  );
}
export function BookingDocumentLink({
  documents,
  onChoose,
  label,
  align,
}: {
  align?: "start" | "end";
  documents: readonly ReadDocument[];
  onChoose?: () => void;
  label?: string;
}) {
  const s = useThemedStyles(bookingReadStyles);
  const docs = readableDocuments([documents]);
  const onPress = docs.length === 1 ? docs[0].onOpen : onChoose;
  if (!docs.length || !onPress) return null;
  const title =
    label ?? (docs.length === 1 ? docs[0].title : t("fidelity.attachmentsTitle"));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={[
        s.documentTarget,
        align === "end" && s.documentEnd,
        align === "start" && s.documentStart,
      ]}
    >
      <UiText style={s.documentLabel}>{title}</UiText>
    </Pressable>
  );
}
export function BookingTags({
  facts,
  photos = false,
}: {
  facts: BookingAssociations;
  photos?: boolean;
}) {
  const s = useThemedStyles(bookingReadStyles),
    people = participationLabel(facts.participation);
  const expenses = new Set(facts.expenseIds).size,
    count = new Set(facts.photoIds).size;
  return (
    <View style={s.tags}>
      {people ? (
        <ReadFactTag label={people} onPress={facts.participation?.onOpen} />
      ) : null}
      {expenses ? (
        <ReadFactTag
          label={t(expenses === 1 ? "fidelity.expenses.one" : "fidelity.expenses", {
            count: expenses,
          })}
          onPress={facts.onExpenses}
        />
      ) : null}
      {photos && count ? (
        <ReadFactTag
          label={t(count === 1 ? "fidelity.photos.one" : "fidelity.photos", { count })}
          onPress={facts.onPhotos}
        />
      ) : null}
    </View>
  );
}
export function BookingCommonFooter({
  facts,
  gallery = false,
}: {
  facts: BookingAssociations;
  gallery?: boolean;
}) {
  useUiLocale();
  const s = useThemedStyles(bookingReadStyles),
    people = participationLabel(facts.participation);
  const photos = [...new Set(facts.photoIds)],
    documents = readableDocuments([facts.documents]),
    expenses = [...new Set(facts.expenseIds)];
  return (
    <>
      {people ? (
        <BookingCard title={t("tripCreate.planParticipants")}>
          <ReadFactTag label={people} onPress={facts.participation?.onOpen} />
        </BookingCard>
      ) : null}
      {facts.note?.trim() ? (
        <BookingCard title={t("fidelity.note")}>
          <UiText style={s.body}>{facts.note}</UiText>
        </BookingCard>
      ) : null}
      {photos.length ? (
        <BookingCard title={t("fidelity.photosTitle")}>
          {gallery && facts.photos?.length ? (
            <View style={s.tags}>
              {facts.photos
                .filter((p) => photos.includes(p.id))
                .slice(0, 3)
                .map((photo) =>
                  photo.uri ? (
                    <Image key={photo.id} source={{ uri: photo.uri }} style={s.photo} />
                  ) : photo.syntheticLabel ? (
                    <View key={photo.id} style={s.syntheticPhoto}>
                      <UiText style={s.meta}>{photo.syntheticLabel}</UiText>
                    </View>
                  ) : null,
                )}
            </View>
          ) : null}
          <UiButton
            variant="text"
            label={t(photos.length === 1 ? "fidelity.photos.one" : "fidelity.photos", {
              count: photos.length,
            })}
            onPress={facts.onPhotos ?? (() => {})}
            disabled={!facts.onPhotos}
          />
        </BookingCard>
      ) : null}
      {documents.length ? (
        <BookingCard title={t("fidelity.attachmentsTitle")}>
          <UiButton
            variant="text"
            label={t(
              documents.length === 1
                ? "fidelity.attachments.one"
                : "fidelity.attachments",
              { count: documents.length },
            )}
            onPress={facts.onDocuments ?? (() => {})}
            disabled={!facts.onDocuments}
          />
        </BookingCard>
      ) : null}
      {expenses.length ? (
        <BookingCard title={t("fidelity.expensesTitle")}>
          <UiButton
            variant="text"
            label={t(
              expenses.length === 1 ? "fidelity.expenses.one" : "fidelity.expenses",
              { count: expenses.length },
            )}
            onPress={facts.onExpenses ?? (() => {})}
            disabled={!facts.onExpenses}
          />
        </BookingCard>
      ) : null}
      {(["addPhoto", "addAttachment", "addExpense", "linkExpense"] as const).some(
        (k) => facts[k],
      ) ? (
        <View style={s.actions}>
          {(["addPhoto", "addAttachment", "addExpense", "linkExpense"] as const).map(
            (k) =>
              facts[k] ? (
                <View style={s.actionCell} key={k}>
                  <UiButton
                    variant="secondary"
                    label={t(`fidelity.${k}`)}
                    onPress={facts[k]!}
                  />
                </View>
              ) : null,
          )}
        </View>
      ) : null}
    </>
  );
}
export const bookingReadStyles = (c: UiColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: visual.radius.association,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      paddingVertical: 17,
      paddingHorizontal: 18,
      gap: 10,
      marginBottom: 11,
    },
    section: {
      ...visual.type.eyebrow,
      color: c.textSecondary,
      textTransform: "none",
      letterSpacing: 0,
    },
    body: { fontSize: 15, lineHeight: 22.5, color: c.textPrimary },
    meta: { ...visual.type.feedNote, lineHeight: 16.8, color: c.textSecondary },
    tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    actionCell: { flexBasis: "47%", flexGrow: 1 },
    documentTarget: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
    documentEnd: { justifyContent: "flex-end", paddingBottom: 6 },
    documentStart: { justifyContent: "flex-start", paddingTop: 6 },
    documentLabel: { fontSize: 13, lineHeight: 18, color: c.accent },
    glyphTarget: {
      minHeight: 44,
      minWidth: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    insertSlot: { height: 18, alignItems: "center", justifyContent: "center", zIndex: 1 },
    insertTarget: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    photo: { width: 82, height: 82, borderRadius: visual.radius.control },
    syntheticPhoto: {
      width: 82,
      minHeight: 82,
      borderRadius: visual.radius.control,
      backgroundColor: c.accentSurface,
      padding: 8,
      justifyContent: "center",
    },
  });
