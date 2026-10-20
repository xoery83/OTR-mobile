import { build } from "esbuild";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { session } from "./__fixtures__/tripCoreV2Sql";
import { causalPlan } from "./__fixtures__/sourcePdfUploadCausal";
import {
  createSourcePdfCausalAuthority,
  type PdfCausalOwner,
} from "./sourcePdfCausalAuthority";
import { createSourcePdfBackendPreparation } from "./sourcePdfBackendPreparation";
import { createSourcePdfPrivateStage } from "./sourcePdfPrivateStage";
import { createSourcePdfStorageProducer } from "./sourcePdfStorageProducer";
import { encodeProfilePdf, pdfHash } from "./sourcePdfProfile";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { DevBackendGateway } from "./app";
const owned = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
const actor = "00000000-0000-4000-8000-000000000002",
  trip = "10000000-0000-4000-8000-000000000001";
const bytes = encodeProfilePdf(["NZ1 AKL CHC", "NZ2 CHC AKL"]);
let admin: ReturnType<typeof session>;
const roots: string[] = [],
  servers: http.Server[] = [];
const connection: CorePgConnection = {
  async withLease(work) {
    const s = session(owned!);
    try {
      await s.lease.query("SET SESSION AUTHORIZATION otr_trip_source_command_gateway");
      return await work(s.lease);
    } finally {
      s.close();
    }
  },
};
async function setup(mode = "good") {
  let posts = 0,
    gets = 0,
    cache: string | undefined;
  let behavior = mode;
  const server = http.createServer((req, res) => {
    if (req.method === "POST") {
      posts++;
      const parts: Buffer[] = [];
      req.on("data", (x) => parts.push(x));
      req.on("end", () => {
        if (!Buffer.concat(parts).equals(Buffer.from(bytes))) {
          res.writeHead(400);
          res.end();
          return;
        }
        if (behavior === "lostack") return res.destroy();
        const body = JSON.stringify({
          Key: req.url!.replace(/^\/object\//, ""),
          Id: randomUUID(),
        });
        res.writeHead(200, {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        });
        res.end(body);
      });
    } else {
      gets++;
      cache = req.headers["cache-control"] as string;
      if (behavior === "getfail") return res.destroy();
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": bytes.length,
      });
      res.end(bytes);
    }
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as { port: number }).port;
  const config = {
    instanceId: "bounded-synthetic",
    origin: `http://127.0.0.1:${port}`,
    credentialRef: "synthetic-reference",
    serviceToken: "synthetic-only",
    timeoutMs: 500,
    localFixture: true as const,
  };
  const provider = createSourcePdfStorageProducer(config);
  const producerId = randomUUID();
  await admin.lease.query(
    "UPDATE trip_source_pdf_upload_config SET beta_producer_id=$1::uuid,beta_provider_instance_sha256=$2",
    [producerId, provider.configurationSha256],
  );
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
    "INSERT INTO public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) VALUES($1::uuid,$2::uuid,$3::uuid,$1,repeat('0',64),'FILE','FILES','UNKNOWN',clock_timestamp(),1,1)",
    [source, trip, actor],
  );
  await admin.lease.query(
    "INSERT INTO public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES($1::uuid,1,clock_timestamp(),$2::uuid,$1,repeat('0',64),ARRAY[$3::uuid],'AS_SUPPLIED','ACQUISITION')",
    [source, actor, original],
  );
  await admin.lease.query(
    "INSERT INTO public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,mime_type,payload_sha256,byte_count,regenerability,created_at,storage_provider,storage_bucket,object_key,remote_state) VALUES($1::uuid,1,$2::uuid,1,'ORIGINAL','BINARY','application/pdf',$3,$4,'NOT_APPLICABLE',clock_timestamp(),'supabase_storage','trip-source-material',$5,'PENDING')",
    [
      original,
      source,
      pdfHash(bytes),
      bytes.length,
      `v1/${trip}/${source}/${original}/payload`,
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
  const plan = await causalPlan(owned!, actor, trip, source, original, bytes);
  let generation = 1;
  const owner: PdfCausalOwner = {
    ownerRun: plan.identity.owner,
    producerId,
    providerInstanceSha256: provider.configurationSha256,
    accountGeneration: async () => generation,
  };
  const authority = createSourcePdfCausalAuthority(connection, owner);
  const resource = {
    attemptId: plan.identity.attempt,
    resourceId: plan.identity.resource,
    nodeId: plan.identity.node,
    resourceKey: plan.identity.resourceKey,
    runToken: plan.identity.runToken,
  };
  const raw = canonicalCoreJson(plan.q);
  const admitted = await authority.admit(actor, raw, 1, resource);
  const context = admitted.context!;
  const root = await mkdtemp(join(tmpdir(), "otr-causal-joined-"));
  roots.push(root);
  const stage = createSourcePdfPrivateStage(root);
  const gateway = {
    validateAccessToken: async (token: string) =>
      token === "synthetic-session" ? { id: actor } : null,
    canReadTrip: async () => true,
  } as unknown as DevBackendGateway;
  const compose = (a = authority) =>
    createSourcePdfBackendPreparation(
      gateway,
      a,
      createSourcePdfPrivateStage(root),
      provider,
    );
  const adapter = compose();
  const identity = {
    tripId: trip,
    sourceId: source,
    representationId: original,
    operationId: plan.q.operation_id,
    accountGeneration: 1,
  };
  const request = () =>
    new Request("http://127.0.0.1/internal-unregistered", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-session",
        "content-type": "application/pdf",
      },
      body: Buffer.from(bytes),
    });
  const facts = async () =>
    (
      await admin.lease.query(
        "SELECT a.phase,a.owner_fence,a.pdf_dispatch_id,a.pdf_beta_ack,a.pdf_beta_get,a.pdf_causal_read_permit,a.termination_outstanding,a.terminal_result,s.cleaned_at,s.release_authorized_at FROM trip_source_execution_attempts a JOIN trip_source_staged_resources s ON s.id=a.staged_resource_id WHERE a.id=$1::uuid",
        [context.binding.attemptId],
      )
    ).rows[0];
  return {
    owner,
    authority,
    context,
    resource,
    raw,
    adapter,
    compose,
    identity,
    request,
    facts,
    root,
    stage,
    provider,
    async restartProcess(hasAck: boolean) {
      const entry = join(root, "restart-process.mjs"),
        input = join(root, "restart-input.json");
      await build({
        entryPoints: ["backend/src/__fixtures__/sourcePdfCausalRestart.ts"],
        outfile: entry,
        bundle: true,
        platform: "node",
        target: "node24",
        format: "esm",
        banner: {
          js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);',
        },
      });
      await writeFile(
        input,
        JSON.stringify({
          fixture: owned,
          root,
          owner: { ...owner, ownerRun: randomUUID() },
          context,
          config,
          raw,
          hasAck,
        }),
        { mode: 0o600 },
      );
      const result = await promisify(execFile)(process.execPath, [entry, input], {
        timeout: 20000,
      });
      return JSON.parse(result.stdout.trim()) as {
        pid: number;
        ownerFence: number;
        writeDenied: boolean;
        read: string;
        receipt: unknown;
      };
    },
    counts: () => ({ posts, gets, cache }),
    behavior: (m: string) => {
      behavior = m;
    },
    generation: (n: number) => {
      generation = n;
    },
  };
}
describe.skipIf(!owned)("CLOSED Backend + Source V3 real RPC/HTTP join", () => {
  beforeAll(async () => {
    admin = session(owned!);
    for (const [t, c] of [
      ["trip_source_command_gate", "trip_source_gate_closed"],
      ["trip_source_pdf_gate", "trip_source_pdf_gate_enabled_check"],
      ["trip_source_pdf_upload_config", "source_pdf_causal_closed"],
    ])
      await admin.lease.query(`ALTER TABLE ${t} DROP CONSTRAINT ${c}`);
    await admin.lease.query("UPDATE trip_source_command_gate SET enabled=true");
    await admin.lease.query("UPDATE trip_source_pdf_gate SET enabled=true");
    await admin.lease.query(
      "UPDATE trip_source_pdf_upload_config SET causal_enabled=true,account_stages=256,global_stages=4096",
    );
  });
  afterEach(async () => {
    for (const s of servers.splice(0)) {
      s.closeAllConnections();
      await new Promise<void>((r) => s.close(() => r()));
    }
    for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
  });
  afterAll(async () => {
    if (admin) {
      await admin.lease.query(
        "UPDATE trip_source_pdf_upload_config SET causal_enabled=false",
      );
      await admin.lease.query("UPDATE trip_source_pdf_gate SET enabled=false");
      await admin.lease.query("UPDATE trip_source_command_gate SET enabled=false");
      admin.close();
    }
  });
  it("admission replay + stage + one POST + persisted ACK + committed READ + fresh GET + Source receipt, without cleanup", async () => {
    const f = await setup();
    expect((await f.authority.admit(actor, f.raw, 1, f.resource)).context).toEqual(
      f.context,
    );
    await f.adapter.ingress(f.request(), f.identity);
    const uploaded = await Promise.allSettled([
      f.adapter.upload(f.request(), f.identity),
      f.adapter.upload(f.request(), f.identity),
    ]);
    expect(uploaded.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(f.counts().posts).toBe(1);
    const before = await f.facts();
    expect(before.pdf_beta_ack).not.toBeNull();
    expect(before.pdf_beta_get).toBeNull();
    expect((await f.adapter.observeRetained(f.request(), f.identity)).kind).toBe("MATCH");
    expect(f.counts()).toMatchObject({ posts: 1, gets: 1, cache: "no-cache, no-store" });
    const now = await f.facts();
    expect(now.pdf_beta_get).toMatchObject({
      read: {
        ackEvidenceSha256: (now.pdf_beta_ack as { evidenceSha256: string })
          .evidenceSha256,
        readId: (now.pdf_causal_read_permit as { readId: string }).readId,
        cacheBypassed: true,
      },
    });
    expect(await f.authority.finish(f.context, f.raw)).toMatchObject({
      outcome: "APPLIED",
      result_remote_state: "PENDING",
      result_verified_at: null,
    });
    expect(await f.authority.finish({ ...f.context, ownerFence: 999 }, f.raw)).toEqual(
      await f.authority.finish(f.context, f.raw),
    );
    expect(await f.facts()).toMatchObject({
      phase: "RUNNING",
      termination_outstanding: true,
      terminal_result: null,
      cleaned_at: null,
      release_authorized_at: null,
    });
    expect((await f.adapter.observeRetained(f.request(), f.identity)).kind).toBe(
      "PERSISTED_GET",
    );
    expect(f.counts()).toMatchObject({ posts: 1, gets: 1 });
    expect((await stat(join(f.root, f.context.binding.resourceId))).mode & 0o777).toBe(
      0o400,
    );
  });
  it("lost ACK persists UNKNOWN; new owner/reopened stage cannot redispatch or GET without ACK", async () => {
    const f = await setup("lostack");
    await f.adapter.ingress(f.request(), f.identity);
    expect((await f.adapter.upload(f.request(), f.identity)).kind).toBe("UNKNOWN");
    const restarted = await f.restartProcess(false);
    expect(restarted.pid).not.toBe(process.pid);
    expect(restarted).toMatchObject({
      ownerFence: 2,
      writeDenied: true,
      read: "ACK_REQUIRED",
      receipt: null,
    });
    expect(f.counts()).toMatchObject({ posts: 1, gets: 0 });
    expect(await f.facts()).toMatchObject({
      phase: "UNKNOWN",
      pdf_beta_ack: null,
      pdf_beta_get: null,
      termination_outstanding: true,
      cleaned_at: null,
      release_authorized_at: null,
    });
    await expect(f.authority.finish(f.context, f.raw)).rejects.toThrow(
      "PDF_BETA_OWNER_CONFLICT",
    );
  });
  it("ACK survives owner restart; stale owner is fenced and only ACK-bound GET may complete custody", async () => {
    const f = await setup();
    await f.adapter.ingress(f.request(), f.identity);
    await f.adapter.upload(f.request(), f.identity);
    const restarted = await f.restartProcess(true);
    expect(restarted.pid).not.toBe(process.pid);
    expect(restarted).toMatchObject({
      ownerFence: 2,
      writeDenied: true,
      read: "MATCH",
      receipt: { outcome: "APPLIED" },
    });
    await expect(f.authority.assertCurrent(f.context)).rejects.toThrow(
      "SOURCE_EXECUTION_FENCE_CONFLICT",
    );
    expect(f.counts()).toMatchObject({ posts: 1, gets: 1 });
    expect(await f.facts()).toMatchObject({
      phase: "UNKNOWN",
      owner_fence: 2,
      termination_outstanding: true,
      cleaned_at: null,
    });
  });
  it("GET failure is UNKNOWN and read-only retry preserves one upload and the persisted ACK", async () => {
    const f = await setup("getfail");
    await f.adapter.ingress(f.request(), f.identity);
    await f.adapter.upload(f.request(), f.identity);
    expect((await f.adapter.observeRetained(f.request(), f.identity)).kind).toBe(
      "UNAVAILABLE",
    );
    const failed = await f.facts();
    expect(failed.phase).toBe("UNKNOWN");
    expect(failed.pdf_beta_ack).not.toBeNull();
    expect(failed.pdf_beta_get).toBeNull();
    f.behavior("good");
    expect((await f.compose().observeRetained(f.request(), f.identity)).kind).toBe(
      "MATCH",
    );
    expect(f.counts()).toMatchObject({ posts: 1, gets: 2 });
  });
  it("generation change prevents staged ingress from producing a dispatch grant", async () => {
    const f = await setup();
    await f.adapter.ingress(f.request(), f.identity);
    f.generation(2);
    await expect(f.adapter.upload(f.request(), f.identity)).rejects.toThrow(
      "PDF_SCOPE_FORBIDDEN",
    );
    expect(f.counts().posts).toBe(0);
    expect(await f.facts()).toMatchObject({ phase: "STARTING", pdf_dispatch_id: null });
  });
  it("rejects an already-open transaction instead of treating nested BEGIN as a commit boundary", async () => {
    const f = await setup();
    const s = session(owned!);
    try {
      await s.lease.query("SET SESSION AUTHORIZATION otr_trip_source_command_gateway");
      await s.lease.query("BEGIN");
      const nested = createSourcePdfCausalAuthority(
        { withLease: (work) => work(s.lease) },
        f.owner,
      );
      await expect(nested.resolveReserved(actor, f.identity)).rejects.toThrow(
        "PDF_TOP_LEVEL_TRANSACTION_REQUIRED",
      );
    } finally {
      s.close();
    }
    expect(f.counts()).toMatchObject({ posts: 0, gets: 0 });
  });
});
