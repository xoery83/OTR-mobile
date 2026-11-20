import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { betaCapabilities, betaRequest } from "./beta";
import { betaResponseSchema } from "../backend/src/mcpBetaApiSchemas";
if (process.env.OTR_MCP_BETA_VALIDATE === "1") {
  const root = new URL("../", import.meta.url),
    dir = "docs/mcp/beta-layer3/";
  const load = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
  const inherited = load("docs/mcp/beta-layer1/SCHEMA_EVIDENCE.json");
  const gaps = load("docs/mcp/beta-layer1/GAP_CLOSURE_MATRIX.json");
  const closure = load(dir + "CONTRACT_CLOSURE_HTTP_PG.json");
  assert.equal(closure.status, "CONTRACT_CLOSURE_HTTP_PG_PASS");
  const rows = betaCapabilities.map((cap) => {
    const samples = inherited.capabilities.find(
      (c: any) => c.capabilityId === cap.capabilityId,
    ).samples;
    const failures: string[] = [];
    let qualified: unknown;
    for (const sample of samples) {
      const request = load("docs/mcp/beta-layer1/" + sample.file).requests[
        sample.requestIndex
      ];
      try {
        const url = new URL(request.path, "http://fixture.invalid");
        const pattern = new RegExp("^" + cap.path.replace(/\{\w+\}/g, "([^/]+)") + "$");
        const match = pattern.exec(url.pathname)!;
        const names = [...cap.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const pathParams = Object.fromEntries(
          names.map((name, i) => [name, decodeURIComponent(match[i + 1])]),
        );
        const query: Record<string, unknown> = Object.fromEntries(url.searchParams);
        for (const key of ["limit", "formatVersion"])
          if (key in query) query[key] = Number(query[key]);
        for (const key of ["includeHidden", "includeDeleted", "includeHistory"])
          if (key in query) query[key] = query[key] === "true";
        const call = {
          capabilityId: cap.capabilityId,
          toolName: cap.toolName,
          pathParams,
          query: cap.method === "GET" ? query : {},
          request: cap.method === "GET" ? {} : (request.request ?? {}),
        };
        const body = call.request as any;
        const key =
          cap.effect === "WRITE"
            ? (body.operationId ??
              body.envelope?.idempotencyKey ??
              "11111111-1111-4111-a111-111111111111")
            : undefined;
        const wire = betaRequest(call, key);
        assert.equal(wire.method, cap.method);
        betaResponseSchema(cap.capabilityId).parse(request.response);
        qualified = {
          file: sample.file,
          requestIndex: sample.requestIndex,
          scope:
            "PINNED_REAL_LAYER1_HTTP_SAMPLE_REVALIDATED_WITH_CURRENT_MCP_AND_OWNING_SCHEMAS_NO_NEW_CALL",
          method: wire.method,
        };
        break;
      } catch (error) {
        failures.push(String(error).slice(0, 500));
      }
    }
    const prior = gaps.capabilities.find((c: any) => c.capabilityId === cap.capabilityId);
    const corrected = ["otr.ledger.history", "otr.ledger.operation.get"].includes(
      cap.capabilityId,
    );
    return {
      capabilityId: cap.capabilityId,
      toolName: cap.toolName,
      wireAndResponseSchema: qualified ? "PASS" : "FAIL",
      schemaEvidence: qualified ?? { failures },
      server: corrected ? "SERVER_API_PASS_L3_CONTRACT_CLOSURE" : prior.acceptance,
      serverEvidence: corrected
        ? [
            "CONTRACT_CLOSURE_HTTP_PG.json",
            "LOCAL_MCP_HTTP_PG.json",
            "../beta-layer1/" +
              (cap.capabilityId === "otr.ledger.history"
                ? "HISTORY_HTTP_PG.json"
                : "EXPENSE_LIST_HTTP_PG.json"),
          ]
        : prior.evidence.map((file: string) => "../beta-layer1/" + file),
      evidenceSource: corrected
        ? "L3_REAL_OWNED_LOCAL_HTTP_PG_PLUS_EXACT_L1_UNCHANGED_BRANCHES"
        : "EXACT_PINNED_L1_PORT_UNCHANGED",
      actualChatGPTConsumer: "NOT_EXECUTED_EXTERNAL_LOGIN_OAUTH_PENDING",
      native: "EXACT_INHERITED_SCOPED_L1_EVIDENCE_ONLY_NO_NEW_NATIVE_CLAIM",
    };
  });
  const report = {
    status: rows.every(
      (r) => r.wireAndResponseSchema === "PASS" && r.server.startsWith("SERVER_API_PASS"),
    )
      ? "103_SERVER_AND_WIRE_SCHEMA_PASS_WITH_EXACT_EVIDENCE_REUSE"
      : "INCOMPLETE",
    scope:
      "Server and schema qualification, not actual ChatGPT Consumer or blanket Native E2E",
    counts: {
      capabilities: rows.length,
      wireAndResponsePass: rows.filter((r) => r.wireAndResponseSchema === "PASS").length,
      serverPass: rows.filter((r) => r.server.startsWith("SERVER_API_PASS")).length,
    },
    rows,
  };
  writeFileSync(
    new URL(dir + "SERVER_CAPABILITY_MATRIX.json", root),
    JSON.stringify(report, null, 2) + "\n",
  );
  const pins = load("docs/mcp/beta-contract-v1/SOURCE_PINS_V1.json").sources.map(
    (pin: any) => {
      const current = createHash("sha256")
        .update(readFileSync(new URL(pin.path, root)))
        .digest("hex");
      const l1 = createHash("sha256")
        .update(
          execFileSync("git", [
            "show",
            "6b826c5c6a2685e72c205b3fe1e6fe4a1a73e0bb:" + pin.path,
          ]),
        )
        .digest("hex");
      return {
        alias: pin.alias,
        path: pin.path,
        frozenMainSha256: pin.sha256,
        layer1Sha256: l1,
        currentSha256: current,
        source:
          current === pin.sha256
            ? "UNCHANGED_FROZEN_MAIN"
            : current === l1
              ? "PINNED_LAYER1_COMPATIBLE_EXTENSION"
              : "LAYER3_DELTA_REVIEW_REQUIRED",
      };
    },
  );
  writeFileSync(
    new URL(dir + "SCHEMA_INTEGRATION_PINS.json", root),
    JSON.stringify(
      {
        frozenSource: "2da5e1a7e88056239ad04217d3c3222421f05ec9",
        layer1: "6b826c5c6a2685e72c205b3fe1e6fe4a1a73e0bb",
        layer2: "cbb8adff0e57b3f34e5ec348523ba3b440975c46",
        pins,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      status: report.status,
      counts: report.counts,
      pinStatuses: Object.fromEntries(
        [...new Set(pins.map((p: any) => p.source))].map((status) => [
          status,
          pins.filter((p: any) => p.source === status).length,
        ]),
      ),
    }),
  );
  assert.equal(report.counts.wireAndResponsePass, 103);
  assert.equal(report.counts.serverPass, 103);
  assert.equal(rows.length, 103);
}
