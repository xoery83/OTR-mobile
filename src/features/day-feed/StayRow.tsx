import { useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { DayEvent } from "@/domain/trip/dayReadModel";
import { UiButton } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { DayRowRendererProps } from "./rendererContribution";
import { timeRailWidth } from "./visualTokens";

type Original = Readonly<{ id: string; title: string; onOpen: () => void }>;
export type StayFacts = Readonly<{
  family: "P3";
  checkin: string;
  checkout: string;
  nights: number;
  propertyName?: string;
  area?: string;
  confirmedBySource?: boolean;
  bookingOriginals?: readonly Original[];
  instructionOriginals?: readonly Original[];
  checkoutOriginals?: readonly Original[];
  checkoutBy?: string;
  registeredGuests?: readonly string[];
  contact?: () => void;
  photos?: Readonly<{
    count: number;
    previews: readonly Readonly<{ id: string; uri: string }>[];
    onViewAll?: () => void;
  }>;
  expenses?: Readonly<{ count: number }>;
  onManage?: () => void;
  onAddAttachment?: () => void;
  onAddPhoto?: () => void;
  onAddExpense?: () => void;
}>;

const civil = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const acceptedCoordinates = (event: DayEvent) =>
  event.accepted_latitude !== null &&
  event.accepted_longitude !== null &&
  Number.isFinite(event.accepted_latitude) &&
  Number.isFinite(event.accepted_longitude) &&
  Math.abs(event.accepted_latitude) <= 90 &&
  Math.abs(event.accepted_longitude) <= 180;

const acceptedAddress = (event: DayEvent) => {
  if (event.accepted_address?.trim()) return event.accepted_address;
  if (
    !event.accepted_address_line1?.trim() ||
    !(
      event.accepted_address_locality ||
      event.accepted_address_region ||
      event.accepted_address_country
    )
  )
    return null;
  return [
    event.accepted_address_line1,
    event.accepted_address_locality,
    event.accepted_address_region,
    event.accepted_address_country,
  ]
    .filter(Boolean)
    .join(", ");
};

export function stayMapUrl(event: DayEvent, facts: StayFacts): string | null {
  const lat = event.accepted_latitude,
    lon = event.accepted_longitude;
  if (acceptedCoordinates(event))
    return `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(facts.propertyName ?? event.title)}`;
  const exact = acceptedAddress(event);
  const query =
    exact ?? (facts.area ? `${facts.propertyName ?? event.title} ${facts.area}` : "");
  return query.trim() ? `https://maps.apple.com/?q=${encodeURIComponent(query)}` : null;
}

export function stayDirectionsUrl(event: DayEvent): string | null {
  if (acceptedCoordinates(event))
    return `https://maps.apple.com/?daddr=${event.accepted_latitude},${event.accepted_longitude}`;
  const address = acceptedAddress(event);
  return address?.trim()
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`
    : null;
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
          entries.length === 1 ? entries[0].onOpen() : setChoosing((value) => !value)
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

export function StayRow({
  row,
  depth,
  context = "UNKNOWN",
  onDepth,
  withinMarker,
  facts,
}: DayRowRendererProps & { facts: StayFacts }) {
  useUiLocale();
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const event = row.item.event;
  const roles = row.coreRowKeys.map((key) => key.projectionRole);
  const checkin = roles.includes("CHECKIN"),
    checkout = roles.includes("CHECKOUT"),
    base = row.position === "BASE";
  const role =
    checkin && checkout
      ? "p3.role.sameDay"
      : checkin
        ? "p3.role.checkin"
        : checkout
          ? "p3.role.checkout"
          : base
            ? "p3.role.base"
            : "p3.role.stay";
  const name = facts.propertyName ?? event.title;
  const knownClock = (role: "START" | "END") =>
    event.boundaries
      .find(
        (boundary) =>
          boundary.role === role &&
          boundary.quality === "EXACT" &&
          boundary.clock_precision !== null &&
          boundary.clock_precision >= 0,
      )
      ?.local_time?.slice(0, 5);
  const clocks = base
    ? []
    : [checkin ? knownClock("START") : null, checkout ? knownClock("END") : null].filter(
        (clock): clock is string => !!clock,
      );
  const mapUrl = stayMapUrl(event, facts);
  const directionsUrl = context === "TODAY" ? stayDirectionsUrl(event) : null;
  const focused = depth === "F",
    immersive = depth === "I";
  const openMap = () => {
    const url = directionsUrl ?? mapUrl;
    if (url) {
      setMapUnavailable(false);
      void Linking.openURL(url).catch(() => setMapUnavailable(true));
    }
  };
  const mapLabel = directionsUrl ? t("p3.directions") : t("p3.viewMap");
  const photos = context === "PAST" ? facts.photos : undefined;
  return (
    <View style={[styles.row, immersive && styles.immersive]}>
      {!immersive && (withinMarker || clocks.length) ? (
        <View style={[styles.nowRail, { width: timeRailWidth(fontScale) }]}>
          {clocks.map((clock, index) => (
            <Text key={`${index}/${clock}`} style={styles.meta}>
              {clock}
            </Text>
          ))}
          {withinMarker}
        </View>
      ) : null}
      {immersive ? (
        <View style={styles.topActions}>
          <UiButton
            label={t("common.close")}
            variant="text"
            onPress={() => onDepth("F")}
          />
          {facts.onManage ? (
            <UiButton label={t("p3.manage")} variant="text" onPress={facts.onManage} />
          ) : null}
        </View>
      ) : null}
      {immersive && photos?.count && photos.previews.length ? (
        <View style={styles.photoRow}>
          {photos.previews.slice(0, Math.min(3, photos.count)).map((photo) => (
            <Image key={photo.id} source={{ uri: photo.uri }} style={styles.photo} />
          ))}
          {photos.onViewAll && photos.count > 3 ? (
            <UiButton
              label={t("p3.viewAllPhotos")}
              variant="text"
              onPress={photos.onViewAll}
            />
          ) : null}
        </View>
      ) : null}
      <Pressable
        disabled={immersive}
        accessibilityRole={immersive ? "text" : "button"}
        accessibilityLabel={name}
        accessibilityHint={
          immersive ? undefined : t(focused ? "p1r.collapseHint" : "p1r.focusHint")
        }
        style={styles.hit}
        onPress={() => onDepth(focused ? "B" : "F")}
      >
        <Text style={immersive ? styles.bigTitle : styles.title}>{name}</Text>
        <Text style={styles.meta}>{t(role)}</Text>
        {(event.accepted_address ?? event.authored_address ?? facts.area) ? (
          <Text style={styles.meta}>
            {event.accepted_address ?? event.authored_address ?? facts.area}
          </Text>
        ) : null}
        {context === "FUTURE" && facts.confirmedBySource ? (
          <Text style={styles.meta}>{t("p3.confirmed")}</Text>
        ) : null}
        {context === "PAST" && photos?.count ? (
          <Text style={styles.meta}>{t("p3.photoCount", { count: photos.count })}</Text>
        ) : null}
      </Pressable>
      {focused || immersive ? (
        <>
          <Text style={styles.body}>
            {t(facts.nights === 1 ? "p3.dateRangeOne" : "p3.dateRange", {
              start: civil(facts.checkin),
              end: civil(facts.checkout),
              nights: facts.nights,
            })}
          </Text>
          {context === "PAST" && facts.expenses?.count ? (
            <Text style={styles.meta}>
              {t("p3.expenseCount", { count: facts.expenses.count })}
            </Text>
          ) : null}
          {context === "TODAY" && checkin ? (
            <Originals
              label={t("p3.instructions")}
              entries={facts.instructionOriginals}
            />
          ) : null}
          {context === "TODAY" && checkout ? (
            <>
              {facts.checkoutBy ? (
                <Text style={styles.body}>
                  {t("p3.checkoutBy", { time: facts.checkoutBy })}
                </Text>
              ) : null}
              <Originals
                label={t("p3.checkoutInstructions")}
                entries={facts.checkoutOriginals}
              />
            </>
          ) : null}
          {mapUrl && context !== "PAST" ? (
            <>
              <UiButton label={mapLabel} variant="text" onPress={openMap} />
              {mapUnavailable ? (
                <Text style={styles.meta}>{t("p3.mapUnavailable")}</Text>
              ) : null}
            </>
          ) : null}
          {context === "TODAY" && facts.contact ? (
            <UiButton label={t("p3.contact")} variant="text" onPress={facts.contact} />
          ) : null}
          {context !== "PAST" || focused ? (
            <Originals label={t("p3.booking")} entries={facts.bookingOriginals} />
          ) : null}
          {focused ? (
            <UiButton
              label={t("p1r.richerDetails")}
              variant="text"
              onPress={() => onDepth("I")}
            />
          ) : null}
        </>
      ) : null}
      {immersive ? (
        <>
          {context === "PAST" ? (
            <Originals label={t("p3.booking")} entries={facts.bookingOriginals} />
          ) : null}
          {facts.registeredGuests?.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("p3.registeredGuests")}</Text>
              {facts.registeredGuests.map((guest, index) => (
                <Text key={`${index}/${guest}`} style={styles.body}>
                  {guest}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={styles.actions}>
            {facts.onAddAttachment ? (
              <UiButton
                label={t("p3.addAttachment")}
                variant="text"
                onPress={facts.onAddAttachment}
              />
            ) : null}
            {facts.onAddPhoto ? (
              <UiButton
                label={t("p3.addPhoto")}
                variant="text"
                onPress={facts.onAddPhoto}
              />
            ) : null}
            {facts.onAddExpense ? (
              <UiButton
                label={t("p3.addExpense")}
                variant="text"
                onPress={facts.onAddExpense}
              />
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    row: {
      paddingVertical: visual.space.row,
      gap: visual.space.heading,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
      backgroundColor: c.background,
    },
    immersive: { flex: 1, padding: visual.space.page, borderBottomWidth: 0 },
    topActions: { flexDirection: "row", justifyContent: "space-between" },
    actions: { gap: visual.space.heading },
    hit: { minHeight: 44, gap: visual.space.heading },
    title: { ...visual.type.section, color: c.textPrimary },
    bigTitle: { ...visual.type.metric, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    body: { ...visual.type.row, color: c.textPrimary },
    section: { gap: visual.space.heading },
    sectionTitle: { ...visual.type.section, color: c.textPrimary },
    photoRow: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    photo: { width: 92, height: 92, borderRadius: visual.radius.control },
    nowRail: { alignSelf: "flex-start" },
  });
