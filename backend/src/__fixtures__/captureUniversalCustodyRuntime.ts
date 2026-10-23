// Disposable network-none Linux proof. Synthetic Storage transport, actual private
// file loader/anchored custody/HTTP; no Hosted, Auth or Provider claim.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, stat, writeFile, chown, readdir } from "node:fs/promises";
import {
  loadDevCaptureCustody,
  captureCustodyRuntimePath,
} from "../captureCustodyRuntime";
import { captureCustodyBoundary } from "../captureCustodyHttp";
import { type CaptureMaterialBinding } from "../../../src/domain/capture/captureCustody";

export async function runCaptureUniversalCustodyFixture() {
  const directory = "/var/lib/otr/capture-custody";
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await mkdir("/run/otr", { recursive: true, mode: 0o700 });
  const st = await stat(directory),
    identity = { store_id: randomUUID(), device: String(st.dev), inode: String(st.ino) };
  await writeFile(
    directory + "/store-identity.json",
    JSON.stringify({ version: 1, store_id: identity.store_id }),
    { mode: 0o600 },
  );
  const accountId = randomUUID(),
    batchId = randomUUID(),
    jobId = randomUUID();
  const originals = [
    new TextEncoder().encode("周一：博物馆。\nKeep my wording."),
    new TextEncoder().encode("%PDF-1.4\nsynthetic container"),
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    new TextEncoder().encode("\ufeff原始 .txt 文件。\r\nKeep CRLF."),
  ];
  const inputs = originals.map((bytes, n) => ({
    version: 2 as const,
    originalFilename: n === 1 ? "synthetic.pdf" : n === 3 ? "synthetic.txt" : null,
    accountId,
    batchId,
    jobId,
    inputId: randomUUID(),
    inputRevision: 3,
    captureId: randomUUID(),
    payloadId: randomUUID(),
    captureRevision: 1,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteCount: bytes.length,
    mediaType: (["text/plain", "application/pdf", "image/png", "text/plain"] as const)[n],
    kind: (["TEXT", "FILE", "IMAGE", "FILE"] as const)[n],
    acquisitionSource: (["magic_input", "files", "clipboard", "files"] as const)[n],
  }));
  // Per-input correlation remains exact despite this batch containing N originals.
  const batch = { version: 2, batchId, jobId, inputs };
  const config = {
    version: 2,
    directory,
    identity,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    batch,
  };
  await writeFile(captureCustodyRuntimePath, JSON.stringify(config), { mode: 0o440 });
  await chown(captureCustodyRuntimePath, 0, 999);
  const stored = new Map<string, { bytes: Uint8Array; media: string }>();
  let storageCreates = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const key = new URL(String(url)).pathname;
    assert.equal(init?.redirect, "error");
    if (init?.method === "POST") {
      assert.equal((init.headers as Record<string, string>)["x-upsert"], "false");
      assert.equal(stored.has(key), false);
      stored.set(key, {
        bytes: new Uint8Array(init.body as ArrayBuffer).slice(),
        media: (init.headers as Record<string, string>)["Content-Type"],
      });
      storageCreates++;
      return Response.json({ Id: randomUUID() });
    }
    const value = stored.get(key.replace("/object/authenticated/", "/object/"));
    return value
      ? new Response(Uint8Array.from(value.bytes), {
          headers: {
            "Content-Type": value.media,
            "Content-Length": String(value.bytes.length),
          },
        })
      : new Response(null, { status: 404 });
  };
  const environment = {
    OTR_DEV_BACKEND_NETWORK_MODE: "host",
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_SUPABASE_SECRET_KEY: "synthetic-never-sent-to-network",
  };
  let runtime = await loadDevCaptureCustody(environment);
  assert.ok(runtime);
  const http = async (binding: CaptureMaterialBinding, bytes?: Uint8Array) =>
    captureCustodyBoundary(
      new Request(
        `https://fixture.invalid/v2/capture-inputs/${binding.inputId}/material`,
        {
          method: bytes ? "PUT" : "GET",
          headers: {
            "X-OTR-Capture-Binding": JSON.stringify(binding),
            ...(bytes
              ? {
                  "Content-Type": binding.mediaType,
                  "Content-Length": String(bytes.length),
                }
              : {}),
          },
          ...(bytes ? { body: Uint8Array.from(bytes).buffer } : {}),
        },
      ),
      accountId,
      runtime!.captureMaterialCustody,
    );
  try {
    for (let n = 0; n < inputs.length; n++) {
      const response = await http(inputs[n], originals[n]);
      assert.equal(response.status, 200);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), originals[n]);
    }
    assert.equal(storageCreates, 4);
    // Native ACK-loss replay uses the exact same storage object and immutable binding.
    assert.equal((await http(inputs[0], originals[0])).status, 200);
    assert.equal(storageCreates, 4);
    await runtime!.close();
    runtime = await loadDevCaptureCustody(environment);
    assert.ok(runtime);
    for (let n = 0; n < inputs.length; n++) {
      const response = await http(inputs[n]);
      assert.equal(response.status, 200);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), originals[n]);
    }
    assert.equal((await http({ ...inputs[0], captureId: randomUUID() })).status, 409);
    assert.equal((await http({ ...inputs[0], accountId: randomUUID() })).status, 403);
    assert.equal(
      (
        await http({
          ...inputs[0],
          version: 1,
          mediaType: "application/pdf",
        } as unknown as CaptureMaterialBinding)
      ).status,
      422,
    );
    const files = await readdir(directory);
    assert.equal(files.filter((n) => n.startsWith("capture-input-")).length, 4);
    assert.equal(files.filter((n) => n.startsWith("material-")).length, 0);
    await runtime!.close();
    runtime = undefined;
    config.expiresAt = new Date(Date.now() - 1000).toISOString();
    await writeFile(captureCustodyRuntimePath, JSON.stringify(config));
    await assert.rejects(loadDevCaptureCustody(environment), /RUNTIME_UNAVAILABLE/);
    return {
      status: "LOCAL_LINUX_CUSTODY_V2_PASS",
      checks: 9,
      originals: 4,
      storageCreates,
      rawAudioOrProviderCalls: 0,
      storage: "SYNTHETIC_IN_PROCESS_HTTPS_TRANSPORT",
      hostedWrites: 0,
      auth: "NOT_TESTED",
      sourceRegistration: "NOT_TESTED",
    };
  } finally {
    await runtime?.close();
    globalThis.fetch = originalFetch;
  }
}
