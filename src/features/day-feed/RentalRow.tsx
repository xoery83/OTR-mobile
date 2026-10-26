import { AppIcon } from "@/components/AppIcon";
import { BookingCard, BookingGlyph, BookingInsert } from "./BookingReadUi";
import { formatDayFeedVisibleDates } from "./DayFeedShell";
import { PendingSyncDot } from "./PendingSyncDot";
import { ImmersiveActions } from "./ImmersiveActions";
import { useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import type { CorePlaceView } from "@/domain/trip/tripCoreV2Day";
import { MoneyText } from "@/features/ledger/MoneyText";
import { UiButton, UiText as Text } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { DayRowRendererProps } from "./rendererContribution";

type Original = Readonly<{ id: string; title: string; onOpen: () => void }>;
type Endpoint = Readonly<{
  date: string;
  zone?: string | null;
  time?: string;
  plannedUnresolved?: boolean;
  place?: CorePlaceView;
}>;
type MoneyAmount = Readonly<{ minor: number; currency: string; scale: number }>;
export type RentalFacts = Readonly<{
  family: "P4";
  pickup: Endpoint;
  return?: Endpoint;
  supplier?: string;
  bookedClass?: string;
  actualModel?: string;
  plate?: string;
  stableVehicleLabel?: string;
  holder?: string;
  drivers?: readonly string[];
  reference?: string;
  bookingOriginals?: readonly Original[];
  pickupInstructions?: readonly Original[];
  returnInstructions?: readonly Original[];
  call?: () => void;
  associatedVehicles?: readonly Readonly<{
    id: string;
    label: string;
    onOpen: () => void;
  }>[];
  photos?: Readonly<{
    count: number;
    previews: readonly Readonly<{ id: string; uri: string }>[];
    onViewAll?: () => void;
  }>;
  expenseCount?: number;
  expenseSummary?: Readonly<{
    total: MoneyAmount;
    // Supplied by owning Ledger billing evidence; calendar duration is insufficient.
    billingDays?: number;
    perDay?: MoneyAmount;
    originals?: readonly MoneyAmount[];
    myShare?: MoneyAmount;
    myPerDay?: MoneyAmount;
  }>;
  onEdit?: () => void;
  onUpdateFromDocument?: () => void;
  onEditExpense?: () => void;
  onAddAttachment?: () => void;
  onAddPhoto?: () => void;
  onAddExpense?: () => void;
  onLinkExpense?: () => void;
}>;

const civil = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const endpointLabel = (endpoint: Endpoint) =>
  endpoint.place?.acceptedAddress ??
  endpoint.place?.authoredAddress ??
  endpoint.place?.authoredLabel ??
  endpoint.place?.authoredText;
export function rentalMapUrl(endpoint: Endpoint, directions: boolean): string | null {
  const place = endpoint.place;
  if (!place) return null;
  const exact =
    typeof place.latitude === "number" &&
    typeof place.longitude === "number" &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    Math.abs(place.latitude) <= 90 &&
    Math.abs(place.longitude) <= 180;
  if (exact)
    return directions
      ? `https://maps.apple.com/?daddr=${place.latitude},${place.longitude}`
      : `https://maps.apple.com/?ll=${place.latitude},${place.longitude}`;
  const address = place.acceptedAddress?.trim();
  if (address)
    return `https://maps.apple.com/?${directions ? "daddr" : "q"}=${encodeURIComponent(address)}`;
  if (directions) return null;
  const keyword = endpointLabel(endpoint)?.trim();
  return keyword ? `https://maps.apple.com/?q=${encodeURIComponent(keyword)}` : null;
}

function Originals({ label, entries }: { label: string; entries?: readonly Original[] }) {
  const [choosing, setChoosing] = useState(false);
  if (!entries?.length) return null;
  return (
    <View>
      <UiButton
        label={label}
        variant="text"
        onPress={() =>
          entries.length === 1 ? entries[0].onOpen() : setChoosing(!choosing)
        }
      />
      {choosing
        ? entries.map((entry) => (
            <UiButton
              key={entry.id}
              label={entry.title}
              variant="secondary"
              onPress={() => {
                setChoosing(false);
                entry.onOpen();
              }}
            />
          ))
        : null}
    </View>
  );
}

export function RentalRow({
  row,
  depth,
  context = "UNKNOWN",
  onDepth,
  withinMarker,
  facts,
}: DayRowRendererProps & { facts: RentalFacts }) {
  const roles = row.coreRowKeys.map((key) => key.projectionRole);
  return (
    <RentalContent
      title={row.item.event.title}
      pickup={roles.includes("PICKUP")}
      back={roles.includes("RETURN")}
      depth={depth}
      context={context}
      onDepth={onDepth}
      withinMarker={withinMarker}
      facts={facts}
    />
  );
}

export function RentalContent({
  title,
  pickup,
  back,
  depth,
  context = "UNKNOWN",
  onDepth,
  withinMarker,
  facts,
  pending,
  note,
  onInsert,
  nativeNavigation = false,
}: Pick<DayRowRendererProps, "depth" | "context" | "onDepth" | "withinMarker"> & {
  title: string;
  pickup: boolean;
  back: boolean;
  facts: RentalFacts;
  pending?: boolean;
  note?: string;
  nativeNavigation?: boolean;
  onInsert?(side: "BEFORE" | "AFTER"): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const { fontScale } = useWindowDimensions();
  const [mapUnavailable, setMapUnavailable] = useState(false);
  if (back && !pickup && !facts.return) return null;
  const current = back && !pickup ? facts.return! : facts.pickup;
  const name = [facts.actualModel, facts.plate].filter(Boolean).join(" · ") || title;
  const role = pickup && back ? "p4.both" : pickup ? "p4.pickup" : "p4.return";
  const focused = depth === "F",
    immersive = depth === "I";
  const active = context === "TODAY" || context === "FUTURE";
  const range = formatDayFeedVisibleDates({
    first: facts.pickup.date,
    last: facts.return?.date ?? facts.pickup.date,
  });
  const open = (url: string) => {
    setMapUnavailable(false);
    void Linking.openURL(url).catch(() => setMapUnavailable(true));
  };
  const roleLine = (
    <View style={styles.role}>
      <AppIcon name="car.side" size={16} color={colors.accent} />
      <Text style={styles.roleLabel}>{t(role)}</Text>
      {(focused || immersive) && facts.stableVehicleLabel ? (
        <Text style={styles.roleLabel}>{facts.stableVehicleLabel}</Text>
      ) : null}
    </View>
  );
  const heading = (
    <View style={styles.heading}>
      {immersive ? roleLine : null}
      <Text style={immersive ? styles.bigTitle : styles.title}>
        {name}
        {pending ? <PendingSyncDot /> : null}
      </Text>
      {!immersive ? roleLine : null}
      {(focused || immersive) && name !== title ? (
        <Text style={styles.meta}>{title}</Text>
      ) : null}
      {(focused || immersive) && facts.bookedClass ? (
        <Text style={styles.meta}>{facts.bookedClass}</Text>
      ) : null}
      {focused || immersive ? <Text style={styles.meta}>{range}</Text> : null}
      {!focused && !immersive && context !== "PAST" && endpointLabel(current) ? (
        <Text style={styles.meta}>{endpointLabel(current)}</Text>
      ) : null}
    </View>
  );
  const endpoint = (label: string, value: Endpoint) => {
    const canMap = active && (context === "FUTURE" || value === current);
    const directions = canMap && context === "TODAY" ? rentalMapUrl(value, true) : null;
    const map = canMap ? (directions ?? rentalMapUrl(value, false)) : null;
    const place = value.place;
    const address =
      place?.acceptedAddress ?? place?.authoredAddress ?? place?.authoredText;
    return (
      <View style={styles.section}>
        <Text style={styles.meta}>{label}</Text>
        <Text style={styles.body}>
          {civil(value.date)}
          {value.time ? ` · ${value.time}` : ""}
        </Text>
        <View style={styles.endpoint}>
          <View style={styles.endpointText}>
            {place?.authoredLabel ? (
              <Text style={styles.meta}>{place.authoredLabel}</Text>
            ) : null}
            {address && address !== place?.authoredLabel ? (
              <Text style={styles.meta}>{address}</Text>
            ) : null}
          </View>
          {map ? (
            <BookingGlyph
              kind={directions ? "navigate" : "map"}
              onPress={() => open(map)}
            />
          ) : null}
        </View>
      </View>
    );
  };
  const endpoints = (
    <>
      {context === "TODAY" && back && facts.return
        ? endpoint(t("p4.return"), facts.return)
        : null}
      {!(focused && context === "TODAY" && back)
        ? endpoint(t("p4.pickup"), facts.pickup)
        : null}
      {facts.return &&
      !(context === "TODAY" && back) &&
      !(focused && context === "TODAY" && pickup)
        ? endpoint(t("p4.return"), facts.return)
        : null}
    </>
  );
  const originals = (
    <Originals label={t("p4.booking")} entries={facts.bookingOriginals} />
  );
  const contact =
    active && facts.call ? <BookingGlyph kind="contact" onPress={facts.call} /> : null;
  const instructions = (
    <>
      {pickup ? (
        <Originals
          label={t("p4.pickupInstructions")}
          entries={facts.pickupInstructions}
        />
      ) : null}
      {back ? (
        <Originals
          label={t("p4.returnInstructions")}
          entries={facts.returnInstructions}
        />
      ) : null}
    </>
  );
  const money = facts.expenseSummary;
  const billingKnown =
    Number.isSafeInteger(money?.billingDays) && (money?.billingDays ?? 0) > 0;
  if (immersive)
    return (
      <View style={styles.immersive}>
        {!nativeNavigation ? (
          <View style={styles.actions}>
            <UiButton
              label={t("common.close")}
              variant="text"
              onPress={() => onDepth("F")}
            />
            {facts.onEdit ? (
              <UiButton label={t("p4.edit")} variant="text" onPress={facts.onEdit} />
            ) : null}
          </View>
        ) : null}
        {heading}
        {context === "PAST" && facts.photos?.count && facts.photos.previews.length ? (
          <BookingCard title={t("fidelity.photosTitle")}>
            <View style={styles.photos}>
              {facts.photos.previews.slice(0, 3).map((photo) => (
                <Image key={photo.id} source={{ uri: photo.uri }} style={styles.photo} />
              ))}
            </View>
            {facts.photos.onViewAll ? (
              <UiButton
                label={t("p4.viewAllPhotos")}
                variant="text"
                onPress={facts.photos.onViewAll}
              />
            ) : null}
          </BookingCard>
        ) : null}
        <BookingCard title={t("p4.both")}>
          {endpoints}
          {instructions}
          {contact}
        </BookingCard>
        {facts.holder || facts.drivers?.length ? (
          <BookingCard>
            {facts.holder ? (
              <Text style={styles.body}>{t("p4.holder", { name: facts.holder })}</Text>
            ) : null}
            {facts.drivers?.map((driver, index) => (
              <Text key={index} style={styles.body}>
                {t("p4.driver", { name: driver })}
              </Text>
            ))}
          </BookingCard>
        ) : null}
        {facts.reference ||
        facts.bookingOriginals?.length ||
        facts.associatedVehicles?.length ? (
          <BookingCard title={t("bookingRead.confirmation")}>
            {facts.reference ? (
              <Text style={styles.body}>
                {t("p4.reference", { value: facts.reference })}
              </Text>
            ) : null}
            {originals}
            {facts.associatedVehicles?.map((vehicle) => (
              <UiButton
                key={vehicle.id}
                label={vehicle.label}
                variant="text"
                onPress={vehicle.onOpen}
              />
            ))}
          </BookingCard>
        ) : null}
        {facts.supplier || facts.plate ? (
          <BookingCard>
            {facts.supplier ? <Text style={styles.body}>{facts.supplier}</Text> : null}
            {facts.plate ? (
              <Text style={styles.body}>{t("p4.plate", { value: facts.plate })}</Text>
            ) : null}
          </BookingCard>
        ) : null}
        {money ? (
          <BookingCard title={t("p4.total")}>
            <MoneyText {...money.total} variant="standard" />
            {billingKnown && money.perDay ? (
              <>
                <Text style={styles.meta}>{t("p4.totalPerDay")}</Text>
                <MoneyText {...money.perDay} variant="compact" />
              </>
            ) : null}
            {money.originals?.map((amount, index) => (
              <MoneyText key={index} {...amount} variant="compact" />
            ))}
            {money.myShare ? (
              <>
                <Text style={styles.sectionTitle}>{t("p4.myShare")}</Text>
                <MoneyText {...money.myShare} variant="standard" />
              </>
            ) : null}
            {money.myShare && billingKnown && money.myPerDay ? (
              <>
                <Text style={styles.meta}>{t("p4.myPerDay")}</Text>
                <MoneyText {...money.myPerDay} variant="compact" />
              </>
            ) : null}
            {facts.onEditExpense ? (
              <UiButton
                label={t("p4.editExpense")}
                variant="text"
                onPress={facts.onEditExpense}
              />
            ) : null}
          </BookingCard>
        ) : null}
        {note?.trim() ? (
          <BookingCard title={t("fidelity.note")}>
            <Text style={styles.note}>{note}</Text>
          </BookingCard>
        ) : null}
        {facts.onUpdateFromDocument ? (
          <UiButton
            label={t("p4.updateFromDocument")}
            variant="text"
            onPress={facts.onUpdateFromDocument}
          />
        ) : null}
        <ImmersiveActions
          linkExpenseFirst
          actions={{
            linkExpense: facts.onLinkExpense,
            addExpense: facts.onAddExpense,
            addPhoto: facts.onAddPhoto,
            addAttachment: facts.onAddAttachment,
          }}
        />
        {mapUnavailable ? (
          <Text accessibilityRole="alert" style={styles.meta}>
            {t("p4.mapUnavailable")}
          </Text>
        ) : null}
      </View>
    );
  const insert = (side: "BEFORE" | "AFTER") =>
    focused && active && onInsert ? (
      <BookingInsert side={side} onPress={() => onInsert(side)} />
    ) : null;
  return (
    <View>
      {insert("BEFORE")}
      <View style={[styles.row, focused && styles.focus]}>
        <View style={[styles.rail, { width: 54 * Math.max(1, fontScale) }]}>
          {current.time ? <Text style={styles.clock}>{current.time}</Text> : null}
          {withinMarker}
        </View>
        <View style={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={name}
            accessibilityHint={t(focused ? "p1r.collapseHint" : "p1r.focusHint")}
            onPress={() => onDepth(focused ? "B" : "F")}
          >
            {heading}
          </Pressable>
          {focused ? (
            <>
              {facts.reference ? (
                <Text style={styles.meta}>
                  {t("p4.reference", { value: facts.reference })}
                </Text>
              ) : null}
              {facts.holder ? (
                <Text style={styles.meta}>{t("p4.holder", { name: facts.holder })}</Text>
              ) : null}
              {endpoints}
              {context === "TODAY" ? instructions : null}
              {originals}
              {context === "PAST" && facts.photos?.count ? (
                <Text style={styles.meta}>
                  {t("p4.photoCount", { count: facts.photos.count })}
                </Text>
              ) : null}
              {context === "PAST" && facts.expenseCount ? (
                <Text style={styles.meta}>
                  {t("p4.expenseCount", { count: facts.expenseCount })}
                </Text>
              ) : null}
              <View style={styles.detailAction}>
                <BookingGlyph kind="detail" onPress={() => onDepth("I")} />
                {contact}
              </View>
              {mapUnavailable ? (
                <Text accessibilityRole="alert" style={styles.meta}>
                  {t("p4.mapUnavailable")}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
      {insert("AFTER")}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    row: {
      paddingVertical: 17,
      flexDirection: "row",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    focus: {
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: visual.radius.feedFocus,
      paddingHorizontal: 11,
      paddingBottom: 8,
      backgroundColor: c.surface,
    },
    immersive: { gap: 12, paddingVertical: 20 },
    rail: { alignSelf: "flex-start" },
    content: { flex: 1, minWidth: 0, gap: 14 },
    heading: { gap: 7 },
    role: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
    roleLabel: { fontSize: 11, fontWeight: "600", color: c.accent },
    clock: { ...visual.type.feedClock, color: c.textSecondary },
    title: { ...visual.type.feedTitle, color: c.textPrimary },
    bigTitle: { ...visual.type.immersiveTitle, color: c.textPrimary },
    meta: { ...visual.type.meta, lineHeight: 18, color: c.textSecondary },
    body: { ...visual.type.row, color: c.textPrimary },
    note: { fontSize: 15, lineHeight: 22.5, color: c.textPrimary },
    sectionTitle: { ...visual.type.section, color: c.textSecondary },
    section: { gap: 7 },
    endpoint: { flexDirection: "row", alignItems: "center" },
    endpointText: { flex: 1, gap: 5 },
    detailAction: { flexDirection: "row", justifyContent: "flex-end" },
    actions: { flexDirection: "row", justifyContent: "space-between" },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    photo: { width: 92, height: 92, borderRadius: visual.radius.control },
  });
