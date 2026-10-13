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
import type { CorePlaceView } from "@/domain/trip/tripCoreV2Day";
import { MoneyText } from "@/features/ledger/MoneyText";
import { UiButton } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { DayRowRendererProps } from "./rendererContribution";
import { timeRailWidth } from "./visualTokens";

type Endpoint = Readonly<{ date: string; time?: string; place?: CorePlaceView }>;
type Openable = Readonly<{
  id: string;
  title: string;
  onOpen: () => void;
  requiresSelection?: boolean;
}>;
type MoneyAmount = Readonly<{ minor: number; currency: string; scale: number }>;
type Passenger = Readonly<{
  id: string;
  name: string;
  seat?: string;
  coach?: string;
  boarding?: string;
}>;
export type ScheduledTransportFacts = Readonly<{
  family: "P5";
  title: string;
  origin: Endpoint;
  destination: Endpoint;
  subtype?: string;
  operator?: string;
  service?: string;
  bookingMarker?: string;
  boarding?: Readonly<{
    platform?: string;
    bay?: string;
    pier?: string;
    coach?: string;
    seat?: string;
  }>;
  // Callbacks and passenger/media/expense data are supplied only by owning
  // capabilities. The Core projection alone never makes a Ticket openable.
  tickets?: readonly Openable[];
  bookings?: readonly Openable[];
  documents?: readonly Openable[];
  passengers?: readonly Passenger[];
  relatedSegments?: readonly Openable[];
  photos?: Readonly<{
    count: number;
    previews: readonly Readonly<{ id: string; uri: string }>[];
    onViewAll?: () => void;
  }>;
  expenseCount?: number;
  expenseSummary?: Readonly<{
    total: MoneyAmount;
    myShare?: MoneyAmount;
    originals?: readonly MoneyAmount[];
    coverage?: string;
  }>;
  onEdit?: () => void;
  onUpdateFromDocument?: () => void;
  onEditExpense?: () => void;
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
const endpointLabel = (endpoint: Endpoint) =>
  endpoint.place?.acceptedAddress ??
  endpoint.place?.authoredAddress ??
  endpoint.place?.authoredLabel ??
  endpoint.place?.authoredText;
const endpointTime = (endpoint: Endpoint) =>
  endpoint.time ? `${civil(endpoint.date)} · ${endpoint.time}` : civil(endpoint.date);

// Coordinates and accepted addresses can drive exact directions. Authored
// labels are keyword search only, never promoted to trusted coordinates.
export function transportMapUrl(endpoint: Endpoint, directions: boolean): string | null {
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

const unique = (entries: readonly Openable[] | undefined) => [
  ...new Map(entries?.map((entry) => [entry.id, entry]) ?? []).values(),
];
const modeKey = (subtype: string | undefined) => {
  switch (subtype) {
    case "TRAIN":
      return "p5.mode.train";
    case "BUS":
      return "p5.mode.bus";
    case "FERRY":
      return "p5.mode.ferry";
    case "WATER_TAXI":
      return "p5.mode.waterTaxi";
    default:
      return null;
  }
};
const passengerLabel = (person: Passenger) =>
  [
    person.name,
    person.coach ? t("p5.coach", { value: person.coach }) : null,
    person.seat ? t("p5.seat", { value: person.seat }) : null,
    person.boarding,
  ]
    .filter(Boolean)
    .join(" · ");

function Openables({
  entries,
  label,
  chooseLabel,
}: {
  entries?: readonly Openable[];
  label: string;
  chooseLabel: string;
}) {
  const [choosing, setChoosing] = useState(false);
  const items = unique(entries);
  if (!items.length) return null;
  const direct = items.length === 1 && !items[0].requiresSelection;
  return (
    <View>
      <UiButton
        label={direct ? label : chooseLabel}
        variant="text"
        onPress={() => (direct ? items[0].onOpen() : setChoosing(!choosing))}
      />
      {choosing
        ? items.map((item) => (
            <UiButton
              key={item.id}
              label={item.title}
              variant="secondary"
              onPress={() => {
                setChoosing(false);
                item.onOpen();
              }}
            />
          ))
        : null}
    </View>
  );
}

export function ScheduledTransportRow({
  row,
  depth,
  context = "UNKNOWN",
  onDepth,
  withinMarker,
  facts,
}: DayRowRendererProps & { facts: ScheduledTransportFacts }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const focused = depth === "F",
    immersive = depth === "I";
  const roles = row.coreRowKeys.map((key) => key.projectionRole);
  const current =
    roles.includes("DESTINATION") && !roles.includes("ORIGIN")
      ? facts.destination
      : facts.origin;
  const currentTime = current.time;
  const boarding = facts.boarding;
  const boardingParts = [
    boarding?.platform ? t("p5.platform", { value: boarding.platform }) : null,
    boarding?.bay ? t("p5.bay", { value: boarding.bay }) : null,
    boarding?.pier ? t("p5.pier", { value: boarding.pier }) : null,
    boarding?.coach ? t("p5.coach", { value: boarding.coach }) : null,
    boarding?.seat ? t("p5.seat", { value: boarding.seat }) : null,
  ].filter(Boolean);
  const openMap = (url: string) => {
    setMapUnavailable(false);
    void Linking.openURL(url).catch(() => setMapUnavailable(true));
  };
  const endpoint = (label: string, value: Endpoint, directions: boolean) => {
    const map = context === "PAST" ? null : transportMapUrl(value, directions);
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <Text style={styles.body}>{endpointTime(value)}</Text>
        {endpointLabel(value) ? (
          <Text style={styles.meta}>{endpointLabel(value)}</Text>
        ) : null}
        {map ? (
          <UiButton
            label={t(directions ? "p5.directions" : "p5.viewMap")}
            variant="text"
            onPress={() => openMap(map)}
          />
        ) : null}
      </View>
    );
  };
  return (
    <View style={[styles.row, immersive && styles.immersive]}>
      {!immersive && (currentTime || withinMarker) ? (
        <View style={[styles.rail, { width: timeRailWidth(fontScale) }]}>
          {currentTime ? <Text style={styles.meta}>{currentTime}</Text> : null}
          {withinMarker}
        </View>
      ) : null}
      {immersive ? (
        <View style={styles.actions}>
          <UiButton
            label={t("common.close")}
            variant="text"
            onPress={() => onDepth("F")}
          />
          {facts.onEdit ? (
            <UiButton label={t("p5.edit")} variant="text" onPress={facts.onEdit} />
          ) : null}
        </View>
      ) : null}
      {immersive && context === "PAST" && facts.photos?.previews.length ? (
        <View style={styles.photos}>
          {facts.photos.previews.slice(0, 3).map((photo) => (
            <Image key={photo.id} source={{ uri: photo.uri }} style={styles.photo} />
          ))}
          {facts.photos.count > 3 && facts.photos.onViewAll ? (
            <UiButton
              label={t("p5.viewAllPhotos")}
              variant="text"
              onPress={facts.photos.onViewAll}
            />
          ) : null}
        </View>
      ) : null}
      <Pressable
        disabled={immersive}
        accessibilityRole={immersive ? "text" : "button"}
        accessibilityLabel={facts.title}
        accessibilityHint={
          immersive ? undefined : t(focused ? "p1r.collapseHint" : "p1r.focusHint")
        }
        style={styles.hit}
        onPress={() => onDepth(focused ? "B" : "F")}
      >
        <Text style={immersive ? styles.bigTitle : styles.title}>{facts.title}</Text>
        {modeKey(facts.subtype) ? (
          <Text style={styles.meta}>{t(modeKey(facts.subtype)!)}</Text>
        ) : null}
        {facts.operator || facts.service ? (
          <Text style={styles.meta}>
            {[facts.operator, facts.service].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        <Text style={styles.body}>
          {endpointLabel(facts.origin) ?? civil(facts.origin.date)}
          {facts.origin.time ? ` · ${facts.origin.time}` : ""}
        </Text>
        <Text style={styles.body}>
          {endpointLabel(facts.destination) ?? civil(facts.destination.date)}
          {facts.destination.time ? ` · ${facts.destination.time}` : ""}
        </Text>
        {context === "FUTURE" && facts.bookingMarker ? (
          <Text style={styles.meta}>
            {t("p5.bookingMarker", { name: facts.bookingMarker })}
          </Text>
        ) : null}
        {context === "TODAY" && !focused && !immersive && boardingParts.length ? (
          <Text style={styles.meta}>{boardingParts.join(" · ")}</Text>
        ) : null}
        {context === "PAST" && facts.photos?.count ? (
          <Text style={styles.meta}>
            {t("p5.photoCount", { count: facts.photos.count })}
          </Text>
        ) : null}
      </Pressable>
      {focused || immersive ? (
        <>
          {context === "TODAY" && boardingParts.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("p5.boarding")}</Text>
              <Text style={styles.body}>{boardingParts.join(" · ")}</Text>
            </View>
          ) : null}
          {context === "TODAY" ? (
            <Openables
              entries={facts.tickets}
              label={t("p5.showTicket")}
              chooseLabel={t("p5.chooseTicket")}
            />
          ) : null}
          {endpoint(t("p5.departure"), facts.origin, context === "TODAY")}
          {endpoint(t("p5.arrival"), facts.destination, false)}
          {context === "FUTURE" || context === "PAST" ? (
            <>
              <Openables
                entries={facts.tickets}
                label={t(context === "PAST" ? "p5.ticketOriginal" : "p5.ticket")}
                chooseLabel={t("p5.chooseTicket")}
              />
              {focused ? (
                <Openables
                  entries={facts.bookings}
                  label={t("p5.booking")}
                  chooseLabel={t("p5.chooseBooking")}
                />
              ) : null}
            </>
          ) : null}
          {context === "PAST" && facts.passengers?.length ? (
            <Text style={styles.meta}>
              {facts.passengers.slice(0, 3).map(passengerLabel).join(" · ")}
              {facts.passengers.length > 3
                ? t("p5.morePassengers", { count: facts.passengers.length - 3 })
                : ""}
            </Text>
          ) : null}
          {context === "PAST" && facts.photos?.count ? (
            <Text style={styles.meta}>
              {t("p5.photoCount", { count: facts.photos.count })}
            </Text>
          ) : null}
          {context === "PAST" && facts.expenseCount ? (
            <Text style={styles.meta}>
              {t("p5.expenseCount", { count: facts.expenseCount })}
            </Text>
          ) : null}
          {mapUnavailable ? (
            <Text style={styles.meta}>{t("p5.mapUnavailable")}</Text>
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
          {facts.passengers?.map((person) => (
            <Text key={person.id} style={styles.body}>
              {passengerLabel(person)}
            </Text>
          ))}
          {unique(facts.relatedSegments).length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("p5.relatedSegments")}</Text>
              {unique(facts.relatedSegments).map((segment) => (
                <UiButton
                  key={segment.id}
                  label={segment.title}
                  variant="text"
                  onPress={segment.onOpen}
                />
              ))}
            </View>
          ) : null}
          <Openables
            entries={facts.documents}
            label={t("p5.documents")}
            chooseLabel={t("p5.chooseDocument")}
          />
          <Openables
            entries={facts.bookings}
            label={t("p5.booking")}
            chooseLabel={t("p5.chooseBooking")}
          />
          {facts.expenseSummary ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("p5.total")}</Text>
              <MoneyText {...facts.expenseSummary.total} variant="standard" />
              {facts.expenseSummary.myShare ? (
                <>
                  <Text style={styles.sectionTitle}>{t("p5.myShare")}</Text>
                  <MoneyText {...facts.expenseSummary.myShare} variant="standard" />
                </>
              ) : null}
              {facts.expenseSummary.originals?.map((amount, index) => (
                <MoneyText key={index} {...amount} variant="compact" />
              ))}
              {facts.expenseSummary.coverage ? (
                <Text style={styles.meta}>{facts.expenseSummary.coverage}</Text>
              ) : null}
            </View>
          ) : null}
          {facts.onUpdateFromDocument ? (
            <UiButton
              label={t("p5.updateFromDocument")}
              variant="text"
              onPress={facts.onUpdateFromDocument}
            />
          ) : null}
          {facts.onEditExpense ? (
            <UiButton
              label={t("p5.editExpense")}
              variant="text"
              onPress={facts.onEditExpense}
            />
          ) : null}
          {facts.onAddPhoto ? (
            <UiButton
              label={t("p5.addPhoto")}
              variant="text"
              onPress={facts.onAddPhoto}
            />
          ) : null}
          {facts.onAddAttachment ? (
            <UiButton
              label={t("p5.addAttachment")}
              variant="text"
              onPress={facts.onAddAttachment}
            />
          ) : null}
          {facts.onAddExpense ? (
            <UiButton
              label={t("p5.addExpense")}
              variant="text"
              onPress={facts.onAddExpense}
            />
          ) : null}
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
    rail: { alignSelf: "flex-start" },
    hit: { minHeight: 44, gap: visual.space.heading },
    title: { ...visual.type.section, color: c.textPrimary },
    bigTitle: { ...visual.type.metric, color: c.textPrimary },
    body: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    section: { gap: visual.space.heading },
    sectionTitle: { ...visual.type.section, color: c.textPrimary },
    actions: { flexDirection: "row", justifyContent: "space-between" },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    photo: { width: 92, height: 92, borderRadius: visual.radius.control },
  });
