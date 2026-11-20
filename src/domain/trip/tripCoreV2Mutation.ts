import { isLegacyStoredP5Identity, p5IdentityPatch } from "./p5Identity";
import { authoredFlightDetailsSchema } from "./authoredFlightDetails";
import {
  isVerifiedLocalOperation,
  localBookedFlightPayloadSchema,
  localAuthoredFlightPayloadSchema,
  type VerifiedLocalOperation,
  type LocalMutationCommand,
} from "./localCoreAuthority";
import { validateCoreGraph, validateLocalCoreGraph } from "./tripCoreV2Graph";
import * as f from "./tripCoreV2";
import { validateCoreCommand } from "./tripCoreV2Commands";
import {
  coreDateBoundary,
  coreStoredBoundary,
  normalizeCoreClock,
  type CoreBoundary,
} from "./tripCoreV2Temporal";
import { canonicalCoreJson, type Json } from "./tripCoreV2Json";
import { instantMicroseconds, validateCalendarDate } from "./dayReadModel";
import { isIso4217Money } from "../ledger/currency";
import {
  authoredPlacePatchSchema,
  authoredPlaceChanges,
  patchCoreBoundary,
  emptyCoreBoundary,
  type SparseBoundaryPatch,
} from "./tripCoreSparseFields";
export type CoreRow = Record<string, unknown>;
export type CoreGraph = { [T in f.CoreTable]: CoreRow[] };
export type CoreActor = {
  accountId: string;
  tripId: string;
  active: boolean;
  canManageShared: boolean;
  personId: string | null;
  personIds: readonly string[];
};
export type CoreMutation = {
  graph: CoreGraph;
  changed: {
    kind: f.CoreKind;
    id: string;
    baseRevision: number | null;
    committedRevision: number;
  }[];
};
export const emptyCoreGraph = (): CoreGraph =>
  Object.fromEntries(
    Object.keys(f.coreTableSchemas).map((k) => [k, []]),
  ) as unknown as CoreGraph;
const aclTables = {
  ITEM: ["trip_item_visibility_people", "item_id"],
  BOOKING: ["trip_booking_visibility_people", "booking_id"],
  ENTITLEMENT: ["trip_entitlement_visibility_people", "entitlement_id"],
  DOCUMENT: ["trip_document_visibility_people", "document_id"],
  INSTRUCTION: ["trip_instruction_visibility_people", "instruction_id"],
} as const;
export function coreCanRead(
  g: CoreGraph,
  actor: CoreActor,
  kind: f.CoreKind,
  row: CoreRow,
): boolean {
  if (!actor.active || row.trip_id !== actor.tripId) return false;
  if (kind === "ORDER")
    return row.owner_account_id === actor.accountId && row.person_id === actor.personId;
  if (kind === "INSTRUCTION") {
    const parent = g.itinerary_events.find((x) => x.id === row.event_id);
    if (!parent || !coreCanRead(g, actor, "ITEM", parent)) return false;
  }
  if (row.owner_account_id === actor.accountId || row.visibility === "GROUP") return true;
  const [table, key] = aclTables[kind];
  return (
    row.visibility === "SELECTED_PERSONS" &&
    actor.personId !== null &&
    g[table].some((x) => x[key] === row.id && x.person_id === actor.personId)
  );
}
export function coreCanManage(
  g: CoreGraph,
  actor: CoreActor,
  kind: f.CoreKind,
  row: CoreRow,
): boolean {
  return (
    coreCanRead(g, actor, kind, row) &&
    (row.owner_account_id === actor.accountId ||
      (row.visibility !== "PRIVATE" &&
        actor.canManageShared &&
        (kind !== "ITEM" || row.participation_mode === "WHOLE_GROUP")))
  );
}
const rev = (row: CoreRow, kind: f.CoreKind) =>
  row[kind === "ITEM" ? "semantic_revision" : "revision"] as number;
export function coreGraphHashText(g: CoreGraph): string {
  // Caller selects the authorized closed lifecycle subgraph before hashing.
  return canonicalCoreJson(
    Object.fromEntries(
      Object.entries(g).filter(([table]) => table !== "trip_person_ordinary_orders"),
    ) as unknown as Json,
  );
}
export type VerifiedPrivateDocumentCustody = Readonly<{
  actorAccountId: string;
  tripId: string;
  documentId: string;
  custodyProofId: string;
  sourceRepresentationId: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
  contentVersion: number;
}>;
export type VerifiedExpenseLinkAuthority = Readonly<{
  actorAccountId: string;
  tripId: string;
  linkId: string;
  expenseId: string;
  itemId: string;
  expenseRevision: number;
}>;
export function applyCoreCommand(
  given: CoreGraph,
  input: unknown,
  actor: CoreActor,
  now: string,
  sourceAuthorized = false,
  lifecycleGraphHash?: string,
  actorProjection = false,
  privateDocumentCustody?: VerifiedPrivateDocumentCustody,
  deletedItemIds: ReadonlySet<string> = new Set(),
  expenseLinkAuthority?: VerifiedExpenseLinkAuthority,
): CoreMutation {
  return executeCoreMutation(
    given,
    validateCoreCommand(input),
    actor,
    now,
    sourceAuthorized,
    lifecycleGraphHash,
    actorProjection,
    privateDocumentCustody,
    false,
    deletedItemIds,
    expenseLinkAuthority,
  );
}
export function applyLocalCoreOperation(
  given: CoreGraph,
  operation: VerifiedLocalOperation,
  actor: CoreActor,
  now: string,
): CoreMutation {
  if (
    !isVerifiedLocalOperation(operation) ||
    operation.command.tripId !== actor.tripId ||
    canonicalCoreJson(operation.actor as unknown as Json) !==
      canonicalCoreJson(actor as unknown as Json)
  )
    throw new Error("LOCAL_CAPABILITY_REQUIRED");
  return executeCoreMutation(
    given,
    operation.command,
    actor,
    now,
    true,
    undefined,
    false,
    undefined,
    true,
  );
}
function executeCoreMutation(
  given: CoreGraph,
  q: ReturnType<typeof validateCoreCommand> | LocalMutationCommand,
  actor: CoreActor,
  now: string,
  sourceAuthorized: boolean,
  lifecycleGraphHash: string | undefined,
  actorProjection: boolean,
  privateDocumentCustody: VerifiedPrivateDocumentCustody | undefined,
  local: boolean,
  deletedItemIds: ReadonlySet<string> = new Set(),
  expenseLinkAuthority?: VerifiedExpenseLinkAuthority,
): CoreMutation {
  if (!actor.active || q.tripId !== actor.tripId) throw new Error("TRIP_NOT_AUTHORIZED");
  if (q.admission.mode !== "MANUAL" && !sourceAuthorized)
    throw new Error("INVALID_PROVENANCE");
  const g = structuredClone(given),
    changed = new Map<string, CoreMutation["changed"][number]>();
  const p = q.payload as Record<string, any>; // Parsed finite command union, never raw input.
  if ("graphHash" in p && (!lifecycleGraphHash || p.graphHash !== lifecycleGraphHash))
    throw new Error("GRAPH_CHANGED");
  const table = (k: f.CoreKind) => f.coreKindTables[k];
  const root = (k: f.CoreKind, id: string, manage = false) => {
    const r = g[table(k)].find((x) => x.id === id);
    if (!r || !coreCanRead(g, actor, k, r) || (manage && !coreCanManage(g, actor, k, r)))
      throw new Error("NOT_VISIBLE");
    return r;
  };
  for (const v of q.baseVector) {
    if (v.kind === "SOURCE") continue;
    if (v.kind === "EXPENSE_LINK") {
      const existing = g.expense_links.find((row) => row.id === v.id);
      if (v.revision === null ? !!existing : !existing || v.revision !== 1)
        throw new Error("REVISION_CONFLICT");
      continue;
    }
    const r = g[table(v.kind)].find((x) => x.id === v.id);
    if (r && !coreCanRead(g, actor, v.kind, r)) throw new Error("NOT_VISIBLE");
    if (v.revision === null ? !!r : !r || rev(r, v.kind) !== v.revision)
      throw new Error("REVISION_CONFLICT");
  }
  if (
    q.target.kind === "ITEM" &&
    deletedItemIds.has(q.target.id) &&
    q.command !== "DELETE_ITEM"
  )
    throw new Error("ITEM_DELETED");
  const usedBases = new Set<string>([q.target.kind + ":" + q.target.id]);
  const requireBase = (k: f.CoreKind, id: string) => {
    usedBases.add(k + ":" + id);
    if (!q.baseVector.some((v) => v.kind === k && v.id === id))
      throw new Error("INVALID_BASE_VECTOR");
  };
  const checkPeople = (people: string[]) => {
    if (people.some((id) => !actor.personIds.includes(id)))
      throw new Error("CROSS_TRIP_PERSON");
  };
  const touch = (k: f.CoreKind, r: CoreRow) => {
    const key = k + ":" + r.id;
    if (changed.has(key)) return;
    const old = given[table(k)].find((x) => x.id === r.id),
      base = old ? rev(old, k) : null;
    if (base !== null && base === Number.MAX_SAFE_INTEGER)
      throw new Error("REVISION_OVERFLOW");
    r[k === "ITEM" ? "semantic_revision" : "revision"] = base === null ? 1 : base + 1;
    r.updated_at = now;
    changed.set(key, {
      kind: k,
      id: r.id as string,
      baseRevision: base,
      committedRevision: r[k === "ITEM" ? "semantic_revision" : "revision"] as number,
    });
  };
  const mark = (k: f.CoreKind, r: CoreRow, changes: CoreRow) => {
    const state = { ...((r.field_state as Record<string, any>) ?? {}) };
    for (const [key, value] of Object.entries(changes)) {
      const address = table(k) + "." + key;
      if (
        q.admission.mode !== "MANUAL" &&
        state[address]?.protected &&
        canonicalCoreJson(value as Json) !== canonicalCoreJson(r[key] as Json)
      )
        throw new Error("PROTECTED_FIELD");
      if (q.admission.mode !== "MANUAL" && state[address]?.protected) continue;
      if (
        q.admission.mode !== "MANUAL" &&
        value === null &&
        r[key] === null &&
        !state[address]
      )
        continue;
      if (q.admission.mode === "AUTO_SOURCE" && value === null)
        throw new Error("AUTO_CLEAR_FORBIDDEN");
      state[address] = {
        state: value === null ? "CLEARED" : "KNOWN",
        origin:
          q.admission.mode === "MANUAL"
            ? "MANUAL"
            : q.admission.mode === "IMPORT"
              ? "PROVIDER"
              : "SOURCE",
        protected: q.admission.mode === "MANUAL",
        changed_revision: r[k === "ITEM" ? "semantic_revision" : "revision"] as number,
        evidence_ref: null,
      };
    }
    r.field_state = state;
    Object.assign(r, changes);
  };
  const defaults = (t: f.CoreTable): CoreRow =>
    Object.fromEntries(
      Object.keys(f.coreTableSchemas[t].shape)
        .filter((k) => k !== "identity_state")
        .map((k) => [k, null]),
    );
  const create = (
    k: f.CoreKind,
    id: string,
    values: CoreRow,
  ): CoreRow & { id: string } => {
    requireBase(k, id);
    if (g[table(k)].some((x) => x.id === id)) throw new Error("REVISION_CONFLICT");
    const r: CoreRow & { id: string } = {
      ...defaults(table(k)),
      id,
      trip_id: actor.tripId,
      owner_account_id: actor.accountId,
      created_at: now,
      updated_at: now,
      hidden_at: null,
      field_state: {},
      ...values,
    };
    g[table(k)].push(r);
    touch(k, r);
    return r;
  };
  const setAcl = (k: f.CoreKind, r: CoreRow, acl: any) => {
    checkPeople(acl.people);
    if (
      r.owner_account_id !== actor.accountId &&
      (r.visibility === "PRIVATE" || r.visibility !== acl.visibility)
    )
      throw new Error("SCOPE_NOT_AUTHORIZED");
    if (
      k === "INSTRUCTION" &&
      r.sensitivity === "SENSITIVE" &&
      acl.visibility !== "PRIVATE" &&
      r.owner_account_id !== actor.accountId
    )
      throw new Error("SCOPE_NOT_AUTHORIZED");
    if (k === "ORDER") throw new Error("SCOPE_NOT_AUTHORIZED");
    const [t, key] = aclTables[k];
    g[t] = g[t].filter((x) => x[key] !== r.id);
    for (const id of acl.people)
      g[t].push({ trip_id: actor.tripId, [key]: r.id, person_id: id });
    r.visibility = acl.visibility;
  };
  const setParticipants = (r: CoreRow, part: any) => {
    checkPeople(part.people);
    if (part.selfPersonId !== null && part.selfPersonId !== actor.personId)
      throw new Error("INVALID_SELF_PERSON");
    for (const row of g.trip_item_participants.filter((x) => x.item_id === r.id))
      row.active = part.people.includes(row.person_id);
    for (const id of part.people)
      if (!g.trip_item_participants.some((x) => x.item_id === r.id && x.person_id === id))
        g.trip_item_participants.push({
          trip_id: actor.tripId,
          item_id: r.id,
          person_id: id,
          active: true,
        });
    r.participation_mode = part.mode;
    r.self_person_id =
      part.mode === "SELF" ? (part.selfPersonId ?? actor.personId) : null;
    r.participant_scope = part.mode === "WHOLE_GROUP" ? "WHOLE_GROUP" : "ASSIGNED";
  };
  const setSchedule = (r: CoreRow, s: any) => {
    if (r.temporal_shape === "TRANSPORT") throw new Error("INVALID_AGGREGATE");
    const updates: CoreRow = {};
    for (const role of ["start", "end"]) {
      const b = s[role] as CoreBoundary | undefined;
      if (!b) continue;
      for (const [key, value] of Object.entries(b))
        updates[key === "instant" ? "planned_" + role : role + "_" + key] =
          key === "local_time" && value !== null
            ? normalizeCoreClock(value as string, b.clock_precision!)
            : value;
    }
    if (!s.start.local_date) throw new Error("INVALID_FACT");
    if (r.experience_family === "P3") r.temporal_shape = "STAY";
    else
      r.temporal_shape = s.end?.local_date
        ? "SPAN"
        : s.start.local_time || s.start.instant
          ? "POINT"
          : "CALENDAR";
    mark("ITEM", r, updates);
  };
  const detail = (t: f.CoreTable, id: string, values: CoreRow, role?: string) => {
    if (
      typeof values.local_time === "string" &&
      typeof values.clock_precision === "number"
    )
      values = {
        ...values,
        local_time: normalizeCoreClock(values.local_time, values.clock_precision),
      };
    const identity =
      t === "itinerary_transport_services"
        ? "service_key"
        : t === "trip_stay_rooms"
          ? "room_id"
          : "role";
    const old = g[t].find(
      (x) => x.event_id === id && (role === undefined || x[identity] === role),
    );
    const item = root("ITEM", id, true),
      address = t + "." + (role ? role + "." : "");
    const state = item.field_state as Record<string, any>;
    for (const [key, v] of Object.entries(values))
      if (
        q.admission.mode !== "MANUAL" &&
        state[address + key]?.protected &&
        canonicalCoreJson(v as Json) !== canonicalCoreJson((old?.[key] ?? null) as Json)
      )
        throw new Error("PROTECTED_FIELD");
    const row = {
      ...defaults(t),
      ...old,
      trip_id: actor.tripId,
      event_id: id,
      ...(role ? { [identity]: role } : {}),
      ...values,
    };
    g[t] = g[t].filter(
      (x) => !(x.event_id === id && (role === undefined || x[identity] === role)),
    );
    g[t].push(row);
    for (const [key, v] of Object.entries(values)) {
      if (q.admission.mode !== "MANUAL" && state[address + key]?.protected) continue;
      if (
        q.admission.mode !== "MANUAL" &&
        v === null &&
        (old?.[key] ?? null) === null &&
        !state[address + key]
      )
        continue;
      if (q.admission.mode === "AUTO_SOURCE" && v === null)
        throw new Error("AUTO_CLEAR_FORBIDDEN");
      state[address + key] = {
        state:
          v === null &&
          (old?.[key] == null ||
            (typeof old?.[key] === "string" &&
              !(old[key] as string).trim() &&
              isLegacyStoredP5Identity(old))) &&
          (values.identity_state as any)?.fields?.[key] === "UNKNOWN"
            ? "UNKNOWN"
            : v === null
              ? "CLEARED"
              : "KNOWN",
        origin:
          q.admission.mode === "MANUAL"
            ? "MANUAL"
            : q.admission.mode === "IMPORT"
              ? "PROVIDER"
              : "SOURCE",
        protected: q.admission.mode === "MANUAL",
        changed_revision: rev(item, "ITEM"),
        evidence_ref: null,
      };
    }
  };
  const manualChanges = (r: CoreRow, old: CoreRow, values: CoreRow, prefix: string) =>
    Object.fromEntries(
      Object.entries(values).filter(([key, value]) =>
        value === null
          ? old[key] !== null ||
            (r.field_state as Record<string, { state: string }>)[prefix + key]?.state !==
              "CLEARED"
          : canonicalCoreJson(value as Json) !==
            canonicalCoreJson((old[key] ?? null) as Json),
      ),
    );
  const manualRoot = (r: CoreRow, values: CoreRow) => {
    const changes = manualChanges(r, r, values, "itinerary_events.");
    if (!Object.keys(changes).length) return;
    touch("ITEM", r);
    mark("ITEM", r, changes);
  };
  const manualDetail = (r: CoreRow, t: f.CoreTable, values: CoreRow, role?: string) => {
    const identity =
      t === "itinerary_transport_services"
        ? "service_key"
        : t === "trip_stay_rooms"
          ? "room_id"
          : "role";
    const old =
      g[t].find(
        (row) => row.event_id === r.id && (role === undefined || row[identity] === role),
      ) ?? {};
    const changes = manualChanges(r, old, values, t + "." + (role ? role + "." : ""));
    if (!Object.keys(changes).length) return;
    touch("ITEM", r);
    detail(t, r.id as string, changes, role);
  };
  const manualPlace = (old: CoreRow, supplied: CoreRow): CoreRow => {
    const full = f.corePlaceSchema.safeParse(supplied).success;
    if (full)
      return Object.fromEntries(
        Object.entries(supplied).filter(
          ([key, value]) =>
            canonicalCoreJson(value as Json) !==
            canonicalCoreJson((old[key] ?? null) as Json),
        ),
      );
    const authored = Object.fromEntries(
      Object.entries(supplied).filter(
        ([key, value]) =>
          key.startsWith("authored_") &&
          (!full ||
            canonicalCoreJson(value as Json) !==
              canonicalCoreJson((old[key] ?? null) as Json)),
      ),
    );
    const changes = Object.keys(authored).length
      ? authoredPlaceChanges(old, authoredPlacePatchSchema.parse(authored))
      : {};
    return changes;
  };
  const manualTransportPoint = (
    r: CoreRow,
    t: "itinerary_transport_endpoints" | "trip_transport_operational_facts",
    role: string,
    changes: Record<string, any>,
  ) => {
    const old = g[t].find((row) => row.event_id === r.id && row.role === role);
    if (!old) throw new Error("NOT_VISIBLE");
    const values: CoreRow = {};
    if (changes.time) {
      const next = patchCoreBoundary(coreStoredBoundary(old), changes.time);
      for (const [key, value] of Object.entries(next))
        if (
          canonicalCoreJson((old[key] ?? null) as Json) !==
            canonicalCoreJson(value as Json) ||
          (Object.hasOwn(changes.time, key) && value === null)
        )
          values[key] = value;
    }
    if (changes.place) Object.assign(values, manualPlace(old, changes.place));
    manualDetail(r, t, values, role);
  };
  const replaceDetails = (t: f.CoreTable, id: string, rows: CoreRow[], key: string) => {
    const item = root("ITEM", id, true);
    const state = item.field_state as Record<string, any>;
    const removed = g[t].filter(
      (r) => r.event_id === id && !rows.some((n) => n[key] === r[key]),
    );
    for (const row of removed)
      if (
        q.admission.mode !== "MANUAL" &&
        Object.entries(state).some(
          ([address, meta]) =>
            address.startsWith(t + "." + row[key] + ".") && meta.protected,
        )
      )
        throw new Error("PROTECTED_FIELD");
    for (const row of rows) {
      const { [key]: identity, ...facts } = row;
      if (
        t === "itinerary_transport_services" &&
        facts.identity_state === undefined &&
        g[t].some((old) => old.event_id === id && old.identity_state !== undefined)
      )
        throw new Error("INVALID_TRANSPORT_IDENTITY");
      detail(t, id, facts, identity as string);
    }
    g[t] = g[t].filter((r) => r.event_id !== id || rows.some((n) => n[key] === r[key]));
    for (const row of removed)
      for (const field of Object.keys(row)) {
        const address = t + "." + row[key] + "." + field;
        if (!f.isCoreFieldAddress(address)) continue;
        state[address] = {
          state: "CLEARED",
          origin:
            q.admission.mode === "MANUAL"
              ? "MANUAL"
              : q.admission.mode === "IMPORT"
                ? "PROVIDER"
                : "SOURCE",
          protected: q.admission.mode === "MANUAL",
          changed_revision: rev(item, "ITEM"),
          evidence_ref: null,
        };
      }
  };
  const clearPlace = Object.fromEntries(
    Object.keys(f.corePlaceSchema.shape).map((key) => [key, null]),
  );
  const relation = (
    t: f.CoreTable,
    owner: f.CoreKind,
    r: CoreRow,
    parentKey: string,
    childKey: string,
    childKind: f.CoreKind,
    add: any[],
    remove: string[],
  ) => {
    for (const raw of add) {
      const id = typeof raw === "string" ? raw : raw.itemId;
      requireBase(childKind, id);
      root(childKind, id, true);
      const existing = g[t].find((x) => x[parentKey] === r.id && x[childKey] === id);
      if (existing?.active === true && typeof raw === "string")
        throw new Error("DUPLICATE_LINK");
      const extra =
        typeof raw === "string"
          ? {}
          : Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "itemId"));
      const row = {
        ...defaults(t),
        ...existing,
        trip_id: actor.tripId,
        [parentKey]: r.id,
        [childKey]: id,
        active: true,
        linked_by: existing?.linked_by ?? actor.accountId,
        linked_at: existing?.linked_at ?? now,
        ...extra,
      };
      g[t] = g[t].filter((x) => !(x[parentKey] === r.id && x[childKey] === id));
      g[t].push(row);
    }
    for (const id of remove) {
      requireBase(childKind, id);
      root(childKind, id, true);
      const edge = g[t].find((x) => x[parentKey] === r.id && x[childKey] === id);
      if (!edge || edge.active !== true) throw new Error("INVALID_LINK");
      edge.active = false;
    }
    touch(owner, r);
  };
  const addObservation = (booking: CoreRow, list: any[]) => {
    for (const x of list) {
      if (g.trip_booking_observations.some((o) => o.observation_id === x.observation_id))
        throw new Error("DUPLICATE_OBSERVATION");
      const v = x;
      g.trip_booking_observations.push({
        trip_id: actor.tripId,
        booking_id: booking.id,
        ...v,
      });
    }
  };
  const target = () => root(q.target.kind as f.CoreKind, q.target.id, true);
  const newItem = (family: string, title: string) =>
    create("ITEM", q.target.id, {
      business_contract_version: 2,
      temporal_contract_version: 1,
      experience_family: family,
      title,
      description: p.core?.description ?? null,
      event_type: (
        {
          P1: "activity",
          P2: "flight",
          P3: "hotel",
          P4: "car",
          P5: "transport",
          P6: "activity",
        } as Record<string, string>
      )[family],
      status: "planned",
      temporal_shape:
        family === "P5" ? "TRANSPORT" : family === "P3" ? "STAY" : "CALENDAR",
      participant_scope: "ASSIGNED",
      participation_mode: "SELF",
    });
  const setFlight = (r: CoreRow, full: any) => {
    const oldDate =
      r.temporal_shape === "CALENDAR"
        ? r.start_local_date
        : g.itinerary_transport_endpoints.find(
            (x) => x.event_id === r.id && x.role === "ORIGIN",
          )?.local_date;
    if (
      q.command === "QUALIFY_FLIGHT" &&
      Object.keys(f.corePlaceSchema.shape).some((key) => r[key] !== null)
    )
      throw new Error("PROTECTED_FIELD");
    if (q.command === "QUALIFY_FLIGHT" && oldDate !== full.origin.time.local_date)
      throw new Error("PROTECTED_FIELD");
    if (
      q.command === "QUALIFY_FLIGHT" &&
      (r.experience_family !== "P2" ||
        r.temporal_shape !== "CALENDAR" ||
        g.itinerary_transport_services.some((x) => x.event_id === r.id))
    )
      throw new Error("INVALID_AGGREGATE");
    if (q.command !== "QUALIFY_FLIGHT" && r.temporal_shape !== "TRANSPORT")
      throw new Error("INVALID_AGGREGATE");
    for (const [input, role] of [
      ["origin", "ORIGIN"],
      ["destination", "DESTINATION"],
    ] as const) {
      const x = full[input];
      if (!x) continue;
      const { fold_choice: _foldChoice, ...storedTime } = x.time;
      const time = x.time;
      detail(
        "itinerary_transport_endpoints",
        r.id as string,
        {
          ...storedTime,
          instant: time.source_instant,
          civil_resolution: "PENDING",
          resolution_offset_seconds: null,
          interpretation_key: null,
          interpretation_input_sha256: null,
          provenance_refs: null,
          ...x.location,
        },
        role,
      );
    }
    if (full.services) {
      const state = r.field_state as Record<string, any>;
      const oldServices = g.itinerary_transport_services.filter(
        (x) => x.event_id === r.id,
      );
      for (const old of oldServices) {
        if (
          !full.services.some((x: CoreRow) => x.service_key === old.service_key) &&
          q.admission.mode !== "MANUAL" &&
          Object.keys(state).some(
            (key) =>
              key.startsWith("itinerary_transport_services." + old.service_key + ".") &&
              state[key].protected,
          )
        )
          throw new Error("PROTECTED_FIELD");
      }
      for (const service of full.services) {
        const old = oldServices.find((x) => x.service_key === service.service_key);
        for (const [field, value] of Object.entries(service)) {
          const key = "itinerary_transport_services." + service.service_key + "." + field;
          if (q.admission.mode !== "MANUAL" && state[key]?.protected) {
            if (
              canonicalCoreJson(value as Json) !==
              canonicalCoreJson((old?.[field] ?? null) as Json)
            )
              throw new Error("PROTECTED_FIELD");
            continue;
          }
          state[key] = {
            state: value === null ? "CLEARED" : "KNOWN",
            origin:
              q.admission.mode === "MANUAL"
                ? "MANUAL"
                : q.admission.mode === "IMPORT"
                  ? "PROVIDER"
                  : "SOURCE",
            protected: q.admission.mode === "MANUAL",
            changed_revision: rev(r, "ITEM"),
            evidence_ref: null,
          };
        }
      }
      g.itinerary_transport_services = g.itinerary_transport_services.filter(
        (x) => x.event_id !== r.id,
      );
      for (const service of full.services)
        g.itinerary_transport_services.push({
          event_id: r.id,
          trip_id: actor.tripId,
          ...service,
        });
    }
    if (full.title !== undefined) mark("ITEM", r, { title: full.title });
    if (q.command === "QUALIFY_FLIGHT") {
      for (const key of Object.keys(r))
        if (
          key.startsWith("start_") ||
          key.startsWith("end_") ||
          key === "planned_start" ||
          key === "planned_end"
        )
          r[key] = null;
      const state = r.field_state as Record<string, unknown>;
      const protectedDate = state["itinerary_events.start_local_date"];
      if (protectedDate)
        state["itinerary_transport_endpoints.ORIGIN.local_date"] = protectedDate;
      const intent = g.trip_flight_intents.find((x) => x.event_id === r.id);
      if (!intent) throw new Error("INVALID_AGGREGATE");
      intent.qualification = "QUALIFIED";
    }
    r.temporal_shape = "TRANSPORT";
    r.event_type = "transport";
  };
  switch (q.command) {
    case "SET_AUTHORED_FLIGHT_DETAILS":
    case "SAVE_AUTHORED_FLIGHT_LOCAL": {
      const formal = q.command === "SET_AUTHORED_FLIGHT_DETAILS";
      if (!formal && (!local || q.admission.mode !== "MANUAL"))
        throw new Error("LOCAL_CAPABILITY_REQUIRED");
      if (formal && "patch" in p) {
        if (q.admission.mode !== "MANUAL") throw new Error("SCOPE_NOT_AUTHORIZED");
        const r = target();
        const intent = g.trip_flight_intents.find((row) => row.event_id === r.id);
        if (
          r.experience_family !== "P2" ||
          intent?.qualification !== "SPARSE" ||
          r.owner_account_id !== actor.accountId
        )
          throw new Error("MANUAL_FLIGHT_EDIT_UNAVAILABLE");
        const patch = p.patch;
        if (patch.flightNumberLiteral !== undefined) {
          manualRoot(r, { title: patch.flightNumberLiteral });
          manualDetail(r, "trip_flight_intents", {
            flight_number_literal: patch.flightNumberLiteral,
          });
        }
        if (patch.origin || patch.destination) {
          if (r.temporal_shape !== "TRANSPORT") {
            const previous = coreStoredBoundary(r, "start");
            const previousState = structuredClone(r.field_state) as Record<
              string,
              unknown
            >;
            touch("ITEM", r);
            detail("itinerary_transport_endpoints", r.id as string, previous, "ORIGIN");
            detail(
              "itinerary_transport_endpoints",
              r.id as string,
              emptyCoreBoundary(),
              "DESTINATION",
            );
            const cleared: CoreRow = {};
            for (const [key] of Object.entries(previous)) {
              const column = key === "instant" ? "planned_start" : "start_" + key;
              if (Object.hasOwn(previousState, "itinerary_events." + column))
                (r.field_state as Record<string, unknown>)[
                  "itinerary_transport_endpoints.ORIGIN." + key
                ] = previousState["itinerary_events." + column];
              if (r[column] !== null) cleared[column] = null;
            }
            for (const key of Object.keys(emptyCoreBoundary())) {
              const column = key === "instant" ? "planned_end" : "end_" + key;
              if (r[column] !== null) cleared[column] = null;
            }
            manualRoot(r, cleared);
            r.temporal_shape = "TRANSPORT";
            r.event_type = "flight";
          }
          for (const [input, role] of [
            ["origin", "ORIGIN"],
            ["destination", "DESTINATION"],
          ] as const) {
            const changes = patch[input];
            if (!changes) continue;
            const endpoint = g.itinerary_transport_endpoints.find(
              (row) => row.event_id === r.id && row.role === role,
            )!;
            if (changes.time) {
              const previous = coreStoredBoundary(endpoint),
                next = patchCoreBoundary(previous, changes.time);
              const values = Object.fromEntries(
                Object.entries(next).filter(
                  ([key, value]) =>
                    canonicalCoreJson((endpoint[key] ?? null) as Json) !==
                      canonicalCoreJson(value as Json) ||
                    (Object.hasOwn(changes.time, key) && value === null),
                ),
              );
              manualDetail(r, "itinerary_transport_endpoints", values, role);
            }
            if (Object.hasOwn(changes, "name"))
              manualDetail(
                r,
                "itinerary_transport_endpoints",
                manualPlace(endpoint, { authored_label: changes.name }),
                role,
              );
            const annotations: CoreRow = {};
            if (Object.hasOwn(changes, "airportCode"))
              annotations.airport_code = changes.airportCode;
            if (Object.hasOwn(changes, "terminal"))
              annotations.terminal = changes.terminal;
            manualDetail(r, "trip_endpoint_details", annotations, role);
          }
        }
        break;
      }
      const b = formal
        ? authoredFlightDetailsSchema.parse(p)
        : localAuthoredFlightPayloadSchema.parse(p);
      const existing = g.itinerary_events.find((x) => x.id === q.target.id);
      if (formal && (!existing || existing.owner_account_id !== actor.accountId))
        throw new Error("MANUAL_FLIGHT_EDIT_UNAVAILABLE");
      if (
        q.admission.mode === "IMPORT" &&
        (!existing ||
          existing.semantic_revision !== 1 ||
          Object.values(existing.field_state as Record<string, { origin: string }>).some(
            (field) => field.origin !== "PROVIDER",
          ))
      )
        throw new Error("PROTECTED_FIELD");
      const intent = g.trip_flight_intents.find((x) => x.event_id === q.target.id);
      if (
        existing &&
        (existing.experience_family !== "P2" || intent?.qualification !== "SPARSE")
      )
        throw new Error("MANUAL_FLIGHT_EDIT_UNAVAILABLE");
      const r = existing
        ? root("ITEM", q.target.id, true)
        : newItem("P2", b.flightNumberLiteral);
      if (existing) touch("ITEM", r);
      if ("participation" in b && "acl" in b) {
        setParticipants(r, b.participation);
        if (!existing) setAcl("ITEM", r, b.acl);
      }
      mark("ITEM", r, { title: b.flightNumberLiteral });
      for (const [input, role] of [
        ["origin", "ORIGIN"],
        ["destination", "DESTINATION"],
      ] as const) {
        detail(
          "itinerary_transport_endpoints",
          r.id as string,
          {
            ...b[input].time,
            authored_label: b[input].name,
          },
          role,
        );
        detail(
          "trip_endpoint_details",
          r.id as string,
          {
            airport_code: b[input].airportCode,
            terminal: b[input].terminal,
          },
          role,
        );
      }
      // Authored structure is unresolved; it does not qualify a physical or commercial flight.
      r.temporal_shape = "TRANSPORT";
      r.event_type = "flight";
      for (const key of Object.keys(r))
        if (
          key.startsWith("start_") ||
          key.startsWith("end_") ||
          key === "planned_start" ||
          key === "planned_end"
        )
          r[key] = null;
      if (intent) intent.flight_number_literal = b.flightNumberLiteral;
      else
        g.trip_flight_intents.push({
          trip_id: actor.tripId,
          event_id: r.id,
          flight_number_literal: b.flightNumberLiteral,
          qualification: "SPARSE",
        });
      break;
    }
    case "CREATE_BOOKING_EVIDENCED_FLIGHT_LOCAL": {
      if (!local || q.admission.mode !== "LOCAL_REVIEWED_SOURCE")
        throw new Error("LOCAL_CAPABILITY_REQUIRED");
      const b = localBookedFlightPayloadSchema.parse(p);
      const r = newItem("P2", b.core.title);
      setParticipants(r, b.participation);
      setAcl("ITEM", r, b.acl);
      mark("ITEM", r, { title: r.title });
      for (const [input, role] of [
        ["origin", "ORIGIN"],
        ["destination", "DESTINATION"],
      ] as const) {
        detail("itinerary_transport_endpoints", r.id, b[input].time, role);
        detail(
          "trip_endpoint_details",
          r.id,
          { airport_code: b[input].airportCode },
          role,
        );
      }
      r.temporal_shape = "TRANSPORT";
      r.event_type = "flight";
      g.trip_flight_intents.push({
        trip_id: actor.tripId,
        event_id: r.id,
        flight_number_literal: b.flightNumberLiteral,
        qualification: "BOOKING_EVIDENCED_ROUTE_TIME",
        qualification_basis: "BOOKING_EVIDENCED_ROUTE_TIME_LOCAL/1",
      });
      break;
    }
    case "CREATE_SPARSE_FLIGHT": {
      const r = newItem("P2", p.core?.title ?? p.flightNumberLiteral);
      setParticipants(r, p.participation);
      setAcl("ITEM", r, p.acl);
      setSchedule(r, { start: coreDateBoundary(p.departureDate) });
      mark("ITEM", r, { title: r.title });
      g.trip_flight_intents.push({
        trip_id: actor.tripId,
        event_id: r.id,
        flight_number_literal: p.flightNumberLiteral,
        qualification: "SPARSE",
      });
      break;
    }
    case "CREATE_ITEM": {
      const r = newItem(p.family, p.core.title);
      setParticipants(r, p.participation);
      setAcl("ITEM", r, p.acl);
      mark("ITEM", r, {
        title: r.title,
        ...(p.core.description !== undefined ? { description: r.description } : {}),
      });
      if (p.family === "P5") {
        for (const [input, role] of [
          ["origin", "ORIGIN"],
          ["destination", "DESTINATION"],
        ] as const)
          detail(
            "itinerary_transport_endpoints",
            r.id,
            { ...p.endpoints[input].time, ...p.endpoints[input].place },
            role,
          );
        replaceDetails(
          "itinerary_transport_services",
          r.id as string,
          [p.service],
          "service_key",
        );
      } else setSchedule(r, p.schedule);
      if (p.place) mark("ITEM", r, p.place);
      if (p.category) r.activity_category = p.category;
      if (p.family === "P3") {
        detail("trip_stay_details", r.id, p.details ?? {});
        replaceDetails("trip_stay_rooms", r.id as string, p.rooms ?? [], "room_id");
      }
      if (p.family === "P4") {
        detail("trip_rental_details", r.id, p.details ?? {});
        for (const [input, role] of [
          ["pickup", "PICKUP"],
          ["return", "RETURN"],
        ] as const)
          if (p.places?.[input])
            detail("trip_rental_places", r.id, p.places[input], role);
      }
      if (p.family === "P6") {
        detail("trip_activity_details", r.id, p.details ?? {});
        if (p.entryPlace)
          detail("trip_activity_entry_places", r.id, p.entryPlace, "ENTRY");
      }
      if (p.family === "P5") {
        for (const [input, role] of [
          ["origin", "ORIGIN"],
          ["destination", "DESTINATION"],
        ] as const)
          if (p.annotations?.[input])
            detail("trip_endpoint_details", r.id, p.annotations[input], role);
        for (const x of p.operationalFacts ?? [])
          detail(
            "trip_transport_operational_facts",
            r.id,
            { ...x.time, ...x.place },
            x.role,
          );
      }
      break;
    }
    case "QUALIFY_FLIGHT":
    case "REPLACE_FLIGHT_SERVICE":
    case "UPDATE_FLIGHT_FACTS": {
      const r = target();
      touch("ITEM", r);
      setFlight(r, p.changes ?? p);
      break;
    }
    case "SET_ITEM_TEXT": {
      const r = target();
      if (
        q.admission.mode === "MANUAL" &&
        r.experience_family === "P2" &&
        Object.hasOwn(p, "title")
      )
        throw new Error("INVALID_AGGREGATE");
      touch("ITEM", r);
      mark("ITEM", r, p);
      break;
    }
    case "SET_ORDINARY_ORDER": {
      if (
        q.admission.mode !== "MANUAL" ||
        !actor.personId ||
        p.personId !== actor.personId
      )
        throw new Error("INVALID_SELF_PERSON");
      const existing = g.trip_person_ordinary_orders.find((x) => x.id === q.target.id);
      if (existing && existing.person_id !== p.personId)
        throw new Error("SCOPE_NOT_AUTHORIZED");
      if (
        g.trip_person_ordinary_orders.some(
          (x) => x.id !== q.target.id && x.person_id === p.personId,
        )
      )
        throw new Error("INVALID_AGGREGATE");
      const refs = new Set<string>([
        ...p.nodes.map((n: any) => n.eventId),
        ...p.gaps.flatMap((x: any) => (x.transportId ? [x.transportId] : [])),
      ]);
      for (const id of refs) {
        requireBase("ITEM", id);
        const item = root("ITEM", id);
        if (!(
          item.participation_mode === "WHOLE_GROUP" ||
          (item.participation_mode === "SELF" &&
            item.self_person_id === actor.personId) ||
          (item.participation_mode === "SELECTED_MEMBERS" &&
            g.trip_item_participants.some(
              (x) => x.item_id === id && x.active && x.person_id === actor.personId,
            ))
        ))
          throw new Error("INVALID_PARTICIPATION");
      }
      for (const gap of p.gaps)
        if (gap.transportId) {
          const leg = root("ITEM", gap.transportId);
          if (
            leg.temporal_shape !== "TRANSPORT" ||
            p.nodes.some((x: any) => x.eventId === gap.transportId)
          )
            throw new Error("INVALID_AGGREGATE");
        }
      const row =
        existing ??
        create("ORDER", q.target.id, {
          person_id: p.personId,
          branch_id: p.branchId,
          visibility: "PRIVATE",
          nodes: [],
          gaps: [],
        });
      if (existing) touch("ORDER", row);
      mark("ORDER", row, { branch_id: p.branchId, nodes: p.nodes, gaps: p.gaps });
      break;
    }
    case "SET_ITEM_SCHEDULE": {
      const r = target();
      if ("schedulePatch" in p) {
        if (q.admission.mode !== "MANUAL" || r.temporal_shape === "TRANSPORT")
          throw new Error("SCOPE_NOT_AUTHORIZED");
        const values: CoreRow = {};
        for (const role of ["start", "end"] as const) {
          if (!Object.hasOwn(p.schedulePatch, role)) continue;
          const patch = p.schedulePatch[role] as SparseBoundaryPatch | null;
          if (patch === null) {
            for (const key of Object.keys(emptyCoreBoundary())) {
              const column = key === "instant" ? "planned_" + role : role + "_" + key;
              if (r[column] !== null) values[column] = null;
            }
            continue;
          }
          const previous =
            r[role + "_quality"] == null
              ? emptyCoreBoundary()
              : coreStoredBoundary(r, role);
          const next = patchCoreBoundary(previous, patch);
          for (const [key, value] of Object.entries(next)) {
            const column = key === "instant" ? "planned_" + role : role + "_" + key;
            if (
              canonicalCoreJson((r[column] ?? null) as Json) !==
                canonicalCoreJson(value as Json) ||
              (Object.hasOwn(patch, key) &&
                value === null &&
                (r.field_state as Record<string, { state: string }>)[
                  "itinerary_events." + column
                ]?.state !== "CLEARED")
            )
              values[column] = value;
          }
        }
        if (!Object.keys(values).length) break;
        touch("ITEM", r);
        mark("ITEM", r, values);
        if (!r.start_local_date) throw new Error("INVALID_FACT");
        r.temporal_shape =
          r.experience_family === "P3"
            ? "STAY"
            : r.end_local_date
              ? "SPAN"
              : r.start_local_time || r.planned_start
                ? "POINT"
                : "CALENDAR";
        break;
      }
      touch("ITEM", r);
      setSchedule(r, p.schedule);
      break;
    }
    case "SET_ITEM_PLACE": {
      const r = target();
      if (!["P1", "P3", "P6"].includes(r.experience_family as string))
        throw new Error("INVALID_AGGREGATE");
      if (q.admission.mode === "MANUAL") manualRoot(r, manualPlace(r, p.place));
      else {
        touch("ITEM", r);
        mark("ITEM", r, p.place);
      }
      break;
    }
    case "SET_ITEM_GROUPING": {
      const r = target();
      touch("ITEM", r);
      mark("ITEM", r, { trip_day_id: p.tripDayId, order_index: p.orderIndex });
      break;
    }
    case "SET_ITEM_PARTICIPATION": {
      const r = target();
      touch("ITEM", r);
      setParticipants(r, p.participation);
      break;
    }
    case "SET_OBJECT_VISIBILITY": {
      const r = target();
      touch(q.target.kind as f.CoreKind, r);
      if (q.admission.mode !== "MANUAL") throw new Error("SCOPE_NOT_AUTHORIZED");
      setAcl(q.target.kind as f.CoreKind, r, p.acl);
      break;
    }
    case "SET_ITEM_CATEGORY": {
      const r = target();
      if (!["P1", "P6"].includes(r.experience_family as string))
        throw new Error("INVALID_AGGREGATE");
      if (p.family !== r.experience_family) throw new Error("INVALID_AGGREGATE");
      touch("ITEM", r);
      mark("ITEM", r, { experience_family: p.family, activity_category: p.category });
      break;
    }
    case "SET_ITEM_STATUS": {
      const r = target();
      touch("ITEM", r);
      mark("ITEM", r, { status: p.status });
      break;
    }
    case "SET_STAY_DETAILS": {
      const r = target();
      if (r.experience_family !== "P3") throw new Error("INVALID_AGGREGATE");
      if ("rooms" in p) {
        touch("ITEM", r);
        detail("trip_stay_details", r.id as string, p.details);
        replaceDetails("trip_stay_rooms", r.id as string, p.rooms, "room_id");
        break;
      }
      if (q.admission.mode !== "MANUAL") throw new Error("SCOPE_NOT_AUTHORIZED");
      const sparseDetail = (
        t: "trip_stay_details" | "trip_stay_rooms",
        values: CoreRow,
        roomId?: string,
      ) => {
        const old = g[t].find(
          (row) =>
            row.event_id === r.id && (roomId === undefined || row.room_id === roomId),
        );
        const prefix = t + "." + (roomId ? roomId + "." : "");
        const state = r.field_state as Record<string, { state: string }>;
        const changes = Object.fromEntries(
          Object.entries(values).filter(([key, value]) =>
            value === null
              ? old?.[key] !== null || state[prefix + key]?.state !== "CLEARED"
              : canonicalCoreJson(value as Json) !==
                canonicalCoreJson((old?.[key] ?? null) as Json),
          ),
        );
        if (!Object.keys(changes).length) return;
        touch("ITEM", r);
        detail(t, r.id as string, changes, roomId);
      };
      if (p.details) sparseDetail("trip_stay_details", p.details);
      for (const change of p.roomChanges ?? []) {
        if (change.operation === "ADD") {
          const { room_id, ...facts } = change.room;
          if (g.trip_stay_rooms.some((row) => row.room_id === room_id))
            throw new Error("DUPLICATE_CORE_ROW");
          touch("ITEM", r);
          detail("trip_stay_rooms", r.id as string, facts, room_id);
          continue;
        }
        const old = g.trip_stay_rooms.find(
          (row) => row.event_id === r.id && row.room_id === change.room_id,
        );
        if (!old) throw new Error("NOT_VISIBLE");
        if (change.operation === "PATCH") {
          sparseDetail("trip_stay_rooms", change.changes, change.room_id);
          continue;
        }
        touch("ITEM", r);
        g.trip_stay_rooms = g.trip_stay_rooms.filter((row) => row !== old);
        const state = r.field_state as Record<string, unknown>;
        for (const field of ["category", "quantity", "capacity"]) {
          state["trip_stay_rooms." + change.room_id + "." + field] = {
            state: "CLEARED",
            origin: "MANUAL",
            protected: true,
            changed_revision: rev(r, "ITEM"),
            evidence_ref: null,
          };
        }
      }
      if (g.trip_stay_rooms.filter((row) => row.event_id === r.id).length > 64)
        throw new Error("INVALID_AGGREGATE");
      break;
    }
    case "SET_RENTAL_DETAILS": {
      const r = target();
      if (r.experience_family !== "P4") throw new Error("INVALID_AGGREGATE");
      if (q.admission.mode !== "MANUAL") {
        touch("ITEM", r);
        detail("trip_rental_details", r.id as string, p.details);
      } else if (p.details) manualDetail(r, "trip_rental_details", p.details);
      for (const [input, role] of [
        ["pickup", "PICKUP"],
        ["return", "RETURN"],
      ] as const)
        if (Object.hasOwn(p.places ?? {}, input)) {
          if (q.admission.mode === "MANUAL") {
            const old =
              g.trip_rental_places.find(
                (row) => row.event_id === r.id && row.role === role,
              ) ?? {};
            manualDetail(
              r,
              "trip_rental_places",
              p.places[input] === null ? clearPlace : manualPlace(old, p.places[input]),
              role,
            );
          } else
            detail(
              "trip_rental_places",
              r.id as string,
              p.places[input] ?? clearPlace,
              role,
            );
        }
      break;
    }
    case "SET_ACTIVITY_DETAILS": {
      const r = target();
      if (r.experience_family !== "P6") throw new Error("INVALID_AGGREGATE");
      if (q.admission.mode === "MANUAL") {
        if (p.details) manualDetail(r, "trip_activity_details", p.details);
        if (Object.hasOwn(p, "entryPlace")) {
          const old =
            g.trip_activity_entry_places.find((row) => row.event_id === r.id) ?? {};
          manualDetail(
            r,
            "trip_activity_entry_places",
            p.entryPlace === null ? clearPlace : manualPlace(old, p.entryPlace),
            "ENTRY",
          );
        }
        break;
      }
      touch("ITEM", r);
      detail("trip_activity_details", r.id as string, p.details);
      detail(
        "trip_activity_entry_places",
        r.id as string,
        p.entryPlace ?? clearPlace,
        "ENTRY",
      );
      break;
    }
    case "SET_TRANSPORT_DETAILS": {
      const r = target();
      if (r.experience_family !== "P5") throw new Error("INVALID_AGGREGATE");
      if ("patch" in p) {
        if (q.admission.mode !== "MANUAL") throw new Error("SCOPE_NOT_AUTHORIZED");
        const patch = p.patch;
        for (const [input, role] of [
          ["origin", "ORIGIN"],
          ["destination", "DESTINATION"],
        ] as const) {
          if (patch.endpoints?.[input])
            manualTransportPoint(
              r,
              "itinerary_transport_endpoints",
              role,
              patch.endpoints[input],
            );
          if (patch.annotations?.[input])
            manualDetail(r, "trip_endpoint_details", patch.annotations[input], role);
        }
        if (patch.service) {
          const services = g.itinerary_transport_services.filter(
            (row) => row.event_id === r.id,
          );
          const old =
            services.find((row) => row.service_key === patch.service.service_key) ??
            (services.length === 1 ? services[0] : undefined);
          if (!old) throw new Error("INVALID_AGGREGATE");
          const facts = p5IdentityPatch(old, patch.service);
          const key = patch.service.service_key ?? old.service_key;
          if (key !== old.service_key) {
            touch("ITEM", r);
            const state = r.field_state as Record<string, unknown>,
              prefix = "itinerary_transport_services." + old.service_key + ".";
            for (const address of Object.keys(state))
              if (address.startsWith(prefix)) {
                state[
                  "itinerary_transport_services." +
                    key +
                    "." +
                    address.slice(prefix.length)
                ] = state[address];
                delete state[address];
              }
            old.service_key = key;
          }

          manualDetail(r, "itinerary_transport_services", facts, key as string);
        }
        for (const change of patch.operationalChanges ?? []) {
          const role = change.operation === "ADD" ? change.fact.role : change.role;
          const old = g.trip_transport_operational_facts.find(
            (row) => row.event_id === r.id && row.role === role,
          );
          if (change.operation === "ADD") {
            if (old) throw new Error("DUPLICATE_CORE_ROW");
            touch("ITEM", r);
            detail(
              "trip_transport_operational_facts",
              r.id as string,
              { ...change.fact.time, ...change.fact.place },
              role,
            );
          } else if (change.operation === "PATCH")
            manualTransportPoint(
              r,
              "trip_transport_operational_facts",
              role,
              change.changes,
            );
          else if (old) {
            touch("ITEM", r);
            g.trip_transport_operational_facts =
              g.trip_transport_operational_facts.filter((row) => row !== old);
            const state = r.field_state as Record<string, unknown>;
            for (const key of Object.keys(old))
              if (!["trip_id", "event_id", "role"].includes(key))
                state["trip_transport_operational_facts." + role + "." + key] = {
                  state: "CLEARED",
                  origin: "MANUAL",
                  protected: true,
                  changed_revision: rev(r, "ITEM"),
                  evidence_ref: null,
                };
          }
        }
        break;
      }
      touch("ITEM", r);
      if (p.endpoints)
        for (const [input, role] of [
          ["origin", "ORIGIN"],
          ["destination", "DESTINATION"],
        ] as const)
          detail(
            "itinerary_transport_endpoints",
            r.id as string,
            { ...p.endpoints[input].time, ...p.endpoints[input].place },
            role,
          );
      if (p.service)
        replaceDetails(
          "itinerary_transport_services",
          r.id as string,
          [p.service],
          "service_key",
        );
      if (p.annotations)
        for (const [input, role] of [
          ["origin", "ORIGIN"],
          ["destination", "DESTINATION"],
        ] as const)
          if (p.annotations[input])
            detail("trip_endpoint_details", r.id as string, p.annotations[input], role);
      if (p.operationalFacts)
        replaceDetails(
          "trip_transport_operational_facts",
          r.id as string,
          p.operationalFacts.map((x: any) => ({ role: x.role, ...x.time, ...x.place })),
          "role",
        );
      break;
    }
    case "CREATE_BOOKING": {
      const r = create("BOOKING", q.target.id, {
        business_contract_version: 2,
        commercial_status: "ACTIVE",
        ...p.fields,
      });
      setAcl("BOOKING", r, p.acl);
      mark("BOOKING", r, p.fields);
      addObservation(r, p.observations);
      relation(
        "trip_booking_item_links",
        "BOOKING",
        r,
        "booking_id",
        "item_id",
        "ITEM",
        p.itemIds,
        [],
      );
      relation(
        "trip_booking_entitlement_links",
        "BOOKING",
        r,
        "booking_id",
        "entitlement_id",
        "ENTITLEMENT",
        p.entitlementIds,
        [],
      );
      relation(
        "trip_booking_document_links",
        "BOOKING",
        r,
        "booking_id",
        "document_id",
        "DOCUMENT",
        p.documentIds,
        [],
      );
      break;
    }
    case "UPDATE_BOOKING": {
      const r = target();
      touch("BOOKING", r);
      mark("BOOKING", r, p.fields);
      addObservation(r, p.appendObservations);
      break;
    }
    case "RECONCILE_BOOKING_LINKS": {
      const r = target();
      for (const [input, t, key, k] of [
        ["items", "trip_booking_item_links", "item_id", "ITEM"],
        [
          "entitlements",
          "trip_booking_entitlement_links",
          "entitlement_id",
          "ENTITLEMENT",
        ],
        ["documents", "trip_booking_document_links", "document_id", "DOCUMENT"],
      ] as const)
        relation(t, "BOOKING", r, "booking_id", key, k, p[input].add, p[input].remove);
      break;
    }
    case "CREATE_ENTITLEMENT": {
      const r = create("ENTITLEMENT", q.target.id, {
        status: "ACTIVE",
        access_class: "UNKNOWN",
        ...p.fields,
      });
      setAcl("ENTITLEMENT", r, p.acl);
      mark("ENTITLEMENT", r, p.fields);
      checkPeople(p.holders);
      for (const id of p.holders)
        g.trip_entitlement_holders.push({
          trip_id: actor.tripId,
          entitlement_id: r.id,
          person_id: id,
          active: true,
        });
      relation(
        "trip_entitlement_item_links",
        "ENTITLEMENT",
        r,
        "entitlement_id",
        "item_id",
        "ITEM",
        p.itemLinks,
        [],
      );
      relation(
        "trip_entitlement_document_links",
        "ENTITLEMENT",
        r,
        "entitlement_id",
        "document_id",
        "DOCUMENT",
        p.documentIds,
        [],
      );
      break;
    }
    case "UPDATE_ENTITLEMENT": {
      const r = target();
      touch("ENTITLEMENT", r);
      mark("ENTITLEMENT", r, p.fields);
      checkPeople(p.holders);
      for (const row of g.trip_entitlement_holders.filter(
        (x) => x.entitlement_id === r.id,
      ))
        row.active = p.holders.includes(row.person_id);
      for (const id of p.holders)
        if (
          !g.trip_entitlement_holders.some(
            (x) => x.entitlement_id === r.id && x.person_id === id,
          )
        )
          g.trip_entitlement_holders.push({
            trip_id: actor.tripId,
            entitlement_id: r.id,
            person_id: id,
            active: true,
          });
      break;
    }
    case "RECONCILE_ENTITLEMENT_LINKS": {
      const r = target();
      relation(
        "trip_entitlement_item_links",
        "ENTITLEMENT",
        r,
        "entitlement_id",
        "item_id",
        "ITEM",
        p.items.add,
        p.items.remove,
      );
      relation(
        "trip_entitlement_document_links",
        "ENTITLEMENT",
        r,
        "entitlement_id",
        "document_id",
        "DOCUMENT",
        p.documents.add,
        p.documents.remove,
      );
      break;
    }
    case "RECONCILE_ITEM_DOCUMENTS": {
      const r = target();
      relation(
        "trip_item_document_links",
        "ITEM",
        r,
        "item_id",
        "document_id",
        "DOCUMENT",
        p.add,
        p.remove,
      );
      break;
    }
    case "APPEND_INSTRUCTION": {
      requireBase("ITEM", p.itemId);
      const item = root("ITEM", p.itemId, true);
      touch("ITEM", item);
      const r = create("INSTRUCTION", q.target.id, {
        event_id: p.itemId,
        section: p.section,
        body: p.body,
        sensitivity: p.sensitivity,
        source_representation_id: p.sourceRepresentationId,
      });
      if (
        p.sensitivity === "SENSITIVE" &&
        q.admission.mode !== "MANUAL" &&
        p.acl.visibility !== "PRIVATE"
      )
        throw new Error("SCOPE_NOT_AUTHORIZED");
      setAcl("INSTRUCTION", r, p.acl);
      mark("INSTRUCTION", r, { body: p.body });
      break;
    }
    case "CORRECT_INSTRUCTION": {
      const old = target();
      requireBase("ITEM", old.event_id as string);
      const item = root("ITEM", old.event_id as string, true);
      touch("ITEM", item);
      if (g.trip_instruction_entries.some((x) => x.supersedes_id === old.id))
        throw new Error("REVISION_CONFLICT");
      const r = create("INSTRUCTION", p.newEntryId, {
        event_id: old.event_id,
        section: old.section,
        body: p.body,
        sensitivity: p.sensitivity,
        source_representation_id: old.source_representation_id,
        supersedes_id: old.id,
      });
      setAcl("INSTRUCTION", r, p.acl);
      mark("INSTRUCTION", r, { body: p.body });
      break;
    }
    case "CANCEL_ENTITLEMENT": {
      const r = target();
      touch("ENTITLEMENT", r);
      mark("ENTITLEMENT", r, { status: "CANCELLED" });
      break;
    }
    case "CANCEL_ARRANGEMENT": {
      if (
        p.scope === "ITEM_ONLY" &&
        (p.affectedBookings.length ||
          p.affectedItems.length !== 1 ||
          p.affectedItems[0] !== q.target.id)
      )
        throw new Error("INVALID_AGGREGATE");
      if (p.scope !== "ITEM_ONLY") {
        const links = g.trip_booking_item_links.filter(
          (x) => x.active && p.affectedBookings.includes(x.booking_id),
        );
        if (
          !p.affectedBookings.length ||
          !p.affectedItems.includes(q.target.id) ||
          p.affectedItems.some((id: string) => !links.some((x) => x.item_id === id)) ||
          (p.scope === "EXCLUSIVE_ARRANGEMENT" &&
            (p.affectedBookings.length !== 1 || p.affectedItems.length !== 1))
        )
          throw new Error("GRAPH_CHANGED");
      }
      for (const id of p.affectedBookings) {
        requireBase("BOOKING", id);
        const booking = root("BOOKING", id, true);
        const active = g.trip_booking_item_links.filter(
          (x) => x.booking_id === id && x.active,
        );
        if (
          p.scope === "EXCLUSIVE_ARRANGEMENT" &&
          (active.length !== 1 ||
            g.trip_booking_entitlement_links.some((x) => x.booking_id === id && x.active))
        )
          throw new Error("GRAPH_CHANGED");
        if (active.some((x) => !p.affectedItems.includes(x.item_id)))
          throw new Error("GRAPH_CHANGED");
        touch("BOOKING", booking);
        mark("BOOKING", booking, { commercial_status: "CANCELLED" });
      }
      for (const id of p.affectedItems) {
        requireBase("ITEM", id);
        const r = root("ITEM", id, true);
        touch("ITEM", r);
        mark("ITEM", r, { status: "cancelled" });
      }
      break;
    }
    case "DELETE_ITEM": {
      const r = target();
      if (deletedItemIds.has(q.target.id)) break;
      touch("ITEM", r);
      mark("ITEM", r, { hidden_at: now });
      break;
    }
    case "HIDE_OBJECT":
    case "RESTORE_OBJECT": {
      if (
        p.scope === "OBJECT_ONLY" &&
        (p.affectedIds.length !== 1 ||
          p.affectedIds[0].kind !== q.target.kind ||
          p.affectedIds[0].id !== q.target.id)
      )
        throw new Error("INVALID_AGGREGATE");
      if (p.scope === "EXCLUSIVE_ARRANGEMENT") {
        if (q.target.kind !== "ITEM") throw new Error("INVALID_AGGREGATE");
        const bookingIds = g.trip_booking_item_links
          .filter((x) => x.item_id === q.target.id && x.active)
          .map((x) => x.booking_id);
        if (
          bookingIds.length !== 1 ||
          g.trip_booking_item_links.filter(
            (x) => x.booking_id === bookingIds[0] && x.active,
          ).length !== 1 ||
          g.trip_booking_entitlement_links.some(
            (x) => x.booking_id === bookingIds[0] && x.active,
          ) ||
          p.affectedIds.length !== 2 ||
          !p.affectedIds.some((x: any) => x.kind === "ITEM" && x.id === q.target.id) ||
          !p.affectedIds.some((x: any) => x.kind === "BOOKING" && x.id === bookingIds[0])
        )
          throw new Error("GRAPH_CHANGED");
      }
      for (const x of p.affectedIds) {
        requireBase(x.kind, x.id);
        const r = root(x.kind, x.id, true);
        if ((q.command === "HIDE_OBJECT") === (r.hidden_at !== null)) continue;
        touch(x.kind, r);
        mark(x.kind, r, { hidden_at: q.command === "HIDE_OBJECT" ? now : null });
      }
      break;
    }
    case "REPLACE_BOOKING": {
      const old = target();
      const active = g.trip_booking_item_links.filter(
        (x) => x.booking_id === old.id && x.active,
      );
      if (p.transferItemIds.some((id: string) => !active.some((x) => x.item_id === id)))
        throw new Error("GRAPH_CHANGED");
      if (
        p.transferEntitlementIds.some(
          (id: string) =>
            !g.trip_booking_entitlement_links.some(
              (x) => x.booking_id === old.id && x.entitlement_id === id && x.active,
            ),
        )
      )
        throw new Error("GRAPH_CHANGED");
      const r = create("BOOKING", p.newBookingId, {
        business_contract_version: 2,
        commercial_status: "ACTIVE",
        replaces_booking_id: old.id,
        ...p.fields,
      });
      if (
        g.itinerary_reservations.some(
          (x) => x.replaces_booking_id === old.id && x.id !== r.id,
        )
      )
        throw new Error("REVISION_CONFLICT");
      setAcl("BOOKING", r, p.acl);
      addObservation(r, p.observations);
      touch("BOOKING", old);
      mark("BOOKING", old, { commercial_status: "REPLACED" });
      relation(
        "trip_booking_item_links",
        "BOOKING",
        old,
        "booking_id",
        "item_id",
        "ITEM",
        [],
        p.transferItemIds,
      );
      relation(
        "trip_booking_item_links",
        "BOOKING",
        r,
        "booking_id",
        "item_id",
        "ITEM",
        p.transferItemIds,
        [],
      );
      relation(
        "trip_booking_entitlement_links",
        "BOOKING",
        old,
        "booking_id",
        "entitlement_id",
        "ENTITLEMENT",
        [],
        p.transferEntitlementIds,
      );
      relation(
        "trip_booking_entitlement_links",
        "BOOKING",
        r,
        "booking_id",
        "entitlement_id",
        "ENTITLEMENT",
        p.transferEntitlementIds,
        [],
      );
      break;
    }
    case "CREATE_DOCUMENT_METADATA": {
      const row = create("DOCUMENT", q.target.id, {
        title: p.title,
        media_type: p.media_type,
        byte_size: p.byte_size,
        sha256: p.sha256,
        custody: "LOCAL_ONLY",
        content_version: 1,
      });
      setAcl("DOCUMENT", row, { visibility: "PRIVATE", people: [] });
      break;
    }
    // These need the owning verified custody/Source/Ledger capability, not a boolean from a caller.
    case "CREATE_DOCUMENT": {
      const proof = privateDocumentCustody;
      if (
        !proof ||
        q.admission.mode !== "MANUAL" ||
        p.acl.visibility !== "PRIVATE" ||
        p.acl.people.length !== 0 ||
        p.fields.custody !== "PRIVATE_SOURCE_REFERENCE" ||
        proof.actorAccountId !== actor.accountId ||
        proof.tripId !== actor.tripId ||
        proof.documentId !== q.target.id ||
        proof.custodyProofId !== p.custodyProofId ||
        proof.sourceRepresentationId !== p.fields.source_representation_id ||
        proof.sha256 !== p.fields.sha256 ||
        proof.byteSize !== p.fields.byte_size ||
        proof.mediaType !== p.fields.media_type ||
        proof.contentVersion !== p.fields.content_version
      )
        throw new Error("OWNING_CAPABILITY_REQUIRED");
      const row = create("DOCUMENT", q.target.id, {
        ...p.fields,
        storage_object_key: null,
        custody_receipt_id: proof.custodyProofId,
      });
      setAcl("DOCUMENT", row, p.acl);
      break;
    }
    case "LINK_EXPENSE":
    case "UNLINK_EXPENSE": {
      const proof = expenseLinkAuthority;
      if (!proof || p.expectedExpenseRevision === undefined)
        throw new Error("OWNING_CAPABILITY_REQUIRED");
      if (
        q.admission.mode !== "MANUAL" ||
        p.targetKind !== "ITEM" ||
        proof.actorAccountId !== actor.accountId ||
        proof.tripId !== actor.tripId ||
        proof.linkId !== q.target.id ||
        proof.expenseId !== p.expenseId ||
        proof.itemId !== p.targetId
      )
        throw new Error("NOT_VISIBLE");
      if (proof.expenseRevision !== p.expectedExpenseRevision)
        throw new Error("REVISION_CONFLICT");
      requireBase("ITEM", p.targetId);
      const item = root("ITEM", p.targetId, true);
      if (deletedItemIds.has(p.targetId)) throw new Error("ITEM_DELETED");
      const existing = g.expense_links.find((row) => row.id === q.target.id);
      if (
        existing &&
        (existing.expense_id !== p.expenseId ||
          existing.type !== "ITINERARY_EVENT" ||
          existing.target_id !== p.targetId)
      )
        throw new Error("INVALID_LINK");
      if (q.command === "LINK_EXPENSE") {
        if (existing) break;
        if (
          g.expense_links.some(
            (row) =>
              row.expense_id === p.expenseId &&
              row.type === "ITINERARY_EVENT" &&
              row.target_id === p.targetId,
          )
        )
          throw new Error("DUPLICATE_LINK");
        g.expense_links.push({
          id: q.target.id,
          expense_id: p.expenseId,
          journey_id: actor.tripId,
          type: "ITINERARY_EVENT",
          target_id: p.targetId,
          metadata: {},
          created_by: actor.accountId,
          created_at: now,
        });
      } else {
        if (!existing) break;
        g.expense_links = g.expense_links.filter((row) => row.id !== q.target.id);
      }
      touch("ITEM", item);
      break;
    }
    case "AUTHORIZE_DOCUMENT_COPY":
      throw new Error("OWNING_CAPABILITY_REQUIRED");
  }
  for (const [t, rows] of Object.entries(g))
    for (const row of rows) {
      (local && t === "trip_flight_intents"
        ? f.localFlightIntentSchema
        : f.coreTableSchemas[t as f.CoreTable]
      ).parse(row);
      if ((t === "expense_links" ? row.journey_id : row.trip_id) !== actor.tripId)
        throw new Error("CROSS_TRIP_REFERENCE");
      if (
        "accepted_latitude" in row &&
        (row.accepted_latitude === null) !== (row.accepted_longitude === null)
      )
        throw new Error("INVALID_COORDINATES");
    }
  for (const r of g.itinerary_events) {
    const start = r.start_local_date as string | null,
      end = r.end_local_date as string | null;
    if (r.temporal_shape !== "TRANSPORT") {
      if (!start) throw new Error("INVALID_AGGREGATE");
      validateCalendarDate(start);
      coreStoredBoundary(r, "start");
      if (end) coreStoredBoundary(r, "end");
      if (end) {
        validateCalendarDate(end);
        if (end < start) throw new Error("INVALID_RANGE");
      }
      if (r.experience_family === "P3" && !end) throw new Error("INVALID_RANGE");
      if (
        r.planned_start &&
        r.planned_end &&
        instantMicroseconds(r.planned_end as string) <
          instantMicroseconds(r.planned_start as string)
      )
        throw new Error("INVALID_RANGE");
    } else {
      const ends = g.itinerary_transport_endpoints.filter((x) => x.event_id === r.id);
      if (
        ends.length !== 2 ||
        new Set(ends.map((x) => x.role)).size !== 2 ||
        !ends.find((x) => x.role === "ORIGIN")?.local_date
      )
        throw new Error("INVALID_AGGREGATE");
      for (const endpoint of ends) coreStoredBoundary(endpoint);
      if (start || end || r.planned_start || r.planned_end)
        throw new Error("DUPLICATE_SCHEDULE");
    }
  }
  for (const r of g.itinerary_reservations)
    for (const prefix of ["price", "due"]) {
      const v = [r[prefix + "_minor"], r[prefix + "_currency"], r[prefix + "_scale"]];
      if (v.some((x) => x !== null) && v.some((x) => x === null))
        throw new Error("INVALID_MONEY");
      if (v[0] !== null && !isIso4217Money(v[1] as string, v[2] as number))
        throw new Error("INVALID_MONEY");
    }
  for (const r of g.trip_entitlements) {
    if (
      (r.validity_precision === "DATE" &&
        (r.valid_from_instant || r.valid_until_instant)) ||
      (r.validity_precision === "INSTANT" && (r.valid_from_date || r.valid_until_date))
    )
      throw new Error("INVALID_VALIDITY");
    if (
      r.validity_precision === null &&
      [
        r.valid_from_date,
        r.valid_until_date,
        r.valid_from_instant,
        r.valid_until_instant,
        r.validity_zone_id,
      ].some((v) => v !== null)
    )
      throw new Error("INVALID_VALIDITY");
    if (r.valid_from_date && r.valid_until_date && r.valid_until_date < r.valid_from_date)
      throw new Error("INVALID_VALIDITY");
    if (
      r.valid_from_instant &&
      r.valid_until_instant &&
      instantMicroseconds(r.valid_until_instant as string) <
        instantMicroseconds(r.valid_from_instant as string)
    )
      throw new Error("INVALID_VALIDITY");
  }
  if (q.baseVector.some((v) => !usedBases.has(v.kind + ":" + v.id)))
    throw new Error("UNUSED_BASE_VECTOR");
  (local ? validateLocalCoreGraph : validateCoreGraph)(g, actor.tripId, actorProjection);
  return { graph: g, changed: [...changed.values()] };
}
