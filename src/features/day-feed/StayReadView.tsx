import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiButton, UiText } from "@/ui/controls";
import { t, formatUiDate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { formatLedgerMoney } from "@/features/ledger/format";
import { formatDayFeedVisibleDates } from "./DayFeedShell";
import {
  BookingCard,
  BookingCommonFooter,
  BookingDocumentLink,
  BookingGlyph,
  BookingInsert,
  BookingTags,
} from "./BookingReadUi";
import {
  stayInsertionTime,
  stayPlannedClock,
  stayNights,
  type BookingContext,
  type StayRead,
} from "./bookingReadPresentation";
export type StayRole = "CHECKIN" | "CHECKOUT" | "BASE";
export function stayRangeLabel(stay: StayRead) {
  const nights = stayNights(stay);
  const range = formatDayFeedVisibleDates({ first: stay.start, last: stay.end });
  return nights === null
    ? range
    : t(nights === 1 ? "bookingRead.dateNight" : "bookingRead.dateNights", {
        range,
        nights,
      });
}
export function StayReadRow({
  stay,
  role,
  focused,
  context,
  onFocus,
  onOpen,
  onInsert,
  onMove,
  renderTime,
  hideDivider,
}: {
  stay: StayRead;
  role: StayRole;
  focused: boolean;
  context: BookingContext;
  onFocus(): void;
  onOpen(): void;
  onInsert?(side: "BEFORE" | "AFTER"): void;
  onMove?(event: GestureResponderEvent): void;
  renderTime?(time: string, content: ReactNode): ReactNode;
  hideDivider?: boolean;
}) {
  useUiLocale();
  const s = useThemedStyles(styles),
    c = useUiTheme();
  const { fontScale } = useWindowDimensions();
  const railWidth = 54 * Math.max(1, fontScale);
  const time =
    role === "CHECKIN"
      ? stay.checkinTime
      : role === "CHECKOUT"
        ? stay.checkoutTime
        : null;
  const active = context === "TODAY" || context === "FUTURE";
  const planned = stayInsertionTime(stay, role, context);
  const instructions =
    role === "CHECKIN"
      ? stay.checkinDocuments
      : role === "CHECKOUT"
        ? stay.checkoutDocuments
        : undefined;
  const readableInstructions = instructions?.filter((d) => d.onOpen) ?? [];
  const confirmations = stay.confirmationDocuments?.filter((d) => d.onOpen) ?? [];
  const tightLinks =
    context === "TODAY" && readableInstructions.length > 0 && confirmations.length > 0;
  const dateLabel = stayRangeLabel(stay);
  const insert = (side: "BEFORE" | "AFTER") =>
    focused && planned && onInsert ? (
      <BookingInsert side={side} onPress={() => onInsert(side)} />
    ) : null;
  return (
    <View>
      {insert("BEFORE")}
      <View style={[s.row, hideDivider && s.noDivider, focused && s.focus]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={stay.title}
          onPress={onFocus}
          onLongPress={stayPlannedClock(stay, role) && onMove ? onMove : undefined}
          delayLongPress={450}
          style={s.main}
        >
          <View style={[s.rail, { width: railWidth }]}>
            {time ? (
              renderTime ? (
                renderTime(time, <UiText style={s.time}>{time.slice(0, 5)}</UiText>)
              ) : (
                <UiText style={s.time}>{time.slice(0, 5)}</UiText>
              )
            ) : null}
          </View>
          <View style={s.text}>
            <UiText style={s.rowTitle}>{stay.title}</UiText>
            <View style={s.role}>
              <AppIcon name="bed.double" size={16} color={c.accent} />
              <UiText style={s.roleLabel}>
                {t(
                  role === "CHECKIN"
                    ? "p3.role.checkin"
                    : role === "CHECKOUT"
                      ? "p3.role.checkout"
                      : "p3.role.base",
                )}
              </UiText>
            </View>
            {(focused || role === "CHECKIN") && stay.address ? (
              <UiText style={s.address}>{stay.address}</UiText>
            ) : null}
            {focused ? <UiText style={s.meta}>{dateLabel}</UiText> : null}
            {stay.pending ? (
              <UiText style={s.meta}>{t("tripCreate.itemPending")}</UiText>
            ) : null}
          </View>
        </Pressable>
        {focused ? (
          <>
            <View style={[s.extra, { marginLeft: railWidth + 12 }]}>
              {stay.bookings?.some((b) => b.reference) ? (
                <UiText style={s.meta}>
                  {t("bookingRead.reference")}{" "}
                  <UiText style={s.value}>
                    {stay.bookings.flatMap((b) => b.reference ?? []).join(", ")}
                  </UiText>
                </UiText>
              ) : null}
              <View>
                {context === "TODAY" && readableInstructions.length ? (
                  <BookingDocumentLink
                    documents={readableInstructions}
                    onChoose={
                      role === "CHECKIN"
                        ? stay.onCheckinDocuments
                        : stay.onCheckoutDocuments
                    }
                    align={tightLinks ? "end" : undefined}
                    label={t(
                      role === "CHECKIN" ? "p3.instructions" : "p3.checkoutInstructions",
                    )}
                  />
                ) : null}
                {active ? (
                  <BookingDocumentLink
                    documents={confirmations}
                    label={t("bookingRead.confirmation")}
                    onChoose={stay.onConfirmationDocuments}
                    align={tightLinks ? "start" : undefined}
                  />
                ) : null}
              </View>
              <BookingTags facts={stay} photos={context === "PAST"} />
            </View>
            <View style={s.icons}>
              <BookingGlyph kind="detail" onPress={onOpen} />
              {active &&
              (context === "TODAY" ? (stay.navigate ?? stay.map) : stay.map) ? (
                <BookingGlyph
                  kind={context === "TODAY" && stay.navigate ? "navigate" : "map"}
                  onPress={
                    (context === "TODAY" ? (stay.navigate ?? stay.map) : stay.map)!
                  }
                />
              ) : null}
              {context === "TODAY" && stay.onContact ? (
                <BookingGlyph kind="contact" onPress={stay.onContact} />
              ) : null}
            </View>
          </>
        ) : null}
      </View>
      {insert("AFTER")}
    </View>
  );
}
export function StayReadView({
  stay,
  role,
  context,
}: {
  stay: StayRead;
  role: StayRole;
  context: BookingContext;
}) {
  useUiLocale();
  const s = useThemedStyles(styles);
  const ledger = stay.ledger,
    nights = stayNights(stay);
  const money = (minor: number) =>
    formatLedgerMoney(minor, ledger!.currency, ledger!.scale);
  const perNight = ledger?.denominator === nights && nights !== null && nights > 0;
  const instructions =
    role === "CHECKOUT"
      ? [
          { text: stay.checkoutInstructions, label: t("p3.checkoutInstructions") },
          { text: stay.checkinInstructions, label: t("p3.instructions") },
        ]
      : [
          { text: stay.checkinInstructions, label: t("p3.instructions") },
          { text: stay.checkoutInstructions, label: t("p3.checkoutInstructions") },
        ];
  const civil = (value: string) =>
    formatUiDate(new Date(value + "T12:00:00Z"), {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return (
    <View>
      <View style={s.heading}>
        <UiText style={s.meta}>
          {t("bookingRead.stay")} ·{" "}
          {t(
            role === "CHECKIN"
              ? "p3.role.checkin"
              : role === "CHECKOUT"
                ? "p3.role.checkout"
                : "p3.role.base",
          )}
        </UiText>
        <UiText accessibilityRole="header" style={s.title}>
          {stay.title}
        </UiText>
        <UiText style={s.meta}>{stayRangeLabel(stay)}</UiText>
      </View>
      <BookingCard>
        <View style={s.schedule}>
          {(["CHECKIN", "CHECKOUT"] as const).map((role) => {
            const clock = stayPlannedClock(stay, role);
            return (
              <View style={s.scheduleCell} key={role}>
                <UiText style={s.meta}>
                  {t(role === "CHECKIN" ? "p3.role.checkin" : "p3.role.checkout")}
                </UiText>
                <UiText style={s.rowTitle}>
                  {civil(role === "CHECKIN" ? stay.start : stay.end)}
                </UiText>
                {clock ? (
                  <UiText style={s.meta}>
                    {t("bookingRead.planned", { time: clock })}
                  </UiText>
                ) : null}
              </View>
            );
          })}
        </View>
        {stay.zone ? <UiText style={s.meta}>{stay.zone}</UiText> : null}
        {stay.permittedCheckin ? (
          <UiText style={s.meta}>
            {t("bookingRead.allowedCheckin", { time: stay.permittedCheckin })}
          </UiText>
        ) : null}
        {stay.checkoutBy ? (
          <UiText style={s.meta}>{t("p3.checkoutBy", { time: stay.checkoutBy })}</UiText>
        ) : null}
      </BookingCard>
      {stay.placeName || stay.address || stay.area ? (
        <BookingCard title={t("bookingRead.location")}>
          {stay.placeName ? <UiText style={s.rowTitle}>{stay.placeName}</UiText> : null}
          {stay.address || stay.area ? (
            <UiText style={s.meta}>{stay.address ?? stay.area}</UiText>
          ) : null}
          {context === "TODAY" || context === "FUTURE" ? (
            <View style={s.icons}>
              {context === "TODAY" && stay.navigate ? (
                <BookingGlyph kind="navigate" onPress={stay.navigate} />
              ) : stay.map ? (
                <BookingGlyph kind="map" onPress={stay.map} />
              ) : null}
            </View>
          ) : null}
        </BookingCard>
      ) : null}
      {instructions
        .filter((i) => i.text?.trim())
        .map((i) => (
          <BookingCard key={i.label} title={i.label}>
            <UiText style={s.body}>{i.text}</UiText>
          </BookingCard>
        ))}
      {stay.contactText ? (
        <BookingCard title={t("p3.contact")}>
          <UiText style={s.body}>{stay.contactText}</UiText>
          {stay.onContact ? (
            <UiButton variant="text" label={t("p3.contact")} onPress={stay.onContact} />
          ) : null}
        </BookingCard>
      ) : null}
      {stay.bookings?.map((booking) => (
        <BookingCard key={booking.id} title={booking.title ?? t("bookingRead.booking")}>
          {booking.reference ? (
            <UiText style={s.body}>
              {t("bookingRead.reference")} · {booking.reference}
            </UiText>
          ) : null}
          {booking.guests?.length ? (
            <>
              <UiText style={s.meta}>{t("p3.registeredGuests")}</UiText>
              {booking.guests.map((guest, i) => (
                <UiText key={i} style={s.body}>
                  {guest}
                </UiText>
              ))}
            </>
          ) : null}
        </BookingCard>
      ))}
      {ledger ? (
        <BookingCard title={t("fidelity.expensesTitle")}>
          <UiText style={s.body}>
            {t("bookingRead.totalCost")} · {money(ledger.total)}
          </UiText>
          {perNight && ledger.totalPerNight !== undefined ? (
            <UiText style={s.meta}>
              {t("bookingRead.perNight")} · {money(ledger.totalPerNight)}
            </UiText>
          ) : null}
          {ledger.myShare !== undefined ? (
            <UiText style={s.body}>
              {t("bookingRead.myShare")} · {money(ledger.myShare)}
            </UiText>
          ) : null}
          {perNight && ledger.mySharePerNight !== undefined ? (
            <UiText style={s.meta}>
              {t("bookingRead.perNight")} · {money(ledger.mySharePerNight)}
            </UiText>
          ) : null}
          {ledger.originals?.map((value, i) => (
            <UiText key={i} style={s.meta}>
              {formatLedgerMoney(value.minor, value.currency, value.scale)}
            </UiText>
          ))}
        </BookingCard>
      ) : null}
      <BookingCommonFooter facts={stay} gallery={context === "PAST"} />
    </View>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    row: {
      paddingVertical: 17,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    noDivider: { borderBottomWidth: 0 },
    focus: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: visual.radius.feedFocus,
      paddingHorizontal: 11,
      paddingBottom: 8,
    },
    schedule: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    scheduleCell: { flexBasis: "45%", flexGrow: 1, gap: 5 },
    main: { flexDirection: "row", minHeight: 44 },
    rail: { width: 54, marginRight: 12 },
    text: { flex: 1, gap: 7 },
    time: { ...visual.type.feedClock, color: c.textSecondary },
    rowTitle: { ...visual.type.feedTitle, color: c.textPrimary },
    role: { flexDirection: "row", gap: 5, alignItems: "center" },
    roleLabel: { fontSize: 11, fontWeight: "600", color: c.accent },
    address: { fontSize: 14, lineHeight: 19, color: c.textSecondary },
    meta: { fontSize: 13, lineHeight: 18, color: c.textSecondary },
    value: { color: c.textPrimary },
    extra: { marginLeft: 66, gap: 12, marginTop: 14 },
    icons: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
    heading: { paddingVertical: 20, gap: 8 },
    title: { ...visual.type.immersiveTitle, color: c.textPrimary },
    body: { fontSize: 15, lineHeight: 22.5, color: c.textPrimary },
  });
