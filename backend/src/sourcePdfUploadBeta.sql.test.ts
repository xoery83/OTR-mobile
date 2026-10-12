import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { session } from "./__fixtures__/tripCoreV2Sql";
import {
  betaPlan,
  betaExecute,
  betaProof,
  type BetaJournal,
} from "./__fixtures__/sourcePdfUploadBeta";
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
    plan: await betaPlan(owned!, actor, trip, source, original, bytes, mime),
  };
}
async function running() {
  const f = await seed();
  let j: BetaJournal = (await f.plan.begin()).journal;
  j = await betaExecute(owned!, j, "STAGE", {
    sha256: pdfHash(bytes),
    byteCount: bytes.length,
    evidenceSha256: "e".repeat(64),
  });
  j = await betaExecute(owned!, j, "DISPATCH");
  return { ...f, j };
}
async function closure(f: Awaited<ReturnType<typeof running>>) {
  f.j = await betaExecute(owned!, f.j, "ACK", await betaProof(owned!, f.j, "ACK"));
  f.j = await betaExecute(owned!, f.j, "GET", await betaProof(owned!, f.j, "GET"));
  return f;
}
async function operational(f: Awaited<ReturnType<typeof running>>) {
  return (
    await admin.lease.query(
      "SELECT a.phase,a.termination_outstanding,a.terminal_result,a.terminal_evidence_sha256,o.phase AS source_phase,o.io_finished_at,s.cleaned_at FROM trip_source_execution_attempts a JOIN trip_source_operations o ON o.id=a.operation_id JOIN trip_source_staged_resources s ON s.id=a.staged_resource_id WHERE a.id=$1::uuid",
      [f.j.id],
    )
  ).rows[0];
}
describe.skipIf(!owned)("CLOSED Beta custody authority", () => {
  beforeAll(async () => {
    admin = session(owned!);
    await admin.lease.query(
      "ALTER TABLE trip_source_command_gate DROP CONSTRAINT trip_source_gate_closed",
    );
    await admin.lease.query(
      "ALTER TABLE trip_source_pdf_gate DROP CONSTRAINT trip_source_pdf_gate_enabled_check",
    );
    await admin.lease.query(
      "ALTER TABLE trip_source_pdf_upload_config DROP CONSTRAINT source_pdf_beta_closed",
    );
    await admin.lease.query("UPDATE trip_source_command_gate SET enabled=true");
    await admin.lease.query("UPDATE trip_source_pdf_gate SET enabled=true");
    await admin.lease.query(
      "UPDATE trip_source_pdf_upload_config SET beta_enabled=true,account_stages=256,global_stages=4096",
    );
  });
  afterAll(async () => {
    if (!admin) return;
    await admin.lease.query(
      "UPDATE trip_source_pdf_upload_config SET beta_enabled=false",
    );
    await admin.lease.query("UPDATE trip_source_pdf_gate SET enabled=false");
    await admin.lease.query("UPDATE trip_source_command_gate SET enabled=false");
    admin.close();
  });
  it("complete ACK and independent GET seal logical PENDING, preserve remote debt and receipt-first recovery", async () => {
    const f = await closure(await running());
    const receipt = await f.plan.finish(f.j);
    expect(receipt).toMatchObject({
      outcome: "APPLIED",
      result_remote_state: "PENDING",
      result_verified_at: null,
    });
    expect(await f.plan.finish({ ...f.j, owner_fence: 999 })).toEqual(receipt);
    expect((await f.plan.begin()).receipt).toEqual(receipt);
    expect(await operational(f)).toMatchObject({
      phase: "RUNNING",
      termination_outstanding: true,
      terminal_result: null,
      terminal_evidence_sha256: null,
      source_phase: "FINAL",
      io_finished_at: null,
      cleaned_at: null,
    });
  });
  it("lost ACK response is recovered from immutable journal without redispatch", async () => {
    const f = await running();
    const ack = await betaProof(owned!, f.j, "ACK");
    await betaExecute(owned!, f.j, "ACK", ack);
    expect((await f.plan.begin()).journal.pdf_beta_ack).toEqual(ack);
    f.j = await betaExecute(owned!, f.j, "ACK", ack);
    await expect(betaExecute(owned!, f.j, "DISPATCH")).rejects.toThrow();
    f.j = await betaExecute(owned!, f.j, "GET", await betaProof(owned!, f.j, "GET"));
    expect((await f.plan.finish(f.j)).outcome).toBe("APPLIED");
  });
  it("matching GET without ACK and ambiguous absence remain UNKNOWN, no automatic retry or VERIFY", async () => {
    const f = await running();
    f.j = await betaExecute(owned!, f.j, "UNKNOWN");
    await expect(
      betaExecute(owned!, f.j, "GET", await betaProof(owned!, f.j, "GET")),
    ).rejects.toThrow("PDF_BETA_ACK_REQUIRED");
    await expect(f.plan.finish(f.j)).rejects.toThrow("PDF_BETA_CUSTODY_INCOMPLETE");
    await expect(betaExecute(owned!, f.j, "DISPATCH")).rejects.toThrow();
    expect(await operational(f)).toMatchObject({
      phase: "UNKNOWN",
      source_phase: "IO_UNKNOWN",
      termination_outstanding: true,
    });
    expect(
      (
        await admin.lease.query(
          "SELECT count(*)::int AS n FROM itinerary_events WHERE trip_id=$1::uuid",
          [trip],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("delayed same-content writer with no ACK never becomes terminal proof", async () => {
    const f = await running();
    const provider = new SyntheticPdfProvider();
    const delayed = provider.start(f.j, bytes);
    f.j = await betaExecute(owned!, f.j, "UNKNOWN");
    delayed();
    await expect(f.plan.finish(f.j)).rejects.toThrow();
    expect(provider.object().sha256).toBe(pdfHash(bytes));
    expect(await operational(f)).toMatchObject({
      termination_outstanding: true,
      terminal_result: null,
      source_phase: "IO_UNKNOWN",
    });
  });
  it.each([
    "issuer",
    "binding",
    "ownerRun",
    "ownerFence",
    "dispatchId",
    "evidenceSha256",
    "uploadVersion",
    "observedAt",
  ])("rejects wrong ACK %s", async (field) => {
    const f = await running();
    const overrides: Record<string, Json> = {
      [field]:
        field === "observedAt"
          ? null
          : field === "binding"
            ? { ...f.j.pdf_binding, producerId: randomUUID() }
            : field === "ownerFence" || field === "uploadVersion"
              ? 99
              : field === "evidenceSha256"
                ? "f".repeat(64)
                : randomUUID(),
    };
    const proof = await betaProof(owned!, f.j, "ACK", overrides);
    if (field === "evidenceSha256") proof.evidenceSha256 = "f".repeat(64);
    await expect(betaExecute(owned!, f.j, "ACK", proof)).rejects.toThrow(
      "PDF_BETA_PROOF_CONFLICT",
    );
  });
  it.each([
    "truncated",
    "duplicate-key",
    "wrong-key",
    "wrong-length",
    "wrong-hash",
    "upsert",
    "incomplete",
    "non200",
  ])("rejects %s complete response evidence", async (kind) => {
    const f = await running();
    const proof = await betaProof(owned!, f.j, "ACK");
    if (!("response" in proof)) throw Error("ACK_FIXTURE_REQUIRED");
    const response = { ...proof.response };
    if (kind === "truncated") response.body = "{";
    if (kind === "duplicate-key")
      response.body = response.body.replace("{", '{"Key":"wrong",');
    if (kind === "wrong-key")
      response.body = JSON.stringify({ Key: "private/other", Id: randomUUID() });
    if (kind === "wrong-length") response.bodyByteCount++;
    if (kind === "wrong-hash") response.bodySha256 = "a".repeat(64);
    if (kind === "upsert") response.upsert = true;
    if (kind === "incomplete") response.transportComplete = false;
    if (kind === "non200") response.status = 201;
    if (kind === "truncated" || kind === "wrong-key" || kind === "duplicate-key") {
      response.bodySha256 = pdfHash(new TextEncoder().encode(response.body));
      response.bodyByteCount = Buffer.byteLength(response.body);
    }
    await expect(
      betaExecute(owned!, f.j, "ACK", await betaProof(owned!, f.j, "ACK", { response })),
    ).rejects.toThrow();
    await expect(f.plan.finish(f.j)).rejects.toThrow();
  });
  it.each(["sha256", "byteCount", "mimeType", "cacheBypassed", "readId"])(
    "rejects changed retained GET %s",
    async (field) => {
      const f = await running();
      f.j = await betaExecute(owned!, f.j, "ACK", await betaProof(owned!, f.j, "ACK"));
      const p = await betaProof(owned!, f.j, "GET");
      if (!("read" in p)) throw Error("GET_FIXTURE_REQUIRED");
      const read = {
        ...p.read!,
        [field]:
          field === "byteCount"
            ? 1
            : field === "cacheBypassed"
              ? false
              : field === "readId"
                ? f.j.pdf_dispatch_id
                : "b".repeat(64),
      };
      await expect(
        betaExecute(owned!, f.j, "GET", await betaProof(owned!, f.j, "GET", { read })),
      ).rejects.toThrow("PDF_BETA_GET_INVALID");
    },
  );
  it("immutable ACK/GET cannot be replaced with a new valid receipt", async () => {
    const f = await closure(await running());
    await expect(
      betaExecute(owned!, f.j, "ACK", await betaProof(owned!, f.j, "ACK")),
    ).rejects.toThrow("PDF_BETA_IMMUTABLE");
    await expect(
      betaExecute(owned!, f.j, "GET", await betaProof(owned!, f.j, "GET")),
    ).rejects.toThrow("PDF_BETA_IMMUTABLE");
  });
  it("takeover preserves ACK, fences old owner, permits new GET but not a write", async () => {
    const f = await running();
    f.j = await betaExecute(owned!, f.j, "ACK", await betaProof(owned!, f.j, "ACK"));
    const old = f.j;
    f.j = await uploadRpc(
      owned!,
      "trip_source_pdf_beta_claim",
      ["uuid", "bigint", "uuid"],
      [old.id, old.owner_fence, randomUUID()],
    );
    expect(f.j.pdf_beta_ack).toEqual(old.pdf_beta_ack);
    await expect(
      betaExecute(owned!, old, "GET", await betaProof(owned!, old, "GET")),
    ).rejects.toThrow("PDF_BETA_OWNER_CONFLICT");
    await expect(betaExecute(owned!, f.j, "DISPATCH")).rejects.toThrow();
    f.j = await betaExecute(owned!, f.j, "GET", await betaProof(owned!, f.j, "GET"));
    expect((await f.plan.finish(f.j)).outcome).toBe("APPLIED");
  });
  it("concurrent workers get one dispatch; duplicate plan reuses journal", async () => {
    const f = await seed();
    const j = (await f.plan.begin()).journal;
    await betaExecute(owned!, j, "STAGE", {
      sha256: pdfHash(bytes),
      byteCount: bytes.length,
      evidenceSha256: "e".repeat(64),
    });
    const out = await Promise.allSettled([
      betaExecute(owned!, j, "DISPATCH"),
      betaExecute(owned!, j, "DISPATCH"),
    ]);
    expect(out.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await f.plan.begin()).journal.id).toBe(j.id);
  });
  it("new operation ID cannot bypass unresolved plan or dispatched immutable key", async () => {
    const f = await running();
    const blocked = await betaPlan(owned!, actor, trip, f.source, f.original, bytes);
    await expect(blocked.begin()).rejects.toThrow("SOURCE_IO_UNAVAILABLE");
    await closure(f);
    await f.plan.finish(f.j);
    const second = await betaPlan(owned!, actor, trip, f.source, f.original, bytes);
    await expect(second.begin()).rejects.toThrow("PDF_UPLOAD_EPOCH_USED");
  });
  it.each(["source", "representation", "actor", "trip"])(
    "stale/revoked %s authority blocks completion",
    async (kind) => {
      const f = await closure(await running());
      if (kind === "source" || kind === "representation") {
        const table = kind === "source" ? "trip_sources" : "trip_source_representations";
        await admin.lease.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
        try {
          await admin.lease.query(
            `UPDATE ${table} SET row_revision=row_revision+1 WHERE id=$1::uuid`,
            [kind === "source" ? f.source : f.original],
          );
        } finally {
          await admin.lease.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
        }
        await expect(f.plan.finish(f.j)).rejects.toThrow();
      } else {
        const q = { ...f.plan.q, actor_account_id: randomUUID() };
        await expect(
          uploadRpc(
            owned!,
            "trip_source_pdf_beta_finish",
            ["uuid", "text", "uuid", "uuid", "bigint"],
            [
              q.actor_account_id,
              canonicalCoreJson(q),
              f.j.id,
              f.j.owner_run,
              f.j.owner_fence,
            ],
          ),
        ).rejects.toThrow();
      }
      expect(await operational(f)).toMatchObject({
        termination_outstanding: true,
        io_finished_at: null,
      });
    },
  );
  it.each(["trip_sources", "trip_source_representations"])(
    "revoked retained custody in %s blocks finish but preserves operational UNKNOWN",
    async (table) => {
      const f = await closure(await running());
      await admin.lease.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
      try {
        await admin.lease.query(
          `UPDATE ${table} SET retention_state='${table === "trip_sources" ? "IDENTITY_ONLY" : "PURGE_PENDING"}' WHERE id=$1::uuid`,
          [table === "trip_sources" ? f.source : f.original],
        );
      } finally {
        await admin.lease.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
      }
      await expect(f.plan.finish(f.j)).rejects.toThrow();
      f.j = await betaExecute(owned!, f.j, "UNKNOWN");
      expect(f.j.termination_outstanding).toBe(true);
    },
  );
  it("Trip membership revocation blocks current completion and private restart inventory", async () => {
    const f = await closure(await running());
    const tables = ["trip_members", "journey_members"];
    const saved: Record<string, unknown[]> = {};
    const owner = (
      await admin.lease.query("SELECT created_by FROM trips WHERE id=$1::uuid", [trip])
    ).rows[0].created_by;
    try {
      for (const table of tables) {
        await admin.lease.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
        saved[table] = (
          await admin.lease.query(
            `SELECT * FROM ${table} WHERE trip_id=$1::uuid AND user_id=$2::uuid`,
            [trip, actor],
          )
        ).rows;
        await admin.lease.query(
          `DELETE FROM ${table} WHERE trip_id=$1::uuid AND user_id=$2::uuid`,
          [trip, actor],
        );
      }
      if (owner === actor) {
        await admin.lease.query("ALTER TABLE trips DISABLE TRIGGER USER");
        await admin.lease.query(
          "UPDATE trips SET created_by='00000000-0000-4000-8000-000000000001' WHERE id=$1::uuid",
          [trip],
        );
      }
      await expect(f.plan.finish(f.j)).rejects.toThrow("SOURCE_ACCESS_DENIED");
      await expect(
        uploadRpc(
          owned!,
          "trip_source_pdf_beta_inventory",
          ["uuid", "uuid", "uuid"],
          [actor, trip, f.source],
        ),
      ).rejects.toThrow("NOT_VISIBLE");
      f.j = await betaExecute(owned!, f.j, "UNKNOWN");
    } finally {
      if (owner === actor) {
        await admin.lease.query(
          "UPDATE trips SET created_by=$1::uuid WHERE id=$2::uuid",
          [owner, trip],
        );
        await admin.lease.query("ALTER TABLE trips ENABLE TRIGGER USER");
      }
      for (const table of tables) {
        for (const row of saved[table] ?? [])
          await admin.lease.query(
            `INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table},$1::jsonb)`,
            [JSON.stringify(row)],
          );
        await admin.lease.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
      }
    }
    expect((await f.plan.finish(f.j)).outcome).toBe("APPLIED");
  });
  it("private inventory rejects other actor and SQL producer roles lack journal DML", async () => {
    const f = await running();
    await expect(
      uploadRpc(
        owned!,
        "trip_source_pdf_beta_inventory",
        ["uuid", "uuid", "uuid"],
        [randomUUID(), trip, f.source],
      ),
    ).rejects.toThrow("NOT_VISIBLE");
    for (const role of [
      "authenticated",
      "service_role",
      "otr_trip_source_command_gateway",
      "otr_trip_source_execution_gateway",
    ]) {
      expect(
        (
          await admin.lease.query(
            "SELECT has_table_privilege($1,'trip_source_execution_attempts','UPDATE') AS ok",
            [role],
          )
        ).rows[0].ok,
      ).toBe(false);
    }
  });
  it("strict v1 terminal/finish/cleanup reject Beta; debt is protected and consumes quota", async () => {
    const f = await closure(await running());
    await f.plan.finish(f.j);
    for (const name of [
      "trip_source_pdf_upload_release",
      "trip_source_pdf_upload_terminal",
    ]) {
      const types = [
        "uuid",
        "uuid",
        "bigint",
        ...(name.endsWith("terminal") ? ["jsonb"] : []),
      ];
      await expect(
        uploadRpc(owned!, name, types, [
          f.j.id,
          f.j.owner_run,
          f.j.owner_fence,
          ...(name.endsWith("terminal") ? ["{}"] : []),
        ]),
      ).rejects.toThrow();
    }
    await admin.lease.query("UPDATE trip_source_pdf_upload_config SET account_stages=1");
    try {
      const next = await seed();
      await expect(next.plan.begin()).rejects.toThrow("PDF_UPLOAD_QUOTA");
    } finally {
      await admin.lease.query(
        "UPDATE trip_source_pdf_upload_config SET account_stages=256",
      );
    }
    expect(await operational(f)).toMatchObject({
      termination_outstanding: true,
      cleaned_at: null,
    });
  });
});
