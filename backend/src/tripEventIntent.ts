import { createHash } from "node:crypto";
import {
  parseEventJson,
  canonicalEventJson,
  type Json,
} from "../../src/domain/trip/eventIntentJson";
import { validateFlightCommand } from "../../src/domain/trip/flightAdmission";

export const eventCommandFamilies = [
  "CREATE_EVENT",
  "UPDATE_CORE_TEXT",
  "UPDATE_TIME",
  "UPDATE_LOCATION",
  "UPDATE_GROUPING",
  "UPDATE_STATUS",
  "CREATE_TRANSPORT",
  "UPDATE_TRANSPORT",
] as const;
export type EventCommandFamily = (typeof eventCommandFamilies)[number];
export {
  parseEventJson,
  canonicalEventJson,
  type Json,
} from "../../src/domain/trip/eventIntentJson";
function fail(): never {
  throw new Error("INVALID_COMMAND");
}

export function eventIntentCodec(raw: string) {
  const envelope = parseEventJson(raw);
  if (!envelope || Array.isArray(envelope) || typeof envelope !== "object") fail();
  const keys = [
    "contractVersion",
    "intentVersion",
    "command",
    "commandVersion",
    "operationKey",
    "actorAccountId",
    "tripId",
    "eventId",
    "baseSemanticRevision",
    "payload",
  ];
  if (
    Object.keys(envelope).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(envelope, k))
  )
    fail();
  if (
    envelope.contractVersion !== 1 ||
    envelope.intentVersion !== 1 ||
    envelope.commandVersion !== 1 ||
    !eventCommandFamilies.includes(envelope.command as EventCommandFamily)
  )
    fail();
  for (const k of ["actorAccountId", "tripId", "eventId", "operationKey"]) {
    if (
      typeof envelope[k] !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(envelope[k])
    )
      fail();
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      envelope.operationKey as string,
    )
  )
    fail();
  if (
    ["CREATE_EVENT", "CREATE_TRANSPORT"].includes(envelope.command as string)
      ? envelope.baseSemanticRevision !== null
      : typeof envelope.baseSemanticRevision !== "number" ||
        envelope.baseSemanticRevision < 1
  )
    fail();
  if (envelope.command === "CREATE_TRANSPORT" || envelope.command === "UPDATE_TRANSPORT")
    validateFlightCommand(envelope.command, envelope.payload);
  const canonical = canonicalEventJson(envelope);
  const bound = canonicalEventJson({ ...envelope, encoding: "otr-event-intent-v1" });
  if (Buffer.byteLength(canonical) > 32768) fail();
  return {
    envelope,
    canonical,
    intentSha256: createHash("sha256").update(bound, "utf8").digest("hex"),
  };
}

export function canonicalCoordinate(value: Json, limit: number): string {
  if (
    typeof value !== "string" ||
    !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/.test(value) ||
    value === "-0"
  )
    return fail();
  // Compare the canonical decimal magnitude before binary64 can round an
  // out-of-range fraction to 90/180. Canonical spelling has no leading zeroes.
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const bound = String(limit);
  if (
    whole.length > bound.length ||
    (whole.length === bound.length && whole > bound) ||
    (whole === bound && fraction !== "")
  )
    fail();
  const digits = value.replace(/[-.]/g, "").replace(/^0+/, "");
  if (
    digits.length > 17 ||
    !Number.isFinite(Number(value)) ||
    (Number(value) === 0 && /[1-9]/.test(value))
  )
    fail();
  return value;
}
