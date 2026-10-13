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
import { transportMapUrl } from "./ScheduledTransportRow";

type Clock = Readonly<{ date: string; time?: string; plannedUnresolved?: boolean }>;
type Openable = Readonly<{
  id: string;
  title: string;
  onOpen: () => void;
  requiresSelection?: boolean;
  coveredParticipants?: readonly string[];
}>;
type MoneyAmount = Readonly<{ minor: number; currency: string; scale: number }>;
type Participant = Readonly<{
  id: string;
  name: string;
  entrance?: string;
  section?: string;
  seat?: string;
}>;
export type TicketedActivityFacts = Readonly<{
  family: "P6";
  title: string;
  start: Clock;
  venue?: CorePlaceView;
  entryPlace?: CorePlaceView;
  // Required arrival/meeting is a distinct, explicit owning fact. Core's
  // general start or venue opening hours never imply this requirement.
  requiredArrival?: Clock & Readonly<{ label?: string; place?: CorePlaceView }>;
  session?: string;
  admissionLine?: string;
  ownAdmission?: Readonly<{ entrance?: string; section?: string; seat?: string }>;
  tickets?: readonly Openable[];
  bookings?: readonly Openable[];
  documents?: readonly Openable[];
  participants?: readonly Participant[];
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
  }>;
  onEdit?: () => void;
  onUpdateFromDocument?: () => void;
  onEditExpense?: () => void;
  onAddPhoto?: () => void;
  onAddAttachment?: () => void;
  onAddExpense?: () => void;
}>;

const unique = (entries: readonly Openable[] | undefined) => [
  ...new Map(entries?.map((entry) => [entry.id, entry]) ?? []).values(),
];
const dateLabel = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const clockLabel = (clock: Clock) =>
  `${dateLabel(clock.date)}${clock.time ? ` · ${clock.time}` : ""}`;
const placeLabel = (place: CorePlaceView | undefined) =>
  place?.acceptedAddress ??
  place?.authoredAddress ??
  place?.authoredLabel ??
  place?.authoredText;
const ownAdmissionLine = (admission: TicketedActivityFacts["ownAdmission"]) =>
  [
    admission?.entrance ? t("p6.entrance", { value: admission.entrance }) : null,
    admission?.section ? t("p6.section", { value: admission.section }) : null,
    admission?.seat ? t("p6.seat", { value: admission.seat }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
const participantLine = (person: Participant) =>
  [person.name, ownAdmissionLine(person)].filter(Boolean).join(" · ");

function Originals({
  entries,
  label,
  chooser,
}: {
  entries?: readonly Openable[];
  label: string;
  chooser: string;
}) {
  const [choosing, setChoosing] = useState(false);
  const items = unique(entries);
  if (!items.length) return null;
  const direct = items.length === 1 && !items[0].requiresSelection;
  return (
    <View>
      <UiButton
        label={direct ? label : chooser}
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

export function TicketedActivityRow({
  row,
  context = "UNKNOWN",
  depth,
  onDepth,
  withinMarker,
  facts,
}: DayRowRendererProps & { facts: TicketedActivityFacts }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const focused = depth === "F",
    immersive = depth === "I";
  const arrival = facts.requiredArrival;
  const pastStartKnown = Boolean(facts.start.time);
  const primary =
    context === "PAST"
      ? pastStartKnown
        ? facts.start
        : (arrival ?? facts.start)
      : (arrival ?? facts.start);
  const secondary =
    context === "PAST"
      ? pastStartKnown
        ? arrival
        : undefined
      : arrival
        ? facts.start
        : undefined;
  const primaryKey = primary === arrival ? "p6.arrive" : "p6.start";
  const venue = placeLabel(facts.venue);
  const currentPlace =
    context === "TODAY"
      ? (arrival?.place ?? facts.entryPlace ?? facts.venue)
      : facts.venue;
  const map =
    context === "PAST" || !currentPlace
      ? null
      : transportMapUrl(
          { date: facts.start.date, place: currentPlace },
          context === "TODAY",
        );
  const openMap = () => {
    if (!map) return;
    setMapUnavailable(false);
    void Linking.openURL(map).catch(() => setMapUnavailable(true));
  };
  const admission = ownAdmissionLine(facts.ownAdmission);
  const browseDetail = facts.admissionLine || admission || arrival?.label;
  const tickets = unique(facts.tickets);
  return (
    <View style={[styles.row, immersive && styles.immersive]}>
      {!immersive && ((primary.time && !primary.plannedUnresolved) || withinMarker) ? (
        <View style={[styles.rail, { width: timeRailWidth(fontScale) }]}>
          {primary.time && !primary.plannedUnresolved ? (
            <Text style={styles.meta}>{primary.time}</Text>
          ) : null}
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
            <UiButton label={t("p6.edit")} variant="text" onPress={facts.onEdit} />
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
              label={t("p6.viewAllPhotos")}
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
        {facts.session ? <Text style={styles.meta}>{facts.session}</Text> : null}
        {venue ? <Text style={styles.meta}>{venue}</Text> : null}
        <Text style={styles.body}>
          {t(primaryKey)} · {clockLabel(primary)}
        </Text>
        {primary.plannedUnresolved && primary.time ? (
          <Text style={styles.meta}>{t("p6.plannedUnresolved")}</Text>
        ) : null}
        {secondary ? (
          <Text style={styles.meta}>
            {t(context === "PAST" ? "p6.arrive" : "p6.start")} · {clockLabel(secondary)}
          </Text>
        ) : null}
        {context !== "PAST" && browseDetail ? (
          <Text style={styles.meta} numberOfLines={1}>
            {browseDetail}
          </Text>
        ) : null}
        {context === "PAST" && facts.photos?.count ? (
          <Text style={styles.meta}>
            {t("p6.photoCount", { count: facts.photos.count })}
          </Text>
        ) : null}
      </Pressable>
      {focused || immersive ? (
        <>
          {arrival ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("p6.arrive")}</Text>
              <Text style={styles.body}>{clockLabel(arrival)}</Text>
              {placeLabel(arrival.place) ? (
                <Text style={styles.meta}>{placeLabel(arrival.place)}</Text>
              ) : null}
              {arrival.label ? <Text style={styles.meta}>{arrival.label}</Text> : null}
            </View>
          ) : null}
          {!arrival && placeLabel(facts.entryPlace) ? (
            <Text style={styles.meta}>
              {t("p6.entryPlace")} · {placeLabel(facts.entryPlace)}
            </Text>
          ) : null}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("p6.start")}</Text>
            <Text style={styles.body}>{clockLabel(facts.start)}</Text>
            {facts.start.plannedUnresolved && facts.start.time ? (
              <Text style={styles.meta}>{t("p6.plannedUnresolved")}</Text>
            ) : null}
          </View>
          {admission ? <Text style={styles.body}>{admission}</Text> : null}
          {focused && context !== "PAST" ? (
            <Originals
              entries={tickets}
              label={t("p6.showTicket")}
              chooser={t("p6.chooseTicket")}
            />
          ) : null}
          {map ? (
            <UiButton
              label={t(context === "TODAY" ? "p6.directions" : "p6.viewMap")}
              variant="text"
              onPress={openMap}
            />
          ) : null}
          {mapUnavailable ? (
            <Text style={styles.meta}>{t("p6.mapUnavailable")}</Text>
          ) : null}
          {focused && context !== "TODAY" ? (
            <Originals
              entries={facts.bookings}
              label={t("p6.booking")}
              chooser={t("p6.chooseBooking")}
            />
          ) : null}
          {focused && context === "PAST" ? (
            <Originals
              entries={tickets}
              label={t("p6.ticketOriginal")}
              chooser={t("p6.chooseTicket")}
            />
          ) : null}
          {focused && context === "PAST"
            ? facts.participants?.slice(0, 3).map((person) => (
                <Text key={person.id} style={styles.meta}>
                  {participantLine(person)}
                </Text>
              ))
            : null}
          {focused && context === "PAST" && (facts.participants?.length ?? 0) > 3 ? (
            <Text style={styles.meta}>
              {t("p6.moreParticipants", { count: facts.participants!.length - 3 })}
            </Text>
          ) : null}
          {context === "PAST" && facts.photos?.count ? (
            <Text style={styles.meta}>
              {t("p6.photoCount", { count: facts.photos.count })}
            </Text>
          ) : null}
          {context === "PAST" && facts.expenseCount ? (
            <Text style={styles.meta}>
              {t("p6.expenseCount", { count: facts.expenseCount })}
            </Text>
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
          {facts.participants?.map((person) => (
            <Text key={person.id} style={styles.meta}>
              {participantLine(person)}
            </Text>
          ))}
          {tickets.map((ticket) => (
            <View key={ticket.id} style={styles.section}>
              <UiButton label={ticket.title} variant="text" onPress={ticket.onOpen} />
              {ticket.coveredParticipants?.map((name) => (
                <Text key={name} style={styles.meta}>
                  {name}
                </Text>
              ))}
            </View>
          ))}
          <Originals
            entries={facts.bookings}
            label={t("p6.booking")}
            chooser={t("p6.chooseBooking")}
          />
          <Originals
            entries={facts.documents}
            label={t("p6.documents")}
            chooser={t("p6.chooseDocument")}
          />
          {facts.expenseSummary ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("p6.total")}</Text>
              <MoneyText {...facts.expenseSummary.total} variant="standard" />
              {facts.expenseSummary.originals?.map((amount, index) => (
                <MoneyText key={index} {...amount} variant="compact" />
              ))}
              {facts.expenseSummary.myShare ? (
                <>
                  <Text style={styles.sectionTitle}>{t("p6.myShare")}</Text>
                  <MoneyText {...facts.expenseSummary.myShare} variant="standard" />
                </>
              ) : null}
            </View>
          ) : null}
          {facts.onUpdateFromDocument ? (
            <UiButton
              label={t("p6.updateFromDocument")}
              variant="text"
              onPress={facts.onUpdateFromDocument}
            />
          ) : null}
          {facts.onEditExpense ? (
            <UiButton
              label={t("p6.editExpense")}
              variant="text"
              onPress={facts.onEditExpense}
            />
          ) : null}
          {facts.onAddPhoto ? (
            <UiButton
              label={t("p6.addPhoto")}
              variant="text"
              onPress={facts.onAddPhoto}
            />
          ) : null}
          {facts.onAddAttachment ? (
            <UiButton
              label={t("p6.addAttachment")}
              variant="text"
              onPress={facts.onAddAttachment}
            />
          ) : null}
          {facts.onAddExpense ? (
            <UiButton
              label={t("p6.addExpense")}
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
