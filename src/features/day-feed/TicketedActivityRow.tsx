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
import { AppIcon } from "@/components/AppIcon";
import { MoneyText } from "@/features/ledger/MoneyText";
import { UiButton } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { DayRowRendererProps } from "./rendererContribution";
import { timeRailWidth } from "./visualTokens";
import { transportMapUrl } from "./transportReadPresentation";
import { BookingCard, BookingGlyph, BookingInsert } from "./BookingReadUi";
import { ImmersiveActions } from "./ImmersiveActions";
import { PendingSyncDot } from "./PendingSyncDot";

type Clock = Readonly<{
  date: string;
  time?: string;
  zone?: string;
  plannedUnresolved?: boolean;
}>;
type Openable = Readonly<{
  id: string;
  title: string;
  onOpen?: () => void;
  requiresSelection?: boolean;
  access?: "availableOffline" | "onlineRequired" | "notDownloaded" | "unavailable";
  coveredParticipants?: readonly string[];
}>;
type MoneyAmount = Readonly<{ minor: number; currency: string; scale: number }>;
type Participant = Readonly<{
  id: string;
  name: string;
  entrance?: string;
  section?: string;
  row?: string;
  seat?: string;
}>;
export type TicketedActivityFacts = Readonly<{
  family: "P6";
  title: string;
  pending?: boolean;
  start: Clock;
  end?: Partial<Clock>;
  venue?: CorePlaceView;
  entryPlace?: CorePlaceView;
  // Only an explicit required-arrival fact may displace the displayed start clock.
  requiredArrival?: Clock & Readonly<{ label?: string; place?: CorePlaceView }>;
  session?: string;
  admissionLine?: string;
  ownAdmission?: Readonly<{
    entrance?: string;
    section?: string;
    row?: string;
    seat?: string;
  }>;
  tickets?: readonly Openable[];
  bookings?: readonly Openable[];
  documents?: readonly Openable[];
  participants?: readonly Participant[];
  participationMode?: "WHOLE_GROUP";
  participantNames?: readonly string[];
  instructions?: string;
  note?: string;
  dynamicAdmission?: readonly Readonly<{
    label: string;
    value: string;
    language?: string;
    semantic?: string;
    evidence?: string;
  }>[];
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
  onCall?: () => void;
  onEdit?: () => void;
  onUpdateFromDocument?: () => void;
  onEditExpense?: () => void;
  onAddPhoto?: () => void;
  onAddAttachment?: () => void;
  onAddExpense?: () => void;
  onLinkExpense?: () => void;
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
  place?.authoredLabel ||
  place?.authoredText ||
  place?.acceptedAddress ||
  place?.authoredAddress;
const ownAdmissionLine = (person: TicketedActivityFacts["ownAdmission"]) =>
  [
    person?.entrance ? t("p6.entrance", { value: person.entrance }) : null,
    person?.section ? t("p6.section", { value: person.section }) : null,
    person?.row ? t("p6.row", { value: person.row }) : null,
    person?.seat ? t("p6.seat", { value: person.seat }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
const participantLine = (person: Participant) =>
  [person.name, ownAdmissionLine(person)].filter(Boolean).join(" · ");
const canOpen = (entry: Openable) =>
  !!entry.onOpen && entry.access !== "unavailable" && entry.access !== "notDownloaded";
function Originals({
  entries,
  label,
  chooser,
  prominent = false,
}: {
  entries?: readonly Openable[];
  label: string;
  chooser: string;
  prominent?: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const items = unique(entries);
  const styles = useThemedStyles(createStyles);
  if (!items.length) return null;
  const direct = items.length === 1 && !items[0].requiresSelection;
  return (
    <View style={styles.section}>
      <UiButton
        label={direct ? label : chooser}
        variant={prominent ? "primary" : "text"}
        disabled={direct && !canOpen(items[0])}
        onPress={() =>
          direct ? canOpen(items[0]) && items[0].onOpen?.() : setChoosing(!choosing)
        }
      />
      {direct && items[0].access ? (
        <Text style={styles.meta}>{t(`p5.access.${items[0].access}`)}</Text>
      ) : null}
      {choosing
        ? items.map((entry) => (
            <View key={entry.id}>
              <UiButton
                label={entry.title}
                variant="secondary"
                disabled={!canOpen(entry)}
                onPress={() => {
                  if (canOpen(entry)) {
                    setChoosing(false);
                    entry.onOpen?.();
                  }
                }}
              />
              {entry.access ? (
                <Text style={styles.meta}>{t(`p5.access.${entry.access}`)}</Text>
              ) : null}
            </View>
          ))
        : null}
    </View>
  );
}
export function TicketedActivityContent({
  facts,
  context = "UNKNOWN",
  depth,
  onDepth,
  withinMarker,
  ending = false,
  onInsert,
}: Pick<DayRowRendererProps, "context" | "depth" | "onDepth" | "withinMarker"> & {
  facts: TicketedActivityFacts;
  ending?: boolean;
  onInsert?(side: "BEFORE" | "AFTER"): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const { fontScale } = useWindowDimensions();
  const [mapUnavailable, setMapUnavailable] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [peopleOpen, setPeopleOpen] = useState(false);
  const focused = depth === "F",
    immersive = depth === "I",
    past = context === "PAST";
  const arrival = facts.requiredArrival;
  const primary =
    ending && facts.end?.date
      ? (facts.end as Clock)
      : past
        ? facts.start.time
          ? facts.start
          : (arrival ?? facts.start)
        : (arrival ?? facts.start);
  const secondary = ending
    ? undefined
    : !past && arrival && facts.start.time
      ? facts.start
      : past && facts.start.time
        ? arrival
        : undefined;
  const currentPlace =
    context === "TODAY"
      ? (arrival?.place ?? facts.entryPlace ?? facts.venue)
      : facts.venue;
  const exactMap =
    context === "TODAY" && currentPlace
      ? transportMapUrl({ place: currentPlace }, true)
      : null;
  const map =
    !past && currentPlace
      ? (exactMap ?? transportMapUrl({ place: currentPlace }, false))
      : null;
  const openMap = () => {
    if (map) {
      setMapUnavailable(false);
      void Linking.openURL(map).catch(() => setMapUnavailable(true));
    }
  };
  const admission = ownAdmissionLine(facts.ownAdmission);
  const venue = placeLabel(facts.venue);
  const tickets = unique(facts.tickets),
    bookings = unique(facts.bookings),
    documents = unique(facts.documents);
  const people = facts.participants ?? [];
  const participantNames =
    facts.participationMode === "WHOLE_GROUP"
      ? [t("tripCreate.planEveryone")]
      : (facts.participantNames ?? []);
  const dynamic = facts.dynamicAdmission ?? [];
  const hasAdmission = !!(
    arrival ||
    facts.instructions?.trim() ||
    dynamic.length ||
    placeLabel(facts.entryPlace)
  );
  const admissionContent = (
    <View style={styles.section}>
      {arrival ? (
        <>
          <Text style={styles.body}>
            {t("p6.arrive")} · {clockLabel(arrival)}
          </Text>
          {placeLabel(arrival.place) ? (
            <Text style={styles.meta}>{placeLabel(arrival.place)}</Text>
          ) : null}
        </>
      ) : null}
      {!arrival?.place && placeLabel(facts.entryPlace) ? (
        <Text style={styles.meta}>
          {t("p6.entryPlace")} · {placeLabel(facts.entryPlace)}
        </Text>
      ) : null}
      {facts.instructions?.trim() ? (
        <Text style={styles.body}>{facts.instructions}</Text>
      ) : null}
      {dynamic.map((field, i) => (
        <Text key={i} style={styles.meta}>
          {field.label} · {field.value}
        </Text>
      ))}
    </View>
  );
  const photoCard =
    facts.photos?.count && facts.photos.previews.length ? (
      <BookingCard title={t("fidelity.photosTitle")}>
        <View style={styles.photos}>
          {facts.photos.previews.slice(0, 3).map((photo) => (
            <Image key={photo.id} source={{ uri: photo.uri }} style={styles.photo} />
          ))}
        </View>
        {facts.photos.count > 3 && facts.photos.onViewAll ? (
          <UiButton
            label={t("p6.viewAllPhotos")}
            variant="text"
            onPress={facts.photos.onViewAll}
          />
        ) : null}
      </BookingCard>
    ) : null;
  const ticketCard = tickets.length ? (
    <BookingCard title={t("p6.tickets")}>
      <Originals
        entries={tickets}
        label={t(past ? "p6.ticketOriginal" : "p6.showTicket")}
        chooser={t("p6.chooseTicket")}
        prominent={context === "TODAY"}
      />
      {tickets.map((ticket) => (
        <View key={ticket.id} style={styles.section}>
          <Text style={styles.caption}>{ticket.title}</Text>
          {ticket.coveredParticipants?.map((name, i) => (
            <Text key={i} style={styles.meta}>
              {name}
            </Text>
          ))}
        </View>
      ))}
    </BookingCard>
  ) : null;
  const scheduleCard =
    facts.start.time ||
    facts.start.zone ||
    facts.end?.date ||
    facts.end?.time ||
    venue ? (
      <BookingCard title={t("p6.schedule")}>
        {facts.start.time ? (
          <Text style={styles.body}>
            {t("p6.start")} · {facts.start.time}
          </Text>
        ) : null}
        {facts.end?.date || facts.end?.time ? (
          <Text style={styles.meta}>
            {t("p6.end")} ·{" "}
            {facts.end.date && facts.end.date !== facts.start.date
              ? `${dateLabel(facts.end.date)} · `
              : ""}
            {facts.end.time}
          </Text>
        ) : null}
        {facts.start.zone ? <Text style={styles.meta}>{facts.start.zone}</Text> : null}
        {facts.end?.zone && facts.end.zone !== facts.start.zone ? (
          <Text style={styles.meta}>{facts.end.zone}</Text>
        ) : null}
        {venue ? <Text style={styles.body}>{venue}</Text> : null}
        {(facts.venue?.acceptedAddress || facts.venue?.authoredAddress) &&
        (facts.venue?.acceptedAddress || facts.venue?.authoredAddress) !== venue ? (
          <Text style={styles.meta}>
            {facts.venue?.acceptedAddress || facts.venue?.authoredAddress}
          </Text>
        ) : null}
        {map ? (
          <View style={styles.actions}>
            <BookingGlyph kind={exactMap ? "navigate" : "map"} onPress={openMap} />
          </View>
        ) : null}
      </BookingCard>
    ) : null;
  if (immersive)
    return (
      <View style={styles.immersive}>
        <View style={styles.identity}>
          <Text style={styles.kicker}>{t("fidelity.activity")}</Text>
          <Text style={styles.bigTitle}>
            {facts.title}
            {facts.pending ? <PendingSyncDot /> : null}
          </Text>
          <Text style={styles.meta}>{dateLabel(facts.start.date)}</Text>
          {facts.session ? <Text style={styles.meta}>{facts.session}</Text> : null}
        </View>
        {past ? photoCard : null}
        {context === "TODAY" && (venue || facts.start.time || hasAdmission) ? (
          <BookingCard title={t("p6.overview")}>
            {venue ? <Text style={styles.body}>{venue}</Text> : null}
            {facts.start.time ? (
              <Text style={styles.meta}>
                {t("p6.start")} · {facts.start.time}
              </Text>
            ) : null}
            {hasAdmission ? admissionContent : null}
          </BookingCard>
        ) : null}
        {context === "TODAY" ? ticketCard : null}
        {scheduleCard}
        {mapUnavailable ? (
          <Text style={styles.meta}>{t("p6.mapUnavailable")}</Text>
        ) : null}
        {hasAdmission && context !== "TODAY" ? (
          <BookingCard title={t(past ? "p6.historicalAdmission" : "p6.admissionDetails")}>
            {past ? (
              <UiButton
                label={t(historyOpen ? "p6.hideAdmission" : "p6.showAdmission")}
                variant="text"
                onPress={() => setHistoryOpen(!historyOpen)}
              />
            ) : null}
            {!past || historyOpen ? admissionContent : null}
          </BookingCard>
        ) : null}
        {context !== "TODAY" ? ticketCard : null}
        {people.length ? (
          <BookingCard title={t("p6.attendees")}>
            {people.map((person) => (
              <Text key={person.id} style={styles.meta}>
                {participantLine(person)}
              </Text>
            ))}
          </BookingCard>
        ) : null}
        {bookings.length || documents.length ? (
          <BookingCard title={t("p6.bookingDocuments")}>
            <Originals
              entries={bookings}
              label={t("p6.booking")}
              chooser={t("p6.chooseBooking")}
            />
            <Originals
              entries={documents}
              label={t("p6.documents")}
              chooser={t("p6.chooseDocument")}
            />
          </BookingCard>
        ) : null}
        {participantNames.length ? (
          <BookingCard title={t("tripCreate.planParticipants")}>
            <View style={styles.tags}>
              {participantNames.map((name, i) => (
                <Text key={i} style={styles.tag}>
                  {name}
                </Text>
              ))}
            </View>
          </BookingCard>
        ) : null}
        {facts.note?.trim() ? (
          <BookingCard title={t("fidelity.note")}>
            <Text style={styles.body}>{facts.note}</Text>
          </BookingCard>
        ) : null}
        {facts.onCall && !past ? (
          <BookingCard title={t("p3.contact")}>
            <BookingGlyph kind="contact" onPress={facts.onCall} />
          </BookingCard>
        ) : null}
        {!past ? photoCard : null}
        {facts.expenseSummary || facts.expenseCount ? (
          <BookingCard title={t("fidelity.expensesTitle")}>
            {facts.expenseSummary ? (
              <>
                <Text style={styles.caption}>{t("p6.total")}</Text>
                <MoneyText {...facts.expenseSummary.total} variant="standard" />
                {facts.expenseSummary.originals?.map((amount, i) => (
                  <MoneyText key={i} {...amount} variant="compact" />
                ))}
                {facts.expenseSummary.myShare ? (
                  <>
                    <Text style={styles.caption}>{t("p6.myShare")}</Text>
                    <MoneyText {...facts.expenseSummary.myShare} variant="standard" />
                  </>
                ) : null}
              </>
            ) : (
              <Text style={styles.meta}>
                {t("p6.expenseCount", { count: facts.expenseCount! })}
              </Text>
            )}
            {facts.onEditExpense ? (
              <UiButton
                label={t("p6.editExpense")}
                variant="text"
                onPress={facts.onEditExpense}
              />
            ) : null}
          </BookingCard>
        ) : null}
        {facts.onUpdateFromDocument ? (
          <UiButton
            label={t("p6.updateFromDocument")}
            variant="text"
            onPress={facts.onUpdateFromDocument}
          />
        ) : null}
        <ImmersiveActions
          actions={{
            addPhoto: facts.onAddPhoto,
            addAttachment: facts.onAddAttachment,
            addExpense: facts.onAddExpense,
            linkExpense: facts.onLinkExpense,
          }}
        />
      </View>
    );
  return (
    <View>
      {focused && !past && onInsert ? (
        <BookingInsert side="BEFORE" onPress={() => onInsert("BEFORE")} />
      ) : null}
      <View style={[styles.row, focused && styles.focus]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={facts.title}
          accessibilityHint={t(focused ? "p1r.collapseHint" : "p1r.focusHint")}
          onPress={() => onDepth(focused ? "B" : "F")}
          style={styles.hit}
        >
          <View style={[styles.rail, { width: timeRailWidth(fontScale) }]}>
            {ending ? (
              <Text style={styles.secondary}>
                {t(primary.time ? "fidelity.endAt" : "fidelity.end")}
              </Text>
            ) : null}
            {primary.time ? (
              <Text style={styles.clock}>{primary.time}</Text>
            ) : (
              <AppIcon name="ticket" size={18} color={colors.textSecondary} />
            )}
            {secondary?.time ? (
              <Text style={styles.secondary}>{secondary.time}</Text>
            ) : null}
            {withinMarker}
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>
              {facts.title}
              {facts.pending ? <PendingSyncDot /> : null}
            </Text>
            {venue ? <Text style={styles.meta}>{venue}</Text> : null}
            {!past && (facts.admissionLine || admission || arrival?.label) ? (
              <Text style={styles.meta} numberOfLines={1}>
                {[facts.admissionLine, admission || arrival?.label]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {focused ? (
          <View style={[styles.expansion, { marginLeft: timeRailWidth(fontScale) + 12 }]}>
            {!past && arrival ? (
              <Text style={styles.meta}>
                {t("p6.arrive")} · {clockLabel(arrival)}
              </Text>
            ) : null}
            {!past && arrival ? (
              <Text style={styles.meta}>
                {t("p6.start")} · {clockLabel(facts.start)}
              </Text>
            ) : null}
            {context === "TODAY" ? (
              <Originals
                entries={tickets}
                label={t("p6.showTicket")}
                chooser={t("p6.chooseTicket")}
                prominent
              />
            ) : null}
            {context !== "TODAY" ? (
              <Originals
                entries={tickets}
                label={t(past ? "p6.ticketOriginal" : "p6.showTicket")}
                chooser={t("p6.chooseTicket")}
              />
            ) : null}
            <Originals
              entries={bookings}
              label={t("p6.booking")}
              chooser={t("p6.chooseBooking")}
            />
            {past ? (
              <>
                {(peopleOpen ? people : people.slice(0, 3)).map((person) => (
                  <Text key={person.id} style={styles.meta}>
                    {participantLine(person)}
                  </Text>
                ))}
                {people.length > 3 ? (
                  <UiButton
                    label={t("p6.moreParticipants", { count: people.length - 3 })}
                    variant="text"
                    onPress={() => setPeopleOpen(!peopleOpen)}
                  />
                ) : null}
                {facts.photos?.count ? (
                  <Text style={styles.meta}>
                    {t("p6.photoCount", { count: facts.photos.count })}
                  </Text>
                ) : null}
                {facts.expenseCount ? (
                  <Text style={styles.meta}>
                    {t("p6.expenseCount", { count: facts.expenseCount })}
                  </Text>
                ) : null}
              </>
            ) : null}
            {mapUnavailable ? (
              <Text style={styles.meta}>{t("p6.mapUnavailable")}</Text>
            ) : null}
            <View style={styles.actions}>
              {!past && facts.onCall ? (
                <BookingGlyph kind="contact" onPress={facts.onCall} />
              ) : null}
              <BookingGlyph kind="detail" onPress={() => onDepth("I")} />
              {map ? (
                <BookingGlyph kind={exactMap ? "navigate" : "map"} onPress={openMap} />
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
      {focused && !past && onInsert ? (
        <BookingInsert side="AFTER" onPress={() => onInsert("AFTER")} />
      ) : null}
    </View>
  );
}
export function TicketedActivityRow(
  props: DayRowRendererProps & {
    facts: TicketedActivityFacts;
    onInsert?(side: "BEFORE" | "AFTER"): void;
  },
) {
  return (
    <TicketedActivityContent
      {...props}
      ending={props.row.coreRowKeys.some((key) => key.projectionRole === "END")}
    />
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    row: {
      paddingVertical: visual.space.row,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    focus: {
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: visual.radius.card,
      backgroundColor: c.surface,
      padding: visual.space.row,
    },
    hit: { minHeight: 44, flexDirection: "row", gap: 12 },
    rail: { gap: 3, alignSelf: "flex-start" },
    content: { flex: 1, gap: 6 },
    clock: { fontSize: 13, fontWeight: "700", color: c.textSecondary },
    secondary: { fontSize: 11, color: c.textSecondary },
    title: { fontSize: 15, fontWeight: "600", color: c.textPrimary },
    bigTitle: { ...visual.type.metric, color: c.textPrimary },
    body: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    caption: { ...visual.type.action, color: c.textPrimary },
    kicker: { ...visual.type.action, color: c.accent },
    immersive: { gap: visual.space.row, padding: visual.space.page },
    identity: { gap: visual.space.heading, paddingVertical: visual.space.row },
    section: { gap: visual.space.heading },
    expansion: { gap: 8, marginTop: 8 },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
    photos: { flexDirection: "row", gap: visual.space.heading },
    photo: { flex: 1, height: 70, borderRadius: visual.radius.control },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    tag: {
      ...visual.type.meta,
      color: c.accent,
      backgroundColor: c.selected,
      borderRadius: visual.radius.control,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
  });
