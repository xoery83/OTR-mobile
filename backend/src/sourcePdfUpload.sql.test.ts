import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { session } from "./__fixtures__/tripCoreV2Sql";
import {
  makeUploadPlan,
  SyntheticPdfProvider,
  terminalProof,
  uploadRpc,
  type UploadJournal,
} from "./__fixtures__/sourcePdfUpload";
import { encodeProfilePdf, pdfHash } from "./sourcePdfProfile";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
const owned = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
const actor = "00000000-0000-4000-8000-000000000002",
  trip = "10000000-0000-4000-8000-000000000001";
const bytes = encodeProfilePdf(["NZ1 AKL CHC", "NZ2 CHC AKL"]);
const missing = { kind: "MISSING", sha256: null, byteCount: null, mimeType: null };
const match = {
  kind: "MATCH",
  sha256: pdfHash(bytes),
  byteCount: bytes.length,
  mimeType: "application/pdf",
};
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
    plan: await makeUploadPlan(owned!, actor, trip, source, original, bytes, mime),
  };
}
async function running() {
  const f = await seed();
  let j: UploadJournal = (await f.plan.begin()).journal;
  await f.plan.mutate(
    "stage",
    j,
    ["text", "bigint", "text"],
    [pdfHash(bytes), bytes.length, "e".repeat(64)],
  );
  j = await f.plan.mutate("dispatch", j);
  return { ...f, j };
}
async function terminal(
  f: Awaited<ReturnType<typeof running>>,
  object: Record<string, Json> = match,
) {
  return f.plan.mutate(
    "terminal",
    f.j,
    ["jsonb"],
    [canonicalCoreJson(await terminalProof(owned!, f.j, object))],
  ) as Promise<UploadJournal>;
}
async function alter(table: string, sql: string, params: unknown[]) {
  await admin.lease.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
  try {
    await admin.lease.query(sql, params);
  } finally {
    await admin.lease.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
  }
}
describe.skipIf(!owned)("CLOSED finite PDF upload SQL terminality", () => {
  beforeAll(async () => {
    admin = session(owned!);
    await admin.lease.query(
      "ALTER TABLE public.trip_source_command_gate DROP CONSTRAINT trip_source_gate_closed",
    );
    await admin.lease.query(
      "ALTER TABLE public.trip_source_pdf_gate DROP CONSTRAINT trip_source_pdf_gate_enabled_check",
    );
    await admin.lease.query(
      "ALTER TABLE public.trip_source_pdf_upload_config DROP CONSTRAINT source_pdf_upload_closed",
    );
    await admin.lease.query("UPDATE public.trip_source_command_gate SET enabled=true");
    await admin.lease.query("UPDATE public.trip_source_pdf_gate SET enabled=true");
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET enabled=true,account_stages=256,global_stages=4096",
    );
  });
  afterAll(async () => {
    if (!admin) return;
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET enabled=false",
    );
    await admin.lease.query("UPDATE public.trip_source_pdf_gate SET enabled=false");
    await admin.lease.query("UPDATE public.trip_source_command_gate SET enabled=false");
    admin.close();
  });
  it("journal-before-dispatch reserves bytes and blocks unsealed stage", async () => {
    const { plan } = await seed();
    const j: UploadJournal = (await plan.begin()).journal;
    expect(j.phase).toBe("STARTING");
    expect(j.pdf_dispatch_id).toBeNull();
    await expect(plan.mutate("dispatch", j)).rejects.toThrow("DISPATCH_CONFLICT");
    await expect(
      plan.mutate(
        "stage",
        j,
        ["text", "bigint", "text"],
        ["0".repeat(64), bytes.length, "e".repeat(64)],
      ),
    ).rejects.toThrow("STAGE_PROOF_CONFLICT");
    await expect(plan.finish(j)).rejects.toThrow("NOT_TERMINAL");
    const proof = await terminalProof(owned!, j, missing);
    const done = await plan.mutate("terminal", j, ["jsonb"], [canonicalCoreJson(proof)]);
    expect((await plan.finish(done)).outcome).toBe("REJECTED");
    await expect(plan.mutate("dispatch", done)).rejects.toThrow(
      "SOURCE_ATTEMPT_CONFLICT",
    );
  });
  it("one dispatch per attempt including concurrent workers and lost dispatch response", async () => {
    const f = await seed();
    const j: UploadJournal = (await f.plan.begin()).journal;
    await f.plan.mutate(
      "stage",
      j,
      ["text", "bigint", "text"],
      [pdfHash(bytes), bytes.length, "e".repeat(64)],
    );
    const result = await Promise.allSettled([
      f.plan.mutate("dispatch", j),
      f.plan.mutate("dispatch", j),
    ]);
    expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await f.plan.begin()).journal.pdf_dispatch_id).toBeTruthy();
    await expect(f.plan.mutate("dispatch", j)).rejects.toThrow("DISPATCH_CONFLICT");
  });
  it("delayed write + ambiguous 404 remains UNKNOWN, protects stage and blocks fresh IDs", async () => {
    const f = await running(),
      provider = new SyntheticPdfProvider();
    const complete = provider.start(f.j, bytes);
    expect(provider.object()).toEqual(missing);
    await expect(provider.evidence(owned!, f.j)).rejects.toThrow("WRITER_ACTIVE");
    f.j = await f.plan.mutate("unknown", f.j);
    expect((await f.plan.begin()).journal.phase).toBe("UNKNOWN");
    await expect(f.plan.finish(f.j)).rejects.toThrow("NOT_TERMINAL");
    await expect(f.plan.mutate("release", f.j)).rejects.toThrow("SOURCE_STAGE_PROTECTED");
    await expect(
      makeUploadPlan(owned!, actor, trip, f.source, f.original, bytes).then((p) =>
        p.begin(),
      ),
    ).rejects.toThrow("SOURCE_IO_UNAVAILABLE");
    complete();
    expect(provider.object()).toEqual(match);
    // Object now matches, but no terminal evidence was persisted: still UNKNOWN.
    await expect(f.plan.finish(f.j)).rejects.toThrow("NOT_TERMINAL");
    expect(provider.writes).toBe(1);
  });
  it("matched bytes with an active writer cannot become producer evidence", async () => {
    const f = await running(),
      provider = new SyntheticPdfProvider();
    provider.start(f.j, bytes);
    provider.bytes = bytes;
    expect(provider.object()).toEqual(match);
    await expect(provider.evidence(owned!, f.j)).rejects.toThrow("WRITER_ACTIVE");
    await expect(f.plan.finish(f.j)).rejects.toThrow("NOT_TERMINAL");
  });
  it.each([
    "objectKey",
    "sha256",
    "byteCount",
    "actorAccountId",
    "tripId",
    "sourceRowRevision",
    "attemptGeneration",
    "runToken",
    "provider",
    "bucket",
  ])("rejects altered immutable binding: %s", async (key) => {
    const f = await running();
    const proof = await terminalProof(owned!, f.j, match, {
      binding: { ...f.j.pdf_binding, [key]: "altered" },
    });
    await expect(
      f.plan.mutate("terminal", f.j, ["jsonb"], [canonicalCoreJson(proof)]),
    ).rejects.toThrow("PROOF_CONFLICT");
  });
  it("rejects fake terminal issuer, digest, dispatch and missing MATCH metadata", async () => {
    const f = await running();
    const alterations: Record<string, Json>[] = [
      { issuer: "native/pdfkit" },
      { dispatchId: randomUUID() },
      { disposition: "NO_DISPATCH" },
      { observedAt: "2000-01-01T00:00:00.000000Z" },
    ];
    for (const overrides of alterations) {
      const proof = await terminalProof(owned!, f.j, match, overrides);
      await expect(
        f.plan.mutate("terminal", f.j, ["jsonb"], [canonicalCoreJson(proof)]),
      ).rejects.toThrow("PROOF_CONFLICT");
    }
    const proof = await terminalProof(owned!, f.j, { ...match, sha256: null });
    await expect(
      f.plan.mutate("terminal", f.j, ["jsonb"], [canonicalCoreJson(proof)]),
    ).rejects.toThrow("OBJECT_PROOF_CONFLICT");
    const valid = await terminalProof(owned!, f.j, match);
    await expect(
      f.plan.mutate(
        "terminal",
        f.j,
        ["jsonb"],
        [canonicalCoreJson({ ...valid, evidenceSha256: "0".repeat(64) })],
      ),
    ).rejects.toThrow("PROOF_CONFLICT");
  });
  it("durable terminal before FINAL recovers after process restart with fresh owner fence", async () => {
    const f = await running();
    f.j = await terminal(f);
    const old = f.j;
    const next = await uploadRpc(
      owned!,
      "trip_source_pdf_upload_claim",
      ["uuid", "bigint", "uuid"],
      [old.id, old.owner_fence, randomUUID()],
    );
    await expect(f.plan.finish(old)).rejects.toThrow("NOT_TERMINAL");
    const receipt = await f.plan.finish(next);
    expect(receipt.outcome).toBe("APPLIED");
    expect(receipt.result_remote_state).toBe("PENDING");
    expect(await f.plan.finish(next)).toEqual(receipt);
    expect((await f.plan.begin()).receipt).toEqual(receipt);
  });
  it("takeover transfers reconciliation only and rejects stale producer fence", async () => {
    const f = await running();
    const old = f.j;
    f.j = await uploadRpc(
      owned!,
      "trip_source_pdf_upload_claim",
      ["uuid", "bigint", "uuid"],
      [old.id, 1, randomUUID()],
    );
    expect(f.j.phase).toBe("UNKNOWN");
    await expect(f.plan.mutate("dispatch", f.j)).rejects.toThrow("DISPATCH_CONFLICT");
    await expect(terminal({ ...f, j: old })).rejects.toThrow("FENCE_CONFLICT");
  });
  it("full plan stays exclusive through IO_QUIESCENT and after accepted PENDING upload", async () => {
    const f = await running();
    f.j = await terminal(f);
    await expect(
      makeUploadPlan(owned!, actor, trip, f.source, f.original, bytes).then((p) =>
        p.begin(),
      ),
    ).rejects.toThrow("SOURCE_IO_UNAVAILABLE");
    expect((await f.plan.finish(f.j)).outcome).toBe("APPLIED");
    await expect(
      makeUploadPlan(owned!, actor, trip, f.source, f.original, bytes).then((p) =>
        p.begin(),
      ),
    ).rejects.toThrow("EPOCH_USED");
    await expect(f.plan.mutate("release", f.j)).rejects.toThrow("SOURCE_STAGE_PROTECTED");
  });
  it.each([
    missing,
    {
      kind: "MISMATCH",
      sha256: "0".repeat(64),
      byteCount: 0,
      mimeType: "application/pdf",
    },
  ])(
    "terminal failed object seals REJECTED, protects orphan and forbids overwrite",
    async (object) => {
      const f = await running();
      f.j = await terminal(f, object);
      const r = await f.plan.finish(f.j);
      expect(r.outcome).toBe("REJECTED");
      expect(r.error_code).toBe("MATERIAL_INTEGRITY_MISMATCH");
      expect(await f.plan.finish(f.j)).toEqual(r);
      await expect(f.plan.mutate("release", f.j)).rejects.toThrow(
        "SOURCE_STAGE_PROTECTED",
      );
      await expect(
        makeUploadPlan(owned!, actor, trip, f.source, f.original, bytes).then((p) =>
          p.begin(),
        ),
      ).rejects.toThrow("EPOCH_USED");
    },
  );
  it("stale Source CAS after PUT retains operational terminal evidence without success", async () => {
    const f = await running();
    await alter(
      "trip_sources",
      "UPDATE public.trip_sources SET row_revision=2 WHERE id=$1::uuid",
      [f.source],
    );
    f.j = await terminal(f);
    expect(f.j.phase).toBe("TERMINAL");
    const r = await f.plan.finish(f.j);
    expect(r.outcome).toBe("REJECTED");
    expect(r.error_code).toBe("SOURCE_CAS_CONFLICT");
  });
  it("revoked custody blocks handoff and leaves terminal orphan protected", async () => {
    const f = await running();
    await alter(
      "trip_source_representations",
      "UPDATE public.trip_source_representations SET retention_state='PURGE_PENDING' WHERE id=$1::uuid",
      [f.original],
    );
    f.j = await terminal(f);
    const r = await f.plan.finish(f.j);
    expect(r.outcome).toBe("REJECTED");
    await expect(f.plan.mutate("release", f.j)).rejects.toThrow("SOURCE_STAGE_PROTECTED");
  });
  it("private inventory denies another account/Trip; current owner has restart obligations", async () => {
    const f = await running();
    f.j = await f.plan.mutate("unknown", f.j);
    const args = ["uuid", "uuid", "uuid"];
    const first = await uploadRpc(owned!, "trip_source_pdf_upload_inventory", args, [
      actor,
      trip,
      f.source,
    ]);
    expect(first[0].id).toBe(f.j.id);
    expect(first[0].staged_resource.cleaned_at).toBeNull();
    expect(
      await uploadRpc(owned!, "trip_source_pdf_upload_inventory", args, [
        actor,
        trip,
        f.source,
      ]),
    ).toEqual(first);
    await expect(
      uploadRpc(owned!, "trip_source_pdf_upload_inventory", args, [
        "00000000-0000-4000-8000-000000000003",
        trip,
        f.source,
      ]),
    ).rejects.toThrow("NOT_VISIBLE");
    await expect(
      uploadRpc(owned!, "trip_source_pdf_upload_inventory", args, [
        actor,
        randomUUID(),
        f.source,
      ]),
    ).rejects.toThrow("NOT_VISIBLE");
  });
  it("durable account/global quota includes UNKNOWN and pending cleanup across restart", async () => {
    const n = (
      await admin.lease.query(
        "SELECT count(*)::int AS n FROM public.trip_source_staged_resources WHERE pdf_actor_account_id=$1::uuid AND cleaned_at IS NULL",
        [actor],
      )
    ).rows[0].n as number;
    expect(n).toBeGreaterThan(1);
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET account_stages=$1",
      [n],
    );
    const f = await seed();
    await expect(f.plan.begin()).rejects.toThrow("PDF_UPLOAD_QUOTA");
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET account_stages=256,global_bytes=1",
    );
    await expect(f.plan.begin()).rejects.toThrow("PDF_UPLOAD_QUOTA");
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET global_bytes=16777216",
    );
    expect((await f.plan.begin()).journal.phase).toBe("STARTING");
  });
  it("stage replay and terminal replay are exact, altered receipts cannot replace evidence", async () => {
    const f = await running();
    const proof = await terminalProof(owned!, f.j, match);
    const first = await f.plan.mutate(
      "terminal",
      f.j,
      ["jsonb"],
      [canonicalCoreJson(proof)],
    );
    expect(
      await f.plan.mutate("terminal", f.j, ["jsonb"], [canonicalCoreJson(proof)]),
    ).toEqual(first);
    const changed = await terminalProof(owned!, f.j, missing);
    await expect(
      f.plan.mutate("terminal", f.j, ["jsonb"], [canonicalCoreJson(changed)]),
    ).rejects.toThrow("IMMUTABLE");
  });
  it("concurrent takeover has one winner and never reopens dispatch", async () => {
    const f = await running();
    const result = await Promise.allSettled(
      [1, 2].map(() =>
        uploadRpc(
          owned!,
          "trip_source_pdf_upload_claim",
          ["uuid", "bigint", "uuid"],
          [f.j.id, 1, randomUUID()],
        ),
      ),
    );
    expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await f.plan.begin()).journal.owner_fence).toBe(2);
  });
  it("quota failure rolls back operation/attempt reservation; configured file/byte ceilings are enforced", async () => {
    const f = await seed();
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET max_file_bytes=1",
    );
    await expect(f.plan.begin()).rejects.toThrow("PDF_UPLOAD_INVALID");
    expect(
      (
        await admin.lease.query(
          "SELECT count(*)::int AS n FROM public.trip_source_operations WHERE id=$1::uuid",
          [f.plan.q.operation_id],
        )
      ).rows[0].n,
    ).toBe(0);
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET max_file_bytes=65536,account_bytes=1",
    );
    await expect(f.plan.begin()).rejects.toThrow("PDF_UPLOAD_QUOTA");
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET account_bytes=1048576",
    );
    const j: UploadJournal = (await f.plan.begin()).journal;
    const proof = [pdfHash(bytes), bytes.length, "e".repeat(64)];
    await f.plan.mutate("stage", j, ["text", "bigint", "text"], proof);
    await f.plan.mutate("stage", j, ["text", "bigint", "text"], proof);
    await expect(
      f.plan.mutate(
        "stage",
        j,
        ["text", "bigint", "text"],
        [pdfHash(bytes), bytes.length, "f".repeat(64)],
      ),
    ).rejects.toThrow("STAGE_PROOF_CONFLICT");
  });
  it("existing PNG register/claim/container/terminal/release and inventory remain intact", async () => {
    const f = await seed("image/png"),
      attempt = randomUUID(),
      resource = randomUUID(),
      node = randomUUID(),
      token = randomUUID(),
      owner = randomUUID(),
      key = "d".repeat(64),
      container = "a".repeat(64);
    // Test-only private producer bridges in this disposable clone; never installed by migration.
    await admin.lease.query("grant create on schema public to otr_trip_source_writer");
    await admin.lease.query(
      "grant execute on function public.trip_source_execution_register(uuid,uuid,bigint,uuid,uuid,text,uuid,text,text) to otr_trip_source_writer",
    );
    await admin.lease.query(
      `create function public.fixture_png_start(actor uuid,raw text,attempt uuid,resource uuid,node uuid,key text,token uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare q jsonb;o public.trip_source_operations;begin q:=public.trip_source_command_codec(raw);perform public.trip_source_register('UPLOAD_ORIGINAL',actor,raw);select * into o from public.trip_source_operations where id=(q->>'operation_id')::uuid;perform public.trip_source_attempt_start(actor,o.trip_id,o.source_id,o.id,o.operation_key,o.operation_sha256,'ADMITTED',1,null,attempt);return public.trip_source_execution_register(o.id,attempt,1,resource,node,key,token,'PNG_STATIC_RGB8_RGBA8_V1','526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5');end$$`,
    );
    await admin.lease.query(
      `create function public.fixture_png_finish(operation uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare o public.trip_source_operations;begin select * into o from public.trip_source_operations where id=operation;perform public.trip_source_attempt_observe(o.id,o.operation_sha256,o.phase,o.attempt_generation,o.attempt_id,'DEFINITIVE_COMPLETION');return public.trip_source_finalize(o.actor_account_id,o.trip_id,o.source_id,o.id,o.operation_key,o.operation_sha256,o.attempt_generation,o.attempt_id,jsonb_build_object('operation_id',o.id,'attempt_id',o.attempt_id,'attempt_generation',o.attempt_generation,'kind','MATCH','payload_sha256',o.bound_payload_sha256,'byte_count',o.bound_byte_count,'mime_type',o.bound_mime_type,'observed_at',public.trip_event_utc_timestamp(o.admitted_at)));end$$`,
    );
    await admin.lease.query(
      "alter function public.fixture_png_start(uuid,text,uuid,uuid,uuid,text,uuid) owner to otr_trip_source_writer",
    );
    await admin.lease.query(
      "alter function public.fixture_png_finish(uuid) owner to otr_trip_source_writer",
    );
    const functions = [
      "trip_source_execution_claim(uuid,bigint,uuid)",
      "trip_source_execution_attach(uuid,uuid,bigint,uuid,uuid,text)",
      "trip_source_execution_advance(uuid,uuid,bigint,text)",
      "trip_source_execution_terminal(uuid,uuid,bigint,uuid,uuid,text,timestamptz,text,text)",
      "trip_source_execution_release(uuid,uuid,bigint)",
      "trip_source_execution_inventory()",
    ];
    for (const fn of functions)
      await admin.lease.query(
        `grant execute on function public.${fn} to otr_trip_source_command_gateway`,
      );
    try {
      const j = await uploadRpc(
        owned!,
        "fixture_png_start",
        ["uuid", "text", "uuid", "uuid", "uuid", "text", "uuid"],
        [actor, canonicalCoreJson(f.plan.q), attempt, resource, node, key, token],
      );
      expect(j.phase).toBe("STARTING");
      expect(j.pdf_binding).toBeNull();
      await uploadRpc(
        owned!,
        "trip_source_execution_claim",
        ["uuid", "bigint", "uuid"],
        [attempt, 0, owner],
      );
      await uploadRpc(
        owned!,
        "trip_source_execution_attach",
        ["uuid", "uuid", "bigint", "uuid", "uuid", "text"],
        [attempt, owner, 1, node, token, container],
      );
      await uploadRpc(
        owned!,
        "trip_source_execution_advance",
        ["uuid", "uuid", "bigint", "text"],
        [attempt, owner, 1, "RUNNING"],
      );
      const now = (
        await admin.lease.query(
          "SELECT public.trip_event_utc_timestamp(clock_timestamp()) AS t",
        )
      ).rows[0].t;
      const ended = await uploadRpc(
        owned!,
        "trip_source_execution_terminal",
        ["uuid", "uuid", "bigint", "uuid", "uuid", "text", "timestamptz", "text", "text"],
        [attempt, owner, 1, node, token, container, now, "e".repeat(64), "PARSE_PASS"],
      );
      expect(ended.terminal_result).toBe("PARSE_PASS");
      const inventory = await uploadRpc(
        owned!,
        "trip_source_execution_inventory",
        [],
        [],
      );
      expect(inventory.map((x: UploadJournal) => x.id)).toEqual([attempt]);
      expect(
        (await uploadRpc(owned!, "fixture_png_finish", ["uuid"], [f.plan.q.operation_id]))
          .outcome,
      ).toBe("APPLIED");
      expect(
        (
          await uploadRpc(
            owned!,
            "trip_source_execution_release",
            ["uuid", "uuid", "bigint"],
            [attempt, owner, 1],
          )
        ).release_authorized_at,
      ).toBeTruthy();
    } finally {
      for (const fn of functions)
        await admin.lease.query(
          `revoke execute on function public.${fn} from otr_trip_source_command_gateway`,
        );
      await admin.lease.query(
        "drop function public.fixture_png_start(uuid,text,uuid,uuid,uuid,text,uuid)",
      );
      await admin.lease.query("drop function public.fixture_png_finish(uuid)");
      await admin.lease.query(
        "revoke execute on function public.trip_source_execution_register(uuid,uuid,bigint,uuid,uuid,text,uuid,text,text) from otr_trip_source_writer",
      );
      await admin.lease.query(
        "revoke create on schema public from otr_trip_source_writer",
      );
    }
  });
  it("receipt-first replay works with activation CLOSED, never regrants PUT", async () => {
    const f = await running();
    f.j = await terminal(f);
    const r = await f.plan.finish(f.j);
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET enabled=false",
    );
    expect((await f.plan.begin()).receipt).toEqual(r);
    expect(await f.plan.finish(f.j)).toEqual(r);
    await expect(f.plan.mutate("dispatch", f.j)).rejects.toThrow("PDF_UPLOAD_CLOSED");
    await admin.lease.query(
      "UPDATE public.trip_source_pdf_upload_config SET enabled=true",
    );
  });
});
