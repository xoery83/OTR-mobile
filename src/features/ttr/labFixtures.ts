import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { ttrFixture } from "@/domain/trip/__fixtures__/ttr";
import { ttrIdentityKey, type TtrInput, type TtrMode } from "@/domain/trip/ttr";
import {
  openTtr,
  projectTtr,
  reduceTtr,
  type TtrState,
  type TtrPresentationProjection,
} from "@/domain/trip/ttrState";
import { dayRowKey, type TransitionProjection } from "@/features/day-feed/composition";
import {
  collectFixtureContributions,
  type FixtureContribution,
} from "@/features/day-feed-lab/contribution";
import { place, scenario } from "@/features/day-feed-lab/fixtureFacts";
import { t } from "@/ui/locale";

export const ttrLabCases = [
  "STRAIGHT_LINE",
  "WALKING_NO_ETA",
  "DRIVING_PENDING",
  "TRANSIT_FAILED",
  "NOW_COLLISION",
  "PAST",
  "UNKNOWN_CONTINUITY",
  "MISSING_ENDPOINT",
  "TEXT_ONLY_ENDPOINT",
  "REPEATED_OCCURRENCE",
  "LOCATION_EDIT",
  "REVERSED_RELATION",
  "EXTERNAL_MAPS_NO_MODE",
  "STALE_OPEN_TTR",
  "COINCIDENT_UNKNOWN",
  "EXPLICIT_SAME_LOCATION",
] as const;
export type TtrLabCase = (typeof ttrLabCases)[number];
type OpenIntent = NonNullable<TtrPresentationProjection["actions"]["openTtr"]>;
type Scope = TtrInput["scope"];
export type TtrLabIntentVector = Readonly<{
  intent: OpenIntent;
  capturedScope: Scope;
  expectedAccepted: boolean;
}>;
export type TtrLabFacts = Readonly<{
  source: "SYNTHETIC_TTR_LAB";
  caseId: TtrLabCase;
  input: TtrInput;
  state: TtrState;
  projection: TtrPresentationProjection;
  before?: TtrPresentationProjection;
  intentVector?: TtrLabIntentVector;
  expected: Readonly<{
    qualification: TtrPresentationProjection["qualification"];
    visibility: TtrPresentationProjection["visibility"];
    mode: TtrMode | null;
    routeStatus: TtrState["route"]["status"];
    composed: boolean;
    suppressConnector: boolean;
  }>;
}>;

// Fixture-only fencing oracle; the future owning controller must revalidate its own context.
export function acceptsTtrLabIntent(
  current: TtrPresentationProjection,
  scope: Scope,
  vector: TtrLabIntentVector,
): boolean {
  const action = current.actions.openTtr;
  return !!(
    current.qualification === "QUALIFIED" &&
    current.visibility !== "HIDDEN" &&
    action &&
    current.identity &&
    scope.accountId === current.identity.accountId &&
    scope.tripId === current.identity.tripId &&
    vector.capturedScope.accountId === scope.accountId &&
    vector.capturedScope.tripId === scope.tripId &&
    vector.capturedScope.travellerKey === scope.travellerKey &&
    vector.capturedScope.generation === scope.generation &&
    vector.intent.publicationVersion === current.publicationVersion &&
    action.publicationVersion === current.publicationVersion &&
    ttrIdentityKey(vector.intent.identity) === ttrIdentityKey(current.identity) &&
    ttrIdentityKey(action.identity) === ttrIdentityKey(current.identity)
  );
}

// Preserve the full owning object; the shared structural port deliberately omits route results.
export function ttrLabPorts(projection: TtrPresentationProjection, scope: Scope) {
  const compatible: TransitionProjection = projection;
  return {
    scope: { accountId: scope.accountId, tripId: scope.tripId },
    transitions: [compatible],
  };
}

export function getTtrLabFixtures(): readonly FixtureContribution<TtrLabFacts>[] {
  const entries = ttrLabCases.map(ttrLabFixture);
  collectFixtureContributions(entries);
  return entries;
}

export function ttrLabFixture(caseId: TtrLabCase): FixtureContribution<TtrLabFacts> {
  const date = "2027-01-15";
  const input = ttrFixture();
  const index = ttrLabCases.indexOf(caseId);
  if (index < 0) throw new Error("TTR_LAB_CASE");
  input.scope.tripId = `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  input.from!.tripId = input.to!.tripId = input.scope.tripId;
  input.expiry = { eventDate: date, zone: "UTC" };
  input.anchors = {
    fromRowKey: dayRowKey(input.from!.eventId, "EVENT", date),
    toRowKey: dayRowKey(input.to!.eventId, "EVENT", date),
  };
  const today = caseId === "NOW_COLLISION";
  const past = caseId === "PAST";
  const instant = past
    ? "2027-01-16T12:00:00Z"
    : today
      ? "2027-01-15T12:00:00Z"
      : "2027-01-14T12:00:00Z";
  input.period = past ? "PAST" : today ? "TODAY" : "FUTURE";
  if (caseId === "UNKNOWN_CONTINUITY") input.continuity = null;
  if (caseId === "MISSING_ENDPOINT") input.to!.endpoint = null;
  if (caseId === "TEXT_ONLY_ENDPOINT") input.to!.endpoint!.qualification = "TEXT_ONLY";
  if (caseId === "COINCIDENT_UNKNOWN" || caseId === "EXPLICIT_SAME_LOCATION") {
    input.to!.endpoint!.coordinates = { ...input.from!.endpoint!.coordinates! };
    if (caseId === "EXPLICIT_SAME_LOCATION")
      input.spatialEquivalence = {
        equivalence: "SAME_LOCATION",
        provenance: "synthetic-lab-equivalence",
      };
  }
  let state = openTtr(input);
  const options = { now: instant, displayPermission: "DENIED" as const };
  let before: TtrPresentationProjection | undefined;
  let intentVector: TtrLabIntentVector | undefined;
  const mode =
    caseId === "DRIVING_PENDING"
      ? "driving"
      : caseId === "TRANSIT_FAILED"
        ? "transit"
        : "walking";
  if (
    [
      "WALKING_NO_ETA",
      "DRIVING_PENDING",
      "TRANSIT_FAILED",
      "LOCATION_EDIT",
      "REVERSED_RELATION",
    ].includes(caseId)
  ) {
    state = reduceTtr(state, { type: "PREVIEW", mode });
    state = reduceTtr(state, { type: "CONFIRM", selectedAt: instant });
  }
  if (["DRIVING_PENDING", "TRANSIT_FAILED", "LOCATION_EDIT"].includes(caseId)) {
    state = reduceTtr(state, { type: "BEGIN_FIXTURE_REQUEST" });
    if (state.route.status !== "PENDING") throw new Error("TTR_LAB_PENDING");
    const ticket = state.route.ticket;
    if (caseId === "TRANSIT_FAILED")
      state = reduceTtr(state, { type: "FIXTURE_FAILURE", ticket, reason: "NO_ROUTE" });
    if (caseId === "LOCATION_EDIT") {
      // Metric-free synthetic observation tests invalidation; ETA values remain test-only.
      state = reduceTtr(state, {
        type: "FIXTURE_RESULT",
        ticket,
        observation: {
          source: "SYNTHETIC_FIXTURE",
          provider: "SYNTHETIC",
          method: "ETA",
          mode: "walking",
          observedAt: instant,
        },
      });
      before = projectTtr(state, options);
      input.to!.endpoint!.coordinates!.longitude = 2;
      input.to!.endpoint!.locationInputRevision = 2;
      state = reduceTtr(state, { type: "REFRESH", input });
    }
  }
  if (caseId === "REPEATED_OCCURRENCE") {
    before = projectTtr(state, options);
    input.to!.occurrenceToken = "synthetic-entry-2";
    input.continuity!.toToken = input.to!.occurrenceToken;
    state = reduceTtr(state, { type: "REFRESH", input });
  }
  if (caseId === "REVERSED_RELATION") {
    before = projectTtr(state, options);
    [input.from, input.to] = [input.to, input.from];
    input.continuity!.fromToken = input.from!.occurrenceToken!;
    input.continuity!.toToken = input.to!.occurrenceToken!;
    input.anchors = {
      fromRowKey: dayRowKey(input.from!.eventId, "EVENT", date),
      toRowKey: dayRowKey(input.to!.eventId, "EVENT", date),
    };
    state = reduceTtr(state, { type: "REFRESH", input });
  }
  if (caseId === "STALE_OPEN_TTR") {
    before = projectTtr(state, options);
    intentVector = {
      intent: before.actions.openTtr!,
      capturedScope: { ...input.scope },
      expectedAccepted: false,
    };
    state = reduceTtr(state, { type: "REFRESH", input });
  }
  const projection = projectTtr(state, options);
  const qualified = ![
    "UNKNOWN_CONTINUITY",
    "MISSING_ENDPOINT",
    "TEXT_ONLY_ENDPOINT",
  ].includes(caseId);
  const selected = [
    "WALKING_NO_ETA",
    "DRIVING_PENDING",
    "TRANSIT_FAILED",
    "LOCATION_EDIT",
  ].includes(caseId);
  const expected: TtrLabFacts["expected"] = {
    qualification: qualified ? "QUALIFIED" : "UNQUALIFIED",
    visibility:
      !qualified || past || caseId === "EXPLICIT_SAME_LOCATION"
        ? "HIDDEN"
        : selected
          ? "SELECTED_MODE"
          : "STRAIGHT_LINE",
    mode: selected ? mode : null,
    routeStatus:
      caseId === "DRIVING_PENDING"
        ? "PENDING"
        : caseId === "TRANSIT_FAILED"
          ? "FAILED"
          : "MISSING",
    composed: qualified && !past && caseId !== "EXPLICIT_SAME_LOCATION",
    suppressConnector: today,
  };
  // Day facts are synthetic rendering inputs; applicability and continuity are supplied separately above.
  const base = scenario(input.scope.tripId, t("dayLab.trip"), [
    place(
      input.from!.eventId,
      t("dayLab.trailStop", { number: 1 }),
      date,
      "09:00",
      "09:30",
    ),
    place(input.to!.eventId, t("dayLab.trailStop", { number: 2 }), date, "13:00"),
  ]);
  return {
    ...base,
    dateRange: { start: date, end: date },
    dates: [date],
    selectedDate: date,
    instant,
    projection: { ...base.projection, accountId: input.scope.accountId },
    metadata: {
      summary: t("dayLab.fixtureSource"),
      expected: [caseId, expected.visibility, expected.routeStatus],
    },
    supplemental: {
      source: "SYNTHETIC_TTR_LAB",
      caseId,
      input,
      state,
      projection,
      before,
      intentVector,
      expected,
    },
    ports: ttrLabPorts(projection, input.scope),
    query: (selectedDate, zone) =>
      itemsForLocalDate(
        { ...base.projection, accountId: input.scope.accountId },
        selectedDate,
        zone,
      ),
  };
}
