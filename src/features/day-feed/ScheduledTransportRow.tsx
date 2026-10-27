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
import { PendingSyncDot } from "./PendingSyncDot";
import { AppIcon } from "@/components/AppIcon";
import {
  transportMapUrl,
  transportPlaceLabel as endpointLabel,
} from "./transportReadPresentation";
import { BookingCard, BookingGlyph, BookingInsert } from "./BookingReadUi";
import { ImmersiveActions } from "./ImmersiveActions";
import type { CorePlaceView } from "@/domain/trip/tripCoreV2Day";
import { MoneyText } from "@/features/ledger/MoneyText";
import { UiButton } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { DayRowRendererProps } from "./rendererContribution";
import { timeRailWidth } from "./visualTokens";
export { transportMapUrl } from "./transportReadPresentation";

type Endpoint = Readonly<{
  date?: string;
  zone?: string;
  time?: string;
  plannedUnresolved?: boolean;
  place?: CorePlaceView;
}>;
type Openable = Readonly<{
  id: string;
  title: string;
  onOpen?: () => void;
  access?: "availableOffline" | "onlineRequired" | "notDownloaded" | "unavailable";
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
  pending?: boolean;
  origin: Endpoint;
  destination: Endpoint;
  subtype?: string;
  operator?: string;
  service?: string;
  duration?: string;
  note?: string;
  participants?: readonly string[];
  participationMode?: "WHOLE_GROUP";
  dynamicBoarding?: readonly Readonly<{
    label: string;
    value: string;
    language?: string;
    evidence?: string;
    semantic?: string;
  }>[];
  instructions?: string;
  onCall?: () => void;
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
  onLinkExpense?: () => void;
}>;

const civil = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const endpointTime = (endpoint: Endpoint) =>
  [endpoint.date ? civil(endpoint.date) : null, endpoint.time]
    .filter(Boolean)
    .join(" · ");

// Authored calendar dates label overnight travel; this is not elapsed duration.
export function transportDayOffset(
  origin: string | undefined,
  destination: string | undefined,
): number {
  if (!origin || !destination) return 0;
  const a = Date.parse(`${origin}T00:00:00Z`),
    b = Date.parse(`${destination}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : 0;
}
export function transportMode(subtype: string | undefined) {
  switch (subtype) {
    case "TRAIN":
      return { key: "p5.mode.train", icon: "tram.fill" } as const;
    case "BUS":
    case "COACH":
      return { key: "p5.mode.bus", icon: "bus.fill" } as const;
    case "FERRY":
      return { key: "p5.mode.ferry", icon: "ferry.fill" } as const;
    case "WATER_TAXI":
      return { key: "p5.mode.waterTaxi", icon: "ferry" } as const;
    case "SHUTTLE":
      return { key: "p5.mode.shuttle", icon: "bus" } as const;
    case "TRANSFER":
    case "PRIVATE_TRANSFER":
      return { key: "p5.mode.privateTransfer", icon: "car.fill" } as const;
    case "TAXI":
    case "RIDESHARE":
      return {
        key: "p5.mode.taxi",
        icon: "car.side.fill",
      } as const;
    case "CABLE_CAR":
    case "GONDOLA":
      return { key: "p5.mode.cableCar", icon: "cablecar.fill" } as const;
    default:
      return {
        key: "p5.mode.other",
        icon: "point.topleft.down.to.point.bottomright.curvepath",
      } as const;
  }
}

const unique = (entries: readonly Openable[] | undefined) => [
  ...new Map(entries?.map((entry) => [entry.id, entry]) ?? []).values(),
];
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
  prominent = false,
  showTitle = false,
}: {
  entries?: readonly Openable[];
  label: string;
  chooseLabel: string;
  prominent?: boolean;
  showTitle?: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const styles = useThemedStyles(createStyles);
  const items = unique(entries);
  if (!items.length) return null;
  const direct = items.length === 1 && !items[0].requiresSelection;
  const allowed = (item: Openable) =>
    !!item.onOpen && item.access !== "notDownloaded" && item.access !== "unavailable";
  return (
    <View>
      <UiButton
        label={direct ? label : chooseLabel}
        variant={prominent ? "secondary" : "text"}
        disabled={direct && !allowed(items[0])}
        onPress={() => (direct ? items[0].onOpen?.() : setChoosing(!choosing))}
      />
      {direct && showTitle ? <Text style={styles.meta}>{items[0].title}</Text> : null}
      {direct && items[0].access ? (
        <Text style={styles.meta}>{t(`p5.access.${items[0].access}`)}</Text>
      ) : null}
      {choosing
        ? items.map((item) => (
            <UiButton
              key={item.id}
              label={item.title}
              variant="secondary"
              disabled={!allowed(item)}
              onPress={() => {
                setChoosing(false);
                item.onOpen?.();
              }}
            />
          ))
        : null}
    </View>
  );
}

export function ScheduledTransportRow(
  props: DayRowRendererProps & {
    facts: ScheduledTransportFacts;
    onInsert?(side: "BEFORE" | "AFTER"): void;
  },
) {
  const roles = props.row.coreRowKeys.map((key) => key.projectionRole);
  return (
    <ScheduledTransportContent
      {...props}
      arrival={roles.includes("DESTINATION") && !roles.includes("ORIGIN")}
    />
  );
}
export function ScheduledTransportContent({
  depth,
  context = "UNKNOWN",
  onDepth,
  withinMarker,
  facts,
  arrival: arrivalProjection = false,
  onInsert,
}: Pick<DayRowRendererProps, "depth" | "context" | "onDepth" | "withinMarker"> & {
  facts: ScheduledTransportFacts;
  arrival?: boolean;
  onInsert?(side: "BEFORE" | "AFTER"): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const { fontScale } = useWindowDimensions();
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const focused = depth === "F",
    immersive = depth === "I";
  const arrival = !immersive && arrivalProjection;
  const sparse =
    !endpointLabel(facts.origin)?.trim() || !endpointLabel(facts.destination)?.trim();
  const mode = transportMode(facts.subtype);
  const offset = transportDayOffset(facts.origin.date, facts.destination.date);
  const current = arrival ? facts.destination : facts.origin;
  const departureMap =
    context !== "TODAY" && context !== "FUTURE"
      ? null
      : (transportMapUrl(facts.origin, context === "TODAY") ??
        transportMapUrl(facts.origin, false));
  const boarding = facts.boarding;
  const boardingParts = [
    boarding?.platform ? t("p5.platform", { value: boarding.platform }) : null,
    boarding?.bay ? t("p5.bay", { value: boarding.bay }) : null,
    boarding?.pier ? t("p5.pier", { value: boarding.pier }) : null,
    boarding?.coach ? t("p5.coach", { value: boarding.coach }) : null,
    boarding?.seat ? t("p5.seat", { value: boarding.seat }) : null,
    ...(facts.dynamicBoarding?.map((field) => `${field.label} · ${field.value}`) ?? []),
  ].filter(Boolean);
  const openMap = (url: string) => {
    setMapUnavailable(false);
    void Linking.openURL(url).catch(() => setMapUnavailable(true));
  };
  const endpoint = (label: string, value: Endpoint, directions: boolean) => {
    const place = endpointLabel(value);
    const address =
      value.place?.acceptedAddress?.trim() || value.place?.authoredAddress?.trim();
    if (!value.date && !value.time && !place && !address) return null;
    const exact = directions ? transportMapUrl(value, true) : null;
    const map =
      context === "TODAY" || context === "FUTURE"
        ? (exact ?? transportMapUrl(value, false))
        : null;
    return (
      <View style={styles.endpointDetail}>
        <View style={styles.endpointFacts}>
          <Text style={styles.meta}>{label}</Text>
          {endpointTime(value) ? (
            <Text style={styles.endpointDate}>{endpointTime(value)}</Text>
          ) : null}
          {place ? <Text style={styles.meta}>{place}</Text> : null}
          {address && address !== place ? (
            <Text style={styles.meta}>{address}</Text>
          ) : null}
          {value.zone ? <Text style={styles.meta}>{value.zone}</Text> : null}
          {value.time && value.plannedUnresolved ? (
            <Text style={styles.meta}>{t("p6.plannedUnresolved")}</Text>
          ) : null}
        </View>
        {map ? (
          <BookingGlyph kind={exact ? "navigate" : "map"} onPress={() => openMap(map)} />
        ) : null}
      </View>
    );
  };
  const compactSummary = (
    <View style={styles.compact}>
      <View style={[styles.rail, { width: timeRailWidth(fontScale) }]}>
        {arrival ? (
          <Text style={styles.arrivalClock}>
            {t(current.time ? "fidelity.endAt" : "fidelity.end")}
          </Text>
        ) : null}
        {current.time ? (
          <Text style={styles.departureClock}>{current.time}</Text>
        ) : !arrival ? (
          <AppIcon name={mode.icon} color={colors.textSecondary} size={20} />
        ) : null}
        {!arrival && facts.destination.time ? (
          <Text style={styles.arrivalClock}>
            {facts.destination.time}
            {offset ? (
              <Text style={styles.offset}>
                {offset > 0 ? `+${offset}` : String(offset)}
              </Text>
            ) : null}
          </Text>
        ) : null}
        {withinMarker}
      </View>
      {sparse ? (
        <View style={styles.sparse}>
          <Text style={styles.title}>
            {facts.title}
            {facts.pending ? <PendingSyncDot /> : null}
          </Text>
          <Text style={styles.meta}>
            {endpointLabel(facts.origin) ??
              (facts.origin.date ? civil(facts.origin.date) : null)}
          </Text>
        </View>
      ) : (
        <View style={styles.route}>
          <Text style={styles.endpoint}>{endpointLabel(facts.origin)}</Text>
          <View style={styles.service}>
            {facts.service ? (
              <Text style={styles.serviceLabel}>
                {facts.service}
                {facts.pending ? <PendingSyncDot /> : null}
              </Text>
            ) : null}
            <View style={styles.glyph} accessibilityLabel={t(mode.key)}>
              <View style={styles.rule} />
              <AppIcon name={mode.icon} color={colors.accent} size={16} />
              <View style={styles.rule} />
            </View>
            {facts.duration ? (
              <Text style={styles.arrivalClock}>{facts.duration}</Text>
            ) : null}
          </View>
          <Text style={[styles.endpoint, styles.destination]}>
            {endpointLabel(facts.destination)}
          </Text>
        </View>
      )}
    </View>
  );
  if (immersive) {
    const participants =
      facts.participants ??
      (facts.participationMode === "WHOLE_GROUP" ? [t("tripCreate.planEveryone")] : []);
    const start = facts.origin.date,
      end = facts.destination.date;
    const dateRange = [
      start ? civil(start) : null,
      end && end !== start ? civil(end) : null,
    ]
      .filter(Boolean)
      .join(" – ");
    const departure = endpoint(
      t("p5.departureScheduled"),
      facts.origin,
      context === "TODAY",
    );
    const destination = endpoint(t("p5.arrivalScheduled"), facts.destination, false);
    const photos = facts.photos;
    const hasPhotos = !!photos?.count;
    const photoCard = hasPhotos ? (
      <BookingCard title={t("fidelity.photosTitle")}>
        {context === "PAST" && photos!.previews.length ? (
          <View style={styles.photos}>
            {photos!.previews.slice(0, 3).map((photo) => (
              <Image key={photo.id} source={{ uri: photo.uri }} style={styles.photo} />
            ))}
          </View>
        ) : (
          <Text style={styles.meta}>{t("p5.photoCount", { count: photos!.count })}</Text>
        )}
        {photos!.onViewAll &&
        (context !== "PAST" || photos!.count > 3 || !photos!.previews.length) ? (
          <UiButton
            label={t("p5.viewAllPhotos")}
            variant="text"
            onPress={photos!.onViewAll}
          />
        ) : null}
      </BookingCard>
    ) : null;
    const ticketCard = unique(facts.tickets).length ? (
      <BookingCard title={t("p5.tickets")}>
        <Openables
          entries={facts.tickets}
          label={t(
            context === "PAST"
              ? "p5.ticketOriginal"
              : context === "TODAY"
                ? "p5.showTicket"
                : "p5.ticket",
          )}
          chooseLabel={t("p5.chooseTicket")}
          prominent={context === "TODAY"}
          showTitle
        />
      </BookingCard>
    ) : null;
    const originals = unique(facts.documents),
      bookings = unique(facts.bookings),
      related = unique(facts.relatedSegments);
    return (
      <View style={styles.immersiveBody}>
        <View style={styles.immersiveHeading}>
          <View style={styles.modeHeading}>
            <AppIcon name={mode.icon} color={colors.accent} size={18} />
            <Text style={styles.modeLabel}>
              {[t(mode.key), facts.operator].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Text style={styles.bigTitle}>
            {facts.title}
            {facts.pending ? <PendingSyncDot /> : null}
          </Text>
          {dateRange ? <Text style={styles.meta}>{dateRange}</Text> : null}
        </View>
        {context === "PAST" ? photoCard : null}
        <BookingCard>
          {compactSummary}
          {context !== "TODAY" ? (
            <>
              {departure}
              {destination}
            </>
          ) : null}
        </BookingCard>
        {boardingParts.length || facts.instructions?.trim() ? (
          <BookingCard title={t("p5.boarding")}>
            {boardingParts.map((part, index) => (
              <Text key={index} style={styles.meta}>
                {part}
              </Text>
            ))}
            {facts.instructions?.trim() ? (
              <Text style={styles.note}>{facts.instructions}</Text>
            ) : null}
          </BookingCard>
        ) : null}
        {ticketCard}
        {context === "TODAY" && (departure || destination) ? (
          <BookingCard>
            {departure}
            {destination}
          </BookingCard>
        ) : null}
        {facts.passengers?.length ? (
          <BookingCard title={t("p5.passengers")}>
            {facts.passengers.map((person) => (
              <Text key={person.id} style={styles.meta}>
                {passengerLabel(person)}
              </Text>
            ))}
          </BookingCard>
        ) : null}
        {facts.bookingMarker || originals.length || bookings.length || related.length ? (
          <BookingCard title={t("p5.bookingDocuments")}>
            {facts.bookingMarker ? (
              <Text style={styles.meta}>
                {t("p5.bookingMarker", { name: facts.bookingMarker })}
              </Text>
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
            {related.length ? (
              <>
                <Text style={styles.sectionTitle}>{t("p5.relatedSegments")}</Text>
                {related.map((segment) => (
                  <UiButton
                    key={segment.id}
                    label={segment.title}
                    variant="text"
                    disabled={!segment.onOpen}
                    onPress={segment.onOpen ?? (() => {})}
                  />
                ))}
              </>
            ) : null}
          </BookingCard>
        ) : null}
        {participants.length ? (
          <BookingCard title={t("tripCreate.planParticipants")}>
            <View style={styles.tags}>
              {participants.map((name, index) => (
                <Text key={index} style={styles.tag}>
                  {name}
                </Text>
              ))}
            </View>
          </BookingCard>
        ) : null}
        {facts.note?.trim() ? (
          <BookingCard title={t("fidelity.note")}>
            <Text style={styles.note}>{facts.note}</Text>
          </BookingCard>
        ) : null}
        {facts.onCall && context !== "PAST" ? (
          <BookingCard title={t("p5.contact")}>
            <BookingGlyph kind="contact" onPress={facts.onCall} />
          </BookingCard>
        ) : null}
        {context !== "PAST" ? photoCard : null}
        {facts.expenseSummary || facts.expenseCount ? (
          <BookingCard title={t("fidelity.expensesTitle")}>
            {facts.expenseSummary ? (
              <>
                <View style={styles.costGrid}>
                  <View style={styles.costColumn}>
                    <Text style={styles.meta}>{t("p5.total")}</Text>
                    <MoneyText {...facts.expenseSummary.total} variant="standard" />
                  </View>
                  {facts.expenseSummary.myShare ? (
                    <View style={styles.costColumn}>
                      <Text style={styles.meta}>{t("p5.myShare")}</Text>
                      <MoneyText {...facts.expenseSummary.myShare} variant="standard" />
                    </View>
                  ) : null}
                </View>
                {facts.expenseSummary.originals?.map((amount, index) => (
                  <MoneyText key={index} {...amount} variant="compact" />
                ))}
                {facts.expenseSummary.coverage ? (
                  <Text style={styles.meta}>{facts.expenseSummary.coverage}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.meta}>
                {t("p5.expenseCount", { count: facts.expenseCount! })}
              </Text>
            )}
            {facts.onEditExpense ? (
              <UiButton
                label={t("p5.editExpense")}
                variant="text"
                onPress={facts.onEditExpense}
              />
            ) : null}
          </BookingCard>
        ) : null}
        {mapUnavailable ? (
          <Text style={styles.meta}>{t("p5.mapUnavailable")}</Text>
        ) : null}
        {facts.onUpdateFromDocument ? (
          <UiButton
            label={t("p5.updateFromDocument")}
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
  }
  const insert = focused && (context === "TODAY" || context === "FUTURE") && onInsert;
  return (
    <View>
      {insert ? <BookingInsert side="BEFORE" onPress={() => insert("BEFORE")} /> : null}
      <View
        style={[styles.row, focused && styles.focused, immersive && styles.immersive]}
      >
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
          {compactSummary}
        </Pressable>
        {focused ? (
          <View style={!immersive ? styles.expansion : styles.section}>
            {!sparse ? (
              <View style={styles.section}>
                <Text style={styles.title}>
                  {facts.title}
                  {facts.pending ? <PendingSyncDot /> : null}
                </Text>
                <Text style={styles.meta}>
                  {[t(mode.key), facts.operator].filter(Boolean).join(" · ")}
                </Text>
              </View>
            ) : null}
            {facts.participants?.length ? (
              <View style={styles.tags}>
                {facts.participants.map((name, index) => (
                  <Text key={index} style={styles.tag}>
                    {name}
                  </Text>
                ))}
              </View>
            ) : null}
            {boardingParts.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("p5.boarding")}</Text>
                <Text style={styles.body}>{boardingParts.join(" · ")}</Text>
              </View>
            ) : null}
            {facts.instructions?.trim() ? (
              <Text style={styles.meta}>{facts.instructions}</Text>
            ) : null}
            {facts.passengers?.length && context !== "PAST"
              ? facts.passengers.map((person) => (
                  <Text key={person.id} style={styles.meta}>
                    {passengerLabel(person)}
                  </Text>
                ))
              : null}
            {facts.bookingMarker ? (
              <Text style={styles.meta}>
                {t("p5.bookingMarker", { name: facts.bookingMarker })}
              </Text>
            ) : null}
            {context === "TODAY" ? (
              <Openables
                entries={facts.tickets}
                label={t("p5.showTicket")}
                prominent
                chooseLabel={t("p5.chooseTicket")}
              />
            ) : null}
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
              <View style={styles.actions}>
                <BookingGlyph kind="detail" onPress={() => onDepth("I")} />
                {departureMap ? (
                  <BookingGlyph
                    kind={
                      context === "TODAY" && transportMapUrl(facts.origin, true)
                        ? "navigate"
                        : "map"
                    }
                    onPress={() => openMap(departureMap)}
                  />
                ) : null}
                {context !== "PAST" && facts.onCall ? (
                  <BookingGlyph kind="contact" onPress={facts.onCall} />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {insert ? <BookingInsert side="AFTER" onPress={() => insert("AFTER")} /> : null}
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
    focused: {
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      borderRadius: visual.radius.card,
      padding: 11,
    },
    immersive: { flex: 1, borderBottomWidth: 0 },
    immersiveBody: { gap: visual.space.row, paddingVertical: visual.space.row },
    immersiveHeading: { gap: visual.space.heading, paddingVertical: visual.space.row },
    modeHeading: { flexDirection: "row", gap: 8, alignItems: "center" },
    modeLabel: { ...visual.type.action, color: c.accent },
    endpointDetail: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingTop: visual.space.row,
    },
    endpointFacts: { flex: 1, gap: visual.space.heading },
    endpointDate: { ...visual.type.row, color: c.textPrimary },
    note: { ...visual.type.row, fontWeight: "400", color: c.textPrimary },
    costGrid: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.row },
    costColumn: { flexGrow: 1, gap: visual.space.heading },
    compact: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    rail: { alignSelf: "flex-start", gap: 3 },
    departureClock: { ...visual.type.meta, fontWeight: "700", color: c.textSecondary },
    arrivalClock: { fontSize: 11, color: c.textSecondary },
    offset: { fontSize: 10, fontWeight: "700", color: c.accent },
    route: { flex: 1, flexDirection: "row", gap: 8, alignItems: "flex-start" },
    endpoint: { flex: 1, fontSize: 15, fontWeight: "600", color: c.textPrimary },
    destination: { textAlign: "right" },
    service: { width: 52, alignItems: "center", gap: 3 },
    serviceLabel: { ...visual.type.meta, fontWeight: "600", color: c.textPrimary },
    glyph: { flexDirection: "row", alignItems: "center", gap: 4 },
    rule: { width: 8, height: StyleSheet.hairlineWidth, backgroundColor: c.separator },
    sparse: { flex: 1, gap: 6 },
    expansion: { marginLeft: 60, gap: 8 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    tag: {
      ...visual.type.meta,
      color: c.accent,
      backgroundColor: c.selected,
      borderRadius: visual.radius.control,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    hit: { minHeight: 44, gap: visual.space.heading },
    title: { ...visual.type.section, color: c.textPrimary },
    bigTitle: { ...visual.type.metric, color: c.textPrimary },
    body: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    section: { gap: visual.space.heading },
    sectionTitle: { ...visual.type.section, color: c.textPrimary },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
    iconAction: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    photo: { width: 92, height: 92, borderRadius: visual.radius.control },
  });
