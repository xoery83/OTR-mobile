import {
  lstatSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { DiagnosticTrace } from "../../src/native/importWorkbenchRun";

export const PRIVATE_ROOT = "/private/tmp/otr-import-workbench-private-20261016";
export const idSchema = z.string().uuid();
export const mediaSchema = z.enum([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
]);
export const inputSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(180),
  mediaType: mediaSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteCount: z.number().int().min(1).max(10485760),
});
export type Input = z.infer<typeof inputSchema>;
export const labelSchema = z.strictObject({
  kind: z.enum(["HUMAN_GROUND_TRUTH", "HYPOTHESIS"]),
  fields: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(200),
        raw: z.string().min(1).max(1000),
      }),
    )
    .max(500),
});
export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
export function fieldEvidence(trace: DiagnosticTrace) {
  return trace.result.fields
    .map((f) =>
      JSON.stringify({
        path: f.path,
        raw: f.raw,
        normalized: f.normalized,
        evidence: f.evidence,
      }),
    )
    .sort();
}
export function compare(a: DiagnosticTrace, b: DiagnosticTrace) {
  if (a.job.sha256 !== b.job.sha256 || a.job.byteCount !== b.job.byteCount)
    throw new Error("COMPARE_REQUIRES_SAME_BYTES");
  const x = fieldEvidence(a),
    y = fieldEvidence(b);
  return {
    sameOriginalBytes: true,
    sameTextSha256: a.textSha256 === b.textSha256,
    sameVersion: JSON.stringify(a.job.version) === JSON.stringify(b.job.version),
    removed: x.filter((v) => !y.includes(v)),
    added: y.filter((v) => !x.includes(v)),
    sameFieldEvidence: JSON.stringify(x) === JSON.stringify(y),
    modelChanged: JSON.stringify(a.model) !== JSON.stringify(b.model),
  };
}
export function statistics(trace: DiagnosticTrace, labels?: z.infer<typeof labelSchema>) {
  if (!labels || labels.kind !== "HUMAN_GROUND_TRUTH")
    return {
      status: "N/A",
      labelKind: labels?.kind ?? "NONE",
      reason: "No human ground truth; hypotheses are not accuracy labels.",
    };
  const actual = new Set(trace.result.fields.map((f) => JSON.stringify([f.path, f.raw])));
  const expected = new Set(labels.fields.map((f) => JSON.stringify([f.path, f.raw])));
  const tp = [...actual].filter((v) => expected.has(v)).length;
  return {
    status: "HUMAN_LABELLED",
    unit: "unique path/raw pairs; labels must be exhaustive",
    tp,
    fp: actual.size - tp,
    fn: expected.size - tp,
    precision: actual.size ? tp / actual.size : null,
    recall: expected.size ? tp / expected.size : null,
  };
}
export class PrivateStore {
  constructor(readonly root = PRIVATE_ROOT) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (lstatSync(root).isSymbolicLink() || realpathSync(root) !== root)
      throw new Error("PRIVATE_ROOT_INVALID");
    chmodSync(root, 0o700);
  }
  path(name: string) {
    if (!/^(?:[a-z0-9-]+\.(?:json|bytes)|native-runner|native-build-pin)$/.test(name))
      throw new Error("ARTIFACT_NAME_INVALID");
    const path = join(this.root, name);
    try {
      if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
        throw new Error("ARTIFACT_TYPE_INVALID");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return path;
  }
  save(name: string, value: unknown) {
    const path = this.path(name),
      temp = this.path(`${randomUUID()}.json`);
    writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
    renameSync(temp, path);
  }
  read(name: string) {
    return JSON.parse(readFileSync(this.path(name), "utf8"));
  }
  inputs(): Input[] {
    return readdirSync(this.root)
      .filter((v) => /^input-[a-f0-9-]+\.json$/.test(v))
      .map((v) => inputSchema.parse(this.read(v)));
  }
  add(bytes: Buffer, mediaType: string, name: string) {
    if (!bytes.length || bytes.length > 10485760 || this.inputs().length >= 64)
      throw new Error("INPUT_LIMIT");
    const input = inputSchema.parse({
      id: randomUUID(),
      name,
      mediaType,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteCount: bytes.length,
    });
    writeFileSync(this.path(`${input.id}.bytes`), bytes, { mode: 0o600, flag: "wx" });
    this.save(`input-${input.id}.json`, input);
    return input;
  }
  input(id: string) {
    return inputSchema.parse(this.read(`input-${idSchema.parse(id)}.json`));
  }
  bytes(input: Input) {
    const data = readFileSync(this.path(`${input.id}.bytes`));
    if (
      data.length !== input.byteCount ||
      createHash("sha256").update(data).digest("hex") !== input.sha256
    )
      throw new Error("INPUT_PIN_MISMATCH");
    return data;
  }
}
