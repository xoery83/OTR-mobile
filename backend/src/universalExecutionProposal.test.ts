import { createHash, randomUUID } from "node:crypto";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildSync } from "esbuild";
import { afterEach, expect, it, vi } from "vitest";
import { buildUniversalExecutionProposal } from "./universalExecutionProposal";
import { intelligenceWakeIdentity } from "../../src/data/sync/syncOperationRepository";
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function fixture() {
  const actor = randomUUID(),
    trip = randomUUID(),
    batch = randomUUID();
  const originals = new Map<string, Buffer>();
  const inputs = [
    "Booked a room in Auckland\r\nName: 测试QA",
    "Confirmed rail journey Auckland to Wellington",
    "Meet for a museum walk in Auckland",
  ].map((text, ordinal) => {
    const id = randomUUID(),
      bytes = Buffer.from(text);
    originals.set(id, bytes);
    return {
      inputId: id,
      ordinal,
      kind: ordinal === 2 ? "TEXT" : "FILE",
      acquisitionSource: ordinal === 2 ? "magic_input" : "files",
      originalFilename:
        ordinal === 2 ? null : ordinal === 0 ? "行程.txt" : "supplement.txt",
      byteCount: bytes.length,
      sha256: hash(bytes),
      bindingId: randomUUID(),
      sourceState: "PREPARED",
      queueOperationId: randomUUID(),
      sourceCommandPin: {
        profile: ordinal === 2 ? "OTR_SUBMITTED_TEXT_V1" : "OTR_UTF8_TEXT_FILE_V1",
        actorId: actor,
        tripId: trip,
        sourceId: randomUUID(),
        representationId: randomUUID(),
        operationId: randomUUID(),
        operationKey: randomUUID(),
        operationSha256: "a".repeat(64),
      },
    };
  });
  const receipt = {
    version: "otr.native.universal-pin-proposal/1",
    qualification: "LOCAL_C3_AND_EXISTING_COMMANDS_ONLY_NOT_SOURCE_PROOF",
    accountId: actor,
    tripId: trip,
    batchId: batch,
    jobId: randomUUID(),
    submissionSha256: "b".repeat(64),
    inputs,
  };
  const ids = {
    taskId: randomUUID(),
    runId: randomUUID(),
    attemptId: randomUUID(),
    callId: randomUUID(),
    logicalRequestId: randomUUID(),
    logicalIdempotencyKey: randomUUID(),
    requestId: randomUUID(),
    idempotencyKey: randomUUID(),
    requestMaterialReference: randomUUID(),
    fallbackChainId: randomUUID(),
    runInputIds: inputs.map((input) => input.inputId),
  };
  const facts = {
    integrationId: "ISOLATED_ONLY",
    configVersion: 2,
    configurationSha256: "c".repeat(64),
    providerConfigId: randomUUID(),
    priceScheduleId: randomUUID(),
    providerId: "DeepSeek",
    modelId: "deepseek-flash",
    modelVersion: "DeepSeek-V4.1-Flash",
    adapterVersion: "ISOLATED_ONLY",
    region: "ISOLATED_ONLY",
    route: "ISOLATED_ONLY",
    startsAt: "2026-10-25T00:00:00.000Z",
    expiresAt: "2026-10-25T00:10:00.000Z",
  };
  return { receipt, ids, facts, originals };
}
afterEach(() => vi.unstubAllGlobals());
it("seals deterministic proposed pins with existing schemas/request/profile/wake, without network or proof claims", async () => {
  const f = fixture();
  const fetch = vi.fn(() => {
    throw Error("NO_NETWORK");
  });
  vi.stubGlobal("fetch", fetch);
  const a = await buildUniversalExecutionProposal(f.receipt, f.ids, f.facts, f.originals),
    b = await buildUniversalExecutionProposal(f.receipt, f.ids, f.facts, f.originals);
  expect(a).toEqual(b);
  expect(a.qualification).toContain("PROPOSED");
  expect(a.sourceProofRequired && a.taskReceiptRequired).toBe(true);
  expect(a.task.sync_operation_id).toBeNull();
  expect(a.attempt.usage_correlation_id).toBe(f.ids.callId);
  expect(a.sourceScope.source_command_pins).toEqual(
    f.receipt.inputs.map((i) => i.sourceCommandPin),
  );
  expect(a.attempt.sync_operation_id).toBe(
    await intelligenceWakeIdentity(
      {
        version: 1,
        account_id: f.receipt.accountId,
        task_id: f.ids.taskId,
        expected_publication_fence: 1,
        wake_reason: "REEVALUATE",
      },
      async (b) => hash(b),
    ),
  );
  expect(a.sourceScope.input_sha256).not.toBe(a.task.input_sha256);
  expect(a.providerScope.model_binding.request.input.sha256).toBe(
    a.attempt.request_material_sha256,
  );
  fetch.mock.calls.length && expect.fail("network");
  expect(JSON.stringify(a)).not.toContain("Booked a room");
  expect(a.runtimePublic).not.toHaveProperty("bearer");
});
it("keeps a legal BOM original unchanged and refuses when frozen preflight is not READY", async () => {
  const f = fixture(),
    i = f.receipt.inputs[0],
    bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), f.originals.get(i.inputId)!]);
  f.originals.set(i.inputId, bytes);
  i.byteCount = bytes.length;
  i.sha256 = hash(bytes);
  await expect(
    buildUniversalExecutionProposal(f.receipt, f.ids, f.facts, f.originals),
  ).rejects.toThrow("ORIGINAL_PREFLIGHT_NOT_READY");
  expect(f.originals.get(i.inputId)).toEqual(bytes);
});
it.each(["bytes", "actor", "profile", "ordinal", "ids", "facts", "window"])(
  "rejects changed %s before sealing",
  async (kind) => {
    const f = fixture();
    if (kind === "bytes")
      f.originals.set(f.receipt.inputs[0].inputId, Buffer.from("changed"));
    if (kind === "actor") f.receipt.inputs[0].sourceCommandPin.actorId = randomUUID();
    if (kind === "profile")
      f.receipt.inputs[0].sourceCommandPin.profile = "OTR_SUBMITTED_TEXT_V1";
    if (kind === "ordinal") f.receipt.inputs[0].ordinal = 1;
    if (kind === "ids") f.ids.callId = f.ids.taskId;
    if (kind === "facts") (f.facts as unknown as { region: null }).region = null;
    if (kind === "window") f.facts.expiresAt = "2026-10-25T00:15:00.000Z";
    await expect(
      buildUniversalExecutionProposal(f.receipt, f.ids, f.facts, f.originals),
    ).rejects.toThrow();
  },
);
it("actual no-network CLI seals only exact receipt hash, refuses overwrite, leaves no output for changed receipt", () => {
  const root = mkdtempSync(join(tmpdir(), "otr-universal-sealer-"));
  chmodSync(root, 0o700);
  try {
    const f = fixture(),
      bundle = join(root, "sealer.mjs");
    buildSync({
      entryPoints: ["scripts/import/seal-universal-execution.ts"],
      bundle: true,
      platform: "node",
      target: "node24",
      format: "esm",
      alias: { "@": "./src" },
      external: ["react-native", "expo-*"],
      outfile: bundle,
      banner: {
        js: 'import { createRequire } from "node:module"; const require=createRequire(import.meta.url);',
      },
    });
    const receipt = Buffer.from(JSON.stringify(f.receipt));
    writeFileSync(join(root, "receipt.json"), receipt);
    writeFileSync(join(root, "ids.json"), JSON.stringify(f.ids));
    writeFileSync(join(root, "facts.json"), JSON.stringify(f.facts));
    const paths: Record<string, string> = {};
    for (const [id, bytes] of f.originals) {
      paths[id] = join(root, id + ".txt");
      writeFileSync(paths[id], bytes);
    }
    writeFileSync(join(root, "paths.json"), JSON.stringify(paths));
    const args = [
      bundle,
      "--seal-proposed",
      join(root, "receipt.json"),
      hash(receipt),
      join(root, "ids.json"),
      join(root, "facts.json"),
      join(root, "paths.json"),
      join(root, "proposal.json"),
    ];
    let r = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(
      JSON.parse(readFileSync(join(root, "proposal.json"), "utf8")).qualification,
    ).toContain("PROPOSED");
    r = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(r.status).toBe(2);
    args[3] = "0".repeat(64);
    args[7] = join(root, "refused.json");
    r = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(existsSync(args[7])).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);

it("preserves actual Native input identities through owning Run inputs and Results", async () => {
  const f = fixture();
  const output = await buildUniversalExecutionProposal(
    f.receipt,
    f.ids,
    f.facts,
    f.originals,
  );
  expect(output.runInputProposal.map((input) => input.id)).toEqual(
    f.receipt.inputs.map((input) => input.inputId).sort(),
  );
  expect(output.task.input_pins.map((pin) => pin.input_id)).toEqual(
    f.receipt.inputs.map((input) => input.inputId).sort(),
  );
  f.ids.runInputIds[0] = randomUUID();
  await expect(
    buildUniversalExecutionProposal(f.receipt, f.ids, f.facts, f.originals),
  ).rejects.toThrow("ACTUAL_SOURCE_INPUT_BINDING_CHANGED");
});
