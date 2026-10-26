import { coreHashValue } from "../../domain/trip/tripCoreV2Read";
import {
  corePayloadSchemas,
  validateCoreCommand,
} from "../../domain/trip/tripCoreV2Commands";
import type { CoreDatabase, CoreAcceptedCertificate } from "./tripCoreV2Repository";
import {
  withAccountApplyGate,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  canonicalCoreJson,
  parseCoreJson,
  type Json,
} from "../../domain/trip/tripCoreV2Json";
import { coreUuid } from "../../domain/trip/tripCoreV2";
import {
  applyLocalCoreOperation,
  coreGraphHashText,
  type CoreActor,
  type CoreGraph,
} from "../../domain/trip/tripCoreV2Mutation";
import {
  localHash,
  localAuthoredFlightPayloadSchema,
  parseLocalCommitEnvelope,
  verifyLocalCommit,
  localCoreReceiptSchema,
  type LocalCoreReceipt,
  type LocalCommitEnvelope,
  type RetainedLocalAuthorityState,
  type VerifiedLocalOperation,
  type LocalHash,
} from "../../domain/trip/localCoreAuthority";
import { createSyncOperationRepository } from "../sync/syncOperationRepository";
export const LOCAL_CORE_OPERATION = "LOCAL_CORE_COMMIT";
export type LocalCoreBaseline = {
  graph: CoreGraph;
  actor: CoreActor;
  participatingPersonIds: string[];
  certificate: CoreAcceptedCertificate | null;
};
export type LocalCoreAuthorityDependencies = {
  readBaselineWithinTransaction(
    context: AccountRequestContext,
  ): Promise<LocalCoreBaseline | null>;
  readSourceWithinTransaction?(
    context: AccountRequestContext,
    envelope: Extract<LocalCommitEnvelope, { authority: "LOCAL_REVIEWED_SOURCE" }>,
  ): Promise<NonNullable<RetainedLocalAuthorityState["source"]>>;
  assessClaimsWithinTransaction?(
    context: AccountRequestContext,
    envelope: LocalCommitEnvelope,
    graph: CoreGraph,
  ): Promise<Pick<RetainedLocalAuthorityState, "coverageSha256" | "claims">>;
};
export type LocalTargetAuthority = {
  authority: LocalCommitEnvelope["authority"];
  commitId: string;
  slotId: string;
  operationId: string;
  localRevision: number;
  receiptSha256: string;
};
export type LocalCoreSnapshot = LocalCoreBaseline & {
  localRevision: number;
  accountGeneration: number;
  participatingRosterHash: string;
  receipts: LocalCoreReceipt[];
  perTargetAuthority: Record<string, LocalTargetAuthority>;
};
type Row = Record<string, unknown>;
function mutationResultBody(m: {
  graph: CoreGraph;
  changed: {
    kind: string;
    id: string;
    baseRevision: number | null;
    committedRevision: number;
  }[];
}) {
  const keys = new Set(m.changed.map((x) => x.id));
  const graph = Object.fromEntries(
    Object.entries(m.graph).map(([table, rows]) => [
      table,
      rows.filter((r) =>
        [
          "id",
          "event_id",
          "item_id",
          "booking_id",
          "entitlement_id",
          "document_id",
          "instruction_id",
        ].some((k) => typeof r[k] === "string" && keys.has(r[k] as string)),
      ),
    ]),
  );
  return { changed: m.changed, graph };
}
const text = (x: unknown) => canonicalCoreJson(x as Json);
const same = (a: unknown, b: unknown) => text(a) === text(b);
const outputs = (e: LocalCommitEnvelope) =>
  e.authority === "LOCAL_MANUAL" ? e.outputs : e.slots;
const isUpdate = (x: ReturnType<typeof outputs>[number]) =>
  x.command === "QUALIFY_FLIGHT" ||
  (x.command === "SAVE_AUTHORED_FLIGHT_LOCAL" &&
    x.baseVector.some(
      (v) => v.kind === x.target.kind && v.id === x.target.id && v.revision !== null,
    ));
const successful = (e: LocalCommitEnvelope) =>
  outputs(e).filter((x) => x.command !== null);
const body = (x: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(x).filter(([k]) => k !== key));
const unavailable = (): never => {
  throw new Error("LOCAL_AUTHORITY_UNAVAILABLE");
};
// Called only under the same account gate/transaction. No remote port is accepted.
export function createLocalCoreCommitRepository(
  database: CoreDatabase,
  getAccountId: () => Promise<string>,
  hash: LocalHash,
  deps: LocalCoreAuthorityDependencies,
  clock = () => new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
) {
  const queue = createSyncOperationRepository(database, getAccountId, clock);
  const assert = (c: AccountRequestContext) =>
    assertAccountRequestContext(c, getAccountId);
  async function source(c: AccountRequestContext, e: LocalCommitEnvelope) {
    if (e.authority !== "LOCAL_REVIEWED_SOURCE") return undefined;
    if (!deps.readSourceWithinTransaction)
      throw new Error("LOCAL_SOURCE_READER_UNAVAILABLE");
    return deps.readSourceWithinTransaction(c, e);
  }
  async function assess(c: AccountRequestContext, e: LocalCommitEnvelope, g: CoreGraph) {
    if (e.authority === "LOCAL_REVIEWED_SOURCE" && deps.assessClaimsWithinTransaction)
      return deps.assessClaimsWithinTransaction(c, e, g);
    // Only explicitly Manual-created P2 identities are eligible; Source contenders stay closed.
    if (e.authority !== "LOCAL_MANUAL" || e.outputs.length !== 1)
      throw new Error("LOCAL_CLAIM_COVERAGE_UNKNOWN");
    {
      const targetAuthorities = new Map<string, LocalCommitEnvelope["authority"]>();
      for (const h of await headers(c)) {
        const old = parseLocalCommitEnvelope(String(h.envelope_json));
        for (const output of outputs(old))
          if (output.target) targetAuthorities.set(output.target.id, old.authority);
      }
      const manualIds = new Set(
        [...targetAuthorities]
          .filter(([, authority]) => authority === "LOCAL_MANUAL")
          .map(([id]) => id),
      );
      if (g.trip_flight_intents.some((r) => !manualIds.has(String(r.event_id))))
        throw new Error("LOCAL_CLAIM_COVERAGE_UNKNOWN");
      const output = e.outputs[0];
      const revision = output.baseVector.find(
        (v) => v.kind === "ITEM" && v.id === output.target.id,
      )?.revision;
      if (revision != null && !manualIds.has(output.target.id))
        throw new Error("MANUAL_FLIGHT_EDIT_UNAVAILABLE");
    }
    const legacy = await database.getFirstAsync<{ n: number }>(
      "SELECT count(*) AS n FROM trip_source_output_slots s JOIN trip_source_confirmations c ON c.cache_account_id=s.cache_account_id AND c.id=s.confirmation_id WHERE c.cache_account_id=? AND c.trip_id=?",
      c.accountId,
      c.tripId,
    );
    const pending = await database.getAllAsync<{
      canonical_intent_text: string;
      operation_id: string;
      intent_sha256: string;
      payload_json: string | null;
      entity_id: string | null;
      idempotency_key: string | null;
      queue_status: string | null;
    }>(
      `SELECT i.canonical_intent_text,i.operation_id,i.intent_sha256,
       q.payload_json,q.entity_id,q.idempotency_key,q.status AS queue_status
       FROM trip_core_pending_intents i LEFT JOIN sync_operations q
       ON q.id=i.queue_operation_id AND q.owner_user_id=i.account_id AND q.trip_id=i.trip_id
       AND q.entity_type='TRIP_CORE_V2' AND q.operation_type='CORE_V2_COMMAND'
       WHERE i.account_id=? AND i.trip_id=? AND i.state NOT IN ('APPLIED') ORDER BY i.operation_id`,
      c.accountId,
      c.tripId,
    );
    // The owning baseline has already verified/replayed these Manual pins; SET alone is not identity evidence.
    const commands = pending.map((r) =>
      validateCoreCommand(parseCoreJson(r.canonical_intent_text, 262144)),
    );
    for (const [index, row] of pending.entries()) {
      const q = commands[index];
      const item = g.itinerary_events.find((r) => r.id === q.target.id);
      const creations = commands.filter(
        (v) => v.target.id === q.target.id && v.command === "CREATE_ITEM",
      );
      if (creations.length > 1) throw new Error("LOCAL_CLAIM_COVERAGE_UNKNOWN");
      const creation = creations[0];
      const family =
        item?.experience_family ??
        (creation?.payload as { family?: string } | undefined)?.family;
      const allowed = [
        "CREATE_ITEM",
        "SET_ITEM_TEXT",
        "SET_ITEM_PARTICIPATION",
        ...(family === "P3" ? ["SET_STAY_DETAILS"] : []),
        ...(family === "P4" ? ["SET_RENTAL_DETAILS"] : []),
        ...(family === "P5" ? ["SET_TRANSPORT_DETAILS"] : []),
        ...(["P1", "P3", "P4"].includes(String(family))
          ? ["SET_ITEM_SCHEDULE", "SET_ITEM_PLACE"]
          : []),
      ];
      if (
        q.tripId !== c.tripId ||
        q.admission.mode !== "MANUAL" ||
        q.target.kind !== "ITEM" ||
        (!item && !creation) ||
        !["P1", "P3", "P4", "P5"].includes(String(family)) ||
        !allowed.includes(q.command) ||
        (q.command === "CREATE_ITEM" &&
          (q.payload as { family: string }).family !== family) ||
        q.operationId !== row.operation_id ||
        row.idempotency_key !== q.operationId ||
        row.entity_id !== q.target.id ||
        row.payload_json !== row.canonical_intent_text ||
        !["PENDING", "DEPENDENCY_BLOCKED", "PROCESSING", "RETRYABLE"].includes(
          row.queue_status ?? "",
        ) ||
        (await coreHashValue("otr-trip-core-intent-v2", q, hash)) !== row.intent_sha256
      )
        throw new Error("LOCAL_CLAIM_COVERAGE_UNKNOWN");
    }
    if (legacy?.n) throw new Error("LOCAL_CLAIM_COVERAGE_UNKNOWN");
    const coverageSha256 = await localHash(
      "otr-local-claim-coverage-v1",
      {
        accountId: c.accountId,
        tripId: c.tripId,
        graph: coreGraphHashText(g),
        legacy: 0,
        pending: pending.map((r) => ({
          operationId: r.operation_id,
          sha256: r.intent_sha256,
        })),
      },
      hash,
    );
    const claims = new Map<
      string,
      { resolvedOutputIdentity: string; outputPurpose: string; assessmentSha256: string }
    >();
    for (const x of e.outputs) {
      const identity = `new-${x.target.id}`;
      const assessmentSha256 = await localHash(
        "otr-local-lineage-assessment-v1",
        { coverageSha256, resolvedOutputIdentity: identity, outputPurpose: "FLIGHT" },
        hash,
      );
      claims.set(x.slotId, {
        resolvedOutputIdentity: identity,
        outputPurpose: "FLIGHT",
        assessmentSha256,
      });
    }
    return { coverageSha256, claims };
  }
  async function headers(c: AccountRequestContext) {
    return database.getAllAsync<Row>(
      "SELECT rowid AS sequence,* FROM local_core_authority_commits WHERE account_id=? AND trip_id=? ORDER BY rowid",
      c.accountId,
      c.tripId,
    );
  }
  async function verifyRows(
    c: AccountRequestContext,
    header: Row,
    e: LocalCommitEnvelope,
    ops: VerifiedLocalOperation[],
    graph: CoreGraph,
  ) {
    if (
      header.account_id !== c.accountId ||
      header.trip_id !== c.tripId ||
      header.commit_id !== e.commitId ||
      header.envelope_sha256 !== e.envelopeSha256 ||
      header.authority_kind !== e.authority ||
      header.envelope_schema_id !== e.schemaId ||
      header.authority_version !== 1 ||
      header.envelope_json !== text(e)
    )
      throw new Error("LOCAL_JOURNAL_CORRUPT");
    const expectedHeader =
      e.authority === "LOCAL_MANUAL"
        ? {
            actor_person_id: e.actorPersonId,
            reviewed_run_id: null,
            run_revision: null,
            input_digest: null,
            candidate_set_digest: null,
            confirmation_id: null,
            confirmation_key: null,
            decision_revision: null,
            decision_sha256: null,
          }
        : {
            actor_person_id: null,
            reviewed_run_id: e.run.runId,
            run_revision: e.run.runRevision,
            input_digest: e.run.inputDigest,
            candidate_set_digest: e.run.candidateSetDigest,
            confirmation_id: e.review.confirmationId,
            confirmation_key: e.review.confirmationKey,
            decision_revision: e.review.decisionRevision,
            decision_sha256: e.review.decisionSha256,
          };
    for (const [k, v] of Object.entries(expectedHeader))
      if (header[k] !== v) throw new Error("LOCAL_JOURNAL_CORRUPT");
    const materialRows = await database.getAllAsync<Row>(
      "SELECT * FROM local_core_authority_materials WHERE account_id=? AND trip_id=? AND commit_id=?",
      c.accountId,
      c.tripId,
      e.commitId,
    );
    const pins = e.authority === "LOCAL_REVIEWED_SOURCE" ? e.materials : [];
    if (materialRows.length !== pins.length) throw new Error("LOCAL_MATERIAL_CORRUPT");
    for (const p of pins) {
      const r = materialRows.find(
        (r) =>
          r.source_id === p.sourceId &&
          r.material_revision === p.materialRevision &&
          r.representation_id === p.representationId &&
          r.input_id === p.inputId,
      );
      const pairs = {
        source_local_revision: p.sourceLocalRevision,
        capture_id: p.captureId,
        capture_revision: p.captureRevision,
        batch_id: p.batchId,
        original_sha256: p.originalSha256,
        original_byte_count: p.originalByteCount,
        extraction_result_digest: p.extractionResultDigest,
        evidence_catalog_digest: p.evidenceCatalogDigest,
      };
      if (!r || Object.entries(pairs).some(([k, v]) => r[k] !== v))
        throw new Error("LOCAL_MATERIAL_CORRUPT");
    }
    const rows = await database.getAllAsync<Row>(
      "SELECT * FROM local_core_authority_slots WHERE account_id=? AND trip_id=? AND commit_id=? ORDER BY rowid",
      c.accountId,
      c.tripId,
      e.commitId,
    );
    if (rows.length !== ops.length) throw new Error("LOCAL_JOURNAL_CORRUPT");
    let current = graph;
    const receipts: LocalCoreReceipt[] = [];
    const applied = new Set<string>();
    while (applied.size < ops.length) {
      const ready = ops.find(
        (o) =>
          !applied.has(o.output.slotId) &&
          o.output.dependsOn.every((id) => applied.has(id)),
      );
      if (!ready) throw new Error("LOCAL_DEPENDENCY_UNAVAILABLE");
      const x = ready.output,
        r = rows.find((r) => r.slot_id === x.slotId);
      if (!r) throw new Error("LOCAL_JOURNAL_CORRUPT");
      const receipt = localCoreReceiptSchema.parse(
        parseCoreJson(String(r.receipt_json), 262144),
      );
      if (
        receipt.authority !== e.authority ||
        receipt.commitId !== e.commitId ||
        receipt.slotId !== x.slotId ||
        receipt.operationId !== x.operationId ||
        !same(receipt.target, x.target) ||
        receipt.intentSha256 !== x.intentSha256 ||
        receipt.receiptSha256 !==
          (await localHash(
            "otr-local-core-receipt-v1",
            body(receipt, "receiptSha256"),
            hash,
          ))
      )
        throw new Error("LOCAL_JOURNAL_CORRUPT");
      const expected = {
        candidate_id: "candidateId" in x ? x.candidateId : null,
        candidate_sha256: "candidateSha256" in x ? x.candidateSha256 : null,
        reviewed_run_id: e.authority === "LOCAL_REVIEWED_SOURCE" ? e.run.runId : null,
        output_purpose_digest: "proof" in x ? x.proof.outputPurposeDigest : null,
        account_id: c.accountId,
        trip_id: c.tripId,
        commit_id: e.commitId,
        slot_id: x.slotId,
        slot_key: "slotKey" in x ? x.slotKey : x.slotId,
        disposition: isUpdate(x) ? "UPDATE" : "CREATE",
        target_kind: x.target.kind,
        target_id: x.target.id,
        operation_id: x.operationId,
        queue_operation_id: x.operationId,
        intent_sha256: x.intentSha256,
        local_revision: receipt.localRevision,
        result_digest: receipt.resultDigest,
        receipt_sha256: receipt.receiptSha256,
        command_json: text(ready.command),
        proof_json: "proof" in x ? text(x.proof) : null,
        proof_sha256: "proof" in x ? x.proof.proofSha256 : null,
        depends_on_json: text(x.dependsOn),
        claim_identity: isUpdate(x) ? null : ready.claimKey,
      };
      for (const [key, value] of Object.entries(expected))
        if (r[key] !== value) throw new Error("LOCAL_JOURNAL_CORRUPT");
      const q = await database.getFirstAsync<Row>(
        "SELECT * FROM sync_operations WHERE owner_user_id=? AND id=?",
        c.accountId,
        x.operationId,
      );
      if (
        !q ||
        q.trip_id !== c.tripId ||
        q.entity_id !== x.target.id ||
        q.operation_type !== LOCAL_CORE_OPERATION ||
        q.idempotency_key !== x.operationId ||
        q.payload_json !==
          text({
            schemaId: "otr.trip.local-core-queue/1",
            commitId: e.commitId,
            slotId: x.slotId,
            receiptSha256: receipt.receiptSha256,
          })
      )
        throw new Error("LOCAL_QUEUE_CORRUPT");
      const mutation = applyLocalCoreOperation(
        current,
        ready,
        depsActor(ready),
        String(header.created_at),
      );
      const digest = await localHash(
        "otr-local-core-result-v1",
        mutationResultBody(mutation),
        hash,
      );
      if (
        mutation.changed.find((y) => y.kind === x.target.kind && y.id === x.target.id)
          ?.committedRevision !== receipt.localRevision ||
        digest !== receipt.resultDigest
      )
        throw new Error("LOCAL_RESULT_MISMATCH");
      current = mutation.graph;
      receipts.push(receipt);
      applied.add(x.slotId);
    }
    return { graph: current, receipts };
  }
  const depsActor = (op: VerifiedLocalOperation) => op.actor;
  async function readCommittedWithinTransaction(
    c: AccountRequestContext,
    baseline: LocalCoreBaseline,
  ): Promise<LocalCoreSnapshot> {
    await assert(c);
    let graph = baseline.graph;
    const receipts: LocalCoreReceipt[] = [];
    const perTargetAuthority: Record<string, LocalTargetAuthority> = {};
    for (const header of await headers(c)) {
      const e = parseLocalCommitEnvelope(String(header.envelope_json));
      if (e.accountId !== c.accountId || e.tripId !== c.tripId)
        throw new Error("LOCAL_SCOPE_MISMATCH");
      // Retained immutable assessment is rechecked as historical commit provenance;
      // new writes independently assess the entire current contender snapshot.
      const state: RetainedLocalAuthorityState = {
        actor: baseline.actor,
        coverageSha256:
          successful(e)[0]?.lineageAssessment.coverageSha256 ?? unavailable(),
        claims: new Map(
          successful(e).map((x) => [
            x.slotId,
            {
              resolvedOutputIdentity: x.lineageAssessment.resolvedOutputIdentity,
              outputPurpose: x.lineageAssessment.outputPurpose,
              assessmentSha256: x.lineageAssessment.assessmentSha256,
            },
          ]),
        ),
        source: await source(c, e),
      };
      const ops = await verifyLocalCommit(e, state, hash);
      const replay = await verifyRows(c, header, e, ops, graph);
      graph = replay.graph;
      for (const r of replay.receipts) {
        receipts.push(r);
        perTargetAuthority[`${r.target.kind}:${r.target.id}`] = {
          authority: r.authority,
          commitId: r.commitId,
          slotId: r.slotId,
          operationId: r.operationId,
          localRevision: r.localRevision,
          receiptSha256: r.receiptSha256,
        };
      }
    }
    await assert(c);
    return {
      ...baseline,
      graph,
      localRevision: receipts.length,
      accountGeneration: c.generation,
      participatingRosterHash: await localHash(
        "otr-local-participating-roster-v1",
        [...baseline.participatingPersonIds].sort(),
        hash,
      ),
      receipts,
      perTargetAuthority,
    };
  }
  async function insert(table: string, row: Record<string, unknown>) {
    const columns = Object.keys(row);
    await database.runAsync(
      `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
      ...(Object.values(row) as (string | number | null)[]),
    );
  }
  async function prepareManualSparse(
    c: AccountRequestContext,
    input: {
      commitId: string;
      slotId: string;
      operationId: string;
      itemId: string;
      payload: unknown;
      command?: "SAVE_AUTHORED_FLIGHT_LOCAL";
      expectedRevision?: number;
    },
  ) {
    coreUuid.parse(input.commitId);
    coreUuid.parse(input.slotId);
    coreUuid.parse(input.operationId);
    coreUuid.parse(input.itemId);
    const command = input.command ?? "CREATE_SPARSE_FLIGHT";
    const payload =
      command === "SAVE_AUTHORED_FLIGHT_LOCAL"
        ? localAuthoredFlightPayloadSchema.parse(input.payload)
        : corePayloadSchemas.CREATE_SPARSE_FLIGHT.parse(input.payload);
    if (
      input.expectedRevision !== undefined &&
      (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)
    )
      throw new Error("INVALID_BASE_VECTOR");
    return withAccountApplyGate(async () => {
      await assert(c);
      let prepared: LocalCommitEnvelope | undefined;
      await database.withTransactionAsync(async () => {
        const baseline = await deps.readBaselineWithinTransaction(c);
        if (!baseline) throw new Error("LOCAL_AUTHORITY_UNAVAILABLE");
        const current = await readCommittedWithinTransaction(c, baseline);
        const person = coreUuid.parse(baseline.actor.personId);
        const placeholder = "0".repeat(64);
        const draft: Extract<LocalCommitEnvelope, { authority: "LOCAL_MANUAL" }> = {
          schemaId: "otr.trip.local-manual-commit/1",
          authority: "LOCAL_MANUAL",
          commitId: input.commitId,
          accountId: c.accountId,
          tripId: c.tripId,
          actorPersonId: person,
          outputs: [
            {
              slotId: input.slotId,
              operationId: input.operationId,
              target: { kind: "ITEM", id: input.itemId },
              command,
              baseVector: [
                {
                  kind: "ITEM",
                  id: input.itemId,
                  revision: input.expectedRevision ?? null,
                },
              ],
              reviewedPayload: payload,
              intentSha256: placeholder,
              manualProvenance: {
                kind: "MANUAL",
                actorPersonId: person,
                authoredAt: clock(),
              },
              lineageAssessment: {
                coverageSha256: placeholder,
                resolvedOutputIdentity: "unassessed",
                outputPurpose: "FLIGHT",
                assessmentSha256: placeholder,
              },
              dependsOn: [],
            },
          ],
          envelopeSha256: placeholder,
        };
        const claims = await assess(c, draft, current.graph);
        const decision = claims.claims.get(input.slotId);
        if (!decision) throw new Error("LOCAL_CLAIM_COVERAGE_UNKNOWN");
        draft.outputs[0].lineageAssessment = {
          coverageSha256: claims.coverageSha256,
          ...decision,
        };
        draft.outputs[0].intentSha256 = await localHash(
          "otr-local-manual-intent-v1",
          {
            accountId: c.accountId,
            tripId: c.tripId,
            target: draft.outputs[0].target,
            operationId: input.operationId,
            command,
            baseVector: draft.outputs[0].baseVector,
            reviewedPayload: payload,
            selectedFields: [],
            dependsOn: [],
          },
          hash,
        );
        draft.envelopeSha256 = await localHash(
          "otr-local-manual-envelope-v1",
          body(draft, "envelopeSha256"),
          hash,
        );
        prepared = parseLocalCommitEnvelope(draft);
        await assert(c);
      });
      await assert(c);
      if (!prepared) throw new Error("LOCAL_AUTHORITY_UNAVAILABLE");
      return prepared;
    });
  }
  async function commit(c: AccountRequestContext, input: unknown) {
    const e = parseLocalCommitEnvelope(input);
    if (e.accountId !== c.accountId || e.tripId !== c.tripId)
      throw new Error("LOCAL_SCOPE_MISMATCH");
    return withAccountApplyGate(async () => {
      await assert(c);
      let result: LocalCoreReceipt[] = [];
      await database.withTransactionAsync(async () => {
        const baseline = await deps.readBaselineWithinTransaction(c);
        if (!baseline) throw new Error("LOCAL_AUTHORITY_UNAVAILABLE");
        const current = await readCommittedWithinTransaction(c, baseline);
        const prior = await database.getFirstAsync<Row>(
          "SELECT * FROM local_core_authority_commits WHERE account_id=? AND commit_id=?",
          c.accountId,
          e.commitId,
        );
        if (prior) {
          if (
            prior.envelope_sha256 !== e.envelopeSha256 ||
            prior.envelope_json !== text(e) ||
            prior.trip_id !== c.tripId
          )
            throw new Error("LOCAL_COMMIT_REUSE_MISMATCH");
          result = current.receipts.filter((r) => r.commitId === e.commitId);
          return;
        }
        const assessed = await assess(c, e, current.graph);
        const state: RetainedLocalAuthorityState = {
          actor: baseline.actor,
          ...assessed,
          source: await source(c, e),
        };
        const ops = await verifyLocalCommit(e, state, hash),
          now = clock();
        let graph = current.graph;
        const remaining = new Map(ops.map((x) => [x.output.slotId, x]));
        const done = new Set<string>();
        const pending: { op: VerifiedLocalOperation; receipt: LocalCoreReceipt }[] = [];
        while (remaining.size) {
          const op = [...remaining.values()].find((x) =>
            x.output.dependsOn.every((id) => done.has(id)),
          );
          if (!op) throw new Error("LOCAL_DEPENDENCY_UNAVAILABLE");
          const mutation = applyLocalCoreOperation(graph, op, baseline.actor, now);
          graph = mutation.graph;
          const x = op.output;
          const localRevision =
            mutation.changed.find((y) => y.kind === x.target.kind && y.id === x.target.id)
              ?.committedRevision ?? unavailable();
          const raw = {
            schemaId: "otr.trip.local-core-receipt/1",
            authority: e.authority,
            commitId: e.commitId,
            slotId: x.slotId,
            operationId: x.operationId,
            target: x.target,
            localRevision,
            intentSha256: x.intentSha256,
            resultDigest: await localHash(
              "otr-local-core-result-v1",
              mutationResultBody(mutation),
              hash,
            ),
            ...("proof" in x ? { proofSha256: x.proof.proofSha256 } : {}),
          };
          const receipt = localCoreReceiptSchema.parse({
            ...raw,
            receiptSha256: await localHash("otr-local-core-receipt-v1", raw, hash),
          });
          pending.push({ op, receipt });
          done.add(x.slotId);
          remaining.delete(x.slotId);
        }
        const sourceFields =
          e.authority === "LOCAL_REVIEWED_SOURCE"
            ? {
                reviewed_run_id: e.run.runId,
                run_revision: e.run.runRevision,
                input_digest: e.run.inputDigest,
                candidate_set_digest: e.run.candidateSetDigest,
                confirmation_id: e.review.confirmationId,
                confirmation_key: e.review.confirmationKey,
                decision_revision: e.review.decisionRevision,
                decision_sha256: e.review.decisionSha256,
              }
            : {
                reviewed_run_id: null,
                run_revision: null,
                input_digest: null,
                candidate_set_digest: null,
                confirmation_id: null,
                confirmation_key: null,
                decision_revision: null,
                decision_sha256: null,
              };
        await insert("local_core_authority_commits", {
          account_id: c.accountId,
          trip_id: c.tripId,
          commit_id: e.commitId,
          authority_version: 1,
          authority_kind: e.authority,
          envelope_schema_id: e.schemaId,
          actor_person_id: e.authority === "LOCAL_MANUAL" ? e.actorPersonId : null,
          ...sourceFields,
          envelope_sha256: e.envelopeSha256,
          envelope_json: text(e),
          created_at: now,
        });
        if (e.authority === "LOCAL_REVIEWED_SOURCE")
          for (const p of e.materials)
            await insert("local_core_authority_materials", {
              account_id: c.accountId,
              trip_id: c.tripId,
              commit_id: e.commitId,
              source_id: p.sourceId,
              material_revision: p.materialRevision,
              representation_id: p.representationId,
              source_local_revision: p.sourceLocalRevision,
              capture_id: p.captureId,
              capture_revision: p.captureRevision,
              batch_id: p.batchId,
              input_id: p.inputId,
              original_sha256: p.originalSha256,
              original_byte_count: p.originalByteCount,
              extraction_result_digest: p.extractionResultDigest,
              evidence_catalog_digest: p.evidenceCatalogDigest,
            });
        for (const { op, receipt } of pending) {
          const x = op.output;
          await queue.enqueue({
            id: x.operationId,
            tripId: c.tripId,
            entityType: "TRIP_CORE_LOCAL",
            entityId: x.target.id,
            operationType: LOCAL_CORE_OPERATION,
            idempotencyKey: x.operationId,
            baseVersion: x.baseVector.find(
              (v) => v.kind === x.target.kind && v.id === x.target.id,
            )!.revision,
            payloadJson: text({
              schemaId: "otr.trip.local-core-queue/1",
              commitId: e.commitId,
              slotId: x.slotId,
              receiptSha256: receipt.receiptSha256,
            }),
            status: "DEPENDENCY_BLOCKED",
            nextAttemptAt: null,
          });
          await insert("local_core_authority_slots", {
            account_id: c.accountId,
            trip_id: c.tripId,
            commit_id: e.commitId,
            slot_id: x.slotId,
            slot_key: "slotKey" in x ? x.slotKey : x.slotId,
            disposition: isUpdate(x) ? "UPDATE" : "CREATE",
            target_kind: x.target.kind,
            target_id: x.target.id,
            operation_id: x.operationId,
            queue_operation_id: x.operationId,
            candidate_id: "candidateId" in x ? x.candidateId : null,
            candidate_sha256: "candidateSha256" in x ? x.candidateSha256 : null,
            reviewed_run_id: e.authority === "LOCAL_REVIEWED_SOURCE" ? e.run.runId : null,
            output_purpose_digest: "proof" in x ? x.proof.outputPurposeDigest : null,
            intent_sha256: x.intentSha256,
            proof_sha256: "proof" in x ? x.proof.proofSha256 : null,
            local_revision: receipt.localRevision,
            result_digest: receipt.resultDigest,
            receipt_sha256: receipt.receiptSha256,
            command_json: text(op.command),
            proof_json: "proof" in x ? text(x.proof) : null,
            receipt_json: text(receipt),
            depends_on_json: text(x.dependsOn),
            claim_identity: isUpdate(x) ? null : op.claimKey,
            created_at: now,
          });
          result.push(receipt);
        }
        await assert(c);
      });
      await assert(c);
      return { status: "LOCAL_COMMITTED" as const, receipts: result };
    });
  }
  return { commit, prepareManualSparse, readCommittedWithinTransaction };
}
