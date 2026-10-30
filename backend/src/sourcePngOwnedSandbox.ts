import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { PNG_DEV_X64_EXECUTION_PROFILE_SHA256 } from "../../src/domain/trip/sourcePngPreparation";
import {
  SOURCE_PNG_SANDBOX_IMAGE,
  sourcePngStorageBindingSchema,
  verifySourcePngSandboxObservation,
  type SourcePngStorageBinding,
} from "./sourcePngStorageProducer";
import {
  canonicalCoreJson,
  parseCoreJson,
  type Json,
} from "../../src/domain/trip/tripCoreV2Json";

const hash = (input: Uint8Array | string) =>
  createHash("sha256").update(input).digest("hex");
const execute = (args: string[], input?: string) =>
  new Promise<string>((resolve, reject) => {
    const child = execFile(
      "docker",
      args,
      {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production" },
        encoding: "utf8",
        timeout: 6000,
        killSignal: "SIGKILL",
        maxBuffer: 8192,
      },
      (error, stdout) =>
        error
          ? reject(
              Error(
                error.killed || error.code === "ETIMEDOUT"
                  ? "PNG_SANDBOX_TIMEOUT"
                  : "PNG_SANDBOX_UNAVAILABLE",
              ),
            )
          : resolve(stdout),
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
export type SourcePngExecutionOwner = {
  assertCurrent(binding: SourcePngStorageBinding): Promise<void>;
  attach(binding: SourcePngStorageBinding, containerId: string): Promise<void>;
  running(binding: SourcePngStorageBinding): Promise<void>;
  terminal(
    binding: SourcePngStorageBinding,
    observation: {
      containerId: string;
      observedAt: string;
      evidenceSha256: string;
      result:
        | "PARSE_PASS"
        | "FORMAT_REJECTED"
        | "PARSER_TIMEOUT"
        | "PARSER_CRASH"
        | "PARSER_PROTOCOL";
    },
  ): Promise<void>;
};

// Host-only adapter for the existing Source execution journal. No reservation or permission is issued here.
export function createSourcePngOwnedSandbox(
  directory: string,
  owner: SourcePngExecutionOwner,
) {
  if (!isAbsolute(directory) || directory.includes("\0") || directory.includes(","))
    throw Error("PNG_STAGE_INVALID");
  return async (raw: SourcePngStorageBinding, supplied: Uint8Array) => {
    const binding = sourcePngStorageBindingSchema.parse(raw),
      bytes = Uint8Array.from(supplied);
    if (bytes.length !== binding.byteCount || hash(bytes) !== binding.sha256)
      throw Error("PNG_INPUT_IDENTITY");
    await owner.assertCurrent(binding);
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o777) !== 0o700 ||
      stat.uid !== process.getuid?.() ||
      (await realpath(directory)) !== directory
    )
      throw Error("PNG_STAGE_INVALID");
    const token = randomBytes(16).toString("hex"),
      name = "otr-source-png-" + token;
    // Disposable decoder input copy; the owning producer retains its canonical durable stage.
    const stage = await mkdtemp(join(directory, "png-")),
      path = join(stage, "input");
    let created = false,
      attached = false,
      cleaned = false;
    let containerId: string | undefined;
    let result: Json | undefined;
    let failure: unknown;
    try {
      const file = await open(
        path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await chmod(path, 0o444);
      await owner.assertCurrent(binding);
      const output = await execute([
        "create",
        "--name",
        name,
        "--label",
        "org.otr.png-owner=" + token,
        "--label",
        "org.otr.png-attempt=" + binding.attemptId,
        "--label",
        "org.otr.png-resource=" + binding.resourceId,
        "--label",
        "org.otr.png-operation=" + binding.operationId,
        "--platform=linux/amd64",
        "--pull=never",
        "--network=none",
        "--read-only",
        "--user=65534:65534",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--cpus=1",
        "--memory=128m",
        "--memory-swap=128m",
        "--pids-limit=16",
        "--ulimit",
        "cpu=1:1",
        "--ulimit",
        "nofile=32:32",
        "--ulimit",
        "fsize=8388608:8388608",
        "--ulimit",
        "core=0:0",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
        "--mount",
        "type=bind,src=" + path + ",dst=/input,readonly",
        "-i",
        SOURCE_PNG_SANDBOX_IMAGE,
      ]);
      created = true;
      containerId = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(output.trim());
      await owner.attach(binding, containerId);
      attached = true;
      await owner.assertCurrent(binding);
      await owner.running(binding);
      await owner.assertCurrent(binding);
      const request = {
        protocol_version: 1,
        profile_version: 1,
        profile_sha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
        input_token: token,
        input_sha256: binding.sha256,
        byte_count: binding.byteCount,
        declared_mime: "image/png",
      };
      const stdout = await execute(
        ["start", "-a", "-i", containerId],
        JSON.stringify(request) + "\n",
      );
      if (Buffer.byteLength(stdout) > 4096) throw Error("PNG_SANDBOX_PROTOCOL");
      try {
        result = parseCoreJson(stdout, 4096);
      } catch {
        throw Error("PNG_SANDBOX_PROTOCOL");
      }
      if (JSON.stringify(result) + "\n" !== stdout) throw Error("PNG_SANDBOX_PROTOCOL");
    } catch (error) {
      failure = error;
    } finally {
      try {
        // A timed-out Docker client does not prove that its container stopped.
        const found = JSON.parse(await execute(["inspect", name]))[0];
        if (
          found?.Config?.Labels?.["org.otr.png-owner"] !== token ||
          !/^[a-f0-9]{64}$/.test(found?.Id) ||
          (containerId && found.Id !== containerId)
        )
          throw Error("PNG_SANDBOX_TERMINATION_UNKNOWN");
        containerId = found.Id;
        await execute(["rm", "--force", containerId!]);
        if (
          (
            await execute([
              "ps",
              "-a",
              "--filter",
              "name=^/" + name + "$",
              "--format",
              "{{.ID}}",
            ])
          ).trim()
        )
          throw Error("PNG_SANDBOX_TERMINATION_UNKNOWN");
        cleaned = true;
      } catch {
        // When create never returned, only an independent empty inventory proves no owned worker remains.
        if (!created) {
          try {
            cleaned = !(
              await execute([
                "ps",
                "-a",
                "--filter",
                "name=^/" + name + "$",
                "--format",
                "{{.ID}}",
              ])
            ).trim();
          } catch {
            cleaned = false;
          }
        }
      }
      if (!cleaned) throw Error("PNG_SANDBOX_TERMINATION_UNKNOWN");
      await rm(stage, { recursive: true });
    }
    if (!attached || !containerId) throw failure ?? Error("PNG_SANDBOX_PROTOCOL");
    let verified = false;
    let failureResult:
      "FORMAT_REJECTED" | "PARSER_TIMEOUT" | "PARSER_CRASH" | "PARSER_PROTOCOL" =
      failure instanceof Error && failure.message === "PNG_SANDBOX_TIMEOUT"
        ? "PARSER_TIMEOUT"
        : failure instanceof Error && failure.message === "PNG_SANDBOX_PROTOCOL"
          ? "PARSER_PROTOCOL"
          : "PARSER_CRASH";
    if (!failure) {
      try {
        const parsed = verifySourcePngSandboxObservation(bytes, {
          imageId: SOURCE_PNG_SANDBOX_IMAGE,
          terminated: true,
          result,
        });
        if (parsed.input_token !== token) throw Error("PNG_SANDBOX_PROTOCOL");
        verified = true;
      } catch (error) {
        failure = error;
        const rejected = z
          .strictObject({
            protocol_version: z.literal(1),
            profile_version: z.literal(1),
            profile_sha256: z.literal(PNG_DEV_X64_EXECUTION_PROFILE_SHA256),
            input_token: z.literal(token),
            input_sha256: z.literal(binding.sha256),
            byte_count: z.literal(binding.byteCount),
            actual_mime: z.null(),
            format: z.null(),
            facts: z.null(),
            status: z.enum([
              "FORMAT_MISMATCH",
              "FORMAT_AMBIGUOUS",
              "FORMAT_MALFORMED",
              "FORMAT_UNSUPPORTED",
              "FORMAT_RESOURCE_LIMIT",
            ]),
          })
          .safeParse(result);
        failureResult = rejected.success ? "FORMAT_REJECTED" : "PARSER_PROTOCOL";
      }
    }
    await owner.terminal(binding, {
      containerId,
      observedAt: new Date().toISOString().replace("Z", "000Z"),
      evidenceSha256: hash(
        canonicalCoreJson({
          binding,
          containerId,
          imageId: SOURCE_PNG_SANDBOX_IMAGE,
          terminated: true,
          result: result ?? null,
        }),
      ),
      result: verified ? "PARSE_PASS" : failureResult,
    });
    if (failure) throw failure;
    return { imageId: SOURCE_PNG_SANDBOX_IMAGE, terminated: true as const, result };
  };
}

// Negative-only physical cleanup for the already-owned attempt. It never writes a Source terminal.
export async function terminateSourcePngAttempt(raw: SourcePngStorageBinding) {
  const b = sourcePngStorageBindingSchema.parse(raw);
  const filters = [
    "--filter",
    "label=org.otr.png-attempt=" + b.attemptId,
    "--filter",
    "label=org.otr.png-resource=" + b.resourceId,
    "--filter",
    "label=org.otr.png-operation=" + b.operationId,
  ];
  const inventory = async () =>
    (await execute(["ps", "-a", "-q", "--no-trunc", ...filters]))
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const ids = await inventory();
  if (ids.length > 1 || ids.some((id) => !/^[a-f0-9]{64}$/.test(id)))
    throw Error("PNG_SANDBOX_TERMINATION_UNKNOWN");
  for (const id of ids) {
    const found = JSON.parse(await execute(["inspect", id]))[0];
    const labels = found?.Config?.Labels,
      token = labels?.["org.otr.png-owner"];
    if (
      found?.Id !== id ||
      found?.Image !== SOURCE_PNG_SANDBOX_IMAGE ||
      !/^[a-f0-9]{32}$/.test(token) ||
      found?.Name !== "/otr-source-png-" + token ||
      labels["org.otr.png-attempt"] !== b.attemptId ||
      labels["org.otr.png-resource"] !== b.resourceId ||
      labels["org.otr.png-operation"] !== b.operationId
    )
      throw Error("PNG_SANDBOX_TERMINATION_UNKNOWN");
    await execute(["rm", "--force", id]);
  }
  if ((await inventory()).length) throw Error("PNG_SANDBOX_TERMINATION_UNKNOWN");
  return { terminated: true as const };
}

// Read-only close proof for this fixed PNG worker namespace; never selects deletion targets.
export async function inventorySourcePngAttempts(): Promise<readonly string[]> {
  const ids = (
    await execute([
      "ps",
      "-a",
      "-q",
      "--no-trunc",
      "--filter",
      "label=org.otr.png-owner",
      "--filter",
      "ancestor=" + SOURCE_PNG_SANDBOX_IMAGE,
    ])
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (ids.some((id) => !/^[a-f0-9]{64}$/.test(id)))
    throw Error("PNG_SANDBOX_INVENTORY_UNKNOWN");
  return Object.freeze(ids);
}
