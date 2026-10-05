import { z } from "zod";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "@/domain/trip/eventIntentJson";
import { importDigest, type ImportHash } from "@/domain/trip/flightImportReview";
import { equalCaptureBytes, type LocalCapture } from "@/domain/capture/localCapture";
import { validateCaptureUtf8 } from "@/data/files/capturePayloadReader";
import type { ImportAdmissionDatabase } from "./tripImportAdmissionRepository";

const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/),
  key = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  revision = z.number().int().positive().safe();
const admission = z
  .strictObject({
    id: uuid,
    admission_key: key,
    capture_id: z.string().min(1).max(128),
    capture_revision: revision,
    intent_kind: z.enum(["NEW", "REUSE", "REPLACEMENT"]),
    source_id: uuid,
    representation_id: uuid,
    material_revision: revision,
    expected_source_revision: revision.nullable(),
    source_operation_id: uuid.nullable(),
    source_operation_key: key.nullable(),
  })
  .superRefine((v, c) => {
    if (
      v.intent_kind === "NEW"
        ? v.material_revision !== 1 ||
          v.expected_source_revision !== null ||
          v.source_operation_id === null ||
          v.source_operation_key === null
        : v.expected_source_revision === null
    )
      c.addIssue({ code: "custom", message: "INVALID_CAPTURE_ADMISSION" });
    if (
      v.intent_kind === "REUSE"
        ? v.source_operation_id !== null || v.source_operation_key !== null
        : v.source_operation_id === null || v.source_operation_key === null
    )
      c.addIssue({ code: "custom", message: "INVALID_CAPTURE_OPERATION" });
  });
export type CaptureSourceAdmission = z.infer<typeof admission>;
type Row = Record<string, unknown>;
export type CaptureSourceDependencies = {
  sha256: ImportHash;
  now(): string;
  newId(): string;
  handoff(captureId: string): Promise<{ capture: LocalCapture; bytes: Uint8Array }>;
  readSelectedMaterial(
    context: AccountRequestContext,
    sourceId: string,
    representationId: string,
  ): Promise<Uint8Array | null>;
  // Existing actual-format/profile verifier, never filename/declared MIME. This
  // dependency is deliberately unwired while Capture/Source runtime gates close.
  verifyBinary?(bytes: Uint8Array): Promise<{
    mimeType:
      "application/pdf" | "image/jpeg" | "image/png" | "image/heic" | "image/heif";
    profileId: string;
    payloadSha256: string;
    byteCount: number;
  }>;
};
const json = (v: unknown) => canonicalEventJson(v as Json);
function fail(code = "CAPTURE_SOURCE_INTEGRITY"): never {
  throw new Error(code);
}
export function createCaptureSourceAdmissionRepository(
  database: ImportAdmissionDatabase,
  getAccountId: () => Promise<string>,
  dependencies: CaptureSourceDependencies,
) {
  const { sha256, now, newId } = dependencies;
  async function scoped<T>(c: AccountRequestContext, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      let value!: T;
      await database.withTransactionAsync(async () => {
        await assertAccountRequestContext(c, getAccountId);
        if (
          !(await database.getFirstAsync(
            "SELECT 1 FROM ledger_actor_context WHERE user_id=? AND journey_id=?",
            c.accountId,
            c.tripId,
          ))
        )
          fail("CAPTURE_SOURCE_TRIP_ACCESS");
        value = await work();
        await assertAccountRequestContext(c, getAccountId);
      });
      return value;
    });
  }
  async function selected(c: AccountRequestContext, p: CaptureSourceAdmission) {
    const s = await database.getFirstAsync<Row>(
      "SELECT * FROM trip_sources WHERE cache_account_id=? AND id=?",
      c.accountId,
      p.source_id,
    );
    if (
      !s ||
      s.trip_id !== c.tripId ||
      s.acquired_by !== c.accountId ||
      s.registration_state !== "REGISTERED" ||
      s.row_revision !== p.expected_source_revision ||
      s.lifecycle !== "ACTIVE" ||
      s.retention_state !== "RETAINED"
    )
      fail("CAPTURE_SOURCE_STALE");
    if (
      p.intent_kind === "REPLACEMENT" &&
      s.current_material_revision !== p.material_revision - 1
    )
      fail("CAPTURE_SOURCE_STALE");
    return s;
  }
  async function reuse(
    c: AccountRequestContext,
    p: CaptureSourceAdmission,
    hash: string,
    count: number,
    bytes: Uint8Array,
    sourceBytes: Uint8Array | null,
  ) {
    await selected(c, p);
    const r = await database.getFirstAsync<Row>(
      "SELECT * FROM trip_source_representations WHERE cache_account_id=? AND source_id=? AND id=?",
      c.accountId,
      p.source_id,
      p.representation_id,
    );
    const m = await database.getFirstAsync<Row>(
      "SELECT * FROM trip_source_revisions WHERE cache_account_id=? AND source_id=? AND material_revision=?",
      c.accountId,
      p.source_id,
      p.material_revision,
    );
    if (
      !r ||
      !m ||
      m.retention_state !== "RETAINED" ||
      r.retention_state !== "RETAINED" ||
      r.registration_state !== "REGISTERED" ||
      r.payload_sha256 !== hash ||
      r.byte_count !== count ||
      (r.material_kind === "BINARY" && r.remote_state !== "VERIFIED") ||
      sourceBytes === null ||
      !equalCaptureBytes(bytes, sourceBytes) ||
      (await sha256(sourceBytes)) !== hash
    )
      fail("CAPTURE_SOURCE_REUSE_UNPROVEN");
    const originals = z
      .array(uuid)
      .min(1)
      .max(64)
      .parse(JSON.parse(m.original_representation_ids as string));
    const seen = new Set<string>();
    async function walk(id: string, path: Set<string>): Promise<void> {
      if (path.has(id)) fail();
      if (seen.has(id)) return;
      seen.add(id);
      if (seen.size > 64) fail("CAPTURE_SOURCE_RESOURCE_LIMIT");
      const row = await database.getFirstAsync<Row>(
        "SELECT * FROM trip_source_representations WHERE cache_account_id=? AND source_id=? AND id=?",
        c.accountId,
        p.source_id,
        id,
      );
      if (!row || row.retention_state !== "RETAINED") fail();
      const parents = z
        .array(uuid)
        .max(16)
        .parse(JSON.parse(row.parent_ids as string));
      if (parents.length === 0 && !originals.includes(id)) fail();
      for (const parent of parents) await walk(parent, new Set([...path, id]));
    }
    await walk(p.representation_id, new Set());
  }
  async function command(
    c: AccountRequestContext,
    p: CaptureSourceAdmission,
    capture: LocalCapture,
    bytes: Uint8Array,
    materialHash: string,
    mimeType: string | null,
  ) {
    const text =
      capture.kind === "TEXT"
        ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
        : null;
    const d = {
      id: p.representation_id,
      material_kind: text === null ? "BINARY" : "TEXT",
      original_filename: text === null ? capture.originalFilename : null,
      part_key: null,
      mime_type: mimeType,
      encoding: text === null ? null : "UTF-8",
      payload_sha256: materialHash,
      byte_count: bytes.byteLength,
      text_content: text,
      locator_uri: null,
    };
    const descriptor = [
      d.id,
      d.material_kind,
      d.original_filename,
      d.part_key,
      d.mime_type,
      d.encoding,
      d.payload_sha256,
      d.byte_count,
      d.text_content,
      d.locator_uri,
    ];
    const family = p.intent_kind === "NEW" ? "ACQUIRE_SOURCE" : "REPLACE_MATERIAL";
    const captureHash = await importDigest(
      "otr-source-capture-v1",
      [
        1,
        p.source_id,
        p.material_revision,
        p.intent_kind === "NEW" ? null : p.material_revision - 1,
        [p.representation_id],
        "AS_SUPPLIED",
        p.intent_kind === "NEW" ? "ACQUISITION" : "REPLACEMENT",
        null,
        null,
      ],
      sha256,
    );
    const cap = { completeness: "AS_SUPPLIED", capture_sha256: captureHash };
    const input = {
      source_kind:
        text !== null ? "TEXT" : mimeType === "application/pdf" ? "FILE" : "IMAGE",
      acquisition_channel: text !== null ? "PASTE" : "FILES",
      captured_at: null,
      capture_time_basis: "UNKNOWN",
    };
    const inputTuple = [input.source_kind, input.acquisition_channel, null, "UNKNOWN"];
    const acquisitionHash = await importDigest(
      "otr-source-acquisition-v1",
      [
        1,
        c.tripId,
        c.accountId,
        p.source_id,
        p.source_operation_key,
        ...inputTuple,
        captureHash,
        descriptor,
      ] as Json,
      sha256,
    );
    const payload =
      p.intent_kind === "NEW"
        ? {
            acquisition_key: p.source_operation_key,
            acquisition_sha256: acquisitionHash,
            source_input: input,
            capture: cap,
            original: d,
          }
        : {
            material_revision: p.material_revision - 1,
            expected_source_row_revision: p.expected_source_revision,
            expected_source_state: { lifecycle: "ACTIVE", retention_state: "RETAINED" },
            expected_current_material_revision: p.material_revision - 1,
            capture: cap,
            original: d,
          };
    const tuple =
      p.intent_kind === "NEW"
        ? [
            p.source_operation_key,
            acquisitionHash,
            inputTuple,
            ["AS_SUPPLIED", captureHash],
            descriptor,
          ]
        : [
            p.material_revision - 1,
            p.expected_source_revision,
            ["ACTIVE", "RETAINED"],
            p.material_revision - 1,
            ["AS_SUPPLIED", captureHash],
            descriptor,
          ];
    const digest = await importDigest(
      "otr-source-command-v1",
      [
        1,
        family,
        p.source_operation_id,
        p.source_operation_key,
        c.accountId,
        c.tripId,
        p.source_id,
        tuple,
      ] as Json,
      sha256,
    );
    const envelope = {
      contract_version: 1,
      command: family,
      operation_id: p.source_operation_id,
      operation_key: p.source_operation_key,
      actor_account_id: c.accountId,
      trip_id: c.tripId,
      source_id: p.source_id,
      operation_sha256: digest,
      payload,
    };
    return {
      envelope,
      digest,
      descriptor: d,
      captureHash,
      acquisitionHash,
      sourceInput: input,
    };
  }
  return {
    captureContext: (tripId: string) =>
      captureAccountRequestContext(tripId, getAccountId),
    async admit(c: AccountRequestContext, rawPlan: CaptureSourceAdmission) {
      const plan = admission.parse(rawPlan);
      await assertAccountRequestContext(c, getAccountId);
      const { capture, bytes } = await dependencies.handoff(plan.capture_id);
      const materialHash = await sha256(bytes);
      if (
        capture.accountId !== c.accountId ||
        capture.tripId !== c.tripId ||
        capture.revision !== plan.capture_revision ||
        capture.id !== plan.capture_id ||
        capture.byteCount !== bytes.byteLength ||
        capture.sha256 !== materialHash
      )
        fail("CAPTURE_SOURCE_STALE");
      if (capture.kind === "TEXT") {
        validateCaptureUtf8(bytes);
        if (bytes.byteLength > 262144) fail("CAPTURE_SOURCE_TEXT_TOO_LARGE");
      }
      let mimeType: string | null = null;
      if (capture.kind !== "TEXT" && plan.intent_kind !== "REUSE") {
        if (!dependencies.verifyBinary) fail("CAPTURE_SOURCE_FORMAT_UNAVAILABLE");
        const proof = await dependencies.verifyBinary(new Uint8Array(bytes));
        if (
          proof.payloadSha256 !== materialHash ||
          proof.byteCount !== bytes.byteLength ||
          proof.profileId !== "PNG_STATIC_RGB8_RGBA8_V1" ||
          proof.mimeType !== "image/png"
        )
          fail("CAPTURE_SOURCE_FORMAT_UNAVAILABLE");
        mimeType = proof.mimeType;
      }
      const sourceBytes =
        plan.intent_kind === "REUSE"
          ? await dependencies.readSelectedMaterial(
              c,
              plan.source_id,
              plan.representation_id,
            )
          : null;
      const prepared =
        plan.intent_kind === "REUSE"
          ? null
          : await command(c, plan, capture, bytes, materialHash, mimeType);
      await assertAccountRequestContext(c, getAccountId);
      return scoped(c, async () => {
        const current = await database.getFirstAsync<Row>(
          "SELECT * FROM local_capture_inbox WHERE account_id=? AND id=?",
          c.accountId,
          plan.capture_id,
        );
        const payload = await database.getFirstAsync<Row>(
          "SELECT * FROM local_capture_payloads WHERE account_id=? AND id=?",
          c.accountId,
          capture.payloadId,
        );
        if (
          !current ||
          !payload ||
          current.trip_id !== c.tripId ||
          current.revision !== capture.revision ||
          current.payload_id !== capture.payloadId ||
          payload.sha256 !== materialHash ||
          payload.byte_count !== bytes.byteLength ||
          !(payload.bytes instanceof Uint8Array) ||
          !equalCaptureBytes(bytes, payload.bytes)
        )
          fail("CAPTURE_SOURCE_STALE");
        const old = await database.getFirstAsync<Row>(
          "SELECT * FROM local_capture_source_bindings WHERE account_id=? AND trip_id=? AND admission_key=?",
          c.accountId,
          c.tripId,
          plan.admission_key,
        );
        if (old) {
          for (const [key, value] of Object.entries(plan))
            if (old[key] !== value) fail("CAPTURE_SOURCE_KEY_REUSED");
          if (
            old.material_sha256 !== materialHash ||
            old.capture_payload_id !== capture.payloadId ||
            old.byte_count !== bytes.byteLength ||
            old.source_operation_sha256 !== (prepared?.digest ?? null)
          )
            fail("CAPTURE_SOURCE_KEY_REUSED");
          return old;
        }
        if (
          await database.getFirstAsync(
            "SELECT 1 FROM local_capture_source_bindings WHERE account_id=? AND capture_id=? AND state='OUTCOME_UNKNOWN' AND (trip_id<>? OR capture_revision<>?)",
            c.accountId,
            plan.capture_id,
            c.tripId,
            plan.capture_revision,
          )
        )
          fail("CAPTURE_SOURCE_RECOVERY_REQUIRED");
        if (plan.intent_kind === "REUSE")
          await reuse(c, plan, materialHash, bytes.byteLength, bytes, sourceBytes);
        if (plan.intent_kind === "REPLACEMENT") await selected(c, plan);
        if (plan.intent_kind === "NEW") {
          const row = await database.getFirstAsync(
            "SELECT 1 FROM trip_sources WHERE cache_account_id=? AND id=?",
            c.accountId,
            plan.source_id,
          );
          if (row) fail("CAPTURE_SOURCE_ID_IN_USE");
          await database.runAsync(
            "INSERT INTO trip_sources(cache_account_id,registration_state,id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) VALUES(?,'PENDING',?,?,?,?,?,?,?,'UNKNOWN',NULL,1,1)",
            c.accountId,
            plan.source_id,
            c.tripId,
            c.accountId,
            plan.source_operation_key,
            prepared!.acquisitionHash,
            prepared!.sourceInput.source_kind,
            prepared!.sourceInput.acquisition_channel,
          );
        }
        if (prepared) {
          const d = prepared.descriptor;
          await database.runAsync(
            "INSERT INTO trip_source_revisions(cache_account_id,registration_state,source_id,material_revision,previous_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES(?,'PENDING',?,?,?,NULL,?,?,?,?,'AS_SUPPLIED',?)",
            c.accountId,
            plan.source_id,
            plan.material_revision,
            plan.intent_kind === "NEW" ? null : plan.material_revision - 1,
            c.accountId,
            plan.source_operation_key,
            prepared.captureHash,
            json([plan.representation_id]),
            plan.intent_kind === "NEW" ? "ACQUISITION" : "REPLACEMENT",
          );
          await database.runAsync(
            "INSERT INTO trip_source_representations(cache_account_id,registration_state,id,row_revision,source_id,introduced_revision,role,material_kind,original_filename,mime_type,encoding,payload_sha256,byte_count,text_content,parent_ids,regenerability,created_at,storage_provider,storage_bucket,object_key,remote_state,local_state,local_verified_at,transfer_state) VALUES(?,'PENDING',?,1,?,?,'ORIGINAL',?,?,?,?,?,?,?,'[]','NOT_APPLICABLE',NULL,?,?,?,?, ?,?,?)",
            c.accountId,
            plan.representation_id,
            plan.source_id,
            plan.material_revision,
            d.material_kind,
            d.original_filename,
            d.mime_type,
            d.encoding,
            d.payload_sha256,
            d.byte_count,
            d.text_content,
            d.material_kind === "BINARY" ? "supabase_storage" : null,
            d.material_kind === "BINARY" ? "trip-source-material" : null,
            d.material_kind === "BINARY"
              ? `v1/${c.tripId}/${plan.source_id}/${plan.representation_id}/payload`
              : null,
            d.material_kind === "BINARY" ? "PENDING" : "NOT_APPLICABLE",
            d.material_kind === "BINARY" ? "ABSENT" : "VERIFIED",
            d.material_kind === "BINARY" ? null : now(),
            d.material_kind === "BINARY" ? "PENDING" : "NOT_REQUIRED",
          );
          await database.runAsync(
            "INSERT INTO sync_operations(id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,status,created_at,updated_at) VALUES(?,?,?,'TRIP_IMPORT',?,'C_ADMIT_CAPTURE_SOURCE',?,?,?,'PENDING',?,?)",
            newId(),
            c.accountId,
            c.tripId,
            plan.id,
            plan.source_operation_key,
            plan.expected_source_revision,
            json({ binding_id: plan.id, source_command: prepared.envelope }),
            now(),
            now(),
          );
        }
        await database.runAsync(
          "INSERT INTO local_capture_source_bindings(account_id,id,admission_key,capture_id,capture_revision,capture_payload_id,material_sha256,byte_count,trip_id,intent_kind,source_id,representation_id,material_revision,expected_source_revision,source_operation_id,source_operation_key,source_operation_sha256,state,row_revision,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)",
          c.accountId,
          plan.id,
          plan.admission_key,
          capture.id,
          capture.revision,
          capture.payloadId,
          materialHash,
          bytes.byteLength,
          c.tripId,
          plan.intent_kind,
          plan.source_id,
          plan.representation_id,
          plan.material_revision,
          plan.expected_source_revision,
          plan.source_operation_id,
          plan.source_operation_key,
          prepared?.digest ?? null,
          plan.intent_kind === "REUSE" ? "ADMITTED" : "PREPARED",
          now(),
        );
        return database.getFirstAsync<Row>(
          "SELECT * FROM local_capture_source_bindings WHERE account_id=? AND id=?",
          c.accountId,
          plan.id,
        );
      });
    },
    async markUnknown(
      c: AccountRequestContext,
      bindingId: string,
      expectedRevision: number,
    ) {
      const binding = await scoped(c, () =>
        database.getFirstAsync<Row>(
          "SELECT * FROM local_capture_source_bindings WHERE account_id=? AND trip_id=? AND id=?",
          c.accountId,
          c.tripId,
          bindingId,
        ),
      );
      if (!binding || binding.intent_kind === "REUSE") fail();
      const handoff = await dependencies.handoff(binding.capture_id as string);
      const hash = await sha256(handoff.bytes);
      if (
        handoff.capture.accountId !== c.accountId ||
        handoff.capture.tripId !== c.tripId ||
        handoff.capture.revision !== binding.capture_revision ||
        handoff.capture.payloadId !== binding.capture_payload_id ||
        hash !== binding.material_sha256 ||
        handoff.bytes.byteLength !== binding.byte_count
      )
        fail("CAPTURE_SOURCE_STALE");
      return scoped(c, async () => {
        const current = await database.getFirstAsync<Row>(
          "SELECT * FROM local_capture_inbox WHERE account_id=? AND id=?",
          c.accountId,
          binding.capture_id as string,
        );
        if (
          !current ||
          current.trip_id !== c.tripId ||
          current.revision !== binding.capture_revision ||
          current.payload_id !== binding.capture_payload_id
        )
          fail("CAPTURE_SOURCE_STALE");
        if (binding.intent_kind === "REPLACEMENT")
          await selected(
            c,
            admission.parse({
              ...Object.fromEntries(
                Object.keys(admission.shape).map((key) => [key, binding[key]]),
              ),
            }),
          );
        const result = await database.runAsync(
          "UPDATE local_capture_source_bindings SET state='OUTCOME_UNKNOWN',row_revision=row_revision+1 WHERE account_id=? AND trip_id=? AND id=? AND row_revision=? AND intent_kind<>'REUSE' AND state='PREPARED'",
          c.accountId,
          c.tripId,
          bindingId,
          expectedRevision,
        );
        if (result.changes !== 1) fail("CAPTURE_SOURCE_CAS_CONFLICT");
      });
    },
    async applySourceReceipt(c: AccountRequestContext, bindingId: string, raw: string) {
      const hash = z.string().regex(/^[0-9a-f]{64}$/),
        stamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
      const r = z
        .strictObject({
          contract_version: z.literal(1),
          operation_id: uuid,
          operation_key: key,
          command: z.enum(["ACQUIRE_SOURCE", "REPLACE_MATERIAL"]),
          operation_sha256: hash,
          outcome: z.enum(["APPLIED", "REJECTED"]),
          error_code: z
            .enum([
              "SOURCE_CAS_CONFLICT",
              "REPRESENTATION_CAS_CONFLICT",
              "PRIOR_STATE_CONFLICT",
              "OBJECT_CONTENT_CONFLICT",
              "MATERIAL_INTEGRITY_MISMATCH",
              "SOURCE_IO_UNAVAILABLE",
            ])
            .nullable(),
          completed_at: stamp,
          source_id: uuid,
          result_source_row_revision: revision.nullable(),
          result_material_revision: revision.nullable(),
          representation_id: uuid,
          result_representation_row_revision: revision.nullable(),
          result_remote_state: z
            .enum(["PENDING", "VERIFIED", "LOST", "PURGED", "NOT_APPLICABLE"])
            .nullable(),
          result_retention_state: z
            .enum(["RETAINED", "PURGE_PENDING", "PAYLOAD_PURGED", "IDENTITY_ONLY"])
            .nullable(),
          result_action_id: uuid.nullable(),
          result_verified_at: stamp.nullable(),
          result_sha256: hash,
        })
        .parse(parseEventJson(raw, 262144));
      if (
        r.result_sha256 !==
        (await importDigest(
          "otr-source-result-v1",
          [
            1,
            r.operation_id,
            r.command,
            r.operation_sha256,
            r.outcome,
            r.error_code,
            r.completed_at,
            r.result_source_row_revision,
            r.result_material_revision,
            r.result_representation_row_revision,
            r.result_remote_state,
            r.result_retention_state,
            r.result_action_id,
            r.result_verified_at,
          ],
          sha256,
        ))
      )
        fail();
      return scoped(c, async () => {
        const b = await database.getFirstAsync<Row>(
          "SELECT * FROM local_capture_source_bindings WHERE account_id=? AND trip_id=? AND id=?",
          c.accountId,
          c.tripId,
          bindingId,
        );
        if (
          !b ||
          b.intent_kind === "REUSE" ||
          r.operation_id !== b.source_operation_id ||
          r.operation_key !== b.source_operation_key ||
          r.operation_sha256 !== b.source_operation_sha256 ||
          r.source_id !== b.source_id ||
          r.representation_id !== b.representation_id ||
          r.command !==
            (b.intent_kind === "NEW" ? "ACQUIRE_SOURCE" : "REPLACE_MATERIAL") ||
          (b.source_receipt_sha256 !== null &&
            b.source_receipt_sha256 !== r.result_sha256)
        )
          fail();
        if (b.state === "ADMITTED" || b.state === "CONFLICTED") return b;
        let state = "OUTCOME_UNKNOWN";
        if (r.outcome === "REJECTED") {
          if (
            r.result_source_row_revision !== null ||
            r.result_material_revision !== null ||
            r.result_representation_row_revision !== null ||
            r.result_action_id !== null ||
            r.error_code === null
          )
            fail();
          state = "CONFLICTED";
        } else {
          if (
            r.error_code !== null ||
            r.result_material_revision !== b.material_revision ||
            r.result_source_row_revision !==
              (b.intent_kind === "NEW"
                ? 1
                : (b.expected_source_revision as number) + 1) ||
            r.result_representation_row_revision !== 1 ||
            r.result_action_id === null
          )
            fail();
          const source = await database.getFirstAsync<Row>(
            "SELECT * FROM trip_sources WHERE cache_account_id=? AND id=?",
            c.accountId,
            b.source_id as string,
          );
          const representation = await database.getFirstAsync<Row>(
            "SELECT * FROM trip_source_representations WHERE cache_account_id=? AND source_id=? AND id=?",
            c.accountId,
            b.source_id as string,
            b.representation_id as string,
          );
          const manifest = await database.getFirstAsync<Row>(
            "SELECT * FROM trip_source_revisions WHERE cache_account_id=? AND source_id=? AND material_revision=?",
            c.accountId,
            b.source_id as string,
            b.material_revision as number,
          );
          if (
            source?.registration_state === "REGISTERED" &&
            representation?.registration_state === "REGISTERED" &&
            manifest?.registration_state === "REGISTERED"
          ) {
            if (
              source.trip_id !== c.tripId ||
              source.acquired_by !== c.accountId ||
              (source.row_revision as number) < r.result_source_row_revision! ||
              representation.payload_sha256 !== b.material_sha256 ||
              representation.byte_count !== b.byte_count ||
              representation.introduced_revision !== b.material_revision ||
              (representation.row_revision as number) <
                r.result_representation_row_revision!
            )
              fail();
            state = "ADMITTED";
          }
        }
        if (b.state === state && b.source_receipt_sha256 === r.result_sha256) return b;
        const result = await database.runAsync(
          "UPDATE local_capture_source_bindings SET state=?,source_receipt_sha256=?,row_revision=row_revision+1 WHERE account_id=? AND trip_id=? AND id=? AND row_revision=?",
          state,
          r.result_sha256,
          c.accountId,
          c.tripId,
          bindingId,
          b.row_revision as number,
        );
        if (result.changes !== 1) fail("CAPTURE_SOURCE_CAS_CONFLICT");
        return { state, source_receipt_sha256: r.result_sha256 };
      });
    },
    async recovery(c: AccountRequestContext, bindingId: string) {
      return scoped(c, async () => {
        const binding = await database.getFirstAsync<Row>(
          "SELECT * FROM local_capture_source_bindings WHERE account_id=? AND trip_id=? AND id=?",
          c.accountId,
          c.tripId,
          bindingId,
        );
        if (!binding) fail();
        const queue = await database.getFirstAsync<Row>(
          "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_id=? AND operation_type='C_ADMIT_CAPTURE_SOURCE'",
          c.accountId,
          c.tripId,
          bindingId,
        );
        if (binding.intent_kind !== "REUSE" && !queue) fail();
        return {
          binding,
          command: queue ? parseEventJson(queue.payload_json as string, 2097152) : null,
        };
      });
    },
  };
}
