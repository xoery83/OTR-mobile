import {
  lstatSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  realpathSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { DiagnosticTrace } from "../../src/native/importWorkbenchRun";

export const PRIVATE_ROOT = resolve("private-data");
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
const annotationFieldSchema = z
  .strictObject({
    path: z.string().min(1).max(200),
    raw: z.string().max(1000),
    status: z.enum(["CONFIRMED", "NOT_PROVIDED", "UNCHECKED"]),
    participantId: z.string().min(1).max(80).optional(),
  })
  .superRefine((field, context) => {
    if (field.status === "CONFIRMED" && !field.raw.trim())
      context.addIssue({ code: "custom", message: "CONFIRMED_VALUE_REQUIRED" });
  });
const annotationSchema = z
  .strictObject({
    documentStatus: z.enum(["UNREVIEWED", "NO_RELEVANT_CONTENT", "RESULTS"]),
    results: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(80),
          type: z.enum([
            "FLIGHT",
            "STAY",
            "CAR_RENTAL",
            "SCHEDULED_TRANSPORT",
            "ACTIVITY",
            "TICKET",
            "UNCLASSIFIED",
          ]),
          status: z.enum(["UNREVIEWED", "CONFIRMED", "WRONG_TYPE"]),
          fields: z.array(annotationFieldSchema).max(500),
          segments: z
            .array(
              z.strictObject({
                id: z.string().min(1).max(80),
                fields: z.array(annotationFieldSchema).max(500),
              }),
            )
            .max(32),
        }),
      )
      .max(32),
  })
  .superRefine((annotation, context) => {
    const fields = annotation.results.flatMap((result) => [
      ...result.fields,
      ...result.segments.flatMap((segment) => segment.fields),
    ]);
    if (
      fields.length > 500 ||
      new Set(annotation.results.map((r) => r.id)).size !== annotation.results.length ||
      annotation.results.some(
        (r) => new Set(r.segments.map((s) => s.id)).size !== r.segments.length,
      )
    )
      context.addIssue({ code: "custom", message: "ANNOTATION_LIMIT_OR_DUPLICATE_ID" });
    if (annotation.documentStatus === "NO_RELEVANT_CONTENT" && annotation.results.length)
      context.addIssue({
        code: "custom",
        message: "NO_RELEVANT_CONTENT_REQUIRES_ZERO_RESULTS",
      });
  });
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
  annotation: annotationSchema.optional(),
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
    sameHostSourceManifest:
      a.job.hostSourceManifest && b.job.hostSourceManifest
        ? JSON.stringify(a.job.hostSourceManifest) ===
          JSON.stringify(b.job.hostSourceManifest)
        : null,
    executedVersionComparison: "UNVERIFIED",
    legacyManifestCoverage:
      a.job.hostSourceManifest && b.job.hostSourceManifest ? "CURRENT" : "UNVERIFIED",
    removed: x.filter((v) => !y.includes(v)),
    added: y.filter((v) => !x.includes(v)),
    sameFieldEvidence: JSON.stringify(x) === JSON.stringify(y),
    modelChanged: JSON.stringify(a.model) !== JSON.stringify(b.model),
  };
}
export function statistics(trace: DiagnosticTrace, labels?: z.infer<typeof labelSchema>) {
  const annotation = labels?.annotation;
  const reviewedFields =
    annotation?.results.flatMap((result) => [
      ...result.fields,
      ...result.segments.flatMap((segment) => segment.fields),
    ]) ?? [];
  const annotationSummary = annotation
    ? {
        documentStatus: annotation.documentStatus,
        resultCount: annotation.results.length,
        segmentCount: annotation.results.reduce((n, r) => n + r.segments.length, 0),
        confirmedFields: reviewedFields.filter((f) => f.status === "CONFIRMED").length,
        notProvidedFields: reviewedFields.filter((f) => f.status === "NOT_PROVIDED")
          .length,
        uncheckedFields: reviewedFields.filter((f) => f.status === "UNCHECKED").length,
        wrongTypeResults: annotation.results.filter((r) => r.status === "WRONG_TYPE")
          .length,
      }
    : null;
  const unavailableMetrics = {
    typeAccuracy: null,
    evidenceValidity: null,
    typedCompleteness: null,
    localIncrementalContribution: null,
    remoteUpgradeRate: null,
  };
  const notApplicable = (reason: string) => ({
    status: "N/A",
    labelKind: labels?.kind ?? "NONE",
    precision: null,
    recall: null,
    reason,
    annotationSummary,
    ...unavailableMetrics,
  });
  if (!labels || labels.kind !== "HUMAN_GROUND_TRUTH")
    return notApplicable("No human ground truth; hypotheses are not accuracy labels.");
  let expectedFields = labels.fields;
  let paths: Set<string> | undefined;
  if (annotation) {
    if (
      annotation.results.length > 1 ||
      annotation.results.some((result) => result.segments.length > 0) ||
      reviewedFields.some((field) => field.participantId !== undefined)
    ) {
      return {
        ...notApplicable(
          "Identity alignment across results, segments or participants is not implemented; precision/recall are not scored.",
        ),
        reasonCode: "IDENTITY_ALIGNMENT_NOT_IMPLEMENTED" as const,
      };
    }
    if (annotation.documentStatus !== "RESULTS" || !annotation.results.length)
      return notApplicable("No applicable reviewed business-result field ground truth.");
    if (
      annotation.results.some((r) => r.status !== "CONFIRMED") ||
      reviewedFields.some((f) => f.status === "UNCHECKED")
    )
      return notApplicable(
        "Annotation is incomplete or a business type is marked wrong; unchecked values are not scored.",
      );
    if (annotation.results.some((r) => r.type !== "FLIGHT"))
      return notApplicable(
        "Current production core does not support scoring these diagnostic business types.",
      );
    if (!reviewedFields.length) return notApplicable("No explicitly reviewed fields.");
    expectedFields = reviewedFields
      .filter((f) => f.status === "CONFIRMED")
      .map((f) => ({ path: f.path, raw: f.raw }));
    paths = new Set(reviewedFields.map((f) => f.path));
  } else if (!labels.fields.length)
    return notApplicable(
      "No field ground truth; an empty form is not an accuracy label.",
    );
  const actual = new Set(
    trace.result.fields
      .filter((f) => !paths || paths.has(f.path))
      .map((f) => JSON.stringify([f.path, f.raw])),
  );
  const expected = new Set(expectedFields.map((f) => JSON.stringify([f.path, f.raw])));
  const tp = [...actual].filter((v) => expected.has(v)).length;
  return {
    status: "HUMAN_LABELLED",
    unit: annotation
      ? "unique path/raw pairs on explicitly reviewed paths only; segment/participant/result matching NOT_SCORED"
      : "unique path/raw pairs; labels must be exhaustive",
    tp,
    fp: actual.size - tp,
    fn: expected.size - tp,
    precision: actual.size ? tp / actual.size : null,
    recall: expected.size ? tp / expected.size : null,
    annotationSummary,
    ...unavailableMetrics,
  };
}
export const PDF_PREVIEW_BINARY =
  "/Users/xoery/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm";
const PDF_PREVIEW_MAX_SIDE = 4000;
export function previewPage(value: string | null) {
  if (value === null) return 1;
  if (!/^[1-9][0-9]?$/.test(value) || Number(value) > 32)
    throw new Error("PREVIEW_PAGE_INVALID");
  return Number(value);
}
function validatePreviewPng(bytes: Buffer) {
  if (
    bytes.length < 24 ||
    bytes.length > 8 * 1024 * 1024 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes.readUInt32BE(16) < 1 ||
    bytes.readUInt32BE(16) > PDF_PREVIEW_MAX_SIDE ||
    bytes.readUInt32BE(20) < 1 ||
    bytes.readUInt32BE(20) > PDF_PREVIEW_MAX_SIDE
  )
    throw new Error("PREVIEW_OUTPUT_INVALID");
  return bytes;
}
export class PrivateStore {
  constructor(readonly root = PRIVATE_ROOT) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (lstatSync(root).isSymbolicLink() || realpathSync(root) !== root)
      throw new Error("PRIVATE_ROOT_INVALID");
    chmodSync(root, 0o700);
  }
  path(name: string) {
    if (!/^(?:[a-z0-9-]+\.(?:json|bytes|png)|(?:real-llm-(?:0[12]|02-stage-[bc])|dual-mode-development)-reconciliations\.jsonl|native-runner|native-build-pin)$/.test(name))
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
  preview(input: Input, page: number) {
    if (!Number.isInteger(page) || page < 1 || page > 32)
      throw new Error("PREVIEW_PAGE_INVALID");
    const original = this.bytes(input); // Check original pins even when serving a cached raster.
    if (input.mediaType === "image/jpeg" || input.mediaType === "image/png") {
      if (page !== 1) throw new Error("PREVIEW_PAGE_INVALID");
      if (
        (input.mediaType === "image/jpeg" &&
          !original.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
        (input.mediaType === "image/png" &&
          !original.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      )
        throw new Error("PREVIEW_IMAGE_INVALID");
      return { mediaType: input.mediaType, bytes: original };
    }
    if (input.mediaType !== "application/pdf")
      throw new Error("PREVIEW_MEDIA_UNSUPPORTED");
    const output = this.path(
      `preview-${input.id}-${input.sha256}-${page}-${PDF_PREVIEW_MAX_SIDE}.png`,
    );
    if (existsSync(output))
      return { mediaType: "image/png", bytes: validatePreviewPng(readFileSync(output)) };
    if (readdirSync(this.root).filter((p) => /^preview-.*\.png$/.test(p)).length >= 256)
      throw new Error("PREVIEW_CACHE_LIMIT");
    const temporary = this.path(`preview-${randomUUID()}.png`);
    try {
      execFileSync(
        PDF_PREVIEW_BINARY,
        [
          "-png",
          "-f",
          String(page),
          "-l",
          String(page),
          "-singlefile",
          "-scale-to",
          String(PDF_PREVIEW_MAX_SIDE),
          this.path(`${input.id}.bytes`),
          temporary.slice(0, -4),
        ],
        {
          timeout: 15_000,
          stdio: "ignore",
          env: { PATH: "/usr/bin:/bin", NODE_ENV: "production" },
        },
      );
      chmodSync(temporary, 0o600);
      const bytes = validatePreviewPng(
        readFileSync(this.path(temporary.split("/").pop()!)),
      );
      renameSync(temporary, output);
      return { mediaType: "image/png", bytes };
    } finally {
      if (existsSync(temporary)) unlinkSync(this.path(temporary.split("/").pop()!));
    }
  }
}
