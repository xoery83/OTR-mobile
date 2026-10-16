import { transformSync } from "esbuild";
import { createServer, type IncomingMessage } from "node:http";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  PrivateStore,
  idSchema,
  labelSchema,
  compare,
  statistics,
  escapeHtml,
} from "./store";
import { compileNative, runMac, sourceVersion, hash } from "./mac";
import { workbenchHtml } from "./view";
import {
  buildCaptureLocalResult,
  attachCaptureLocalModelEvidence,
  projectCaptureLocalFlightInterpretation,
} from "../../src/domain/capture/captureLocalInterpretation";
import {
  createCaptureLocalExtractorCore,
  validateCaptureLocalModelResponse,
} from "../../src/native/captureLocalExtractionCore";
import type { DiagnosticJob, DiagnosticTrace } from "../../src/native/importWorkbenchRun";

export const PORT = 49184;
export const ORIGIN = `http://127.0.0.1:${PORT}`;
export const DEVICE = "418CF8AE-ED96-4E76-8D22-533EB6C08032";
const jobRequest = z.strictObject({
  inputId: idSchema,
  runtime: z.enum(["MAC_COMPONENT", "IOS_DIAGNOSTIC_COMPONENT"]),
});
type Run = {
  id: string;
  inputId: string;
  runtime: "MAC_COMPONENT" | "IOS_DIAGNOSTIC_COMPONENT";
  stage: string;
  job: DiagnosticJob;
  createdAt: number;
  trace?: DiagnosticTrace;
  error?: string;
};
async function body(req: IncomingMessage, max: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error("REQUEST_LIMIT");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function createWorkbench(store = new PrivateStore()) {
  const nativeToken = randomBytes(32).toString("hex");
  const loadedVersion = sourceVersion();
  const runs = new Map<string, Run>();
  for (const file of readdirSync(store.root).filter((v) =>
    /^run-[a-f0-9-]+\.json$/.test(v),
  )) {
    const run = store.read(file) as Run;
    if (idSchema.safeParse(run.id).success)
      runs.set(run.id, { ...run, stage: run.trace ? "FINISHED" : "INTERRUPTED" });
  }
  let busy = false;
  let binary: string | undefined;
  let nativeRun: Run | undefined;
  let lastNativeSeen: string | null = null;
  let nativeArmExpiresAt = 0;
  const nativeStatus = () => {
    const armed = nativeArmExpiresAt > Date.now();
    const connected = !!lastNativeSeen && Date.now() - Date.parse(lastNativeSeen) < 5000;
    return {
      armed,
      connected,
      ready: armed && connected,
      executedNativeVersion: "UNVERIFIED",
      executedJSVersion: "UNVERIFIED",
    };
  };
  const persist = (run: Run) => store.save(`run-${run.id}.json`, run);
  function expire() {
    if (nativeRun && Date.now() - nativeRun.createdAt > 120_000) {
      nativeRun.stage = "FAILED";
      nativeRun.error = "IOS_CALLER_TIMEOUT";
      persist(nativeRun);
      nativeRun = undefined;
      busy = false;
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      expire();
      if (
        req.headers.host !== `127.0.0.1:${PORT}` ||
        !["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")
      )
        throw new Error("LOOPBACK_REQUIRED");
      const url = new URL(req.url ?? "/", ORIGIN);
      const native = url.pathname.startsWith("/native/");
      if (native) {
        if (req.headers["x-otr-diagnostic"] !== nativeToken || !nativeStatus().armed)
          throw new Error("NATIVE_GATE_REQUIRED");
        lastNativeSeen = new Date().toISOString();
      } else if (req.headers.origin && req.headers.origin !== ORIGIN)
        throw new Error("ORIGIN_REJECTED");
      if (req.method !== "GET" && !native && req.headers.origin !== ORIGIN)
        throw new Error("ORIGIN_REQUIRED");
      const send = (value: unknown, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(value));
      };
      const json = async () => {
        if (req.headers["content-type"] !== "application/json")
          throw new Error("JSON_REQUIRED");
        return JSON.parse((await body(req, 2_000_000)).toString("utf8"));
      };
      if (req.method === "GET" && url.pathname === "/") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(workbenchHtml());
        return;
      }
      if (req.method === "GET" && url.pathname === "/client.js") {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.end(readFileSync("scripts/import-workbench/client.js"));
        return;
      }
      if (req.method === "GET" && url.pathname === "/batch.js") {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.end(
          transformSync(readFileSync("scripts/import-workbench/batch.ts", "utf8"), {
            loader: "ts",
            format: "esm",
          }).code,
        );
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        send({
          hostSourceManifest: loadedVersion,
          inputs: store.inputs(),
          runs: [...runs.values()].map(({ trace, ...r }) => ({
            ...r,
            fields: trace?.result.fields.length,
            textSha256: trace?.textSha256,
            model: trace?.result.modelReason,
          })),
          lastNativeSeen,
          native: nativeStatus(),
          busy,
          imports: readdirSync(store.root)
            .filter((v) => /^import-[a-f0-9-]+\.json$/.test(v))
            .map((v) => v.slice(7, -5)),
          remote: "NOT_USED",
          remoteCost: 0,
        });
        return;
      }
      const originalMatch = /^\/api\/input\/([a-f0-9-]+)\/original$/.exec(url.pathname);
      if (req.method === "GET" && originalMatch) {
        const input = store.input(idSchema.parse(originalMatch[1]));
        const bytes = store.bytes(input);
        const extension = {
          "application/pdf": "pdf",
          "image/jpeg": "jpg",
          "image/png": "png",
          "text/plain": "txt",
        }[input.mediaType];
        res.setHeader("Content-Type", input.mediaType);
        res.setHeader("Content-Length", bytes.length);
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${input.id}.${extension}"`,
        );
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
        );
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        res.end(bytes);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/input") {
        if (req.headers["content-type"] !== "application/octet-stream")
          throw new Error("BINARY_REQUIRED");
        send(
          store.add(
            await body(req, 10485760),
            url.searchParams.get("media") ?? "",
            url.searchParams.get("name") ?? "input",
          ),
        );
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/run") {
        const request = jobRequest.parse(await json());
        if (JSON.stringify(sourceVersion()) !== JSON.stringify(loadedVersion))
          throw new Error("VERSION_CHANGED_RESTART_REQUIRED");
        if (request.runtime === "IOS_DIAGNOSTIC_COMPONENT" && !nativeStatus().ready)
          throw new Error("NATIVE_CALLER_NOT_CONNECTED");
        if (busy || runs.size >= 256) throw new Error("RUN_BUSY_OR_LIMIT");
        const input = store.input(request.inputId),
          bytes = store.bytes(input);
        const id = randomUUID();
        const job = {
          runId: id,
          inputId: input.id,
          mediaType: input.mediaType,
          sha256: input.sha256,
          byteCount: input.byteCount,
          hostSourceManifest: loadedVersion,
        };
        const run: Run = {
          id,
          inputId: input.id,
          runtime: request.runtime,
          job,
          stage: "QUEUED",
          createdAt: Date.now(),
        };
        runs.set(id, run);
        persist(run);
        busy = true;
        send(run, 202);
        if (request.runtime === "IOS_DIAGNOSTIC_COMPONENT") {
          nativeRun = run;
          return;
        }
        void Promise.resolve()
          .then(async () => {
            run.stage = "BUILDING_FORMAL_SWIFT";
            binary ??= compileNative(store.root);
            run.trace = await runMac(job, bytes, binary, (s) => {
              run.stage = s;
            });
            run.stage = "FINISHED";
          })
          .catch(() => {
            run.stage = "FAILED";
            run.error = "LOCAL_RUN_FAILED";
          })
          .finally(() => {
            persist(run);
            busy = false;
          });
        return;
      }
      if (req.method === "GET" && url.pathname === "/native/job") {
        lastNativeSeen = new Date().toISOString();
        if (nativeRun?.stage === "QUEUED") {
          nativeRun.stage = "IOS_CLAIMED";
          send({
            job: nativeRun.job,
            bytesBase64: store.bytes(store.input(nativeRun.inputId)).toString("base64"),
          });
        } else send(null);
        return;
      }
      if (req.method === "POST" && url.pathname === "/native/stage") {
        const v = z
          .strictObject({
            runId: idSchema,
            stage: z.enum([
              "EXTRACTING",
              "DETERMINISTIC",
              "APPLE_MODEL",
              "TYPED_PROJECTION",
            ]),
          })
          .parse(await json());
        if (!nativeRun || nativeRun.id !== v.runId)
          throw new Error("TRACE_SCOPE_INVALID");
        nativeRun.stage = v.stage;
        send({ accepted: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/native/trace") {
        const raw = (await json()) as DiagnosticTrace;
        if (
          !nativeRun ||
          raw.job?.runId !== nativeRun.id ||
          raw.runtime !== "IOS_DIAGNOSTIC_COMPONENT" ||
          raw.schema !== "OTR_IMPORT_DIAGNOSTIC_TRACE" ||
          raw.mode !== "DIAGNOSTIC_ONLY" ||
          raw.remote !== "NOT_USED" ||
          raw.remoteCost !== 0 ||
          JSON.stringify(raw.job) !== JSON.stringify(nativeRun.job)
        )
          throw new Error("TRACE_SCOPE_INVALID");
        // Revalidate Native extraction and model anchors through the SAME production core.
        const bytes = store.bytes(store.input(nativeRun.inputId));
        // Trace carries the adapter's validated PDF output, including derived text pins.
        // Remove only those two known adapter fields before reusing the strict Native schema.
        const bridgeExtraction = { ...raw.extraction } as Record<string, unknown>;
        delete bridgeExtraction.textSha256;
        delete bridgeExtraction.textByteCount;
        const extractor = createCaptureLocalExtractorCore({
          hash,
          getBridge: () => ({
            extractCaptureLocal: async () => bridgeExtraction,
            captureLocalModelCapability: async () => raw.capability,
          }),
        });
        const extracted = await extractor.extract(bytes, raw.job.mediaType);
        const capability = await extractor.modelCapability();
        const textSha256 = await hash(new TextEncoder().encode(extracted.text));
        if (textSha256 !== raw.textSha256) throw new Error("TRACE_TEXT_PIN_INVALID");
        const deterministic = buildCaptureLocalResult(
          raw.job.inputId,
          extracted,
          { sha256: raw.job.sha256, byteCount: raw.job.byteCount },
          textSha256,
          capability.status,
        );
        const model = z
          .strictObject({
            status: z.enum(["SUCCEEDED", "FAILED", "UNAVAILABLE"]),
            reason: z.enum([
              "VERBATIM_SERVICE_EVIDENCE_ONLY",
              "LOCAL_MODEL_TIMEOUT",
              "LOCAL_MODEL_FAILED",
              "LOCAL_MODEL_UNAVAILABLE",
              "LOCAL_MODEL_INPUT_LIMIT",
              "LOCAL_MODEL_OUTPUT_LIMIT",
              "LOCAL_MODEL_EVIDENCE_INVALID",
              "LOCAL_MODEL_OUTPUT_INVALID",
              "SYSTEM_MODEL_AVAILABLE",
              "DEVICE_NOT_ELIGIBLE",
              "APPLE_INTELLIGENCE_NOT_ENABLED",
              "MODEL_NOT_READY",
              "UNKNOWN_MODEL_UNAVAILABILITY",
              "FOUNDATION_MODELS_UNSUPPORTED",
              "CAPABILITY_UNAVAILABLE",
              "CAPABILITY_NOT_INSTALLED",
            ]),
            observations: z
              .array(
                z.strictObject({
                  literal: z.string().min(2).max(16),
                  start: z.number().int().min(0),
                  end: z.number().int().positive(),
                }),
              )
              .max(64),
          })
          .parse(raw.model);
        if (model.status !== "SUCCEEDED" && model.observations.length)
          throw new Error("TRACE_MODEL_INVALID");
        if (model.status === "SUCCEEDED") {
          const validated = validateCaptureLocalModelResponse(extracted.text, {
            json: JSON.stringify({
              flightNumbers: model.observations.map((o) => o.literal),
            }),
          });
          if (
            capability.status !== "AVAILABLE" ||
            JSON.stringify(validated) !== JSON.stringify(model)
          )
            throw new Error("TRACE_MODEL_INVALID");
        }
        const result = attachCaptureLocalModelEvidence(deterministic, model);
        nativeRun.trace = {
          ...raw,
          extraction: extracted,
          capability,
          textSha256,
          model,
          sourceAuthority: "NONE",
          executedVersion: { native: "UNVERIFIED", javascript: "UNVERIFIED" },
          admission: "NOT_AVAILABLE",
          coldModelResourceClaim: "UNVERIFIED",
          result,
          typed: projectCaptureLocalFlightInterpretation(result),
        };
        nativeRun.stage = "FINISHED";
        persist(nativeRun);
        nativeRun = undefined;
        busy = false;
        send({ accepted: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/native/failure") {
        const v = z
          .strictObject({ runId: idSchema, code: z.literal("IOS_DIAGNOSTIC_FAILED") })
          .parse(await json());
        if (!nativeRun || nativeRun.id !== v.runId)
          throw new Error("TRACE_SCOPE_INVALID");
        nativeRun.stage = "FAILED";
        nativeRun.error = v.code;
        persist(nativeRun);
        nativeRun = undefined;
        busy = false;
        send({ accepted: true });
        return;
      }
      const importedMatch = /^\/api\/import\/([a-f0-9-]+)$/.exec(url.pathname);
      if (req.method === "GET" && importedMatch) {
        send(store.read(`import-${idSchema.parse(importedMatch[1])}.json`));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/import-trace") {
        const raw = await json();
        const id = randomUUID();
        if (readdirSync(store.root).filter((v) => v.startsWith("import-")).length >= 64)
          throw new Error("IMPORT_LIMIT");
        store.save(`import-${id}.json`, {
          status: "IMPORTED_UNVERIFIED_VIEW_ONLY",
          importedAt: new Date().toISOString(),
          payload: raw,
        });
        send({ id, status: "IMPORTED_UNVERIFIED_VIEW_ONLY", payload: raw });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/compare") {
        const a = runs.get(idSchema.parse(url.searchParams.get("a")))?.trace,
          b = runs.get(idSchema.parse(url.searchParams.get("b")))?.trace;
        if (!a || !b) throw new Error("TRACE_REQUIRED");
        send(compare(a, b));
        return;
      }
      const match = /^\/api\/run\/([a-f0-9-]+)(?:\/(json|html|labels|stats))?$/.exec(
        url.pathname,
      );
      if (match) {
        const run = runs.get(idSchema.parse(match[1]));
        if (!run) throw new Error("RUN_UNKNOWN");
        if (req.method === "POST" && match[2] === "labels") {
          const labels = labelSchema.parse(await json());
          store.save(`labels-${run.id}.json`, labels);
          send({ saved: true, kind: labels.kind });
          return;
        }
        if (req.method === "GET" && match[2] === "labels") {
          try {
            send(labelSchema.parse(store.read(`labels-${run.id}.json`)));
          } catch {
            send(null);
          }
          return;
        }
        if (req.method === "GET" && match[2] === "stats" && run.trace) {
          let labels;
          try {
            labels = labelSchema.parse(store.read(`labels-${run.id}.json`));
          } catch {
            /* N/A */
          }
          send(statistics(run.trace, labels));
          return;
        }
        if (req.method === "GET") {
          if (match[2] === "html") {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader(
              "Content-Disposition",
              `attachment; filename="trace-${run.id}.html"`,
            );
            res.setHeader(
              "Content-Security-Policy",
              "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            );
            res.end(
              `<!doctype html><meta charset="utf-8"><title>OTR diagnostic trace</title><pre>${escapeHtml(JSON.stringify(run, null, 2))}</pre>`,
            );
          } else {
            if (match[2] === "json")
              res.setHeader(
                "Content-Disposition",
                `attachment; filename="trace-${run.id}.json"`,
              );
            send(run);
          }
          return;
        }
      }
      send({ error: "NOT_FOUND" }, 404);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "REQUEST_REJECTED" }));
    }
  });
  return {
    server,
    store,
    nativeToken,
    armNative: (expiresAt: number) => {
      nativeArmExpiresAt = expiresAt;
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createWorkbench();
  if (process.argv.includes("--arm-ios")) {
    const container = execFileSync(
      "xcrun",
      ["simctl", "get_app_container", DEVICE, "com.xoery.otrmobile", "data"],
      { encoding: "utf8" },
    ).trim();
    if (
      !/^\/Users\/[^/]+\/Library\/Developer\/CoreSimulator\/Devices\/418CF8AE-ED96-4E76-8D22-533EB6C08032\/data\/Containers\/Data\/Application\/[A-F0-9-]+$/.test(
        container,
      )
    )
      throw new Error("EXACT_CONTAINER_REQUIRED");
    const gate = {
      device: DEVICE,
      container: container.split("/").pop(),
      token: app.nativeToken,
      origin: ORIGIN,
      expiresAt: Date.now() + 60 * 60 * 1000,
      hostSourceManifest: sourceVersion(),
    };
    mkdirSync(`${container}/Library/Caches/import-workbench`, {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(
      `${container}/Library/Caches/import-workbench/gate.json`,
      JSON.stringify(gate),
      { mode: 0o600 },
    );
    app.armNative(gate.expiresAt);
    app.store.save("ios-gate-manifest.json", {
      device: DEVICE,
      gatePath: `${container}/Library/Caches/import-workbench/gate.json`,
      expiresAt: gate.expiresAt,
    });
  }
  app.server.listen(PORT, "127.0.0.1", () =>
    console.log(`OTR diagnostic workbench ${ORIGIN} — Remote NOT_USED; cost 0`),
  );
}
