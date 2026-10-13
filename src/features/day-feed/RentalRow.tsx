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

type Original = Readonly<{ id: string; title: string; onOpen: () => void }>;
type Endpoint = Readonly<{ date: string; time?: string; place?: CorePlaceView }>;
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
const returnSummary = (endpoint: Endpoint) => {
  const date = civil(endpoint.date);
  const time = endpoint.time;
  const place = endpointLabel(endpoint);
  if (time && place) return t("p4.returnSummaryTimePlace", { date, time, place });
  if (time) return t("p4.returnSummaryTime", { date, time });
  if (place) return t("p4.returnSummaryPlace", { date, place });
  return t("p4.returnSummaryDate", { date });
};
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
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const roles = row.coreRowKeys.map((key) => key.projectionRole);
  const pickup = roles.includes("PICKUP"),
    back = roles.includes("RETURN");
  const current = back && !pickup ? (facts.return ?? facts.pickup) : facts.pickup;
  const name =
    context === "FUTURE"
      ? (facts.bookedClass ??
        facts.actualModel ??
        facts.stableVehicleLabel ??
        row.item.event.title)
      : (facts.actualModel ??
        facts.bookedClass ??
        facts.stableVehicleLabel ??
        row.item.event.title);
  const role = pickup && back ? "p4.both" : pickup ? "p4.pickup" : "p4.return";
  const focused = depth === "F",
    immersive = depth === "I";
  const open = (url: string) => {
    setMapUnavailable(false);
    void Linking.openURL(url).catch(() => setMapUnavailable(true));
  };
  const endpoint = (label: string, value: Endpoint) => {
    const canMap = context === "FUTURE" || (context === "TODAY" && value === current);
    const map = canMap ? rentalMapUrl(value, context === "TODAY") : null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <Text style={styles.body}>
          {civil(value.date)}
          {value.time ? ` · ${value.time}` : ""}
        </Text>
        {endpointLabel(value) ? (
          <Text style={styles.meta}>{endpointLabel(value)}</Text>
        ) : null}
        {context !== "PAST" && map ? (
          <UiButton
            label={t(context === "TODAY" ? "p4.directions" : "p4.viewMap")}
            variant="text"
            onPress={() => open(map)}
          />
        ) : null}
      </View>
    );
  };
  return (
    <View style={[styles.row, immersive && styles.immersive]}>
      {!immersive && (current.time || withinMarker) ? (
        <View style={[styles.rail, { width: timeRailWidth(fontScale) }]}>
          {current.time ? <Text style={styles.meta}>{current.time}</Text> : null}
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
            <UiButton label={t("p4.edit")} variant="text" onPress={facts.onEdit} />
          ) : null}
        </View>
      ) : null}
      {immersive &&
      context === "PAST" &&
      facts.photos?.count &&
      facts.photos.previews.length ? (
        <View style={styles.photos}>
          {facts.photos.previews.slice(0, 3).map((photo) => (
            <Image key={photo.id} source={{ uri: photo.uri }} style={styles.photo} />
          ))}
          {facts.photos.count > 3 && facts.photos.onViewAll ? (
            <UiButton
              label={t("p4.viewAllPhotos")}
              variant="text"
              onPress={facts.photos.onViewAll}
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
        {facts.stableVehicleLabel && facts.stableVehicleLabel !== name ? (
          <Text style={styles.meta}>{facts.stableVehicleLabel}</Text>
        ) : null}
        {facts.supplier ? <Text style={styles.meta}>{facts.supplier}</Text> : null}
        {context === "FUTURE" && pickup && !focused && !immersive && facts.holder ? (
          <Text style={styles.meta}>{t("p4.holder", { name: facts.holder })}</Text>
        ) : null}
        {endpointLabel(current) ? (
          <Text style={styles.meta}>{endpointLabel(current)}</Text>
        ) : null}
        {context === "FUTURE" && pickup && facts.return ? (
          <Text style={styles.meta}>{returnSummary(facts.return)}</Text>
        ) : null}
        {context === "PAST" && facts.photos?.count ? (
          <Text style={styles.meta}>
            {t("p4.photoCount", { count: facts.photos.count })}
          </Text>
        ) : null}
      </Pressable>
      {focused || immersive ? (
        <>
          {endpoint(t("p4.pickup"), facts.pickup)}
          {facts.return ? endpoint(t("p4.return"), facts.return) : null}
          {facts.holder ? (
            <Text style={styles.body}>{t("p4.holder", { name: facts.holder })}</Text>
          ) : null}
          {facts.reference ? (
            <Text style={styles.body}>
              {t("p4.reference", { value: facts.reference })}
            </Text>
          ) : null}
          {facts.plate ? (
            <Text style={styles.body}>{t("p4.plate", { value: facts.plate })}</Text>
          ) : null}
          {context === "PAST" && facts.expenseCount ? (
            <Text style={styles.meta}>
              {t("p4.expenseCount", { count: facts.expenseCount })}
            </Text>
          ) : null}
          {context === "TODAY" && pickup ? (
            <Originals
              label={t("p4.pickupInstructions")}
              entries={facts.pickupInstructions}
            />
          ) : null}
          {context === "TODAY" && back ? (
            <Originals
              label={t("p4.returnInstructions")}
              entries={facts.returnInstructions}
            />
          ) : null}
          {context !== "PAST" && facts.call ? (
            <UiButton label={t("p4.call")} variant="text" onPress={facts.call} />
          ) : null}
          <Originals label={t("p4.booking")} entries={facts.bookingOriginals} />
          {mapUnavailable ? (
            <Text style={styles.meta}>{t("p4.mapUnavailable")}</Text>
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
          {facts.expenseSummary ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("p4.total")}</Text>
              <MoneyText {...facts.expenseSummary.total} variant="standard" />
              {facts.expenseSummary.perDay &&
              Number.isSafeInteger(facts.expenseSummary.billingDays) &&
              (facts.expenseSummary.billingDays ?? 0) > 0 ? (
                <>
                  <Text style={styles.meta}>{t("p4.totalPerDay")}</Text>
                  <MoneyText {...facts.expenseSummary.perDay} variant="compact" />
                </>
              ) : null}
              {facts.expenseSummary.originals?.map((amount, index) => (
                <MoneyText key={index} {...amount} variant="compact" />
              ))}
              {facts.expenseSummary.myShare ? (
                <>
                  <Text style={styles.sectionTitle}>{t("p4.myShare")}</Text>
                  <MoneyText {...facts.expenseSummary.myShare} variant="standard" />
                </>
              ) : null}
              {facts.expenseSummary.myShare &&
              facts.expenseSummary.myPerDay &&
              Number.isSafeInteger(facts.expenseSummary.billingDays) &&
              (facts.expenseSummary.billingDays ?? 0) > 0 ? (
                <>
                  <Text style={styles.meta}>{t("p4.myPerDay")}</Text>
                  <MoneyText {...facts.expenseSummary.myPerDay} variant="compact" />
                </>
              ) : null}
            </View>
          ) : null}
          {facts.associatedVehicles?.map((vehicle) => (
            <UiButton
              key={vehicle.id}
              label={vehicle.label}
              variant="text"
              onPress={vehicle.onOpen}
            />
          ))}
          {facts.onUpdateFromDocument ? (
            <UiButton
              label={t("p4.updateFromDocument")}
              variant="text"
              onPress={facts.onUpdateFromDocument}
            />
          ) : null}
          {facts.onEditExpense ? (
            <UiButton
              label={t("p4.editExpense")}
              variant="text"
              onPress={facts.onEditExpense}
            />
          ) : null}
          {facts.onAddPhoto ? (
            <UiButton
              label={t("p4.addPhoto")}
              variant="text"
              onPress={facts.onAddPhoto}
            />
          ) : null}
          {facts.onAddAttachment ? (
            <UiButton
              label={t("p4.addAttachment")}
              variant="text"
              onPress={facts.onAddAttachment}
            />
          ) : null}
          {facts.onAddExpense ? (
            <UiButton
              label={t("p4.addExpense")}
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
    meta: { ...visual.type.meta, color: c.textSecondary },
    body: { ...visual.type.row, color: c.textPrimary },
    section: { gap: visual.space.heading },
    sectionTitle: { ...visual.type.section, color: c.textPrimary },
    actions: { flexDirection: "row", justifyContent: "space-between" },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    photo: { width: 92, height: 92, borderRadius: visual.radius.control },
  });
