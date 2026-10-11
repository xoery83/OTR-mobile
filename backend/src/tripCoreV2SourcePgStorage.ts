import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import type { FlightOutputClaimV2 } from "../../src/domain/trip/flightOutputPurposeV2";
import type {
  CoreSourcePlanStorageV2,
  CoreSourceStoredPlanV2,
  CoreSourceCatalogV2,
  CoreSourceScopeV2,
  CoreSourcePlanTransactionV2,
} from "./tripCoreV2Source";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
const json = (value: unknown) => canonicalCoreJson(value as Json);

export async function readOwningLegacySourceCatalog(
  lease: CorePgLease,
  scope: CoreSourceScopeV2 & { sourceId: string },
  runId?: string,
): Promise<CoreSourceCatalogV2> {
  const sourceId = scope.sourceId;
  const source = (
    await lease.query(
      "SELECT to_jsonb(s) AS source FROM public.trip_sources s WHERE id=$1::uuid",
      [sourceId],
    )
  ).rows[0]?.source as Record<string, Json> | undefined;
  if (
    !source ||
    source.trip_id !== scope.tripId ||
    source.acquired_by !== scope.actorAccountId ||
    source.lifecycle !== "ACTIVE" ||
    source.retention_state !== "RETAINED"
  )
    throw new Error("INPUT_STALE");
  const runs = (
    await lease.query(
      "SELECT to_jsonb(r) AS run FROM public.trip_source_runs r WHERE actor_account_id=$1::uuid AND trip_id=$2::uuid AND $3::uuid=ANY(scope_source_ids) AND superseded_by IS NULL AND ($4::uuid IS NULL OR id=$4::uuid) ORDER BY generation DESC LIMIT 65",
      [scope.actorAccountId, scope.tripId, sourceId, runId ?? null],
    )
  ).rows;
  // Multiple independent scopes require the future owning complete-catalog selector.
  if (runs.length !== 1) throw new Error("PREDECESSOR_OUTCOME_UNKNOWN");
  const run = runs[0].run as Record<string, Json>;
  if (run.state !== "READY" || run.retention_state !== "RETAINED")
    throw new Error("INPUT_STALE");
  const pins = (
    await lease.query(
      "SELECT to_jsonb(i) AS pin,public.trip_import_input_valid(i,$2::uuid,$3::uuid,true) AS valid FROM public.trip_source_inputs i WHERE run_id=$1::uuid ORDER BY id LIMIT 65",
      [run.id, scope.actorAccountId, scope.tripId],
    )
  ).rows;
  if (!pins.length || pins.length > 64 || pins.some((p) => p.valid !== true))
    throw new Error("INPUT_STALE");
  const inputs = pins.map((p) => {
    const {
      run_id: _run,
      confirmation_id: _confirmation,
      ...pin
    } = p.pin as Record<string, Json>;
    return pin;
  });
  const inputHash = (
    await lease.query("SELECT public.trip_import_run_input_hash($1::jsonb) AS hash", [
      json(inputs),
    ])
  ).rows[0]?.hash;
  if (inputHash !== run.input_sha256) throw new Error("INPUT_STALE");
  const candidates = (
    await lease.query(
      "SELECT id,run_id,candidate_kind,proposal,proposal_sha256,retention_state,public.trip_source_hash('otr-source-candidate-v1',proposal) AS checked_hash FROM public.trip_source_candidates WHERE run_id=$1::uuid ORDER BY id LIMIT 65",
      [run.id],
    )
  ).rows;
  if (
    candidates.length > 64 ||
    candidates.some(
      (c) =>
        c.retention_state !== "RETAINED" ||
        c.checked_hash !== c.proposal_sha256 ||
        !c.proposal,
    )
  )
    throw new Error("INVALID_PROVENANCE");
  return {
    actorAccountId: scope.actorAccountId,
    tripId: scope.tripId,
    sourceId,
    sourceRevision: Number(source.current_material_revision),
    inputCatalogSha256: inputHash as string,
    source,
    inputs,
    ...(Array.isArray(run.scope_source_ids)
      ? { runScopeSourceIds: run.scope_source_ids as string[] }
      : {}),
    candidates: candidates.map((c) => ({
      candidateId: c.id as string,
      runId: c.run_id as string,
      candidateSha256: c.proposal_sha256 as string,
      kind: c.candidate_kind === "TRANSPORT" ? "P2" : (c.candidate_kind as string),
      snapshot: c.proposal as Json,
      // Do not promote Capture's transient airport/relationship observations.
      identityFacts: null,
      identityEvidenceRefs: null,
    })),
  };
}

// This binding can persist honest REVIEW plans; W4 has not sealed qualified identity yet.
export function createCoreSourcePgStorageV2(
  connection: CorePgConnection,
): CoreSourcePlanStorageV2 {
  return {
    async withLockedSourcePlan(scope, work) {
      for (const id of [scope.actorAccountId, scope.tripId, scope.planId])
        coreUuid.parse(id);
      if (scope.sourceId) coreUuid.parse(scope.sourceId);
      return connection.withLease(async (lease) => {
        let began = false;
        try {
          await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
          began = true;
          await lease.query("SET LOCAL statement_timeout='5000ms'");
          await lease.query("SET LOCAL lock_timeout='1000ms'");
          const role = (
            await lease.query("SELECT session_user AS principal,current_user AS role")
          ).rows[0];
          if (
            role?.principal !== "otr_trip_core_v2_gateway" ||
            role.role !== "otr_trip_core_v2_gateway"
          )
            throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
          await lease.query(
            "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
            [scope.actorAccountId, scope.tripId],
          );
          let stored = (
            await lease.query(
              "SELECT account_id,trip_id,source_id,prepared_json FROM public.trip_source_core_v2_intents WHERE plan_id=$1::uuid",
              [scope.planId],
            )
          ).rows[0];
          if (
            stored &&
            (stored.account_id !== scope.actorAccountId ||
              stored.trip_id !== scope.tripId ||
              (scope.sourceId && stored.source_id !== scope.sourceId))
          )
            throw new Error("IMPORT_SCOPE_MISMATCH");
          const sourceId = scope.sourceId ?? (stored?.source_id as string | undefined);
          if (!sourceId) throw new Error("SOURCE_PLAN_NOT_FOUND");
          const locked = (
            await lease.query(
              "SELECT public.trip_core_lock_source_scope($1::uuid,$2::uuid,$3::uuid) AS allowed",
              [scope.actorAccountId, scope.tripId, sourceId],
            )
          ).rows[0]?.allowed;
          if (locked !== true) throw new Error("NOT_VISIBLE");
          await lease.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            "otr-core2-plan:" + scope.planId,
          ]);
          await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
          stored = (
            await lease.query(
              "SELECT account_id,trip_id,source_id,prepared_json FROM public.trip_source_core_v2_intents WHERE plan_id=$1::uuid FOR UPDATE",
              [scope.planId],
            )
          ).rows[0];
          if (
            stored &&
            (stored.account_id !== scope.actorAccountId ||
              stored.trip_id !== scope.tripId ||
              stored.source_id !== sourceId)
          )
            throw new Error("IMPORT_SCOPE_MISMATCH");

          const tx = {
            async readPlan() {
              return stored
                ? structuredClone(stored.prepared_json as CoreSourceStoredPlanV2)
                : null;
            },
            // The scoped definer holds legacy locks; this principal has SELECT-only legacy grants.
            async readSealedCatalog(): Promise<CoreSourceCatalogV2> {
              return readOwningLegacySourceCatalog(lease, { ...scope, sourceId });
            },
            async readClaims(): Promise<FlightOutputClaimV2[]> {
              const rows = (
                await lease.query(
                  "SELECT s.slot_id FROM public.trip_source_output_slots s JOIN public.trip_source_confirmations c ON c.id=s.confirmation_id LEFT JOIN public.trip_source_runs r ON r.id=s.reviewed_run_id WHERE c.actor_account_id=$1::uuid AND c.trip_id=$2::uuid AND ($3::uuid=ANY(r.scope_source_ids) OR EXISTS(SELECT 1 FROM public.trip_source_inputs i WHERE i.confirmation_id=c.id AND i.source_id=$3::uuid)) AND s.disposition='CREATE' AND s.no_commit_basis IS NULL LIMIT 65",
                  [scope.actorAccountId, scope.tripId, sourceId],
                )
              ).rows;
              if (rows.length > 64) throw new Error("PREDECESSOR_OUTCOME_UNKNOWN");
              return rows.map((r) => ({
                kind: "LEGACY",
                accountId: scope.actorAccountId,
                tripId: scope.tripId,
                slotId: r.slot_id as string,
                outcome: "UNKNOWN",
              }));
            },
            async verifyFlightEvidence() {
              throw new Error("UNRESOLVED_IDENTITY");
            },
            async assertCommandAdmission() {
              throw new Error("CONTRACT_UNSUPPORTED");
            },
            async readCoreReceipt(operationId: string) {
              const row = (
                await lease.query(
                  "SELECT id,body FROM public.trip_core_command_receipts WHERE actor_account_id=$1::uuid AND trip_id=$2::uuid AND operation_id=$3::uuid",
                  [scope.actorAccountId, scope.tripId, operationId],
                )
              ).rows[0];
              return row
                ? { domainReceiptId: row.id as string, receiptText: json(row.body) }
                : null;
            },
            async putPlan(plan: CoreSourceStoredPlanV2) {
              if (
                plan.scope.actorAccountId !== scope.actorAccountId ||
                plan.scope.tripId !== scope.tripId ||
                plan.scope.planId !== scope.planId ||
                plan.request.sourceId !== sourceId
              )
                throw new Error("IMPORT_SCOPE_MISMATCH");
              if (
                plan.slots.some(
                  (s) =>
                    s.certified ||
                    s.command ||
                    s.binding ||
                    s.receipt ||
                    s.domainReceiptId ||
                    !["REVIEW", "BLOCKED"].includes(s.state),
                )
              )
                throw new Error("CONTRACT_UNSUPPORTED");
              await lease.query(
                "INSERT INTO public.trip_source_core_v2_intents(plan_id,account_id,trip_id,source_id,source_revision,proposal_version,intent_version,request_sha256,request_json,prepared_json,created_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,2,2,$6,$7::jsonb,$8::jsonb,clock_timestamp()) ON CONFLICT(plan_id) DO UPDATE SET prepared_json=excluded.prepared_json WHERE trip_source_core_v2_intents.account_id=excluded.account_id AND trip_source_core_v2_intents.trip_id=excluded.trip_id AND trip_source_core_v2_intents.source_id=excluded.source_id AND trip_source_core_v2_intents.request_sha256=excluded.request_sha256",
                [
                  scope.planId,
                  scope.actorAccountId,
                  scope.tripId,
                  sourceId,
                  plan.request.sourceRevision,
                  plan.proposalSha256,
                  json(plan.request),
                  json(plan),
                ],
              );
            },
            async finalizeEvidence(): Promise<{
              state: "EVIDENCE_PENDING";
              errorCode: string;
            }> {
              return { state: "EVIDENCE_PENDING", errorCode: "CONTRACT_UNSUPPORTED" };
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

// Reuse the existing owning transaction boundary for publisher and admitted Source ports.
export async function withCoreSourcePgLease<T>(
  connection: CorePgConnection,
  scope: CoreSourceScopeV2,
  task: (lease: CorePgLease, legacy: CoreSourcePlanTransactionV2) => Promise<T>,
): Promise<T> {
  let current: CorePgLease | undefined;
  const storage = createCoreSourcePgStorageV2({
    withLease: (work) =>
      connection.withLease((lease) => {
        current = lease;
        return work(lease);
      }),
  });
  return storage.withLockedSourcePlan(scope, (tx) => {
    if (!current) throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
    return task(current, tx);
  });
}
