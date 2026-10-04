import { createHash } from "node:crypto";

export const eventCommandFamilies = [
  "CREATE_EVENT",
  "UPDATE_CORE_TEXT",
  "UPDATE_TIME",
  "UPDATE_LOCATION",
  "UPDATE_GROUPING",
  "UPDATE_STATUS",
] as const;
export type EventCommandFamily = (typeof eventCommandFamilies)[number];
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
function fail(): never {
  throw new Error("INVALID_COMMAND");
}

// JSON.parse loses duplicate members and numeric spelling. Validate before decoding.
export function parseEventJson(source: string): Json {
  if (Buffer.byteLength(source, "utf8") > 32768) fail();
  let at = 0;
  const space = () => {
    while (/\s/.test(source[at] ?? "") && at < source.length) {
      if (!/[ \t\r\n]/.test(source[at])) fail();
      at++;
    }
  };
  const string = (): string => {
    const start = at++;
    while (at < source.length) {
      const char = source[at++];
      if (char === "\\") at++;
      else if (char === '"') {
        let value: string;
        try {
          value = JSON.parse(source.slice(start, at)) as string;
        } catch {
          return fail();
        }
        if (
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
            value,
          )
        )
          fail();
        if (value.includes("\0")) fail();
        return value;
      }
    }
    return fail();
  };
  const value = (depth: number): Json => {
    if (depth > 32) fail();
    space();
    const c = source[at];
    if (c === '"') return string();
    if (c === "{" || c === "[") {
      at++;
      space();
      const object = Object.create(null) as Record<string, Json>;
      const array: Json[] = [];
      const end = c === "{" ? "}" : "]";
      if (source[at] === end) {
        at++;
        return c === "{" ? object : array;
      }
      while (at < source.length) {
        if (c === "{") {
          if (source[at] !== '"') fail();
          const key = string();
          space();
          if (source[at++] !== ":" || Object.hasOwn(object, key)) fail();
          object[key] = value(depth + 1);
        } else array.push(value(depth + 1));
        space();
        if (source[at] === end) {
          at++;
          return c === "{" ? object : array;
        }
        if (source[at++] !== ",") fail();
        space();
      }
      return fail();
    }
    const token = /^(?:null|true|false|-?(?:0|[1-9][0-9]*))/.exec(source.slice(at))?.[0];
    if (!token || token === "-0") return fail();
    at += token.length;
    const result = JSON.parse(token) as Json;
    if (typeof result === "number" && !Number.isSafeInteger(result)) fail();
    return result;
  };
  const result = value(0);
  space();
  if (at !== source.length) fail();
  return result;
}

export function canonicalEventJson(value: Json): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail();
    return String(value);
  }
  if (typeof value === "string") {
    if (value.includes("\0")) fail();
    if (
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        value,
      )
    )
      fail();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalEventJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      if (!/^[\x20-\x7e]+$/.test(key)) fail();
      return `${JSON.stringify(key)}:${canonicalEventJson(value[key])}`;
    })
    .join(",")}}`;
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
    envelope.command === "CREATE_EVENT"
      ? envelope.baseSemanticRevision !== null
      : typeof envelope.baseSemanticRevision !== "number" ||
        envelope.baseSemanticRevision < 1
  )
    fail();
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
