import { z } from "zod";
import { createItemInput, updateItemInput, stayRooms } from "./mutationContract";
import { itemSchema, uuid } from "./contract";
import { contentDigest } from "./mutation";
import { ReadError, type createReadTools } from "./read";
import {
  personObservation,
  moneyObservation,
  matchPeople,
  reviewMoney,
} from "./peopleExpenseAdapter";
import { fieldCreateInput } from "./fieldAdapter";
import type { createDomainAdapters } from "./domainAdapter";

const key = z.string().min(1).max(128);
const source = z.strictObject({
  id: key,
  name: z.string().min(1).max(256),
  media_type: z.string().max(128),
  readable: z.boolean(),
  readable_scope: z.string().max(500),
  kind: z.enum(["CONFIRMATION", "AMENDMENT", "SUPPLEMENT", "PLAN", "USER_ASSERTION"]),
  confirmation_status: z.enum(["CONFIRMED", "PENDING", "UNKNOWN"]).optional(),
});
const fields = [
  "title",
  "category",
  "notes",
  "dates.start_date",
  "dates.end_date",
  "dates.start_time",
  "dates.end_time",
  "dates.start_zone",
  "dates.end_zone",
  "place",
  "place_address",
  "property_name",
  "rooms",
  "stay.permitted_checkin_from",
  "stay.permitted_checkin_until",
  "stay.permitted_checkout_by",
  "rental.supplier",
  "rental.reserved_category",
  "rental.or_similar",
  "rental.actual_vehicle_model",
  "rental.verified_plate",
  "return_place",
  "return_address",
  "transport.subtype",
  "transport.origin",
  "transport.destination",
  "transport.operator",
  "transport.service_number",
  "transport.checkin.date",
  "transport.checkin.time",
  "transport.checkin.zone",
  "transport.checkin.place",
  "flight_number",
  "origin.date",
  "origin.time",
  "origin.zone",
  "origin.airport_code",
  "origin.name",
  "origin.terminal",
  "destination.date",
  "destination.time",
  "destination.zone",
  "destination.airport_code",
  "destination.name",
  "destination.terminal",
  "activity.session_label",
  "activity.admission_note",
  "activity.entry_place",
] as const;
const claim = z.strictObject({
  id: key,
  source_id: key,
  locator: z.string().min(1).max(256),
  field: z.string().min(1).max(128),
  value: z.union([
    z.string().max(5000),
    z.boolean(),
    z.number().finite(),
    z.null(),
    stayRooms,
  ]),
  certainty: z.enum(["CONFIRMED", "PLANNED", "CONFLICTING", "MISSING"]),
  replaces_claim_id: key.optional(),
});
export const materialReviewInput = z.strictObject({
  trip_id: uuid,
  sources: z.array(source).min(1).max(30),
  candidates: z
    .array(
      z.strictObject({
        key,
        family: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]),
        family_options: z
          .array(z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]))
          .min(2)
          .max(6)
          .optional(),
        existing_item_id: uuid.optional(),
        claims: z.array(claim).min(1).max(80),
      }),
    )
    .max(60),
  people: z.array(personObservation).max(100).optional(),
  money: z.array(moneyObservation).max(100).optional(),
});
export const materialReviewOutput = z.object({
  version: z.literal("otr.ai.material-review/1"),
  evidence_authority: z.literal("CLIENT_CANDIDATE_NOT_ADMISSION"),
  trip_id: uuid,
  inventory: z.array(source),
  unreadable_source_ids: z.array(key),
  writes: z.literal(0),
  plan_digest: z.string().regex(/^[a-f0-9]{64}$/),
  people_review: z.array(z.record(z.string(), z.unknown())),
  expense_review: z.array(z.record(z.string(), z.unknown())),
  rows: z.array(
    z.object({
      candidate_key: key,
      family: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]),
      family_options: z.array(z.string()).optional(),
      decision: z.enum(["CREATE", "UPDATE", "NO_CHANGE", "NEEDS_INPUT", "BLOCKED"]),
      item_id: uuid.nullable(),
      expected_revision: z.number().int().positive().nullable(),
      possible_existing_item_ids: z.array(uuid),
      changes: z.array(
        z.object({ field: z.string(), before: z.unknown(), after: z.unknown() }),
      ),
      coverage: z.array(
        z.object({
          field: z.string(),
          state: z.string(),
          value: z.unknown(),
          planned: z.boolean(),
          sources: z.array(
            z.object({ claim_id: key, source_id: key, locator: z.string() }),
          ),
          superseded_claim_ids: z.array(key),
          pending_change_claim_ids: z.array(key),
        }),
      ),
      proposed_fields: z.record(z.string(), z.unknown()),
      create_schema_valid: z.boolean(),
      warnings: z.array(z.string()),
    }),
  ),
});
type Item = z.infer<typeof itemSchema>;
const normalize = (value: unknown) =>
  typeof value === "string"
    ? value.normalize("NFKC").trim().toLocaleLowerCase("en")
    : value;
const equal = (a: unknown, b: unknown) =>
  contentDigest(a ?? null) === contentDigest(b ?? null);
function factDigest(field: string, value: unknown) {
  const rooms = field === "rooms" ? stayRooms.safeParse(value) : null;
  return contentDigest(
    rooms?.success
      ? [...rooms.data].sort((a, b) => a.room_id.localeCompare(b.room_id))
      : (value ?? null),
  );
}
function validField(field: string, value: unknown) {
  if (field === "rooms") return stayRooms.safeParse(value).success;
  if (field === "rental.or_similar") return typeof value === "boolean";
  if (value === null) return field === "notes";
  if (typeof value !== "string") return false;
  if (field.endsWith("_date") || field.endsWith(".date"))
    return z.iso.date().safeParse(value).success;
  if (
    field.endsWith("_time") ||
    field.startsWith("stay.permitted_") ||
    field.endsWith(".time")
  )
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (field.endsWith("_zone") || field.endsWith(".zone")) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }
  return field === "notes" || value.trim().length > 0;
}
function assign(draft: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let target = draft;
  for (const part of parts.slice(0, -1)) {
    target[part] ??= {};
    target = target[part] as Record<string, unknown>;
  }
  target[parts.at(-1)!] = value;
}
function existingClock(boundary: Item["schedule"]["start"]) {
  const value = boundary?.localTime;
  return boundary?.precision === -1 &&
    boundary.quality !== "EXACT" &&
    boundary.basis !== "SOURCE_INSTANT" &&
    !boundary.instant &&
    typeof value === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d:00$/.test(value)
    ? value.slice(0, 5)
    : value;
}
function existingFields(item: Item): Record<string, unknown> {
  const s = item.schedule;
  const values: Record<string, unknown> = {
    title: item.title,
    notes: item.description,
    "dates.start_date": (s.start ?? s.origin?.time)?.localDate,
    "dates.end_date": (s.end ?? s.destination?.time)?.localDate,
    "dates.start_time": existingClock(s.start ?? s.origin?.time),
    "dates.end_time": existingClock(s.end ?? s.destination?.time),
    "dates.start_zone": (s.start ?? s.origin?.time)?.zoneId,
    "dates.end_zone": (s.end ?? s.destination?.time)?.zoneId,
    place: item.place?.authoredLabel,
    place_address: item.place?.authoredAddress,
  };
  if (item.family === "P2") {
    values.flight_number = item.details.flightNumberLiteral;
    for (const role of ["origin", "destination"] as const) {
      const endpoint = s[role];
      Object.assign(values, {
        [`${role}.date`]: endpoint?.time.localDate,
        [`${role}.time`]: existingClock(endpoint?.time),
        [`${role}.zone`]: endpoint?.time.zoneId,
        [`${role}.airport_code`]: endpoint?.airportCode,
        [`${role}.name`]: endpoint?.place?.authoredLabel,
        [`${role}.terminal`]: endpoint?.terminal,
      });
    }
  }
  if (item.family === "P3")
    Object.assign(values, {
      property_name: item.details.propertyName,
      rooms: item.details.rooms.map((r) => ({
        room_id: r.roomId,
        category: r.category ?? null,
        quantity: r.quantity ?? null,
        capacity: r.capacity ?? null,
      })),
      "stay.permitted_checkin_from": item.details.permittedCheckinFrom,
      "stay.permitted_checkin_until": item.details.permittedCheckinUntil,
      "stay.permitted_checkout_by": item.details.permittedCheckoutBy,
    });
  if (item.family === "P4")
    Object.assign(values, {
      "rental.supplier": item.details.supplier,
      "rental.reserved_category": item.details.reservedCategory,
      "rental.or_similar": item.details.orSimilar,
      "rental.actual_vehicle_model": item.details.actualVehicleModel,
      "rental.verified_plate": item.details.verifiedPlate,
      place: item.details.pickupPlace?.authoredLabel,
      return_place: item.details.returnPlace?.authoredLabel,
      place_address: item.details.pickupPlace?.authoredAddress,
      return_address: item.details.returnPlace?.authoredAddress,
    });
  if (item.family === "P5")
    Object.assign(values, {
      "transport.subtype": item.details.service?.transportSubtype,
      "transport.origin": s.origin?.place?.authoredLabel,
      "transport.destination": s.destination?.place?.authoredLabel,
      "transport.operator": item.details.service?.operatorLiteral,
      "transport.service_number": item.details.service?.serviceNumber,
    });
  if (item.family === "P6")
    Object.assign(values, {
      category: item.details.category,
      "activity.session_label": item.details.sessionLabel,
      "activity.admission_note": item.details.admissionNote,
      "activity.entry_place": item.details.entryPlace?.authoredLabel,
    });
  if (item.family === "P1") values.category = item.details.category;
  return values;
}

// Candidate facts are supplied by the client, never promoted to Source Admission.
export function reconcileMaterials(
  raw: unknown,
  snapshot: { tripId: string; items: unknown[]; complete: boolean },
  domains: { accountId: string; roster?: unknown; expenses?: unknown } = {
    accountId: "00000000-0000-4000-8000-000000000000",
  },
) {
  const q = materialReviewInput.parse(raw);
  if (q.trip_id !== snapshot.tripId || !snapshot.complete)
    throw Error("COMPLETE_SCOPED_ITEM_READ_REQUIRED");
  const items = snapshot.items.map((item) => itemSchema.parse(item));
  if (
    items.some((item) => item.tripId !== q.trip_id) ||
    new Set(items.map((item) => item.itemId)).size !== items.length
  )
    throw Error("SNAPSHOT_SCOPE_OR_IDENTITY");
  if (
    new Set(q.sources.map((s) => s.id)).size !== q.sources.length ||
    new Set(q.candidates.map((c) => c.key)).size !== q.candidates.length
  )
    throw Error("DUPLICATE_SOURCE_OR_CANDIDATE_ID");
  const allClaims = q.candidates.flatMap((c) => c.claims);
  if (new Set(allClaims.map((c) => c.id)).size !== allClaims.length)
    throw Error("DUPLICATE_CLAIM_ID");
  const rows = q.candidates.map((candidate) => {
    const warnings: string[] = [];
    const draft: Record<string, unknown> = { family: candidate.family };
    const superseded = new Set<string>();
    for (const c of candidate.claims) {
      const origin = q.sources.find((s) => s.id === c.source_id);
      if (!origin?.readable) throw Error("CLAIM_SOURCE_NOT_READABLE");
      if (c.replaces_claim_id) {
        const previous = candidate.claims.find((p) => p.id === c.replaces_claim_id);
        if (
          !previous ||
          previous.field !== c.field ||
          previous.id === c.id ||
          !["AMENDMENT", "USER_ASSERTION"].includes(origin.kind)
        )
          throw Error("INVALID_SUPERSESSION");
        const visited = new Set([c.id]);
        let p: typeof previous | undefined = previous;
        while (p) {
          if (visited.has(p.id)) throw Error("CYCLIC_SUPERSESSION");
          visited.add(p.id);
          p = candidate.claims.find((x) => x.id === p!.replaces_claim_id);
        }
        if (
          origin.confirmation_status === "PENDING" ||
          origin.confirmation_status === "UNKNOWN" ||
          c.certainty !== "CONFIRMED"
        )
          warnings.push(`UNCONFIRMED_AMENDMENT_NOT_SUPERSEDING:${c.id}`);
        else superseded.add(previous.id);
      }
    }
    const coverage = [...new Set(candidate.claims.map((c) => c.field))].map((field) => {
      const active = candidate.claims.filter(
        (c) => c.field === field && !superseded.has(c.id),
      );
      const pending = active.filter((c) => {
        const source = q.sources.find((s) => s.id === c.source_id)!;
        const status = source.confirmation_status;
        return (
          status === "PENDING" ||
          (status === "UNKNOWN" && source.kind !== "PLAN") ||
          (!!c.replaces_claim_id && c.certainty !== "CONFIRMED")
        );
      });
      const usable = active.filter(
        (c) => c.certainty !== "MISSING" && !pending.includes(c),
      );
      const conflicting =
        usable.some((c) => c.certainty === "CONFLICTING") ||
        new Set(usable.map((c) => factDigest(field, c.value))).size > 1;
      const owner =
        field.startsWith("stay.") || field === "property_name" || field === "rooms"
          ? "P3"
          : field.startsWith("rental.") || field.startsWith("return_")
            ? "P4"
            : field.startsWith("transport.")
              ? "P5"
              : field.startsWith("activity.")
                ? "P6"
                : field === "flight_number" ||
                    field.startsWith("origin.") ||
                    field.startsWith("destination.")
                  ? "P2"
                  : null;
      const supported =
        (fields as readonly string[]).includes(field) &&
        (!owner || owner === candidate.family);
      const state =
        (owner && owner !== candidate.family) ||
        (field === "category" && !["P1", "P6"].includes(candidate.family))
          ? "FAMILY_MISMATCH"
          : pending.length
            ? "PENDING_CHANGE"
            : conflicting
              ? "CONFLICTING"
              : !usable.length
                ? "MISSING"
                : !supported
                  ? "UNSUPPORTED"
                  : !validField(field, usable[0].value)
                    ? "INVALID"
                    : "MAPPED";
      if (
        state === "MAPPED" ||
        (state === "PENDING_CHANGE" &&
          usable.length &&
          !conflicting &&
          supported &&
          validField(field, usable[0].value))
      )
        assign(draft, field, usable[0].value);
      return {
        field,
        state,
        value:
          state === "MAPPED" ||
          (state === "PENDING_CHANGE" && usable.length && !conflicting)
            ? usable[0].value
            : null,
        planned: usable.some((c) => c.certainty === "PLANNED"),
        sources: active.map((c) => ({
          claim_id: c.id,
          source_id: c.source_id,
          locator: c.locator,
        })),
        superseded_claim_ids: candidate.claims
          .filter((c) => c.field === field && superseded.has(c.id))
          .map((c) => c.id),
        pending_change_claim_ids: pending.map((c) => c.id),
      };
    });
    const exact = candidate.existing_item_id
      ? items.find(
          (i) => i.itemId === candidate.existing_item_id && i.family === candidate.family,
        )
      : undefined;
    const hasAmendment = candidate.claims.some(
      (c) => q.sources.find((s) => s.id === c.source_id)?.kind === "AMENDMENT",
    );
    const candidateDates = draft.dates as
      { start_date?: string; end_date?: string } | undefined;
    const possible = items.filter(
      (i) =>
        i.family === candidate.family &&
        (hasAmendment ||
          !candidateDates?.start_date ||
          !existingFields(i)["dates.start_date"] ||
          !(
            String(
              existingFields(i)["dates.end_date"] ??
                existingFields(i)["dates.start_date"],
            ) < candidateDates.start_date ||
            String(candidateDates.end_date ?? candidateDates.start_date) <
              String(existingFields(i)["dates.start_date"])
          )) &&
        (normalize(i.title) === normalize(draft.title) ||
          (!!draft.property_name &&
            normalize(existingFields(i).property_name) ===
              normalize(draft.property_name)) ||
          (!!draft.place &&
            normalize(existingFields(i).place) === normalize(draft.place))),
    );
    const amendmentNeedsTarget = !exact && hasAmendment;
    if (amendmentNeedsTarget)
      warnings.push("AMENDMENT_REQUIRES_EXPLICIT_EXISTING_TARGET");
    const changes = exact
      ? coverage
          .filter(
            (c) =>
              c.state === "MAPPED" &&
              factDigest(c.field, existingFields(exact)[c.field]) !==
                factDigest(c.field, c.value),
          )
          .map((c) => ({
            field: c.field,
            before: existingFields(exact)[c.field] ?? null,
            after: c.value,
          }))
      : [];
    const {
      activity: activityFields,
      origin,
      destination,
      category,
      ...itemDraft
    } = draft;
    let flightFollowup: unknown;
    let flightValid = true;
    let mappingConflict = false;
    if (candidate.family === "P2") {
      const dates = (itemDraft.dates as Record<string, unknown>) ?? {};
      const originDate = (origin as Record<string, unknown> | undefined)?.date;
      if (!dates.start_date && originDate) dates.start_date = originDate;
      if (dates.start_date && originDate && dates.start_date !== originDate) {
        mappingConflict = true;
        warnings.push("FLIGHT_DEPARTURE_DATE_CONFLICT");
      }
      if (origin || destination || dates?.start_time || dates?.end_time) {
        flightFollowup = {
          kind: "FLIGHT_DETAILS",
          flight_number: itemDraft.flight_number,
          origin: {
            date: dates?.start_date ?? null,
            time: dates?.start_time ?? null,
            zone: dates?.start_zone ?? null,
            airport_code: null,
            name: null,
            terminal: null,
            ...(origin as object),
          },
          destination: {
            date: dates?.end_date ?? null,
            time: dates?.end_time ?? null,
            zone: dates?.end_zone ?? null,
            airport_code: null,
            name: null,
            terminal: null,
            ...(destination as object),
          },
        };
        const followUpValidation = updateItemInput.shape.change.safeParse(flightFollowup);
        flightValid = followUpValidation.success;
        if (!followUpValidation.success)
          warnings.push(
            ...followUpValidation.error.issues.map(
              (issue) => `FIELD_VALIDATION:flight_details.${issue.path.join(".")}`,
            ),
          );
        warnings.push(
          "FLIGHT_DETAILS_REQUIRE_SEPARATE_OPERATION_AFTER_CREATE_AND_FRESH_READ_CORE_SETS_TITLE_TO_LITERAL",
        );
      }
      itemDraft.dates = { start_date: dates?.start_date };
    }
    const activityValues = activityFields as Record<string, unknown> | undefined;
    const { entry_place, ...details } = activityValues ?? {};
    const typedActivity = activityValues
      ? { details, ...(entry_place ? { entry_place: { label: entry_place } } : {}) }
      : undefined;
    const validation = createItemInput.shape.item.safeParse(itemDraft);
    const activityValidation = fieldCreateInput.shape.activity.safeParse(typedActivity);
    const createValid =
      validation.success &&
      activityValidation.success &&
      flightValid &&
      fieldCreateInput.shape.category.safeParse(category).success;
    if (!validation.success)
      warnings.push(
        ...validation.error.issues.map(
          (i) => `FIELD_VALIDATION:${i.path.join(".")}:${i.message}`,
        ),
      );
    let decision =
      mappingConflict ||
      !!candidate.family_options ||
      coverage.some(
        (c) =>
          ["CONFLICTING", "INVALID", "PENDING_CHANGE", "FAMILY_MISMATCH"].includes(
            c.state,
          ) ||
          (c.state === "MISSING" &&
            (["title", "dates.start_date"].includes(c.field) ||
              (candidate.family === "P3" && c.field === "dates.end_date") ||
              (candidate.family === "P2" && c.field === "flight_number") ||
              (candidate.family === "P5" &&
                [
                  "transport.subtype",
                  "transport.origin",
                  "transport.destination",
                ].includes(c.field)))),
      )
        ? "NEEDS_INPUT"
        : candidate.existing_item_id && !exact
          ? "BLOCKED"
          : !exact && (possible.length || amendmentNeedsTarget)
            ? "NEEDS_INPUT"
            : exact
              ? changes.length
                ? "UPDATE"
                : "NO_CHANGE"
              : createValid
                ? "CREATE"
                : "NEEDS_INPUT";
    if (coverage.some((c) => c.state === "UNSUPPORTED")) {
      warnings.push("UNSUPPORTED_FACTS_NOT_SAVED");
      if (decision === "NO_CHANGE") decision = "BLOCKED";
    }
    return {
      candidate_key: candidate.key,
      family: candidate.family,
      ...(candidate.family_options ? { family_options: candidate.family_options } : {}),
      decision,
      item_id: exact?.itemId ?? null,
      expected_revision: exact?.itemRevision ?? null,
      possible_existing_item_ids: possible.map((i) => i.itemId),
      changes,
      coverage,
      proposed_fields: {
        ...itemDraft,
        ...(typedActivity ? { activity: typedActivity } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(flightFollowup
          ? {
              flight_details_follow_up: {
                tool: "update_trip_item",
                change: flightFollowup,
                requires: "CREATE_APPLIED_AND_FRESH_ITEM_REVISION",
              },
            }
          : {}),
      } as Record<string, unknown>,
      create_schema_valid: createValid,
      warnings,
    };
  });
  // Two source groups about the same target require review, not two CAS writes.
  for (const row of rows)
    if (row.item_id && rows.filter((r) => r.item_id === row.item_id).length > 1) {
      row.decision = "NEEDS_INPUT";
      row.warnings.push("MULTIPLE_CANDIDATES_FOR_SAME_ITEM");
    }
  for (const row of rows)
    if (
      !row.item_id &&
      rows.some(
        (r) =>
          r !== row &&
          !r.item_id &&
          r.family === row.family &&
          normalize(r.proposed_fields.title) === normalize(row.proposed_fields.title) &&
          equal(r.proposed_fields.dates, row.proposed_fields.dates),
      )
    ) {
      row.decision = "NEEDS_INPUT";
      row.warnings.push("POSSIBLE_DUPLICATE_CANDIDATES_NOT_SEPARATE_CREATES");
    }
  return materialReviewOutput.parse({
    version: "otr.ai.material-review/1",
    evidence_authority: "CLIENT_CANDIDATE_NOT_ADMISSION",
    trip_id: q.trip_id,
    inventory: q.sources,
    rows,
    writes: 0,
    people_review: matchPeople(
      { account_id: domains.accountId, trip_id: q.trip_id },
      q.people ?? [],
      domains.roster ?? null,
    ),
    expense_review: reviewMoney(
      { account_id: domains.accountId, trip_id: q.trip_id },
      q.money ?? [],
      domains.expenses ?? null,
    ),
    unreadable_source_ids: q.sources.filter((s) => !s.readable).map((s) => s.id),
    plan_digest: contentDigest({
      request: q,
      basis: items,
      roster: domains.roster ?? null,
      expenses: domains.expenses ?? null,
    }),
  });
}

export async function reviewWithReads(
  raw: unknown,
  reads: ReturnType<typeof createReadTools>,
  domains?: {
    accountId: string;
    readExpenses?: ReturnType<typeof createDomainAdapters>["list_expenses"];
    readRoster?: ReturnType<typeof createDomainAdapters>["list_trip_people"];
  },
) {
  const q = materialReviewInput.parse(raw);
  const items: Item[] = [];
  if (reads.get_review_snapshot)
    items.push(...(await reads.get_review_snapshot({ trip_id: q.trip_id })).items);
  let cursor: string | undefined;
  let pageCount = 0;
  const seen = new Set<string>();
  while (!reads.get_review_snapshot) {
    if (++pageCount > 4) throw new ReadError("READ_LIMIT");
    const page = await reads.list_trip_items({
      trip_id: q.trip_id,
      limit: 25,
      ...(cursor ? { cursor } : {}),
    });
    for (let start = 0; start < page.items.length; start += 5) {
      const details = await Promise.all(
        page.items
          .slice(start, start + 5)
          .map((i) => reads.get_trip_item({ trip_id: q.trip_id, item_id: i.itemId })),
      );
      items.push(...details.map((d) => d.item));
    }
    if (!page.next_cursor) break;
    if (items.length >= 100 || seen.has(page.next_cursor))
      throw new ReadError("READ_LIMIT");
    seen.add(page.next_cursor);
    cursor = page.next_cursor;
    if (!cursor) break;
  }
  let expenses: unknown;
  let roster: unknown;
  if (q.people?.length && domains?.readRoster) {
    try {
      roster = await domains.readRoster({ trip_id: q.trip_id });
    } catch (error) {
      throw new ReadError(
        String(error).includes("401") ? "AUTH_REQUIRED" : "BACKEND_UNAVAILABLE",
      );
    }
  }
  if (q.money?.length && domains?.readExpenses) {
    const existing: Awaited<
      ReturnType<NonNullable<typeof domains.readExpenses>>
    >["expenses"] = [];
    const expenseCursors = new Set<string>();
    let cursor: string | undefined;
    for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
      let page: Awaited<ReturnType<typeof domains.readExpenses>>;
      try {
        page = await domains.readExpenses({
          trip_id: q.trip_id,
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });
      } catch (error) {
        throw new ReadError(
          String(error).includes("401") ? "AUTH_REQUIRED" : "BACKEND_UNAVAILABLE",
        );
      }
      existing.push(...page.expenses);
      if (!page.nextCursor) break;
      if (pageIndex === 4 || expenseCursors.has(page.nextCursor))
        throw new ReadError("READ_LIMIT");
      expenseCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    expenses = {
      account_id: domains.accountId,
      trip_id: q.trip_id,
      complete: true,
      links_complete: false,
      links: [],
      expenses: existing.map((e) => ({
        expense_id: e.id,
        revision: e.revision,
        arrangement_key: `server:${e.id}`,
        title: e.title,
        ...(e.economicDate ? { economic_date: e.economicDate } : {}),
        original: e.original,
        payer_person_id: e.payerMemberId,
        split_person_ids: e.participants.map((p) => p.memberId),
      })),
    };
  }
  return reconcileMaterials(
    q,
    { tripId: q.trip_id, items, complete: true },
    {
      accountId: domains?.accountId ?? "00000000-0000-4000-8000-000000000000",
      expenses,
      roster,
    },
  );
}
