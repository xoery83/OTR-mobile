import { randomUUID } from "node:crypto";
import { mkdtemp, open, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { canonicalCoreJson, type Json } from "../../../src/domain/trip/tripCoreV2Json";
import { importDigest } from "../../../src/domain/trip/flightImportReview";
import { publicationTestHash as hash } from "./tripCoreV2CandidatePublication";
import { session } from "./tripCoreV2Sql";
import {
  sourcePdfUploadCommandSchema,
  sourcePdfUploadBindingSchema,
  sourcePdfUploadTerminalSchema,
  sourcePdfUploadReceiptSchema,
} from "../../../src/domain/trip/sourcePdfUploadAuthority";
import { pdfHash } from "../sourcePdfProfile";

export const uploadProfile = "PDF_PRIVATE_UPLOAD_V1";
export type UploadJournal = {
  id: string;
  operation_id: string;
  canonical_generation: number;
  phase: string;
  owner_run: string;
  owner_fence: number;
  staged_resource_id: string;
  pdf_binding: Record<string, Json>;
  pdf_dispatch_id: string | null;
  pdf_terminal_body: Record<string, Json> | null;
};
export async function uploadRpc(
  owned: string,
  name: string,
  types: string[],
  values: unknown[],
) {
  const s = session(owned);
  try {
    await s.lease.query("SET SESSION AUTHORIZATION otr_trip_source_command_gateway");
    return (
      await s.lease.query(
        `SELECT public.${name}(${types.map((t, i) => `$${i + 1}::${t}`).join(",")}) AS r`,
        values,
      )
    ).rows[0].r as any;
  } finally {
    s.close();
  }
}
export async function makeUploadPlan(
  owned: string,
  actor: string,
  trip: string,
  source: string,
  original: string,
  bytes: Uint8Array,
  mime = "application/pdf",
) {
  const payload = {
    material_revision: 1,
    expected_source_row_revision: 1,
    expected_source_state: { lifecycle: "ACTIVE", retention_state: "RETAINED" },
    representation_id: original,
    expected_representation_row_revision: 1,
    expected_representation_state: {
      remote_state: "PENDING",
      retention_state: "RETAINED",
    },
  };
  const command = async (kind: string, extra: object = {}) => {
    const q = {
      contract_version: 1,
      command: kind,
      operation_id: randomUUID(),
      operation_key: randomUUID(),
      actor_account_id: actor,
      trip_id: trip,
      source_id: source,
      operation_sha256: "",
      payload: { ...payload, ...extra },
    };
    // SQL's owning codec supplies the existing finite tuple; no alternate hashing format.
    const s = session(owned);
    try {
      const tuple = (
        await s.lease.query(
          "SELECT public.trip_source_payload_tuple($1,$2::jsonb) AS t",
          [kind, canonicalCoreJson(q.payload)],
        )
      ).rows[0].t as Json;
      q.operation_sha256 = await importDigest(
        kind === "UPLOAD_ORIGINAL" ? "otr-source-upload-v1" : "otr-source-command-v1",
        kind === "UPLOAD_ORIGINAL"
          ? [
              1,
              q.operation_id,
              q.operation_key,
              actor,
              trip,
              source,
              ...(tuple as Json[]),
            ]
          : [1, kind, q.operation_id, q.operation_key, actor, trip, source, tuple],
        hash,
      );
    } finally {
      s.close();
    }
    return q;
  };
  const prepare = await command("PREPARE_REPRESENTATION");
  expect(
    (
      await uploadRpc(
        owned,
        "trip_source_prepare_representation",
        ["uuid", "text"],
        [actor, canonicalCoreJson(prepare)],
      )
    ).outcome,
  ).toBe("APPLIED");
  const q = await command("UPLOAD_ORIGINAL", {
    parent_operation_id: prepare.operation_id,
    payload_sha256: pdfHash(bytes),
    byte_count: bytes.length,
    mime_type: mime,
  });
  const identity = {
    attempt: randomUUID(),
    resource: randomUUID(),
    node: randomUUID(),
    resourceKey: pdfHash(new TextEncoder().encode(randomUUID())),
    runToken: randomUUID(),
    owner: randomUUID(),
  };
  const begin = () =>
    uploadRpc(
      owned,
      "trip_source_pdf_upload_begin",
      ["uuid", "text", "uuid", "uuid", "uuid", "text", "uuid", "uuid"],
      [
        actor,
        canonicalCoreJson(q),
        identity.attempt,
        identity.resource,
        identity.node,
        identity.resourceKey,
        identity.runToken,
        identity.owner,
      ],
    );
  const mutate = (
    verb: string,
    j: UploadJournal,
    extraTypes: string[] = [],
    extra: unknown[] = [],
  ) =>
    uploadRpc(
      owned,
      `trip_source_pdf_upload_${verb}`,
      ["uuid", "uuid", "bigint", ...extraTypes],
      [j.id, j.owner_run, j.owner_fence, ...extra],
    );
  const finish = (j: UploadJournal) =>
    uploadRpc(
      owned,
      "trip_source_pdf_upload_finish",
      ["uuid", "text", "uuid", "uuid", "bigint"],
      [actor, canonicalCoreJson(q), j.id, j.owner_run, j.owner_fence],
    );
  return { q, identity, begin, mutate, finish };
}
export async function terminalProof(
  owned: string,
  j: UploadJournal,
  object: Record<string, Json>,
  overrides: Record<string, Json> = {},
) {
  const s = session(owned);
  try {
    const observedAt = (
      await s.lease.query(
        "SELECT public.trip_event_utc_timestamp(clock_timestamp()) AS t",
      )
    ).rows[0].t as Json;
    const body = {
      uploadVersion: 1,
      issuer: "otr-source-pdf-upload-producer/1",
      binding: j.pdf_binding,
      ownerRun: j.owner_run,
      ownerFence: j.owner_fence,
      dispatchId: j.pdf_dispatch_id,
      observedAt,
      disposition: j.pdf_dispatch_id ? "WRITER_TERMINAL" : "NO_DISPATCH",
      object,
      ...overrides,
    };
    const evidenceSha256 = (
      await s.lease.query(
        "SELECT public.trip_source_hash('otr-source-pdf-upload-terminal-v1',$1::jsonb) AS d",
        [canonicalCoreJson(body)],
      )
    ).rows[0].d as string;
    return { ...body, evidenceSha256 };
  } finally {
    s.close();
  }
}
// Deterministic synthetic provider only: delayed writes retain a live writer until explicit completion.
export class SyntheticPdfProvider {
  writes = 0;
  active = false;
  bytes: Uint8Array | null = null;
  private used = new Set<string>();
  start(j: UploadJournal, bytes: Uint8Array) {
    if (!j.pdf_dispatch_id || j.phase !== "RUNNING" || this.used.has(j.pdf_dispatch_id))
      throw Error("NO_NEW_DISPATCH");
    this.used.add(j.pdf_dispatch_id);
    this.writes++;
    this.active = true;
    return () => {
      if (this.bytes) throw Error("CREATE_ONLY_CONFLICT");
      this.bytes = bytes.slice();
      this.active = false;
    };
  }
  object() {
    return this.bytes
      ? {
          kind: "MATCH",
          sha256: pdfHash(this.bytes),
          byteCount: this.bytes.length,
          mimeType: "application/pdf",
        }
      : { kind: "MISSING", sha256: null, byteCount: null, mimeType: null };
  }
  async evidence(owned: string, j: UploadJournal) {
    if (this.active) throw Error("WRITER_ACTIVE");
    return terminalProof(owned, j, this.object());
  }
}
export async function uploadRetainedPdfFixture(
  owned: string,
  actor: string,
  trip: string,
  source: string,
  original: string,
  bytes: Uint8Array,
  retainedFile: string,
) {
  const plan = await makeUploadPlan(owned, actor, trip, source, original, bytes);
  sourcePdfUploadCommandSchema.parse(plan.q);
  const initial = await plan.begin();
  let j: UploadJournal = initial.journal;
  sourcePdfUploadBindingSchema.parse(j.pdf_binding);
  expect((await plan.begin()).journal).toEqual(j);
  const stageDirectory = await mkdtemp(join(tmpdir(), "otr-pdf-upload-stage-"));
  const stageFile = join(stageDirectory, "sealed-payload");
  const handle = await open(stageFile, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const staged = new Uint8Array(await readFile(stageFile));
  expect(pdfHash(staged)).toBe(j.pdf_binding.sha256);
  await plan.mutate(
    "stage",
    j,
    ["text", "bigint", "text"],
    [pdfHash(bytes), bytes.length, "e".repeat(64)],
  );
  j = await plan.mutate("dispatch", j);
  const provider = new SyntheticPdfProvider();
  provider.start(j, staged)();
  await writeFile(retainedFile, provider.bytes!, { flag: "wx", mode: 0o600 });
  const observed = new Uint8Array(await readFile(retainedFile));
  expect(pdfHash(observed)).toBe(j.pdf_binding.sha256);
  expect(observed.length).toBe(j.pdf_binding.byteCount);
  const evidence = sourcePdfUploadTerminalSchema.parse(await provider.evidence(owned, j));
  j = await plan.mutate("terminal", j, ["jsonb"], [canonicalCoreJson(evidence)]);
  const receipt = sourcePdfUploadReceiptSchema.parse(await plan.finish(j));
  expect(receipt.outcome).toBe("APPLIED");
  expect(receipt.result_remote_state).toBe("PENDING");
  expect(await plan.finish(j)).toEqual(receipt);
  expect((await plan.begin()).receipt).toEqual(receipt);
  expect(provider.writes).toBe(1);
  console.log(
    JSON.stringify({
      classification: "CLOSED_SYNTHETIC_PDF_UPLOAD",
      operationId: plan.q.operation_id,
      attemptId: j.id,
      providerWrites: provider.writes,
      receiptSha256: receipt.result_sha256,
      remoteState: "PENDING",
    }),
  );
  return { plan, j, receipt, removeStage: () => rm(stageDirectory, { recursive: true }) };
}
