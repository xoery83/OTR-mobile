import type * as SQLite from "expo-sqlite";
import { z } from "zod";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  parseFlightConfirmation,
  resolveReviewedFlightSelection,
  validateReviewedFlightCommand,
  flightReviewSchema,
  flightInputSchema,
  importDigest,
  type ImportHash,
  type FlightConfirmationIntent,
} from "@/domain/trip/flightImportReview";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "@/domain/trip/eventIntentJson";
import {
  flightServicesSchema,
  parseFlightCommandEnvelope,
} from "@/domain/trip/flightAdmission";
import {
  tripImportSnapshotSchema,
  type TripImportCatalogName,
} from "@/data/api/tripImportCatalogContracts";
import {
  validateImportSnapshot,
  importCatalogKeys,
  importCatalogMutableColumns,
} from "./tripImportCatalogRecovery";
import { eventOperationReceiptSchema } from "@/data/api/tripCanonicalReadContracts";

export type ImportAdmissionDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
> &
  Partial<Pick<SQLite.SQLiteDatabase, "isInTransactionAsync">>;
type Row = Record<string, unknown>;
const receiptSchema = eventOperationReceiptSchema.omit({ projection: true }).extend({
  intended_payload: z.string().max(32768),
  result_fields: z.record(z.string(), z.unknown()),
  confirmations: z.record(z.string(), z.unknown()),
});
const json = (v: unknown) => canonicalEventJson(v as Json);
function integrity(): never {
  throw new Error("IMPORT_ADMISSION_INTEGRITY");
}
function changes(v: { changes: number }) {
  if (v.changes !== 1) throw new Error("IMPORT_CAS_CONFLICT");
}
// Unwired repository: these operation names are not registered with the scheduler.
export function createTripImportAdmissionRepository(
  database: ImportAdmissionDatabase,
  getAccountId: () => Promise<string>,
  sha256: ImportHash,
  now: () => string,
  newId: () => string,
) {
  async function scoped<T>(
    context: AccountRequestContext,
    work: () => Promise<T>,
    afterRelease?: (result: T) => void,
  ) {
    return withAccountApplyGate(async () => {
      let result!: T;
      await database.withTransactionAsync(async () => {
        await assertAccountRequestContext(context, getAccountId);
        await trip(context);
        result = await work();
        await assertAccountRequestContext(context, getAccountId);
      });
      await assertAccountRequestContext(context, getAccountId);
      return result;
    }, afterRelease);
  }
  async function closureEvidence(c: AccountRequestContext, candidateId: string) {
    const candidate = await database.getFirstAsync<Row>(
      "SELECT p.*,r.generation,r.input_sha256,r.scope_source_ids,r.state AS run_state,r.retention_state AS run_retention FROM trip_source_candidates p JOIN trip_source_runs r ON r.cache_account_id=p.cache_account_id AND r.id=p.run_id WHERE p.cache_account_id=? AND p.id=? AND r.trip_id=? AND r.actor_account_id=?",
      c.accountId,
      candidateId,
      c.tripId,
      c.accountId,
    );
    if (
      !candidate ||
      candidate.retention_state !== "RETAINED" ||
      candidate.run_retention !== "RETAINED" ||
      candidate.run_state !== "READY"
    )
      throw new Error("INPUT_STALE");
    const family = await related(c, candidateId);
    const sources = z
      .array(z.uuid())
      .max(64)
      .parse(parseEventJson(candidate.scope_source_ids as string));
    const claims = await database.getAllAsync<Row>(
      "SELECT s.*,r.scope_source_ids FROM trip_source_output_slots s JOIN trip_source_confirmations c ON c.cache_account_id=s.cache_account_id AND c.id=s.confirmation_id JOIN trip_source_candidates p ON p.cache_account_id=s.cache_account_id AND p.id=s.candidate_id JOIN trip_source_runs r ON r.cache_account_id=p.cache_account_id AND r.id=p.run_id WHERE c.cache_account_id=? AND c.trip_id=? AND c.actor_account_id=? AND s.disposition='CREATE' AND s.create_claim_active=1",
      c.accountId,
      c.tripId,
      c.accountId,
    );
    if (claims.length > 64) throw new Error("IMPORT_RESOURCE_LIMIT");
    const inputs = await database.getAllAsync<Row>(
      "SELECT * FROM trip_source_inputs WHERE cache_account_id=? AND run_id=? ORDER BY id",
      c.accountId,
      candidate.run_id as string,
    );
    if (inputs.length > 64) throw new Error("IMPORT_RESOURCE_LIMIT");
    for (const row of inputs) {
      const input = flightInputSchema.parse(
        Object.fromEntries(
          Object.keys(flightInputSchema.shape).map((k) => [
            k,
            k === "historical_selection" ? row[k] === 1 : row[k],
          ]),
        ),
      );
      await pin(c, input);
    }
    return {
      candidate,
      inputs,
      claims: claims
        .filter(
          (p) =>
            family.includes(p.candidate_id as string) ||
            z
              .array(z.uuid())
              .max(64)
              .parse(parseEventJson(p.scope_source_ids as string))
              .some((id) => sources.includes(id)),
        )
        .map((p): Row & { lineage_related: boolean } => ({
          ...p,
          lineage_related: family.includes(p.candidate_id as string),
        })),
    };
  }
  async function trip(c: AccountRequestContext) {
    if (
      !(await database.getFirstAsync(
        "SELECT 1 FROM ledger_actor_context WHERE user_id=? AND journey_id=?",
        c.accountId,
        c.tripId,
      ))
    )
      throw new Error("IMPORT_TRIP_ACCESS");
  }
  async function admitTransactionStore(c: AccountRequestContext) {
    if (!database.isInTransactionAsync || !(await database.isInTransactionAsync()))
      throw new Error("IMPORT_TRANSACTION_REQUIRED");
    await assertAccountRequestContext(c, getAccountId);
    await trip(c);
  }
  async function queue(
    c: AccountRequestContext,
    type: string,
    id: string,
    key: string,
    base: number | null,
    payload: string,
  ) {
    const old = await database.getFirstAsync<Row>(
      "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND idempotency_key=? AND operation_type=?",
      c.accountId,
      c.tripId,
      key,
      type,
    );
    if (old) {
      if (
        old.entity_id !== id ||
        old.payload_json !== payload ||
        old.base_version !== base
      )
        throw new Error("IMPORT_KEY_REUSED");
      return;
    }
    await database.runAsync(
      "INSERT INTO sync_operations(id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,status,attempt_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'PENDING',0,?,?)",
      newId(),
      c.accountId,
      c.tripId,
      "TRIP_IMPORT",
      id,
      type,
      key,
      base,
      payload,
      now(),
      now(),
    );
  }
  async function pin(
    c: AccountRequestContext,
    p: FlightConfirmationIntent["inputs"][number],
  ) {
    const source = await database.getFirstAsync<Row>(
      "SELECT * FROM trip_sources WHERE cache_account_id=? AND id=?",
      c.accountId,
      p.source_id,
    );
    const representation = await database.getFirstAsync<Row>(
      "SELECT * FROM trip_source_representations WHERE cache_account_id=? AND id=? AND source_id=?",
      c.accountId,
      p.representation_id,
      p.source_id,
    );
    const manifest = await database.getFirstAsync<Row>(
      "SELECT * FROM trip_source_revisions WHERE cache_account_id=? AND source_id=? AND material_revision=?",
      c.accountId,
      p.source_id,
      p.material_revision,
    );
    if (
      !source ||
      !representation ||
      !manifest ||
      source.trip_id !== c.tripId ||
      source.acquired_by !== c.accountId ||
      source.lifecycle !== "ACTIVE" ||
      source.retention_state !== "RETAINED" ||
      source.row_revision !== p.observed_source_row_revision ||
      (!p.historical_selection &&
        source.current_material_revision !== p.material_revision) ||
      representation.retention_state !== "RETAINED" ||
      representation.payload_sha256 !== p.payload_sha256 ||
      representation.byte_count !== p.byte_count ||
      manifest.retention_state !== "RETAINED" ||
      representation.registration_state !== "REGISTERED" ||
      (representation.material_kind === "BINARY" &&
        representation.remote_state !== "VERIFIED")
    )
      throw new Error("INPUT_STALE");
    const originals = z
      .array(z.uuid())
      .min(1)
      .max(64)
      .parse(JSON.parse(manifest.original_representation_ids as string));
    const visited = new Set<string>();
    async function ancestry(id: string, path: Set<string>): Promise<void> {
      if (path.has(id)) integrity();
      if (visited.has(id)) return;
      visited.add(id);
      if (visited.size > 64) throw new Error("IMPORT_RESOURCE_LIMIT");
      const r = await database.getFirstAsync<Row>(
        "SELECT * FROM trip_source_representations WHERE cache_account_id=? AND id=? AND source_id=?",
        c.accountId,
        id,
        p.source_id,
      );
      if (!r || r.retention_state !== "RETAINED") integrity();
      const parents = z
        .array(z.uuid())
        .max(16)
        .parse(JSON.parse(r.parent_ids as string));
      if (parents.length === 0 && !originals.includes(id)) integrity();
      for (const parent of parents) await ancestry(parent, new Set([...path, id]));
    }
    await ancestry(p.representation_id, new Set());
  }
  async function related(c: AccountRequestContext, candidate: string) {
    const rows = await database.getAllAsync<{ id: string | null; run_id: string }>(
      `WITH RECURSIVE ancestors(id) AS (SELECT run_id FROM trip_source_candidates WHERE cache_account_id=? AND id=? UNION SELECT p.parent_run_id FROM trip_source_run_predecessors p JOIN ancestors a ON p.child_run_id=a.id WHERE p.cache_account_id=?), related(id) AS (SELECT id FROM ancestors UNION SELECT p.child_run_id FROM trip_source_run_predecessors p JOIN related a ON p.parent_run_id=a.id WHERE p.cache_account_id=?) SELECT c.id,r.id AS run_id FROM related r LEFT JOIN trip_source_candidates c ON r.id=c.run_id AND c.cache_account_id=?`,
      c.accountId,
      candidate,
      c.accountId,
      c.accountId,
      c.accountId,
    );
    if (
      new Set(rows.map((r) => r.run_id)).size > 64 ||
      rows.filter((r) => r.id !== null).length > 64
    )
      throw new Error("IMPORT_RESOURCE_LIMIT");
    return rows.flatMap((r) => (r.id === null ? [] : [r.id]));
  }
  async function retainedProofs(
    c: AccountRequestContext,
    slot: FlightConfirmationIntent["slots"][number],
    actual: ReturnType<typeof validateReviewedFlightCommand>,
  ) {
    for (const [field, proof] of Object.entries(actual.payload.proofs)) {
      if (proof.kind !== "RETAINED") continue;
      if (slot.disposition !== "UPDATE") integrity();
      let row: Row | null, value: unknown, ref: unknown;
      const leaf = field.slice(field.lastIndexOf(".") + 1);
      if (field === "ROOT.title") {
        row = await database.getFirstAsync<Row>(
          "SELECT title FROM trip_canonical_events WHERE account_id=? AND trip_id=? AND event_id=? AND semantic_revision=?",
          c.accountId,
          c.tripId,
          slot.intended_target_id,
          slot.base_revision,
        );
        value = row?.title;
        const receipt = await database.getFirstAsync<Row>(
          "SELECT receipt_json FROM trip_event_receipt_cache WHERE cache_account_id=? AND trip_id=? AND json_extract(receipt_json,'$.target_event_id')=? AND json_extract(receipt_json,'$.outcome') IN ('APPLIED','NO_CHANGE') AND json_extract(receipt_json,'$.committed_semantic_revision')<=? AND json_extract(receipt_json,'$.confirmations.\"ROOT.title\".ref') IS NOT NULL ORDER BY json_extract(receipt_json,'$.committed_semantic_revision') DESC LIMIT 1",
          c.accountId,
          c.tripId,
          slot.intended_target_id,
          slot.base_revision,
        );
        if (receipt) {
          const cached = parseEventJson(receipt.receipt_json as string, 262144) as {
            confirmations: Record<string, { ref?: string }>;
          };
          ref = cached.confirmations[field]?.ref;
        }
      } else {
        row = field.startsWith("SERVICE.")
          ? await database.getFirstAsync<Row>(
              "SELECT * FROM trip_transport_service_mirrors WHERE cache_account_id=? AND trip_id=? AND event_id=? AND semantic_revision=? AND service_key=?",
              c.accountId,
              c.tripId,
              slot.intended_target_id,
              slot.base_revision,
              field.slice(8, -leaf.length - 1),
            )
          : await database.getFirstAsync<Row>(
              "SELECT * FROM trip_canonical_transport_endpoints WHERE account_id=? AND trip_id=? AND event_id=? AND role=?",
              c.accountId,
              c.tripId,
              slot.intended_target_id,
              field.split(".")[0],
            );
        value = row?.[leaf];
        if (row && ["local_time", "source_instant"].includes(leaf))
          value = {
            value,
            precision:
              row[leaf === "local_time" ? "clock_precision" : "source_instant_precision"],
          };
        if (row)
          for (const column of ["provenance_refs", "spatial_provenance_refs"]) {
            if (typeof row[column] === "string")
              ref ??= (parseEventJson(row[column] as string) as Record<string, Json>)[
                leaf
              ];
          }
      }
      if (
        !row ||
        ref !== proof.ref ||
        value === null ||
        value === undefined ||
        (typeof value === "object" && "value" in value && value.value === null) ||
        json(value) !== json(actual.leaves[field])
      )
        integrity();
    }
  }
  async function review(
    c: AccountRequestContext,
    intent: FlightConfirmationIntent,
    command?: { slotId: string; envelope: ReturnType<typeof parseFlightCommandEnvelope> },
  ) {
    for (const p of intent.inputs) await pin(c, p);
    for (const s of intent.slots) {
      if (s.candidate_id === null) continue;
      const candidate = await database.getFirstAsync<Row>(
        "SELECT c.*,r.trip_id,r.actor_account_id,r.state AS run_state,r.retention_state AS run_retention,r.scope_source_ids FROM trip_source_candidates c JOIN trip_source_runs r ON r.cache_account_id=c.cache_account_id AND r.id=c.run_id WHERE c.cache_account_id=? AND c.id=? AND c.run_id=?",
        c.accountId,
        s.candidate_id,
        s.reviewed_run_id,
      );
      if (
        !candidate ||
        candidate.trip_id !== c.tripId ||
        candidate.actor_account_id !== c.accountId ||
        candidate.run_state !== "READY" ||
        candidate.retention_state !== "RETAINED" ||
        candidate.run_retention !== "RETAINED" ||
        candidate.proposal_sha256 !==
          (await importDigest(
            "otr-source-candidate-v1",
            parseEventJson(candidate.proposal as string, 262144),
            sha256,
          ))
      )
        integrity();
      if (s.disposition !== "CREATE" && s.disposition !== "UPDATE") continue;
      const proposal = parseEventJson(candidate.proposal as string, 262144) as {
        fields: Record<string, { input_ids: string[]; proposed_value: Json }>;
      };
      for (const [field, support] of Object.entries(s.support_payload)) {
        if (
          !s.reviewed_payload?.selected_fields.includes(field) ||
          support.accepted_value_ref !==
            `otr-event/receipt/${c.tripId}/${c.accountId}/${s.domain_operation_key}/slot/${s.slot_id}/${field}`
        )
          integrity();
        if (support.origin === "USER_ENTERED") {
          if (!(field in s.reviewed_payload.edits)) integrity();
        } else {
          const container = support.candidate_field_key!;
          const extracted = proposal.fields[container];
          if (support.candidate_id !== s.candidate_id || !extracted) integrity();
          const selected = intent.inputs.filter((p) => support.input_ids.includes(p.id));
          const original = await database.getAllAsync<Row>(
            "SELECT * FROM trip_source_inputs WHERE cache_account_id=? AND run_id=?",
            c.accountId,
            s.reviewed_run_id,
          );
          const identity = (p: Record<string, unknown>) =>
            json([
              p.source_id,
              p.material_revision,
              p.representation_id,
              p.payload_sha256,
              p.byte_count,
            ]);
          const required = original
            .filter((p) => extracted.input_ids.includes(p.id as string))
            .map(identity)
            .sort();
          if (
            required.length !== extracted.input_ids.length ||
            selected.length !== support.input_ids.length ||
            json(selected.map(identity).sort()) !== json(required)
          )
            integrity();
          if (
            support.origin === "EDITED_EXTRACTED" &&
            json(support.edited_value) !== json(s.reviewed_payload.edits[container])
          )
            integrity();
        }
      }

      resolveReviewedFlightSelection(s, proposal.fields);
      if (command?.slotId === s.slot_id)
        await retainedProofs(
          c,
          s,
          validateReviewedFlightCommand(
            s,
            proposal.fields,
            command.envelope.command,
            command.envelope.payload,
          ),
        );
      const candidates = await related(c, s.candidate_id);
      const claims = await database.getAllAsync<Row>(
        "SELECT s.*,r.scope_source_ids AS claim_sources FROM trip_source_output_slots s JOIN trip_source_confirmations c ON c.cache_account_id=s.cache_account_id AND c.id=s.confirmation_id JOIN trip_source_candidates p ON p.cache_account_id=s.cache_account_id AND p.id=s.candidate_id JOIN trip_source_runs r ON r.cache_account_id=p.cache_account_id AND r.id=p.run_id WHERE c.cache_account_id=? AND c.trip_id=? AND c.actor_account_id=? AND s.disposition='CREATE' AND s.create_claim_active=1",
        c.accountId,
        c.tripId,
        c.accountId,
      );
      if (claims.length > 64) throw new Error("IMPORT_RESOURCE_LIMIT");
      const selectedSources = z
        .array(z.uuid())
        .max(64)
        .parse(JSON.parse(candidate.scope_source_ids as string));
      for (const claim of claims) {
        if (claim.slot_id === s.slot_id) continue;
        if (
          !candidates.includes(claim.candidate_id as string) &&
          z
            .array(z.uuid())
            .max(64)
            .parse(JSON.parse(claim.claim_sources as string))
            .some((id) => selectedSources.includes(id))
        )
          throw new Error("UNRESOLVED_MATCH");
      }
      for (const claim of claims.filter(
        (p) => p.slot_id !== s.slot_id && candidates.includes(p.candidate_id as string),
      )) {
        const mapping = intent.lineage_dispositions.find(
          (p) =>
            p.slot_id === s.slot_id &&
            p.ancestor_candidate_id === claim.candidate_id &&
            p.ancestor_slot_key === claim.slot_key,
        );
        if (mapping?.relation === "DISTINCT_OUTPUT" && s.slot_key !== claim.slot_key)
          continue;
        if (claim.candidate_id !== s.candidate_id && !mapping)
          throw new Error("UNRESOLVED_MATCH");
        if (claim.receipt_sha256 === null) throw new Error("PREDECESSOR_OUTCOME_UNKNOWN");
        if (s.disposition === "CREATE") throw new Error("KNOWN_PREDECESSOR_TARGET");
        if (claim.result_target_id !== s.intended_target_id)
          throw new Error("INCOMPATIBLE_MERGE_TARGETS");
      }
      if (s.disposition === "UPDATE") {
        const target = await database.getFirstAsync<Row>(
          "SELECT * FROM trip_canonical_events WHERE account_id=? AND trip_id=? AND event_id=?",
          c.accountId,
          c.tripId,
          s.intended_target_id,
        );
        if (
          !target ||
          target.temporal_shape !== "TRANSPORT" ||
          target.semantic_revision !== s.base_revision
        )
          throw new Error("STALE_BASE_REVISION");
      }
    }
    for (const d of intent.dependencies) {
      const p = await database.getFirstAsync<Row>(
        "SELECT s.*,c.trip_id,c.actor_account_id FROM trip_source_output_slots s JOIN trip_source_confirmations c ON c.cache_account_id=s.cache_account_id AND c.id=s.confirmation_id WHERE s.cache_account_id=? AND s.slot_id=?",
        c.accountId,
        d.predecessor_slot_id,
      );
      const s = intent.slots.find((s) => s.slot_id === d.slot_id);
      if (
        !p ||
        !s ||
        p.trip_id !== c.tripId ||
        p.actor_account_id !== c.accountId ||
        p.receipt_sha256 !== d.expected_receipt_sha256 ||
        p.result_target_id !== d.expected_target_id ||
        p.result_revision !== d.expected_result_revision ||
        s.intended_target_id !== d.expected_target_id ||
        s.base_revision !== d.expected_result_revision
      )
        integrity();
    }
  }
  async function insert(table: string, row: Record<string, string | number | null>) {
    const columns = Object.keys(row);
    await database.runAsync(
      `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
      ...Object.values(row),
    );
  }
  async function applyCatalogsInTransaction(c: AccountRequestContext, raw: string) {
    const snapshot = tripImportSnapshotSchema.parse(parseEventJson(raw, 4194304));
    if (snapshot.trip_id !== c.tripId || snapshot.actor_account_id !== c.accountId)
      integrity();
    const catalogs = snapshot as unknown as Record<TripImportCatalogName, Row[]>;
    await validateImportSnapshot(c.accountId, c.tripId, catalogs, sha256);
    await trip(c);
    // Deferred Source/manifest and C parent FKs are checked at transaction commit.
    // Every cross-row relationship is also checked above for FK-OFF parity.
    const parentRevisions = new Map<
      unknown,
      { revision: unknown; registered: boolean }
    >();
    for (const observed of catalogs.trip_source_confirmations) {
      const previous = await database.getFirstAsync<Row>(
        "SELECT row_revision,registration_state FROM trip_source_confirmations WHERE cache_account_id=? AND id=?",
        c.accountId,
        observed.id as string,
      );
      if (previous)
        parentRevisions.set(observed.id, {
          revision: previous.row_revision,
          registered: previous.registration_state === "REGISTERED",
        });
    }
    for (const table of Object.keys(importCatalogKeys) as TripImportCatalogName[]) {
      for (const observed of catalogs[table]) {
        const values: Record<string, string | number | null> = {
          cache_account_id: c.accountId,
          registration_state: "REGISTERED",
        };
        for (const [key, value] of Object.entries(observed))
          values[key] =
            value === null
              ? null
              : typeof value === "boolean"
                ? Number(value)
                : typeof value === "object"
                  ? json(value)
                  : (value as string | number);
        const keys = importCatalogKeys[table];
        const where = ["cache_account_id", ...keys].map((k) => `${k}=?`).join(" AND ");
        const params = [c.accountId, ...keys.map((k) => values[k])];
        const old = await database.getFirstAsync<Row>(
          `SELECT * FROM ${table} WHERE ${where}`,
          ...params,
        );
        if (!old) {
          if (table === "trip_source_representations")
            Object.assign(values, {
              local_uri: null,
              local_state:
                observed.material_kind === "TEXT" &&
                observed.retention_state === "RETAINED"
                  ? "VERIFIED"
                  : "ABSENT",
              local_verified_at:
                observed.material_kind === "TEXT" &&
                observed.retention_state === "RETAINED"
                  ? now()
                  : null,
              transfer_state:
                observed.material_kind === "BINARY"
                  ? observed.remote_state === "VERIFIED"
                    ? "COMPLETE"
                    : "PENDING"
                  : "NOT_REQUIRED",
            });
          await insert(table, values);
          continue;
        }
        if (old.retention_state !== "RETAINED" && observed.retention_state === "RETAINED")
          integrity();
        if (
          table === "trip_source_candidates" &&
          old.proposal !== values.proposal &&
          !(observed.retention_state === "IDENTITY_ONLY" && values.proposal === null)
        )
          integrity();
        if (table === "trip_source_representations") {
          // Material identity can only disappear through an authoritative privacy
          // transition; a higher operational revision cannot rebind its bytes.
          for (const k of [
            "text_content",
            "locator_uri",
            "storage_provider",
            "storage_bucket",
            "object_key",
            "payload_sha256",
            "byte_count",
            "original_filename",
          ]) {
            if (
              old[k] !== values[k] &&
              !(observed.retention_state !== "RETAINED" && values[k] === null)
            )
              integrity();
          }
        }
        const mutable = importCatalogMutableColumns[table];
        for (const [key, value] of Object.entries(values)) {
          if (
            key === "registration_state" ||
            mutable.includes(key) ||
            (old.registration_state === "PENDING" &&
              (key === "created_at" || key === "reviewed_at") &&
              old[key] === null)
          )
            continue;
          if (
            old[key] !== value &&
            !(
              ((table === "trip_sources" && key === "acquisition_sha256") ||
                (table === "trip_source_revisions" && key === "capture_sha256")) &&
              observed.retention_state === "IDENTITY_ONLY" &&
              value === null
            )
          )
            throw new Error("IMPORT_OBSERVATION_IDENTITY_CONFLICT");
        }
        if (
          typeof old.row_revision === "number" &&
          typeof values.row_revision === "number"
        ) {
          if (values.row_revision < old.row_revision) continue;
          if (
            values.row_revision === old.row_revision &&
            old.registration_state === "REGISTERED" &&
            Object.keys(values).some((k) => old[k] !== values[k])
          )
            throw new Error("IMPORT_OBSERVATION_REVISION_CONFLICT");
        }
        if (table === "trip_source_output_slots") {
          const parent = catalogs.trip_source_confirmations.find(
            (p) => p.id === observed.confirmation_id,
          )!;
          const previous = parentRevisions.get(observed.confirmation_id);
          if (previous && Number(parent.row_revision) < Number(previous.revision))
            continue;
          if (
            previous?.registered &&
            parent.row_revision === previous.revision &&
            old.registration_state === "REGISTERED" &&
            Object.keys(values).some((k) => old[k] !== values[k])
          )
            throw new Error("IMPORT_OBSERVATION_REVISION_CONFLICT");
          if (old.dispatched_at !== null && values.dispatched_at === null) continue;
          for (const k of [
            "receipt_sha256",
            "result_target_id",
            "result_revision",
            "no_commit_basis",
            "no_commit_receipt_sha256",
          ]) {
            if (old[k] !== null && old[k] !== values[k]) integrity();
          }
          if (
            old.create_claim_active === 1 &&
            values.create_claim_active === 0 &&
            values.no_commit_basis === null
          )
            integrity();
        }
        const columns = Object.keys(values).filter(
          (k) => k !== "cache_account_id" && !keys.includes(k),
        );
        await database.runAsync(
          `UPDATE ${table} SET ${columns.map((k) => `${k}=?`).join(",")} WHERE ${where}`,
          ...columns.map((k) => values[k]),
          ...params,
        );
      }
    }
    return "APPLIED" as const;
  }
  return {
    captureContext: (tripId: string) =>
      captureAccountRequestContext(tripId, getAccountId),
    // Owning caller supplies the existing serialized transaction and Account gate.
    transactionStore: Object.freeze({
      database,
      async applyCatalogs(c: AccountRequestContext, raw: string) {
        await admitTransactionStore(c);
        const result = await applyCatalogsInTransaction(c, raw);
        await assertAccountRequestContext(c, getAccountId);
        return result;
      },
      async assertInput(
        c: AccountRequestContext,
        input: FlightConfirmationIntent["inputs"][number],
      ) {
        await admitTransactionStore(c);
        return pin(c, input);
      },
    }),
    async applyCatalogs(c: AccountRequestContext, raw: string) {
      return scoped(c, () => applyCatalogsInTransaction(c, raw));
    },
    async readDraft(c: AccountRequestContext, draftKey: string) {
      return scoped(c, async () => {
        const row = await database.getFirstAsync<Row>(
          "SELECT * FROM trip_source_review_drafts WHERE account_id=? AND trip_id=? AND draft_key=?",
          c.accountId,
          c.tripId,
          draftKey,
        );
        if (!row) return null;
        const run = await database.getFirstAsync<Row>(
          "SELECT * FROM trip_source_runs WHERE cache_account_id=? AND trip_id=? AND actor_account_id=? AND id=?",
          c.accountId,
          c.tripId,
          c.accountId,
          row.run_id as string,
        );
        if (
          !run ||
          run.retention_state !== "RETAINED" ||
          run.input_sha256 !== row.observed_input_sha256
        )
          throw new Error("INPUT_STALE");
        return {
          runId: row.run_id as string,
          inputHash: row.observed_input_sha256 as string,
          revision: row.row_revision as number,
          review: flightReviewSchema.parse(parseEventJson(row.review_payload as string)),
        };
      });
    },
    async readClosureEvidence(c: AccountRequestContext, candidateId: string) {
      z.uuid().parse(candidateId);
      return scoped(c, () => closureEvidence(c, candidateId));
    },
    // Read-only final revision admission. The caller's synchronous handoff runs
    // only after COMMIT and Account-gate release, never across remote I/O.
    async admitClosureReview(
      c: AccountRequestContext,
      pins: {
        candidateId: string;
        candidateSha256: string;
        runId: string;
        runGeneration: number;
        inputSha256: string;
        inputs: z.infer<typeof flightInputSchema>[];
        eventId: string | null;
        baseRevision: number | null;
      },
      handoff: () => void,
    ) {
      pins = structuredClone(pins);
      return scoped(
        c,
        async () => {
          const evidence = await closureEvidence(c, pins.candidateId);
          const current = evidence.candidate;
          if (
            current.run_id !== pins.runId ||
            current.generation !== pins.runGeneration ||
            current.input_sha256 !== pins.inputSha256 ||
            current.proposal_sha256 !== pins.candidateSha256
          )
            throw new Error("INPUT_STALE");
          const inputs = evidence.inputs.map((row) =>
            flightInputSchema.parse(
              Object.fromEntries(
                Object.keys(flightInputSchema.shape).map((key) => [
                  key,
                  key === "historical_selection" ? row[key] === 1 : row[key],
                ]),
              ),
            ),
          );
          if (
            json(inputs) !==
            json([...pins.inputs].sort((a, b) => a.id.localeCompare(b.id)))
          )
            throw new Error("INPUT_STALE");
          if (pins.eventId !== null) {
            const event = await database.getFirstAsync<Row>(
              "SELECT semantic_revision FROM trip_canonical_events WHERE account_id=? AND trip_id=? AND event_id=?",
              c.accountId,
              c.tripId,
              pins.eventId,
            );
            if (!event || event.semantic_revision !== pins.baseRevision)
              throw new Error("STALE_BASE_REVISION");
          }
        },
        handoff,
      );
    },
    async saveDraft(
      c: AccountRequestContext,
      draftKey: string,
      runId: string,
      expectedRevision: number | null,
      payload: unknown,
      inputHash: string,
    ) {
      z.string()
        .regex(/^[A-Za-z0-9._:-]{1,128}$/)
        .parse(draftKey);
      z.uuid().parse(runId);
      z.string()
        .regex(/^[0-9a-f]{64}$/)
        .parse(inputHash);
      const bytes = json(flightReviewSchema.parse(payload));
      return scoped(c, async () => {
        const run = await database.getFirstAsync<Row>(
          "SELECT * FROM trip_source_runs WHERE cache_account_id=? AND id=? AND trip_id=? AND actor_account_id=?",
          c.accountId,
          runId,
          c.tripId,
          c.accountId,
        );
        if (!run || run.input_sha256 !== inputHash || run.retention_state !== "RETAINED")
          throw new Error("INPUT_STALE");
        if (expectedRevision === null)
          await database.runAsync(
            "INSERT INTO trip_source_review_drafts(account_id,draft_key,trip_id,run_id,row_revision,review_version,review_payload,observed_input_sha256,updated_at) VALUES(?,?,?,?,1,1,?,?,?)",
            c.accountId,
            draftKey,
            c.tripId,
            runId,
            bytes,
            inputHash,
            now(),
          );
        else
          changes(
            await database.runAsync(
              "UPDATE trip_source_review_drafts SET review_payload=?,observed_input_sha256=?,row_revision=row_revision+1,updated_at=? WHERE account_id=? AND draft_key=? AND trip_id=? AND run_id=? AND row_revision=?",
              bytes,
              inputHash,
              now(),
              c.accountId,
              draftKey,
              c.tripId,
              runId,
              expectedRevision,
            ),
          );
      });
    },
    async prepare(c: AccountRequestContext, raw: string) {
      const intent = parseFlightConfirmation(raw);
      const canonical = json(intent);
      const digest = await importDigest(
        "otr-source-confirmation-v1",
        [1, c.accountId, c.tripId, intent] as unknown as Json,
        sha256,
      );
      return scoped(c, async () => {
        const old = await database.getFirstAsync<Row>(
          "SELECT * FROM trip_source_confirmations WHERE cache_account_id=? AND trip_id=? AND actor_account_id=? AND confirmation_key=?",
          c.accountId,
          c.tripId,
          c.accountId,
          intent.confirmation_key,
        );
        if (old) {
          if (old.id !== intent.id || old.intent_sha256 !== digest)
            throw new Error("IMPORT_KEY_REUSED");
          return old;
        }
        for (const slot of intent.slots) {
          if (
            slot.domain_operation_key !== null &&
            (await database.getFirstAsync(
              "SELECT 1 FROM trip_source_output_slots s JOIN trip_source_confirmations c ON c.cache_account_id=s.cache_account_id AND c.id=s.confirmation_id WHERE c.cache_account_id=? AND c.trip_id=? AND c.actor_account_id=? AND s.domain_operation_key=?",
              c.accountId,
              c.tripId,
              c.accountId,
              slot.domain_operation_key,
            ))
          )
            throw new Error("DOMAIN_OPERATION_KEY_REUSED");
        }
        await review(c, intent);
        await insert("trip_source_confirmations", {
          cache_account_id: c.accountId,
          registration_state: "PENDING",
          id: intent.id,
          trip_id: c.tripId,
          actor_account_id: c.accountId,
          confirmation_key: intent.confirmation_key,
          intent_version: 1,
          intent_sha256: digest,
          created_at: null,
          state: "PREPARED",
          row_revision: 1,
          retention_state: "RETAINED",
        });
        for (const p of intent.inputs)
          await insert("trip_source_inputs", {
            ...p,
            historical_selection: p.historical_selection ? 1 : 0,
            cache_account_id: c.accountId,
            registration_state: "PENDING",
            run_id: null,
            confirmation_id: intent.id,
          });
        for (const s of intent.slots)
          await insert("trip_source_output_slots", {
            ...s,
            reviewed_payload: s.reviewed_payload ? json(s.reviewed_payload) : null,
            support_payload: json(s.support_payload),
            cache_account_id: c.accountId,
            registration_state: "PENDING",
            confirmation_id: intent.id,
            state:
              s.disposition === "REJECT"
                ? "REJECTED"
                : s.disposition === "DEFER"
                  ? "DEFERRED"
                  : "PREPARED",
            create_claim_active: s.disposition === "CREATE" ? 1 : 0,
          });
        for (const r of intent.lineage_dispositions)
          await insert("trip_source_slot_lineage_dispositions", {
            ...r,
            cache_account_id: c.accountId,
            registration_state: "PENDING",
            reviewed_by: c.accountId,
            reviewed_at: null,
          });
        for (const r of intent.dependencies)
          await insert("trip_source_slot_dependencies", {
            ...r,
            cache_account_id: c.accountId,
            registration_state: "PENDING",
          });
        await queue(
          c,
          "C_PREPARE_CONFIRMATION",
          intent.id,
          intent.confirmation_key,
          null,
          canonical,
        );
        return { id: intent.id, intent_sha256: digest };
      });
    },
    async markDispatch(
      c: AccountRequestContext,
      confirmationId: string,
      slotId: string,
      expectedRevision: number,
      rawCommand: string,
    ) {
      const envelope = parseFlightCommandEnvelope(rawCommand);
      const canonical = json(envelope);
      const digest = z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .parse(
          await sha256(
            new TextEncoder().encode(
              json({ ...envelope, encoding: "otr-event-intent-v1" }),
            ),
          ),
        );
      return scoped(c, async () => {
        const s = await database.getFirstAsync<Row>(
          "SELECT s.*,c.trip_id,c.actor_account_id,c.row_revision,c.retention_state AS parent_retention FROM trip_source_output_slots s JOIN trip_source_confirmations c ON c.cache_account_id=s.cache_account_id AND c.id=s.confirmation_id WHERE s.cache_account_id=? AND s.slot_id=? AND s.confirmation_id=?",
          c.accountId,
          slotId,
          confirmationId,
        );
        if (
          !s ||
          s.trip_id !== c.tripId ||
          s.actor_account_id !== c.accountId ||
          s.domain_intent_sha256 !== digest ||
          s.domain_operation_key !== envelope.operationKey ||
          s.intended_target_id !== envelope.eventId ||
          s.base_revision !== envelope.baseSemanticRevision ||
          envelope.actorAccountId !== c.accountId ||
          envelope.tripId !== c.tripId
        )
          integrity();
        if (s.state === "OUTCOME_UNKNOWN") return;
        if (
          s.state !== "PREPARED" ||
          s.parent_retention !== "RETAINED" ||
          s.retention_state !== "RETAINED"
        )
          integrity();
        const prepared = await database.getFirstAsync<Row>(
          "SELECT payload_json FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_id=? AND operation_type='C_PREPARE_CONFIRMATION'",
          c.accountId,
          c.tripId,
          confirmationId,
        );
        if (!prepared) throw new Error("IMPORT_REVIEW_INTENT_UNAVAILABLE");
        await review(c, parseFlightConfirmation(prepared.payload_json as string), {
          slotId,
          envelope,
        });
        changes(
          await database.runAsync(
            "UPDATE trip_source_confirmations SET row_revision=row_revision+1,state='PROCESSING',registration_state='PENDING' WHERE cache_account_id=? AND id=? AND row_revision=?",
            c.accountId,
            confirmationId,
            expectedRevision,
          ),
        );
        changes(
          await database.runAsync(
            "UPDATE trip_source_output_slots SET state='OUTCOME_UNKNOWN',dispatched_at=?,registration_state='PENDING' WHERE cache_account_id=? AND slot_id=? AND state='PREPARED'",
            now(),
            c.accountId,
            slotId,
          ),
        );
        await queue(
          c,
          "C_EXECUTE_EVENT_SLOT",
          slotId,
          s.domain_operation_key as string,
          s.base_revision as number | null,
          canonical,
        );
      });
    },
    async cacheReceipt(c: AccountRequestContext, slotId: string, raw: string) {
      const parsed = parseEventJson(raw, 262144);
      const receipt = receiptSchema.parse(parsed);
      const { receipt_sha256, ...bound } = receipt;
      if (receipt_sha256 !== (await sha256(new TextEncoder().encode(json(bound)))))
        integrity();
      const intent = parseEventJson(receipt.intended_payload);
      if (
        !intent ||
        typeof intent !== "object" ||
        Array.isArray(intent) ||
        receipt.intent_sha256 !==
          (await sha256(
            new TextEncoder().encode(
              json({ ...intent, encoding: "otr-event-intent-v1" }),
            ),
          ))
      )
        integrity();
      return scoped(c, async () => {
        const s = await database.getFirstAsync<Row>(
          "SELECT s.*,c.trip_id,c.actor_account_id FROM trip_source_output_slots s JOIN trip_source_confirmations c ON c.cache_account_id=s.cache_account_id AND c.id=s.confirmation_id WHERE s.cache_account_id=? AND s.slot_id=?",
          c.accountId,
          slotId,
        );
        if (
          !s ||
          s.trip_id !== c.tripId ||
          s.actor_account_id !== c.accountId ||
          receipt.trip_id !== c.tripId ||
          receipt.actor_account_id !== c.accountId ||
          receipt.operation_key !== s.domain_operation_key ||
          receipt.intent_sha256 !== s.domain_intent_sha256 ||
          receipt.target_event_id !== s.intended_target_id ||
          receipt.base_semantic_revision !== s.base_revision ||
          receipt.command !==
            (s.disposition === "CREATE" ? "CREATE_TRANSPORT" : "UPDATE_TRANSPORT")
        )
          integrity();
        const success = receipt.outcome === "APPLIED" || receipt.outcome === "NO_CHANGE";
        if (
          success
            ? receipt.result_event_id !== s.intended_target_id ||
              receipt.committed_semantic_revision === null
            : receipt.result_event_id !== null ||
              receipt.committed_semantic_revision !== null
        )
          integrity();
        const canonical = json(receipt);
        const old = await database.getFirstAsync<Row>(
          "SELECT * FROM trip_event_receipt_cache WHERE cache_account_id=? AND trip_id=? AND actor_account_id=? AND operation_key=?",
          c.accountId,
          c.tripId,
          c.accountId,
          receipt.operation_key,
        );
        if (old) {
          if (old.receipt_json !== canonical) integrity();
          return;
        }
        await database.runAsync(
          "INSERT INTO trip_event_receipt_cache(cache_account_id,trip_id,actor_account_id,operation_key,intent_sha256,receipt_sha256,receipt_version,receipt_json) VALUES(?,?,?,?,?,?,1,?)",
          c.accountId,
          c.tripId,
          c.accountId,
          receipt.operation_key,
          receipt.intent_sha256,
          receipt.receipt_sha256,
          canonical,
        );
        // Observation caching never inserts collection IDs, Event mirrors or Day rows.
        await queue(
          c,
          "C_FINALIZE_EVENT_SLOT",
          slotId,
          receipt.operation_key,
          null,
          json({
            confirmation_id: s.confirmation_id,
            slot_id: slotId,
            operation_key: receipt.operation_key,
            intent_sha256: receipt.intent_sha256,
          }),
        );
      });
    },
    async requestRevocation(
      c: AccountRequestContext,
      confirmationId: string,
      slotId: string,
      expectedRevision: number,
    ) {
      return scoped(c, async () => {
        const s = await database.getFirstAsync<Row>(
          "SELECT s.*,c.trip_id,c.actor_account_id,c.row_revision FROM trip_source_output_slots s JOIN trip_source_confirmations c ON c.cache_account_id=s.cache_account_id AND c.id=s.confirmation_id WHERE s.cache_account_id=? AND s.slot_id=? AND s.confirmation_id=?",
          c.accountId,
          slotId,
          confirmationId,
        );
        if (
          !s ||
          s.trip_id !== c.tripId ||
          s.actor_account_id !== c.accountId ||
          s.row_revision !== expectedRevision ||
          s.state !== "PREPARED" ||
          s.dispatched_at !== null
        )
          throw new Error("DISPATCHED_OUTCOME_REQUIRES_RECEIPT");
        // Requesting revocation does not release the local claim. Only an exact
        // authoritative observation of permanent server revocation can do that.
        await queue(
          c,
          "C_REVOKE_EVENT_SLOT",
          slotId,
          s.domain_operation_key as string,
          expectedRevision,
          json({
            confirmation_id: confirmationId,
            slot_id: slotId,
            expected_revision: expectedRevision,
            intent_sha256: s.domain_intent_sha256,
          }),
        );
      });
    },
    async pending(c: AccountRequestContext) {
      return scoped(c, () =>
        database.getAllAsync<Row>(
          "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND operation_type IN ('C_PREPARE_CONFIRMATION','C_EXECUTE_EVENT_SLOT','C_FINALIZE_EVENT_SLOT','C_ADMIT_CAPTURE_SOURCE','C_REVOKE_EVENT_SLOT') AND status<>'SUCCEEDED' ORDER BY created_at,id",
          c.accountId,
          c.tripId,
        ),
      );
    },
    async applyServices(
      c: AccountRequestContext,
      eventId: string,
      semanticRevision: number,
      raw: string,
    ) {
      const response = z
        .strictObject({
          version: z.literal(1),
          event_id: z.uuid(),
          semantic_revision: z.number().int().positive().safe(),
          services: z.array(z.unknown()).max(4),
        })
        .parse(parseEventJson(raw, 262144));
      if (
        response.event_id !== eventId ||
        response.semantic_revision !== semanticRevision
      )
        integrity();
      const services = flightServicesSchema.parse(
        response.services.map((v) => {
          const row = z.record(z.string(), z.unknown()).parse(v);
          return Object.fromEntries(
            Object.entries(row).filter(
              ([k]) => k !== "event_id" && k !== "provenance_refs",
            ),
          );
        }),
      );
      return scoped(c, async () => {
        const baseline = await database.getFirstAsync<Row>(
          "SELECT * FROM trip_canonical_events WHERE account_id=? AND trip_id=? AND event_id=?",
          c.accountId,
          c.tripId,
          eventId,
        );
        if (!baseline || baseline.semantic_revision !== semanticRevision)
          return "WITHHELD" as const;
        await database.runAsync(
          "DELETE FROM trip_transport_service_mirrors WHERE cache_account_id=? AND trip_id=? AND event_id=?",
          c.accountId,
          c.tripId,
          eventId,
        );
        for (let i = 0; i < services.length; i++) {
          const service = services[i];
          const source = response.services[i] as Row;
          if (source.event_id !== eventId) integrity();
          const refs = z
            .record(z.string(), z.string().min(1).max(512))
            .parse(source.provenance_refs);
          await insert("trip_transport_service_mirrors", {
            ...service,
            cache_account_id: c.accountId,
            trip_id: c.tripId,
            event_id: eventId,
            semantic_revision: semanticRevision,
            provenance_refs: json(refs),
          });
        }
        return "APPLIED" as const;
      });
    },
    async readServices(c: AccountRequestContext, eventId: string) {
      return scoped(c, () =>
        database.getAllAsync<Row>(
          "SELECT s.* FROM trip_transport_service_mirrors s JOIN trip_canonical_events e ON e.account_id=s.cache_account_id AND e.trip_id=s.trip_id AND e.event_id=s.event_id AND e.semantic_revision=s.semantic_revision WHERE s.cache_account_id=? AND s.trip_id=? AND s.event_id=? ORDER BY s.service_key",
          c.accountId,
          c.tripId,
          eventId,
        ),
      );
    },
  };
}
