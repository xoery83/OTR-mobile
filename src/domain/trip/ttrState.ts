import { z } from "zod";
import {
  qualifyTtr,
  ttrExpired,
  ttrIdentity,
  ttrIdentityKey,
  ttrInputSchema,
  ttrModeSchema,
  ttrRouteFingerprint,
  type TtrExpiry,
  type TtrIdentity,
  type TtrInput,
  type TtrMode,
  type TtrQualification,
  type TtrPoint,
  type TtrUnavailableReason,
} from "./ttr";

export type TtrSelection = Readonly<{
  identityKey: string;
  mode: TtrMode;
  selectedAt: string;
  expiry: TtrExpiry | null;
}>;
export type TtrRequestTicket = Readonly<{
  identityKey: string;
  generation: number;
  publicationVersion: number;
  fingerprint: string;
}>;
const fixtureObservation = z.strictObject({
  source: z.literal("SYNTHETIC_FIXTURE"),
  provider: z.literal("SYNTHETIC"),
  method: z.literal("ETA"),
  mode: ttrModeSchema,
  observedAt: z.string().datetime(),
  durationSeconds: z.number().finite().nonnegative().optional(),
  routeDistanceMeters: z.number().finite().nonnegative().optional(),
});
export type TtrFixtureObservation = z.infer<typeof fixtureObservation>;
export type TtrRouteState =
  | Readonly<{ status: "MISSING" }>
  | Readonly<{ status: "PENDING"; ticket: TtrRequestTicket }>
  | Readonly<{
      status: "AVAILABLE";
      ticket: TtrRequestTicket;
      observation: TtrFixtureObservation;
    }>
  | Readonly<{
      status: "FAILED";
      ticket: TtrRequestTicket;
      reason: "NETWORK" | "TIMEOUT" | "NO_ROUTE" | "INVALID_RESULT";
    }>;
export type TtrState = Readonly<{
  input: TtrInput | null;
  qualification: TtrQualification;
  identity: TtrIdentity | null;
  publicationVersion: number;
  confirmed: TtrSelection | null;
  preview: Readonly<{ mode: TtrMode | null }> | null;
  route: TtrRouteState;
}>;
const missing: TtrRouteState = Object.freeze({ status: "MISSING" });
const activeMode = (s: TtrState) =>
  s.preview ? s.preview.mode : (s.confirmed?.mode ?? null);
export function openTtr(
  raw: unknown,
  selection: TtrSelection | null = null,
  publicationVersion = 0,
): TtrState {
  const parsed = ttrInputSchema.safeParse(raw);
  const input = parsed.success ? parsed.data : null;
  const identity = input && ttrIdentity(input);
  const confirmed =
    identity && selection?.identityKey === ttrIdentityKey(identity)
      ? { ...selection, mode: ttrModeSchema.parse(selection.mode) }
      : null;
  return {
    input,
    identity,
    qualification: qualifyTtr(raw),
    publicationVersion,
    confirmed,
    preview: { mode: confirmed?.mode ?? null },
    route: missing,
  };
}
export type TtrEvent =
  | { type: "REFRESH"; input: unknown }
  | { type: "PREVIEW"; mode: TtrMode }
  | { type: "CONFIRM"; selectedAt: string }
  | { type: "DISMISS" }
  | { type: "BEGIN_FIXTURE_REQUEST" }
  | { type: "FIXTURE_RESULT"; ticket: TtrRequestTicket; observation: unknown }
  | {
      type: "FIXTURE_FAILURE";
      ticket: TtrRequestTicket;
      reason: "NETWORK" | "TIMEOUT" | "NO_ROUTE";
    }
  | { type: "CLEANUP"; now: string };
const sameIdentity = (a: TtrState, b: TtrState) =>
  !!a.identity &&
  !!b.identity &&
  ttrIdentityKey(a.identity) === ttrIdentityKey(b.identity);
function currentTicket(s: TtrState, ticket: TtrRequestTicket): boolean {
  const mode = activeMode(s);
  return (
    s.qualification.status === "QUALIFIED" &&
    !!mode &&
    s.route.status === "PENDING" &&
    s.route.ticket === ticket &&
    s.publicationVersion === ticket.publicationVersion &&
    s.input!.scope.generation === ticket.generation &&
    ttrIdentityKey(s.qualification.identity) === ticket.identityKey &&
    ttrRouteFingerprint(s.qualification, mode) === ticket.fingerprint
  );
}
export function reduceTtr(s: TtrState, event: TtrEvent): TtrState {
  switch (event.type) {
    case "REFRESH": {
      const next = openTtr(event.input, s.confirmed, s.publicationVersion + 1);
      const unchangedScope =
        sameIdentity(s, next) &&
        s.input?.scope.generation === next.input?.scope.generation;
      const preview = unchangedScope ? s.preview : null;
      const confirmed =
        next.confirmed && next.qualification.status === "QUALIFIED"
          ? { ...next.confirmed, expiry: next.input!.expiry }
          : next.confirmed;
      const mode = preview ? preview.mode : (confirmed?.mode ?? null);
      const preserve =
        unchangedScope &&
        next.qualification.status === "QUALIFIED" &&
        mode &&
        s.route.status === "AVAILABLE" &&
        s.route.observation.mode === mode &&
        s.route.ticket.fingerprint === ttrRouteFingerprint(next.qualification, mode);
      return { ...next, preview, confirmed, route: preserve ? s.route : missing };
    }
    case "PREVIEW": {
      if (!s.preview || s.qualification.status !== "QUALIFIED") return s;
      const mode = ttrModeSchema.parse(event.mode);
      if (mode === s.preview.mode) return s;
      return {
        ...s,
        preview: { mode },
        publicationVersion: s.publicationVersion + 1,
        route: missing,
      };
    }
    case "CONFIRM": {
      if (
        !s.preview?.mode ||
        s.qualification.status !== "QUALIFIED" ||
        s.input?.period === "PAST" ||
        ttrExpired(s.input?.expiry ?? null, event.selectedAt)
      )
        return s;
      z.string().datetime().parse(event.selectedAt);
      return {
        ...s,
        confirmed: {
          identityKey: ttrIdentityKey(s.qualification.identity),
          mode: s.preview.mode,
          selectedAt: event.selectedAt,
          expiry: s.input!.expiry,
        },
      };
    }
    case "DISMISS": {
      if (!s.preview) return s;
      const retained = s.preview.mode === s.confirmed?.mode;
      return {
        ...s,
        preview: null,
        route: retained ? s.route : missing,
        publicationVersion: retained ? s.publicationVersion : s.publicationVersion + 1,
      };
    }
    case "BEGIN_FIXTURE_REQUEST": {
      const mode = activeMode(s);
      if (
        !mode ||
        s.qualification.status !== "QUALIFIED" ||
        s.qualification.sameLocation ||
        s.input?.period === "PAST"
      )
        return s;
      if (s.route.status !== "MISSING") return s;
      const ticket = Object.freeze({
        identityKey: ttrIdentityKey(s.qualification.identity),
        generation: s.input!.scope.generation,
        publicationVersion: s.publicationVersion,
        fingerprint: ttrRouteFingerprint(s.qualification, mode),
      });
      return { ...s, route: { status: "PENDING", ticket } };
    }
    case "FIXTURE_RESULT": {
      if (!currentTicket(s, event.ticket)) return s;
      const result = fixtureObservation.safeParse(event.observation);
      if (!result.success || result.data.mode !== activeMode(s))
        return {
          ...s,
          route: { status: "FAILED", ticket: event.ticket, reason: "INVALID_RESULT" },
        };
      return {
        ...s,
        route: { status: "AVAILABLE", ticket: event.ticket, observation: result.data },
      };
    }
    case "FIXTURE_FAILURE":
      return currentTicket(s, event.ticket)
        ? {
            ...s,
            route: { status: "FAILED", ticket: event.ticket, reason: event.reason },
          }
        : s;
    case "CLEANUP":
      if (
        s.qualification.status !== "QUALIFIED" ||
        !ttrExpired(s.input!.expiry, event.now)
      )
        return s;
      return {
        ...s,
        confirmed: null,
        preview: null,
        route: missing,
        publicationVersion: s.publicationVersion + 1,
      };
  }
}
export type TtrPresentationProjection = Readonly<{
  version: "ttr-presentation/1";
  identity: TtrIdentity | null;
  qualification: TtrQualification["status"];
  unavailableReason: TtrUnavailableReason | "SAME_LOCATION" | "PAST" | null;
  publicationVersion: number;
  inputFingerprint: string | null;
  visibility: "HIDDEN" | "STRAIGHT_LINE" | "SELECTED_MODE" | "SUGGESTED_MODE";
  modeOrigin: "NONE" | "USER_CONFIRMED" | "SYSTEM_SUGGESTED";
  mode: TtrMode | null;
  geometricDistance?: Readonly<{
    kind: "STRAIGHT_LINE";
    source: "LOCAL_GEOMETRY";
    meters: number;
  }>;
  route: Readonly<{
    status: TtrRouteState["status"];
    observation?: Readonly<TtrFixtureObservation>;
    freshness?: "CURRENT_INPUT";
  }>;
  anchors: Readonly<TtrInput["anchors"]> | null;
  actions: Readonly<{
    openTtr: Readonly<{ identity: TtrIdentity; publicationVersion: number }> | null;
    externalMaps: Readonly<{
      from: Readonly<TtrPoint>;
      to: Readonly<TtrPoint>;
    }> | null;
  }>;
}>;
export function projectTtr(
  s: TtrState,
  options: {
    now: string;
    displayPermission: "SYNTHETIC_ALLOWED" | "DENIED";
    suggestion?: Readonly<{ source: "SYNTHETIC_TRUSTED_CONTEXT"; mode: TtrMode }>;
  },
): TtrPresentationProjection {
  const q = s.qualification;
  const hidden =
    q.status !== "QUALIFIED" ||
    q.sameLocation ||
    s.input?.period === "PAST" ||
    ttrExpired(s.input?.expiry ?? null, options.now);
  const suggested =
    !s.confirmed &&
    s.input?.period === "TODAY" &&
    q.status === "QUALIFIED" &&
    q.timedEligible &&
    s.input.queryTime?.kind === "DEPARTURE" &&
    options.suggestion?.source === "SYNTHETIC_TRUSTED_CONTEXT";
  const delta = suggested
    ? Date.parse(s.input!.queryTime!.instant) - Date.parse(options.now)
    : NaN;
  const suggestedMode =
    suggested && delta >= 0 && delta <= 90 * 60000
      ? ttrModeSchema.parse(options.suggestion!.mode)
      : null;
  const mode = hidden ? null : (s.confirmed?.mode ?? suggestedMode);
  const currentRoute = !hidden && !!mode && activeMode(s) === mode;
  const observation =
    currentRoute &&
    s.route.status === "AVAILABLE" &&
    options.displayPermission === "SYNTHETIC_ALLOWED" &&
    Date.parse(s.route.observation.observedAt) <= Date.parse(options.now) &&
    s.route.observation.mode === mode
      ? Object.freeze({ ...s.route.observation })
      : undefined;
  return Object.freeze({
    version: "ttr-presentation/1",
    identity: s.identity,
    qualification: q.status,
    unavailableReason:
      q.status === "UNQUALIFIED"
        ? q.reason
        : q.sameLocation
          ? "SAME_LOCATION"
          : hidden
            ? "PAST"
            : null,
    publicationVersion: s.publicationVersion,
    inputFingerprint:
      q.status === "QUALIFIED" && mode ? ttrRouteFingerprint(q, mode) : null,
    visibility: hidden
      ? "HIDDEN"
      : s.confirmed
        ? "SELECTED_MODE"
        : suggestedMode
          ? "SUGGESTED_MODE"
          : "STRAIGHT_LINE",
    modeOrigin: hidden
      ? "NONE"
      : s.confirmed
        ? "USER_CONFIRMED"
        : suggestedMode
          ? "SYSTEM_SUGGESTED"
          : "NONE",
    mode,
    ...(!hidden && q.status === "QUALIFIED"
      ? { geometricDistance: q.geometricDistance }
      : {}),
    route: Object.freeze({
      status:
        !currentRoute || (s.route.status === "AVAILABLE" && !observation)
          ? "MISSING"
          : s.route.status,
      ...(observation ? { observation, freshness: "CURRENT_INPUT" as const } : {}),
    }),
    anchors: !hidden && s.input ? Object.freeze({ ...s.input.anchors }) : null,
    actions: Object.freeze({
      openTtr:
        !hidden && s.identity
          ? Object.freeze({
              identity: s.identity,
              publicationVersion: s.publicationVersion,
            })
          : null,
      externalMaps:
        q.status === "QUALIFIED" &&
        s.input?.period !== "PAST" &&
        !ttrExpired(s.input?.expiry ?? null, options.now)
          ? Object.freeze({
              from: Object.freeze({ ...q.input.from!.endpoint!.coordinates! }),
              to: Object.freeze({ ...q.input.to!.endpoint!.coordinates! }),
            })
          : null,
    }),
  });
}
