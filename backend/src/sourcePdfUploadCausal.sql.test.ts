import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { session } from "./__fixtures__/tripCoreV2Sql";
import {
  causalPlan,
  causalExecute,
  causalProof,
  controlledIndependentRead,
  type CausalJournal,
} from "./__fixtures__/sourcePdfUploadCausal";
import { betaPlan, betaExecute, betaProof } from "./__fixtures__/sourcePdfUploadBeta";
import { uploadRpc, SyntheticPdfProvider } from "./__fixtures__/sourcePdfUpload";
import { encodeProfilePdf, pdfHash } from "./sourcePdfProfile";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
const owned = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
const actor = "00000000-0000-4000-8000-000000000002",
  trip = "10000000-0000-4000-8000-000000000001";
const bytes = encodeProfilePdf(["NZ1 AKL CHC", "NZ2 CHC AKL"]);
let admin: ReturnType<typeof session>;
async function seed(mime = "application/pdf") {
  const source = randomUUID(),
    original = randomUUID();
  await admin.lease.query("BEGIN");
  for (const t of [
    "trip_sources",
    "trip_source_revisions",
    "trip_source_representations",
  ])
    await admin.lease.query(`ALTER TABLE public.${t} DISABLE TRIGGER USER`);
  await admin.lease.query(
    "INSERT INTO public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) VALUES($1::uuid,$2::uuid,$3::uuid,$1,repeat('0',64),$4,'FILES','UNKNOWN',clock_timestamp(),1,1)",
    [source, trip, actor, mime === "image/png" ? "IMAGE" : "FILE"],
  );
  await admin.lease.query(
    "INSERT INTO public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES($1::uuid,1,clock_timestamp(),$2::uuid,$1,repeat('0',64),ARRAY[$3::uuid],'AS_SUPPLIED','ACQUISITION')",
    [source, actor, original],
  );
  await admin.lease.query(
    "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,mime_type,payload_sha256,byte_count,regenerability,created_at,storage_provider,storage_bucket,object_key,remote_state) VALUES($1::uuid,1,$2::uuid,1,'ORIGINAL','BINARY',$6,$3,$4,'NOT_APPLICABLE',clock_timestamp(),'supabase_storage','trip-source-material',$5,'PENDING')",
    [
      original,
      source,
      pdfHash(bytes),
      bytes.length,
      `v1/${trip}/${source}/${original}/payload`,
      mime,
    ],
  );
  await admin.lease.query("SET CONSTRAINTS ALL IMMEDIATE");
  for (const t of [
    "trip_sources",
    "trip_source_revisions",
    "trip_source_representations",
  ])
    await admin.lease.query(`ALTER TABLE public.${t} ENABLE TRIGGER USER`);
  await admin.lease.query("COMMIT");
  return {
    source,
    original,
    plan: await causalPlan(owned!, actor, trip, source, original, bytes, mime),
  };
}
async function start() {
  const f = await seed();
  let j: CausalJournal = (await f.plan.begin()).journal;
  j = await causalExecute(owned!, j, "STAGE", {
    sha256: pdfHash(bytes),
    byteCount: bytes.length,
    evidenceSha256: "e".repeat(64),
  });
  return { ...f, j };
}
async function running() {
  const f = await start();
  f.j = await causalExecute(owned!, f.j, "DISPATCH");
  return f;
}
async function ack(
  f: Awaited<ReturnType<typeof running>>,
  overrides: Record<string, Json> = {},
) {
  f.j = await causalExecute(
    owned!,
    f.j,
    "ACK",
    await causalProof(owned!, f.j, "ACK", overrides),
  );
  return f;
}
async function closure(f: Awaited<ReturnType<typeof running>>) {
  await ack(f);
  f.j = await causalExecute(owned!, f.j, "READ");
  f.j = await causalExecute(owned!, f.j, "GET", await causalProof(owned!, f.j, "GET"));
  return f;
}
async function transaction(body: (s: ReturnType<typeof session>) => Promise<void>) {
  const s = session(owned!);
  try {
    await s.lease.query("SET SESSION AUTHORIZATION otr_trip_source_command_gateway");
    await s.lease.query("BEGIN");
    await body(s);
    await s.lease.query("ROLLBACK");
  } finally {
    s.close();
  }
}
const inTx = (
  s: ReturnType<typeof session>,
  j: CausalJournal,
  action: string,
  proof: Json | null = null,
) =>
  s.lease.query(
    "SELECT trip_source_pdf_causal_execute($1::uuid,$2::uuid,$3::bigint,$4,$5::jsonb) AS r",
    [
      j.id,
      j.owner_run,
      j.owner_fence,
      action,
      proof === null ? null : canonicalCoreJson(proof),
    ],
  );
describe.skipIf(!owned)("CLOSED V3 causal upload authority", () => {
  beforeAll(async () => {
    admin = session(owned!);
    for (const [table, c] of [
      ["trip_source_command_gate", "trip_source_gate_closed"],
      ["trip_source_pdf_gate", "trip_source_pdf_gate_enabled_check"],
      ["trip_source_pdf_upload_config", "source_pdf_causal_closed"],
    ])
      await admin.lease.query(`ALTER TABLE ${table} DROP CONSTRAINT ${c}`);
    await admin.lease.query("UPDATE trip_source_command_gate SET enabled=true");
    await admin.lease.query("UPDATE trip_source_pdf_gate SET enabled=true");
    await admin.lease.query(
      "UPDATE trip_source_pdf_upload_config SET causal_enabled=true,account_stages=256,global_stages=4096",
    );
  });
  afterAll(async () => {
    if (!admin) return;
    await admin.lease.query(
      "UPDATE trip_source_pdf_upload_config SET causal_enabled=false",
    );
    await admin.lease.query("UPDATE trip_source_pdf_gate SET enabled=false");
    await admin.lease.query("UPDATE trip_source_command_gate SET enabled=false");
    admin.close();
  });
  it.each([
    ["2026-10-12T23:29:40.943900Z", "2026-10-12T23:29:40.875884Z"],
    ["2026-10-12T23:29:50.984518Z", "2026-10-12T23:29:50.908372Z"],
  ])(
    "rollback observation %s remains audit-only and FINAL preserves debt",
    async (observed, earlier) => {
      const f = await running();
      await ack(f, { observedAt: observed });
      f.j = await causalExecute(owned!, f.j, "READ");
      f.j = await causalExecute(
        owned!,
        f.j,
        "GET",
        await causalProof(owned!, f.j, "GET", { observedAt: earlier }),
      );
      const receipt = await f.plan.finish(f.j);
      expect(receipt).toMatchObject({
        outcome: "APPLIED",
        result_remote_state: "PENDING",
        result_verified_at: null,
      });
      expect(await f.plan.finish({ ...f.j, owner_fence: 999 })).toEqual(receipt);
      expect((await f.plan.begin()).receipt).toEqual(receipt);
      const row = (
        await admin.lease.query(
          "SELECT a.termination_outstanding,a.terminal_result,a.terminal_evidence_sha256,a.phase,o.io_finished_at,s.cleaned_at FROM trip_source_execution_attempts a JOIN trip_source_operations o ON o.id=a.operation_id JOIN trip_source_staged_resources s ON s.id=a.staged_resource_id WHERE a.id=$1::uuid",
          [f.j.id],
        )
      ).rows[0];
      expect(row).toMatchObject({
        termination_outstanding: true,
        terminal_result: null,
        terminal_evidence_sha256: null,
        phase: "RUNNING",
        io_finished_at: null,
        cleaned_at: null,
      });
    },
  );
  it("large past/future audit labels do not grant expiry or physical terminality", async () => {
    const f = await running();
    await ack(f, { observedAt: "9999-01-01T00:00:00.000000Z" });
    f.j = await causalExecute(owned!, f.j, "READ");
    f.j = await causalExecute(
      owned!,
      f.j,
      "GET",
      await causalProof(owned!, f.j, "GET", {
        observedAt: "1900-01-01T00:00:00.000000Z",
      }),
    );
    expect((await f.plan.finish(f.j)).outcome).toBe("APPLIED");
  });
  it.each([
    null,
    "infinity",
    "2026-10-12T23:29:50.984518+00:00",
    "2026-10-12T23:29:50.984Z",
    "2026-99-99T00:00:00.000000Z",
  ])("malformed/noncanonical audit %s rejects", async (observedAt) => {
    const f = await running();
    await expect(
      causalExecute(
        owned!,
        f.j,
        "ACK",
        await causalProof(owned!, f.j, "ACK", { observedAt }),
      ),
    ).rejects.toThrow();
  });
  it.each([null, "PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3"])(
    "stage CHECK isolates rollback for tag %s",
    async (tag) => {
      const s = session(owned!);
      const run = async () => {
        try {
          await s.lease.query("BEGIN");
          await s.lease.query(
            "ALTER TABLE trip_source_staged_resources DISABLE TRIGGER USER",
          );
          await s.lease.query(
            "INSERT INTO trip_source_staged_resources(id,execution_principal,node_id,resource_key,payload_sha256,byte_count,created_at,pdf_actor_account_id,pdf_sealed_at,pdf_stage_evidence_sha256,pdf_causal_profile_id) VALUES($1::uuid,'otr_trip_source_command_gateway',$2::uuid,repeat('0',64),repeat('0',64),1,'2026-10-12T23:29:50.984518Z',$3::uuid,'2026-10-12T23:29:50.908372Z',repeat('e',64),$4)",
            [randomUUID(), randomUUID(), actor, tag],
          );
          await s.lease.query("ROLLBACK");
        } finally {
          s.close();
        }
      };
      if (tag === null) await expect(run()).rejects.toThrow("source_pdf_stage_shape");
      else await run();
    },
  );
  it.each(["binding", "response"])("wrong bound ACK %s fails closed", async (field) => {
    const f = await running();
    const p = await causalProof(owned!, f.j, "ACK");
    const overrides: Record<string, Json> =
      field === "binding"
        ? { binding: { ...f.j.pdf_binding, producerId: randomUUID() } }
        : { response: { ...(p as any).response, body: "{" } };
    await expect(
      causalExecute(owned!, f.j, "ACK", await causalProof(owned!, f.j, "ACK", overrides)),
    ).rejects.toThrow();
  });
  it("unsealed stage cannot dispatch", async () => {
    const f = await seed();
    const j = (await f.plan.begin()).journal;
    await expect(causalExecute(owned!, j, "DISPATCH")).rejects.toThrow();
  });
  it("uncommitted stage cannot dispatch", async () => {
    const f = await seed();
    const j = (await f.plan.begin()).journal;
    await expect(
      transaction(async (s) => {
        await inTx(s, j, "STAGE", {
          sha256: pdfHash(bytes),
          byteCount: bytes.length,
          evidenceSha256: "e".repeat(64),
        });
        await inTx(s, j, "DISPATCH");
      }),
    ).rejects.toThrow("PDF_CAUSAL_COMMIT_REQUIRED");
  });
  it("uncommitted dispatch cannot confirm write", async () => {
    const f = await start();
    await expect(
      transaction(async (s) => {
        const j = (await inTx(s, f.j, "DISPATCH")).rows[0].r as CausalJournal;
        await inTx(s, j, "CONFIRM");
      }),
    ).rejects.toThrow("PDF_CAUSAL_COMMIT_REQUIRED");
    expect((await f.plan.begin()).journal.pdf_dispatch_id).toBeNull();
  });
  it("uncommitted dispatch cannot commit ACK", async () => {
    const f = await start();
    await expect(
      transaction(async (s) => {
        const j = (await inTx(s, f.j, "DISPATCH")).rows[0].r as CausalJournal;
        await inTx(s, j, "ACK", await causalProof(owned!, j, "ACK"));
      }),
    ).rejects.toThrow("PDF_CAUSAL_COMMIT_REQUIRED");
    expect((await f.plan.begin()).journal.pdf_beta_ack).toBeNull();
  });
  it("ACK not committed cannot issue new independent READ", async () => {
    const f = await running();
    const p = await causalProof(owned!, f.j, "ACK");
    await expect(
      transaction(async (s) => {
        await inTx(s, f.j, "ACK", p);
        await inTx(s, f.j, "READ");
      }),
    ).rejects.toThrow("PDF_CAUSAL_COMMIT_REQUIRED");
    expect((await f.plan.begin()).journal.pdf_beta_ack).toBeNull();
  });
  it("uncommitted READ permit cannot submit GET", async () => {
    const f = await ack(await running());
    await expect(
      transaction(async (s) => {
        const j = (await inTx(s, f.j, "READ")).rows[0].r as CausalJournal;
        await inTx(s, j, "GET", await causalProof(owned!, j, "GET"));
      }),
    ).rejects.toThrow("PDF_CAUSAL_COMMIT_REQUIRED");
  });
  it("pre-ACK/cached read with matching bytes is not a Source-issued permit", async () => {
    const f = await running();
    const cached = await causalProof(owned!, f.j, "GET");
    await expect(causalExecute(owned!, f.j, "GET", cached)).rejects.toThrow();
    await ack(f);
    f.j = await causalExecute(owned!, f.j, "READ");
    const preRead = (cached as any).read;
    await expect(
      causalExecute(
        owned!,
        f.j,
        "GET",
        await causalProof(owned!, f.j, "GET", {
          read: {
            ...preRead,
            ackEvidenceSha256: f.j.pdf_causal_read_permit!.ackEvidenceSha256,
          },
        }),
      ),
    ).rejects.toThrow("PDF_BETA_GET_INVALID");
  });
  it("controlled producer forbids pre-ACK/cached buffers with matching bytes", async () => {
    const f = await running();
    let reads = 0;
    const read = async () => {
      reads++;
      return bytes;
    };
    await expect(controlledIndependentRead(f.j, read)).rejects.toThrow(
      "ACK_LINKED_READ_REQUIRED",
    );
    await ack(f);
    f.j = await causalExecute(owned!, f.j, "READ");
    await expect(controlledIndependentRead(f.j, read, true)).rejects.toThrow(
      "CACHED_READ_FORBIDDEN",
    );
    expect(reads).toBe(0);
    expect(await controlledIndependentRead(f.j, read)).toEqual(bytes);
    expect(reads).toBe(1);
  });
  it.each(["ackEvidenceSha256", "readId", "sha256", "byteCount", "cacheBypassed"])(
    "wrong GET %s rejects despite causal journal",
    async (field) => {
      const f = await ack(await running());
      f.j = await causalExecute(owned!, f.j, "READ");
      const p = await causalProof(owned!, f.j, "GET");
      if (!("read" in p)) throw Error("GET_REQUIRED");
      const read = {
        ...p.read,
        [field]:
          field === "byteCount"
            ? 1
            : field === "cacheBypassed"
              ? false
              : field === "readId"
                ? randomUUID()
                : "f".repeat(64),
      };
      await expect(
        causalExecute(
          owned!,
          f.j,
          "GET",
          await causalProof(owned!, f.j, "GET", { read }),
        ),
      ).rejects.toThrow("PDF_BETA_GET_INVALID");
    },
  );
  it("missing ACK + matched bytes stays UNKNOWN with zero FINAL", async () => {
    const f = await running();
    f.j = await causalExecute(owned!, f.j, "UNKNOWN");
    await expect(causalExecute(owned!, f.j, "READ")).rejects.toThrow(
      "PDF_CAUSAL_ACK_REQUIRED",
    );
    await expect(f.plan.finish(f.j)).rejects.toThrow("PDF_BETA_CUSTODY_INCOMPLETE");
    await expect(causalExecute(owned!, f.j, "CONFIRM")).rejects.toThrow();
  });
  it("lost ACK/GET/FINAL responses recover the same immutable receipts without another write", async () => {
    const f = await running();
    const provider = new SyntheticPdfProvider();
    f.j = await causalExecute(owned!, f.j, "CONFIRM");
    provider.start(f.j, bytes)();
    const p = await causalProof(owned!, f.j, "ACK");
    await causalExecute(owned!, f.j, "ACK", p);
    f.j = (await f.plan.begin()).journal;
    expect(f.j.pdf_beta_ack).toEqual(p);
    f.j = await causalExecute(owned!, f.j, "READ");
    const get = await causalProof(owned!, f.j, "GET");
    await causalExecute(owned!, f.j, "GET", get);
    f.j = (await f.plan.begin()).journal;
    expect(f.j.pdf_beta_get).toEqual(get);
    const receipt = await f.plan.finish(f.j);
    expect(await f.plan.finish(f.j)).toEqual(receipt);
    expect(provider.writes).toBe(1);
    await expect(causalExecute(owned!, f.j, "DISPATCH")).rejects.toThrow();
  });
  it("concurrent dispatch and takeover grant at most one write", async () => {
    const f = await start();
    const out = await Promise.allSettled([
      causalExecute(owned!, f.j, "DISPATCH"),
      causalExecute(owned!, f.j, "DISPATCH"),
    ]);
    expect(out.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    f.j = (await f.plan.begin()).journal;
    const old = f.j;
    f.j = await uploadRpc(
      owned!,
      "trip_source_pdf_causal_claim",
      ["uuid", "bigint", "uuid"],
      [old.id, old.owner_fence, randomUUID()],
    );
    await expect(causalExecute(owned!, old, "CONFIRM")).rejects.toThrow();
    await expect(causalExecute(owned!, f.j, "CONFIRM")).rejects.toThrow(
      "PDF_CAUSAL_NO_NEW_WRITE",
    );
    await expect(causalExecute(owned!, f.j, "DISPATCH")).rejects.toThrow();
  });
  it("takeover fences old read and permits a new independent read linked to historic ACK", async () => {
    const f = await ack(await running());
    f.j = await causalExecute(owned!, f.j, "READ");
    const old = f.j;
    const oldGet = await causalProof(owned!, old, "GET");
    f.j = await uploadRpc(
      owned!,
      "trip_source_pdf_causal_claim",
      ["uuid", "bigint", "uuid"],
      [old.id, old.owner_fence, randomUUID()],
    );
    await expect(causalExecute(owned!, old, "GET", oldGet)).rejects.toThrow();
    f.j = await causalExecute(owned!, f.j, "READ");
    expect(f.j.pdf_causal_read_permit!.readId).not.toBe(
      old.pdf_causal_read_permit!.readId,
    );
    f.j = await causalExecute(owned!, f.j, "GET", await causalProof(owned!, f.j, "GET"));
    expect((await f.plan.finish(f.j)).outcome).toBe("APPLIED");
  });
  it.each(["source", "representation", "generation"])(
    "stale %s rejects current completion",
    async (kind) => {
      const f = await closure(await running());
      const table =
        kind === "source"
          ? "trip_sources"
          : kind === "representation"
            ? "trip_source_representations"
            : "trip_source_operations";
      await admin.lease.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
      try {
        await admin.lease.query(
          `UPDATE ${table} SET ${kind === "generation" ? "attempt_generation=attempt_generation+1" : "row_revision=row_revision+1"} WHERE id=$1::uuid`,
          [
            kind === "source"
              ? f.source
              : kind === "representation"
                ? f.original
                : f.plan.q.operation_id,
          ],
        );
      } finally {
        await admin.lease.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
      }
      await expect(f.plan.finish(f.j)).rejects.toThrow();
    },
  );
  it("private cross-account access and revoked custody fail closed", async () => {
    const f = await closure(await running());
    await expect(
      uploadRpc(
        owned!,
        "trip_source_pdf_causal_inventory",
        ["uuid", "uuid", "uuid"],
        [randomUUID(), trip, f.source],
      ),
    ).rejects.toThrow("NOT_VISIBLE");
    await admin.lease.query(
      "ALTER TABLE trip_source_representations DISABLE TRIGGER USER",
    );
    await admin.lease.query(
      "UPDATE trip_source_representations SET retention_state='PURGE_PENDING' WHERE id=$1::uuid",
      [f.original],
    );
    await admin.lease.query(
      "ALTER TABLE trip_source_representations ENABLE TRIGGER USER",
    );
    await expect(f.plan.finish(f.j)).rejects.toThrow();
  });
  it("normal logical completion retains quota and cannot use legacy cleanup", async () => {
    const f = await closure(await running());
    await f.plan.finish(f.j);
    await expect(
      uploadRpc(
        owned!,
        "trip_source_pdf_upload_release",
        ["uuid", "uuid", "bigint"],
        [f.j.id, f.j.owner_run, f.j.owner_fence],
      ),
    ).rejects.toThrow();
    await admin.lease.query("UPDATE trip_source_pdf_upload_config SET account_stages=1");
    try {
      const next = await seed();
      await expect(next.plan.begin()).rejects.toThrow("PDF_UPLOAD_QUOTA");
    } finally {
      await admin.lease.query(
        "UPDATE trip_source_pdf_upload_config SET account_stages=256",
      );
    }
  });
  it("old V2 still rejects backwards/future timestamp evidence", async () => {
    await admin.lease.query(
      "ALTER TABLE trip_source_pdf_upload_config DROP CONSTRAINT source_pdf_beta_closed",
    );
    await admin.lease.query("UPDATE trip_source_pdf_upload_config SET beta_enabled=true");
    try {
      const f = await seed();
      const plan = await betaPlan(owned!, actor, trip, f.source, f.original, bytes);
      let j = (await plan.begin()).journal;
      j = await betaExecute(owned!, j, "STAGE", {
        sha256: pdfHash(bytes),
        byteCount: bytes.length,
        evidenceSha256: "e".repeat(64),
      });
      j = await betaExecute(owned!, j, "DISPATCH");
      for (const observedAt of [
        "2026-10-12T23:29:40.943900Z",
        "9999-01-01T00:00:00.000000Z",
      ])
        await expect(
          betaExecute(
            owned!,
            j,
            "ACK",
            await betaProof(owned!, j, "ACK", { observedAt }),
          ),
        ).rejects.toThrow("PDF_BETA_PROOF_CONFLICT");
    } finally {
      await admin.lease.query(
        "UPDATE trip_source_pdf_upload_config SET beta_enabled=false",
      );
    }
  });
});
