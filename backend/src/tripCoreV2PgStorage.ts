import { readReviewedP1Gate, readCoreGate, type CoreGateMode } from "./tripSustainedGate";
import { isReviewedP1Gate, normalManualCapabilities } from "./tripNormalP1Policy";
import { randomUUID } from "node:crypto";
import {
  coreUuid,
  coreTableSchemas,
  coreKindTables,
  type CoreKind,
  type CoreTable,
} from "../../src/domain/trip/tripCoreV2";
import {
  coreTableKeys,
  coreMirrorKey,
  validateCoreGraph,
} from "../../src/domain/trip/tripCoreV2Graph";
import {
  emptyCoreGraph,
  coreCanRead,
  type CoreGraph,
  type CoreActor,
  type CoreMutation,
  type VerifiedPrivateDocumentCustody,
  type CoreRow,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { coreLifecycleGraphHash } from "../../src/domain/trip/tripCoreV2Lifecycle";
import { validateCoreReceipt } from "../../src/domain/trip/tripCoreV2Receipt";
import type {
  CoreCommand,
  CoreCommandName,
} from "../../src/domain/trip/tripCoreV2Commands";
import {
  coreReceiptStatus,
  type CoreCommandStorage,
  type CoreCommandTransaction,
} from "./tripCoreV2Commands";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
export type CorePgLease = {
  retire(): void;
  query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: CoreRow[] }>;
};
export type CorePgConnection = {
  withLease<T>(work: (lease: CorePgLease) => Promise<T>): Promise<T>;
};
export type CorePgAdmission = {
  audit?(
    lease: CorePgLease,
    actor: CoreActor,
    command: CoreCommand,
    intentSha256: string,
  ): Promise<
    Pick<
      import("../../src/domain/trip/tripCoreV2Receipt").CoreReceipt["audit"],
      "evidenceRefs" | "authorizationRefs"
    >
  >;
  verify(
    lease: CorePgLease,
    actor: CoreActor,
    command: CoreCommand,
    intentSha256: string,
    graph: CoreGraph,
  ): Promise<void | VerifiedPrivateDocumentCustody>;
  canReadSourceReceipt(
    lease: CorePgLease,
    actor: CoreActor,
    operationId: string,
  ): Promise<boolean>;
  canReadAudit?(
    lease: CorePgLease,
    actor: CoreActor,
    receipt: import("../../src/domain/trip/tripCoreV2Receipt").CoreReceipt,
  ): Promise<boolean>;
  canReadOriginal(
    lease: CorePgLease,
    actor: CoreActor,
    document: CoreRow,
  ): Promise<boolean>;
};
const quoted = (value: string) => '"' + value + '"';
const json = (value: unknown) => canonicalCoreJson(value as Json);
const normalized = (row: CoreRow) => {
  const fact = { ...row };
  for (const [key, value] of Object.entries(fact))
    if (
      typeof value === "string" &&
      (key.endsWith("_at") ||
        key.endsWith("_instant") ||
        ["instant", "planned_start", "planned_end"].includes(key))
    )
      fact[key] = value.replace(/\+00:00$/, "Z");
  const fraction = (value: unknown, precision: unknown) => {
    if (typeof value !== "string" || typeof precision !== "number") return value;
    const match = /^(.*\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)?$/.exec(value);
    if (!match) throw new Error("INVALID_CLOCK_PRECISION");
    const digits = match[2] ?? "",
      size = Math.max(0, precision);
    if (
      !Number.isInteger(precision) ||
      precision < -1 ||
      precision > 6 ||
      /[1-9]/.test(digits.slice(size))
    )
      throw new Error("INVALID_CLOCK_PRECISION");
    return (
      match[1] +
      (size ? "." + digits.slice(0, size).padEnd(size, "0") : "") +
      (match[3] ?? "")
    );
  };
  for (const prefix of ["", "start_", "end_"]) {
    fact[prefix + "local_time"] = fraction(
      fact[prefix + "local_time"],
      fact[prefix + "clock_precision"],
    );
    const precision = fact[prefix + "source_instant_precision"];
    fact[prefix + "source_instant"] = fraction(
      fact[prefix + "source_instant"],
      precision,
    );
    const instant = prefix ? "planned_" + prefix.slice(0, -1) : "instant";
    if (fact[prefix + "basis"] === "SOURCE_INSTANT")
      fact[instant] = fraction(fact[instant], precision);
    else fact[instant] = fraction(fact[instant], fact[prefix + "clock_precision"]);
  }
  // Keep the exact finite physical shape; missing tuple members are not invented.
  return Object.fromEntries(
    Object.entries(fact).filter(([, value]) => value !== undefined),
  );
};
const columns = (table: CoreTable) => Object.keys(coreTableSchemas[table].shape);
const physical = (table: CoreTable, column: string) =>
  table === "expense_links" && column === "type" ? "link_type" : column;
const projection = (table: CoreTable) =>
  columns(table)
    .map((k) => `${quoted(physical(table, k))} AS ${quoted(k)}`)
    .join(",");
export async function readCorePgGraph(
  lease: CorePgLease,
  trip: string,
): Promise<CoreGraph> {
  const graph = emptyCoreGraph();
  const tables = (Object.keys(coreTableSchemas) as CoreTable[]).filter(
    (table) => table !== "expense_links",
  );
  const reads = tables.map((table) => {
    const legacy = table === "itinerary_events" || table === "itinerary_reservations";
    return `SELECT '${table}'::text AS core_table,to_jsonb(facts) AS fact FROM (SELECT ${projection(table)} FROM public.${quoted(table)} WHERE trip_id=$1::uuid${legacy ? " AND business_contract_version=2" : ""} LIMIT 20001) facts`;
  });
  // One bounded SQL snapshot keeps repeated Source projection inside the owning lease deadline.
  const rows = (
    await lease.query(
      `SELECT * FROM (${reads.join(" UNION ALL ")}) core_graph LIMIT 20001`,
      [trip],
    )
  ).rows;
  if (rows.length > 20000) throw new Error("CORE_READ_RESOURCE_LIMIT");
  for (const row of rows) {
    const table = row.core_table as (typeof tables)[number];
    if (!tables.includes(table)) throw new Error("CORE_READ_TABLE_MISMATCH");
    graph[table].push(
      coreTableSchemas[table].parse(normalized(row.fact as CoreRow)) as CoreRow,
    );
  }
  return validateCoreGraph(graph, trip);
}
export async function lockCorePgActor(
  lease: CorePgLease,
  actor: string,
  trip: string,
): Promise<CoreActor> {
  const row = (
    await lease.query(
      "SELECT public.trip_core_lock_actor_scope($1::uuid,$2::uuid) AS actor",
      [actor, trip],
    )
  ).rows[0]?.actor as CoreActor | undefined;
  if (!row || row.accountId !== actor || row.tripId !== trip)
    throw new Error("CORE_PERSON_BINDING_INVALID");
  return row;
}
async function persist(lease: CorePgLease, before: CoreGraph, mutation: CoreMutation) {
  for (const table of Object.keys(coreTableSchemas) as CoreTable[]) {
    if (table === "expense_links") {
      if (json(before[table]) !== json(mutation.graph[table]))
        throw new Error("OWNING_CAPABILITY_REQUIRED");
      continue;
    }
    const old = new Map(before[table].map((r) => [coreMirrorKey(table, r), r]));
    const current = new Map(
      mutation.graph[table].map((r) => [coreMirrorKey(table, r), r]),
    );
    for (const [key, row] of old)
      if (!current.has(key)) {
        if (Object.values(coreKindTables).includes(table as never))
          throw new Error("CORE_PHYSICAL_DELETE_FORBIDDEN");
        const fields = coreTableKeys[table];
        await lease.query(
          `DELETE FROM public.${quoted(table)} WHERE ${fields.map((k, i) => `${quoted(k)}=$${i + 1}`).join(" AND ")} AND trip_id=$${fields.length + 1}::uuid`,
          [...fields.map((k) => row[k]), row.trip_id],
        );
      }
    for (const [key, row] of current) {
      const previous = old.get(key);
      if (previous && json(previous) === json(row)) continue;
      const fields = columns(table),
        values = fields.map((k) => row[k]);
      // pg arrays/objects must be JSON text for finite JSONB columns, not PostgreSQL array literals.
      for (let i = 0; i < values.length; i++)
        if (values[i] !== null && typeof values[i] === "object")
          values[i] = json(values[i]);
      if (previous) {
        const keys = coreTableKeys[table],
          updates = fields.filter((k) => !keys.includes(k));
        await lease.query(
          `UPDATE public.${quoted(table)} SET ${updates.map((k, i) => `${quoted(k)}=$${i + 1}`).join(",")} WHERE ${keys.map((k, i) => `${quoted(k)}=$${updates.length + i + 1}`).join(" AND ")} AND trip_id=$${updates.length + keys.length + 1}::uuid`,
          [
            ...updates.map((k) => {
              const v = row[k];
              return v !== null && typeof v === "object" ? json(v) : v;
            }),
            ...keys.map((k) => row[k]),
            row.trip_id,
          ],
        );
      } else {
        const names = [...fields];
        if (table === "itinerary_transport_services") {
          names.push("provenance_refs");
          values.push("{}");
        }
        await lease.query(
          `INSERT INTO public.${quoted(table)}(${names.map(quoted).join(",")}) VALUES(${names.map((_, i) => `$${i + 1}`).join(",")})`,
          values,
        );
      }
    }
  }
}
// Unprovisioned port. The writer principal cannot be replaced by service_role or a UI credential.
export function createCorePgStorage(
  connection: CorePgConnection,
  hash: ImportHash,
  admission?: CorePgAdmission,
  gateMode?: CoreGateMode,
): CoreCommandStorage {
  return {
    async withLockedCommand(scope, work) {
      coreUuid.parse(scope.actorAccountId);
      coreUuid.parse(scope.tripId);
      coreUuid.parse(scope.operationId);
      return connection.withLease(async (lease) => {
        let began = false;
        try {
          await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
          began = true;
          await lease.query(
            "SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='1000ms'; SET LOCAL TIME ZONE 'UTC'",
          );
          const identity = (
            await lease.query("SELECT session_user AS principal,current_user AS role")
          ).rows[0];
          if (
            identity?.principal !== "otr_trip_core_v2_gateway" ||
            identity.role !== "otr_trip_core_v2_gateway"
          )
            throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
          await lease.query(
            "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true),set_config('otr.core.operation',$3,true)",
            [scope.actorAccountId, scope.tripId, scope.operationId],
          );
          const finiteScope = async () => {
            const allowed = (
              await lease.query(
                "SELECT public.trip_core_finite_scope_allowed($1::uuid,$2::uuid) AS allowed",
                [scope.actorAccountId, scope.tripId],
              )
            ).rows[0]?.allowed;
            if (allowed !== true) throw new Error("CORE_CAPABILITY_CLOSED");
          };
          await finiteScope();
          // Join the established Source/C locks before membership rows to avoid reversed lock order.
          await lease.query("SELECT public.trip_import_scope_lock($1::uuid,$2::uuid)", [
            scope.actorAccountId,
            scope.tripId,
          ]);
          const actor = await lockCorePgActor(lease, scope.actorAccountId, scope.tripId);
          await lease.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            "otr-core2-operation:" + scope.actorAccountId + ":" + scope.operationId,
          ]);
          let locked: CoreGraph | undefined,
            collision = false,
            verified: { command: CoreCommand; intentSha256: string } | undefined;
          const tx: CoreCommandTransaction = {
            actor,
            async authoritativeClock() {
              const clock = (
                await lease.query("SELECT to_jsonb(transaction_timestamp()) AS instant")
              ).rows[0]?.instant;
              if (typeof clock !== "string") throw new Error("CORE_CLOCK_UNAVAILABLE");
              return clock.replace(/\+00:00$/, "Z");
            },
            async readReceipt() {
              const row = (
                await lease.query(
                  "SELECT id,body FROM public.trip_core_command_receipts WHERE actor_account_id=$1::uuid AND operation_id=$2::uuid",
                  [scope.actorAccountId, scope.operationId],
                )
              ).rows[0];
              return row
                ? {
                    domainReceiptId: row.id as string,
                    receiptText: json(row.body),
                  }
                : null;
            },
            async hasLegacyOperation() {
              return (
                (
                  await lease.query(
                    "SELECT 1 FROM public.trip_event_operation_receipts WHERE actor_account_id=$1::uuid AND operation_key=$2::uuid LIMIT 1",
                    [scope.actorAccountId, scope.operationId],
                  )
                ).rows.length > 0
              );
            },
            async enabledCommands() {
              if (gateMode?.sustainedDev && gateMode.reviewedP1) {
                const reviewed = await readReviewedP1Gate(
                  lease,
                  actor.accountId,
                  actor.tripId,
                );
                if (
                  ["P1", "P2", "P3", "P4", "P5", "P6"].some((family) =>
                    isReviewedP1Gate(
                      reviewed,
                      family as "P1" | "P2" | "P3" | "P4" | "P5" | "P6",
                    ),
                  )
                )
                  return reviewed.enabled_commands as CoreCommandName[];
              }
              const r = await readCoreGate(
                lease,
                actor.accountId,
                actor.tripId,
                gateMode,
                "runtime_enabled,enabled_commands",
              );
              return r?.runtime_enabled ? (r.enabled_commands as CoreCommandName[]) : [];
            },
            async readLockedGraph(command) {
              await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
              for (const v of command.baseVector) {
                if (v.kind === "SOURCE" || v.kind === "EXPENSE_LINK") continue;
                const table = coreKindTables[v.kind];
                await lease.query(
                  "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
                  ["otr-core2-identity:" + v.id],
                );
                const row = (
                  await lease.query(
                    `SELECT trip_id${["ITEM", "BOOKING"].includes(v.kind) ? ",business_contract_version" : ""} FROM public.${quoted(table)} WHERE id=$1::uuid FOR UPDATE`,
                    [v.id],
                  )
                ).rows[0];
                if (
                  row &&
                  (row.trip_id !== actor.tripId ||
                    (v.revision === null &&
                      ["ITEM", "BOOKING"].includes(v.kind) &&
                      row.business_contract_version !== 2))
                )
                  collision = true;
              }
              await lease.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
                "otr-core2-trip:" + actor.tripId,
              ]);
              locked = await readCorePgGraph(lease, actor.tripId);
              await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
              return locked;
            },
            async verifyAdmission(command, intent, graph) {
              const sourceP1 =
                gateMode?.sustainedDev &&
                gateMode.reviewedP1 &&
                command.admission.mode === "REVIEWED_SOURCE";
              const activation = sourceP1
                ? await readReviewedP1Gate(lease, actor.accountId, actor.tripId)
                : await readCoreGate(lease, actor.accountId, actor.tripId, gateMode);
              const manual = normalManualCapabilities(activation);
              const normal = manual !== null;
              const finiteFamily =
                command.command === "CREATE_SPARSE_FLIGHT"
                  ? "P2"
                  : command.command === "CREATE_ITEM"
                    ? (command.payload as { family?: string }).family
                    : graph.itinerary_events.find((item) => item.id === command.target.id)
                        ?.experience_family;
              const reviewed =
                sourceP1 &&
                isReviewedP1Gate(
                  activation,
                  finiteFamily === "P2"
                    ? "P2"
                    : finiteFamily === "P3"
                      ? "P3"
                      : finiteFamily === "P4"
                        ? "P4"
                        : finiteFamily === "P6"
                          ? "P6"
                          : finiteFamily === "P5"
                            ? "P5"
                            : "P1",
                );
              if (
                reviewed
                  ? command.command !==
                      (finiteFamily === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM") ||
                    !["P1", "P2", "P3", "P4", "P5", "P6"].includes(
                      String(finiteFamily),
                    ) ||
                    !command.admission.sourceIntentId ||
                    command.admission.policyVersion !== null
                  : normal
                    ? command.admission.mode !== "MANUAL" ||
                      !manual!.families.includes(String(finiteFamily)) ||
                      !(manual!.commands as readonly string[]).includes(
                        command.command,
                      ) ||
                      (command.command === "SET_STAY_DETAILS" && finiteFamily !== "P3")
                    : command.command !== "CREATE_ITEM" ||
                      command.admission.mode !== "MANUAL" ||
                      (finiteFamily !== "P1" && finiteFamily !== "P3")
              )
                throw new Error("CORE_CAPABILITY_CLOSED");
              if (
                normal &&
                command.command !== "CREATE_ITEM" &&
                graph.itinerary_events.find((item) => item.id === command.target.id)
                  ?.owner_account_id !== actor.accountId
              )
                throw new Error("CORE_CREATOR_REQUIRED");
              await lease.query(
                "SELECT set_config('otr.core.command',$1,true),set_config('otr.core.family',$2,true),set_config('otr.core.admission',$3,true),set_config('otr.core.target_item',$4,true),set_config('otr.core.operation',$5,true),set_config('otr.core.source_intent',$6,true)",
                [
                  command.command,
                  finiteFamily,
                  command.admission.mode,
                  command.target.id,
                  command.operationId,
                  command.admission.sourceIntentId ?? "",
                ],
              );
              if (collision) throw new Error("REVISION_CONFLICT");
              if (command.command === "SET_ORDINARY_ORDER") {
                const bindings = (
                  await lease.query(
                    "SELECT public.trip_core_read_person_bindings($1::uuid,$2::uuid) AS bindings",
                    [actor.accountId, actor.tripId],
                  )
                ).rows[0]?.bindings as {
                  person_id: string;
                  account_id: string | null;
                  active: boolean;
                  participating: boolean;
                }[];
                if (
                  !bindings?.some(
                    (b) =>
                      b.person_id === actor.personId &&
                      b.account_id === actor.accountId &&
                      b.active &&
                      b.participating,
                  )
                )
                  throw new Error("INVALID_SELF_PERSON");
              }

              const gate = sourceP1
                ? activation
                : await readCoreGate(
                    lease,
                    actor.accountId,
                    actor.tripId,
                    gateMode,
                    "enabled_families,enabled_admission_modes",
                  );
              const family =
                command.command === "CREATE_SPARSE_FLIGHT"
                  ? "P2"
                  : ((command.payload as { family?: string }).family ??
                    (command.target.kind === "ITEM"
                      ? graph.itinerary_events.find((r) => r.id === command.target.id)
                          ?.experience_family
                      : undefined));
              if (
                !gate ||
                !(gate.enabled_admission_modes as string[]).includes(
                  command.admission.mode,
                ) ||
                (family &&
                  !(gate.enabled_families as string[]).includes(family as string))
              )
                throw new Error("CORE_CAPABILITY_CLOSED");
              const requiresTemporalAuthority = (value: unknown): boolean => {
                if (!value || typeof value !== "object") return false;
                return Object.entries(value).some(
                  ([key, child]) =>
                    ([
                      "source_instant",
                      "sourceInstant",
                      "interpretation_key",
                      "interpretationKey",
                    ].includes(key) &&
                      child !== null) ||
                    requiresTemporalAuthority(child),
                );
              };
              if (
                requiresTemporalAuthority(command.payload) ||
                command.admission.mode !== "MANUAL" ||
                command.baseVector.some((v) => v.kind === "SOURCE") ||
                [
                  "CREATE_DOCUMENT",
                  "AUTHORIZE_DOCUMENT_COPY",
                  "LINK_EXPENSE",
                  "UNLINK_EXPENSE",
                ].includes(command.command) ||
                (command.command === "APPEND_INSTRUCTION" &&
                  (command.payload as { sourceRepresentationId: string | null })
                    .sourceRepresentationId !== null)
              ) {
                if (!admission) throw new Error("OWNING_CAPABILITY_REQUIRED");
                const owning = await admission.verify(
                  lease,
                  actor,
                  command,
                  intent,
                  graph,
                );
                verified = { command, intentSha256: intent };
                return owning;
              }
            },
            async admissionAudit() {
              return verified && admission?.audit
                ? admission.audit(lease, actor, verified.command, verified.intentSha256)
                : { evidenceRefs: [], authorizationRefs: [] };
            },
            async lifecycleGraphHash(command, graph) {
              return "graphHash" in (command.payload as object)
                ? coreLifecycleGraphHash(graph, actor, command, hash)
                : undefined;
            },
            async canReadReceipt(receipt) {
              if (!actor.active) return false;
              const privateProof = (value: unknown): boolean => {
                if (!value || typeof value !== "object") return false;
                return Object.entries(value).some(
                  ([key, child]) =>
                    (["evidence_ref", "source_representation_id"].includes(key) &&
                      child !== null) ||
                    (!key.includes(".") &&
                      key.endsWith("provenance_refs") &&
                      child !== null &&
                      typeof child === "object" &&
                      Object.keys(child).length > 0) ||
                    privateProof(child),
                );
              };
              if (
                (receipt.audit.evidenceRefs.length || privateProof(receipt.audit)) &&
                (!admission?.canReadAudit ||
                  !(await admission.canReadAudit(lease, actor, receipt)))
              )
                return false;
              let graph = locked;
              if (!graph) {
                await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
                graph = await readCorePgGraph(lease, actor.tripId);
                await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
              }
              for (const v of receipt.targetVector) {
                if (v.kind === "SOURCE" || v.kind === "EXPENSE_LINK") return false;
                const row = graph[coreKindTables[v.kind as CoreKind]].find(
                  (r) => r.id === v.id,
                );
                if (
                  row &&
                  v.kind === "ORDER" &&
                  (row.nodes as { eventId: string }[]).some((n) => {
                    const item = graph!.itinerary_events.find((x) => x.id === n.eventId);
                    return !item || !coreCanRead(graph!, actor, "ITEM", item);
                  })
                )
                  return false;
                if (!row) {
                  if (
                    v.baseRevision === null &&
                    ["REJECTED", "CONFLICT"].includes(receipt.outcome)
                  )
                    continue;
                  return false;
                }
                if (!coreCanRead(graph, actor, v.kind as CoreKind, row)) return false;
                if (
                  v.kind === "DOCUMENT" &&
                  (!admission || !(await admission.canReadOriginal(lease, actor, row)))
                )
                  return false;
              }
              if (
                receipt.command.includes("FLIGHT") &&
                receipt.command !== "CREATE_SPARSE_FLIGHT" &&
                (!admission ||
                  !(await admission.canReadSourceReceipt(
                    lease,
                    actor,
                    receipt.operationId,
                  )))
              )
                return false;
              return true;
            },
            async commit(mutation, receipt, canonicalIntent) {
              await validateCoreReceipt(receipt, hash);
              await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
              await lease.query("SELECT set_config('otr.core.actor',$1,true)", [
                actor.accountId,
              ]);
              if (mutation) await persist(lease, locked!, mutation);
              const id = randomUUID();
              await lease.query(
                "INSERT INTO public.trip_core_command_receipts(id,trip_id,actor_account_id,operation_id,intent_version,command_version,receipt_version,intent_sha256,canonical_intent_text,receipt_sha256,body,outcome,committed_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,2,2,2,$5,$6,$7,$8::jsonb,$9,$10::timestamptz)",
                [
                  id,
                  actor.tripId,
                  actor.accountId,
                  scope.operationId,
                  receipt.intentSha256,
                  canonicalIntent,
                  receipt.receiptSha256,
                  json(receipt),
                  receipt.outcome,
                  receipt.committedAt,
                ],
              );
              if (mutation)
                await lease.query(
                  "INSERT INTO public.trip_core_read_state(trip_id) VALUES($1::uuid) ON CONFLICT(trip_id) DO UPDATE SET revision=trip_core_read_state.revision+1",
                  [actor.tripId],
                );
              await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
              if (mutation) locked = mutation.graph;
              return id;
            },
          };
          const result = await work(tx);
          await finiteScope();
          await lease.query("COMMIT");
          began = false;
          return result;
        } catch (error) {
          if (began) {
            try {
              await lease.query("ROLLBACK");
            } catch {
              lease.retire();
            }
          }
          throw error;
        }
      });
    },
  };
}

export async function readCorePgOperation(
  storage: CoreCommandStorage,
  actorAccountId: string,
  tripId: string,
  operationId: string,
  hash: ImportHash,
) {
  for (const id of [actorAccountId, tripId, operationId]) coreUuid.parse(id);
  return storage.withLockedCommand(
    { actorAccountId, tripId, operationId, baseVector: [] },
    async (tx) => {
      const prior = await tx.readReceipt();
      if (!prior) return null;
      const receipt = await validateCoreReceipt(JSON.parse(prior.receiptText), hash);
      if (
        receipt.actorAccountId !== actorAccountId ||
        receipt.tripId !== tripId ||
        receipt.operationId !== operationId
      )
        return null;
      return (await tx.canReadReceipt(receipt))
        ? {
            projection: "FULL" as const,
            domainReceiptId: prior.domainReceiptId,
            receipt,
          }
        : coreReceiptStatus(prior.domainReceiptId, receipt);
    },
  );
}
