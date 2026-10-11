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
  type CoreRow,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { coreLifecycleGraphHash } from "../../src/domain/trip/tripCoreV2Lifecycle";
import { validateCoreReceipt } from "../../src/domain/trip/tripCoreV2Receipt";
import type {
  CoreCommand,
  CoreCommandName,
} from "../../src/domain/trip/tripCoreV2Commands";
import type { CoreCommandStorage, CoreCommandTransaction } from "./tripCoreV2Commands";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
export type CorePgLease = {
  retire(): void;
  query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: CoreRow[] }>;
};
export type CorePgConnection = {
  withLease<T>(work: (lease: CorePgLease) => Promise<T>): Promise<T>;
};
export type CorePgAdmission = {
  verify(
    lease: CorePgLease,
    actor: CoreActor,
    command: CoreCommand,
    intentSha256: string,
    graph: CoreGraph,
  ): Promise<void>;
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
const normalized = (row: CoreRow) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)
        ? v.replace(/\+00:00$/, "Z")
        : v,
    ]),
  );
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
  let count = 0;
  for (const table of Object.keys(coreTableSchemas) as CoreTable[]) {
    if (table === "expense_links") continue; // Ledger owner supplies associations after its independent access check.
    const legacy = table === "itinerary_events" || table === "itinerary_reservations";
    const rows = (
      await lease.query(
        `SELECT to_jsonb(facts) AS fact FROM (SELECT ${projection(table)} FROM public.${quoted(table)} WHERE trip_id=$1::uuid${legacy ? " AND business_contract_version=2" : ""} LIMIT 20001) facts`,
        [trip],
      )
    ).rows;
    count += rows.length;
    if (count > 20000) throw new Error("CORE_READ_RESOURCE_LIMIT");
    graph[table] = rows.map((r) =>
      coreTableSchemas[table].parse(normalized(r.fact as CoreRow)),
    ) as CoreRow[];
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
          await lease.query("SET LOCAL statement_timeout='5000ms'");
          await lease.query("SET LOCAL lock_timeout='1000ms'");
          await lease.query("SET LOCAL TIME ZONE 'UTC'");
          const identity = (
            await lease.query("SELECT session_user AS principal,current_user AS role")
          ).rows[0];
          if (
            identity?.principal !== "otr_trip_core_v2_gateway" ||
            identity.role !== "otr_trip_core_v2_gateway"
          )
            throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
          await lease.query(
            "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
            [scope.actorAccountId, scope.tripId],
          );
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
            collision = false;
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
                ? { domainReceiptId: row.id as string, receiptText: json(row.body) }
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
              const r = (
                await lease.query(
                  "SELECT runtime_enabled,enabled_commands FROM public.trip_core_activation_gate WHERE singleton",
                )
              ).rows[0];
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
              if (collision) throw new Error("REVISION_CONFLICT");
              const gate = (
                await lease.query(
                  "SELECT enabled_families,enabled_admission_modes FROM public.trip_core_activation_gate WHERE singleton",
                )
              ).rows[0];
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
                await admission.verify(lease, actor, command, intent, graph);
              }
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
