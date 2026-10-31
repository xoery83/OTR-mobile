import { createInterface } from "node:readline";
import { createItemInput } from "./mutationContract";
import { verifyGoldenReadback } from "./goldenReadback";
// Explicit registered-QA protocol acceptance only. Root window and normal OTP helper remain mandatory.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  withRegisteredQaHostSession,
  registeredHostQa,
} from "../scripts/auth/registered-qa-host-session";
import { publicConfiguration } from "../scripts/auth/resend-inbound-otp-e2e";
import { coreCapabilitiesSchema } from "../src/domain/trip/tripCoreV2Commands";
import { canonicalCoreJson, type Json } from "../src/domain/trip/tripCoreV2Json";
import {
  sha,
  prepareCreate,
  prepareTrip,
  createMutationTools,
  contentDigest,
  prepareUpdate,
  mutationIdentity,
  type PreparedMutation,
  type ApprovalRequest,
} from "./mutation";
import { createMcpHandler } from "./server";
import { internalSessionAuthorizer, DEV_BACKEND } from "./internal";
import { loopbackServer } from "./http";
import { itemSchema } from "./contract";
const digest = (v: unknown) => sha(canonicalCoreJson(v as Json));
const fixtureSchema = z.object({
  version: z.literal(1),
  account_id: z.uuid(),
  trip_id: z.uuid(),
  existing_p3_id: z.uuid(),
  foreign_write_request_id: z.uuid(),
  expected_item_id: z.uuid(),
  create: z.unknown(),
  edit_request_id: z.uuid(),
  date_edit_request_id: z.uuid(),
  nelson_trip_request_id: z.uuid(),
  nelson_change_request_ids: z.array(z.uuid()).length(3),
});
export async function runGolden(
  stage:
    | "READ"
    | "P3"
    | "NELSON"
    | "P3_VERIFY"
    | "NELSON_STATUS"
    | "NELSON_RESUME"
    | "NELSON_DATE_EDIT",
) {
  assert.equal(process.env.OTR_MCP_QA_CASE, stage);
  if (stage === "NELSON_DATE_EDIT")
    assert.equal(
      process.env.OTR_MCP_NATIVE_NELSON_READY,
      "1",
      "ACTUAL_NATIVE_CHECKPOINT_REQUIRED",
    );
  if (stage === "P3" || stage === "NELSON" || stage === "NELSON_RESUME")
    assert(process.stdin.isTTY, "GOLDEN_INTERACTIVE_TTY_REQUIRED");
  assert.equal(process.env.OTR_QA_DEV_BUSINESS_WINDOW, "HELD");
  const fixture = fixtureSchema.parse(
    JSON.parse(readFileSync("mcp/fixtures/golden-slices.json", "utf8")),
  );
  assert.equal(fixture.account_id, registeredHostQa.accountId);
  assert.equal(fixture.trip_id, registeredHostQa.tripId);
  const fixedCreate = createItemInput.parse(fixture.create);
  assert.equal(fixedCreate.trip_id, fixture.trip_id);
  assert.equal(
    mutationIdentity(fixture.account_id, prepareCreate(fixture.account_id, fixedCreate))
      .item_id,
    fixture.expected_item_id,
  );
  const facts: Record<string, unknown> = {
    stage,
    status: "STARTED",
    auth: "INTERNAL_NORMAL_ACCOUNT_SESSION_NOT_REMOTE_OAUTH",
    targetTrip: fixture.trip_id,
    accountId: fixture.account_id,
    observedAt: new Date().toISOString(),
  };
  const recoverP3 = stage === "P3" && process.env.OTR_MCP_RECOVER_P3 === "1";
  const outputPath = `docs/mcp/acceptance/${stage}.json`;
  mkdirSync("docs/mcp/acceptance", { recursive: true });
  const save = () => writeFileSync(outputPath, JSON.stringify(facts, null, 2) + "\n");
  save();
  try {
    const sessionEvidence = await withRegisteredQaHostSession(async (context) => {
      facts.phase = "HOST_SCOPE_ENTERED";
      save();
      const session = await context.readSession();
      assert(session.accessToken);
      const config = publicConfiguration(process.env);
      facts.phase = "NORMAL_QA_SESSION_READY";
      save();
      async function direct(path: string) {
        facts.directPath = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id");
        save();
        return fetch(DEV_BACKEND + path, {
          headers: {
            Authorization: "Bearer " + session.accessToken,
            "X-OTR-Core-Contract-Version": "2",
          },
          redirect: "error",
          signal: AbortSignal.timeout(50000),
        });
      }
      facts.phase = "LOOPBACK_START";
      save();
      const allowedResumePosts = new Map<string, PreparedMutation>();
      const resumePostCounts = new Map<string, number>();
      let handle: ReturnType<typeof createMcpHandler>;
      const server = loopbackServer((request) => handle(request));
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const addr = server.address();
      assert(addr && typeof addr !== "string");
      const resource = `http://127.0.0.1:${addr.port}/mcp`;
      const approved = new Set<string>();
      const confirm = async (request: ApprovalRequest) =>
        request.accountId === context.accountId &&
        request.clientId === "otr-internal-controlled-qa" &&
        request.resource === resource &&
        approved.has(request.digest);
      facts.phase = "MCP_HANDLER_BUILD";
      save();
      handle = createMcpHandler({
        resource,
        authorize: async (request) => {
          const auth = await internalSessionAuthorizer(
            config.publishableKey,
            stage !== "READ",
          )(request);
          if ((stage === "P3_VERIFY" || stage === "NELSON_STATUS") && auth?.backend) {
            const backend = auth.backend;
            auth.backend = (q, signal) => {
              assert.equal(q.method, "GET", "VERIFY_CANNOT_REPOST");
              return backend(q, signal);
            };
          }
          if (
            (stage === "NELSON_RESUME" || stage === "NELSON_DATE_EDIT") &&
            auth?.backend
          ) {
            const backend = auth.backend;
            auth.backend = (q, signal) => {
              if (q.method === "POST") {
                const operationId = z
                  .uuid()
                  .parse((q.body as { operationId?: unknown })?.operationId);
                const expected = allowedResumePosts.get(operationId);
                assert(expected?.kind === "ITEM", "RESUME_POST_NOT_AUTHORIZED");
                assert.equal(
                  q.path,
                  `/v2/trips/${expected.command.tripId}/core/commands`,
                );
                assert.equal(contentDigest(q.body), contentDigest(expected.command));
                assert.equal(
                  resumePostCounts.get(operationId) ?? 0,
                  0,
                  "RESUME_POST_ALREADY_SENT",
                );
                if (operationId === fixture.nelson_change_request_ids[2])
                  writeFileSync(
                    "docs/mcp/acceptance/NELSON_P6_RETRY_ATTEMPT.json",
                    JSON.stringify(
                      {
                        operationId,
                        itemId: expected.command.target.id,
                        tripId: expected.command.tripId,
                        commandSha256: contentDigest(expected.command),
                        dispatchReservedBeforeFetchAt: new Date().toISOString(),
                        authority:
                          "EXPLICIT_OWNER_AUTHORIZED_SYNTHETIC_SAME_OPERATION_RETRY",
                        previous404IsNotNoCommit: true,
                      },
                      null,
                      2,
                    ) + "\n",
                    { flag: "wx", mode: 0o600 },
                  );
                resumePostCounts.set(operationId, 1);
              }
              return backend(q, signal);
            };
          }
          return auth;
        },
        confirm,
      });
      const client = new Client({
        name: "otr-mcp-golden-" + stage.toLowerCase(),
        version: "1",
      });
      async function call(name: string, args: Record<string, unknown>) {
        facts.phase = name;
        save();
        const r = await client.callTool({ name, arguments: args });
        if ((r as { isError?: boolean }).isError) {
          let code = "TOOL_ERROR";
          try {
            const c = JSON.parse((r as { content: { text: string }[] }).content[0].text)
              .error?.code;
            if (typeof c === "string" && /^[A-Z_]{1,80}$/.test(c)) code = c;
          } catch {}
          facts.toolFailure = { name, code };
          save();
        }
        assert(!(r as { isError?: boolean }).isError, "TOOL_ERROR");
        const v = r as {
          structuredContent?: Record<string, unknown>;
          result?: Record<string, unknown>;
        };
        return v.structuredContent ?? v.result ?? {};
      }
      async function recoverApplied(
        result: Record<string, unknown>,
        prepared: PreparedMutation,
      ) {
        if (result.outcome !== "UNKNOWN" || result.error_code === "RECEIPT_UNVERIFIED")
          return result;
        const identity = mutationIdentity(context.accountId, prepared);
        assert.equal(result.operation_id, identity.operation_id);
        assert.equal(result.trip_id, identity.trip_id);
        const target = prepared.kind;
        const status = await call("get_operation_status", {
          trip_id: z.uuid().parse(result.trip_id),
          operation_id: z.uuid().parse(result.operation_id),
          target,
        });
        const recoveries = (facts.sameOperationLookups ?? []) as unknown[];
        recoveries.push({ original: result, status });
        facts.sameOperationLookups = recoveries;
        save();
        if (status.outcome !== "APPLIED") return result;
        const expectedPath =
          prepared.kind === "TRIP"
            ? `/v2/trip-create-operations/${identity.operation_id}`
            : `/v2/trips/${identity.trip_id}/core/operations/${identity.operation_id}`;
        const verifier = createMutationTools({
          accountId: context.accountId,
          clientId: "otr-internal-controlled-qa",
          resource,
          backend: (q, signal) => {
            assert.equal(q.method, "GET", "RECOVERY_CANNOT_POST");
            assert.equal(q.path, expectedPath);
            return fetch(DEV_BACKEND + q.path, {
              headers: {
                ...q.headers,
                Authorization: "Bearer " + session.accessToken,
                "X-OTR-Core-Contract-Version": "2",
              },
              redirect: "error",
              signal,
            });
          },
        });
        // Reuse the complete owning receipt validator behind a strict GET-only port.
        const verified = await verifier.execute(
          prepared,
          "APPLY",
          identity.preview_digest,
          true,
        );
        recoveries.push({
          operationId: identity.operation_id,
          fullExpectedReceipt: verified,
        });
        save();
        return verified.outcome === "APPLIED" ? verified : result;
      }
      async function approvedCall(
        name: "create_trip" | "create_trip_item" | "update_trip_item",
        args: Record<string, unknown>,
      ) {
        const p = await call(name, args);
        assert.equal(p.outcome, "PREVIEW");
        const d = z.string().parse(p.preview_digest);
        approved.add(d);
        return recoverApplied(
          await call(name, { ...args, mode: "APPLY", preview_digest: d }),
          name === "create_trip"
            ? prepareTrip(context.accountId, args)
            : name === "create_trip_item"
              ? prepareCreate(context.accountId, args)
              : prepareUpdate(context.accountId, args),
        );
      }
      async function databaseVerify(
        operationId: string,
        itemId: string,
        prepared: PreparedMutation,
      ) {
        z.uuid().parse(operationId);
        z.uuid().parse(itemId);
        const targetTrip = z.uuid().parse(prepared.command.tripId);
        const sql = `BEGIN READ ONLY; SELECT json_build_object('itemCount',(SELECT count(*) FROM public.itinerary_events WHERE id='${itemId}'::uuid AND trip_id='${targetTrip}'::uuid AND owner_account_id='${context.accountId}'::uuid),'items',(SELECT json_agg(to_jsonb(e)) FROM public.itinerary_events e WHERE id='${itemId}'::uuid AND trip_id='${targetTrip}'::uuid),'stay',(SELECT to_jsonb(s) FROM public.trip_stay_details s WHERE event_id='${itemId}'::uuid AND trip_id='${targetTrip}'::uuid),'receipt',(SELECT body FROM public.trip_core_command_receipts WHERE operation_id='${operationId}'::uuid AND actor_account_id='${context.accountId}'::uuid AND trip_id='${targetTrip}'::uuid)) AS evidence; ROLLBACK;`;
        const file = `/private/tmp/otr-mcp-${operationId}.sql`;
        writeFileSync(file, sql, { mode: 0o600 });
        const raw = execFileSync(
          "node_modules/.bin/supabase",
          [
            "db",
            "query",
            "--linked",
            "--project-ref",
            "tuqigdxrvrerfewsxqgm",
            "--file",
            file,
            "--output",
            "json",
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 },
        );
        return verifyGoldenReadback(JSON.parse(raw), prepared, context.accountId);
      }
      async function foreignWriteNegative() {
        const negativeCommand = prepareUpdate(context.accountId, {
          request_id: fixture.foreign_write_request_id,
          trip_id: "9a96becb-a10b-4c58-b50d-2547dd61b0b7",
          item_id: "85ef0df8-d9b2-42b7-98c3-e94404ff2033",
          expected_revision: Number.MAX_SAFE_INTEGER,
          change: { kind: "TEXT", title: "Unauthorized QA write must be denied" },
        });
        assert.equal(negativeCommand.kind, "ITEM");
        const negative = await fetch(
          DEV_BACKEND + "/v2/trips/9a96becb-a10b-4c58-b50d-2547dd61b0b7/core/commands",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + session.accessToken,
              "Content-Type": "application/json",
              "X-OTR-Core-Contract-Version": "2",
              "Idempotency-Key": fixture.foreign_write_request_id,
            },
            body: JSON.stringify(negativeCommand.command),
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          },
        );
        assert([403, 404].includes(negative.status), "FOREIGN_WRITE_NOT_DENIED");
        await negative.body?.cancel();
        facts.independentForeignWriteDenied = negative.status;
      }
      try {
        facts.phase = "MCP_CLIENT_CONNECT";
        save();
        await client.connect(
          new StreamableHTTPClientTransport(new URL(resource), {
            requestInit: { headers: { Authorization: "Bearer " + session.accessToken } },
          }),
        );
        if (stage === "NELSON_DATE_EDIT") {
          const checkpoint = z
            .object({
              trip: z.object({ trip_id: z.uuid() }),
              operations: z
                .array(z.object({ item_id: z.uuid(), operation_id: z.uuid() }))
                .length(3),
            })
            .parse(
              JSON.parse(
                readFileSync("docs/mcp/acceptance/NELSON_CREATE_CHECKPOINT.json", "utf8"),
              ),
            );
          const tripId = checkpoint.trip.trip_id,
            itemId = checkpoint.operations[1].item_id;
          assert.equal(tripId, "cc44a705-6f43-41e0-a2f9-16f334b2a6b2");
          assert.equal(itemId, "73f6d7a2-3191-46ca-aba9-ea57d61f2183");
          assert.equal(
            checkpoint.operations[1].operation_id,
            fixture.nelson_change_request_ids[1],
          );
          const args = {
            request_id: fixture.date_edit_request_id,
            trip_id: tripId,
            item_id: itemId,
            expected_revision: 1,
            change: { kind: "DATES", dates: { start_date: "2026-12-12" } },
          };
          const prepared = prepareUpdate(context.accountId, args);
          allowedResumePosts.set(fixture.date_edit_request_id, prepared);
          facts.nativeCheckpoint = "ACTUAL_NATIVE_OWNER_READY_BEFORE_THIS_QA_ACTION";
          facts.nelsonTripId = tripId;
          facts.itemId = itemId;
          const edited = await approvedCall("update_trip_item", args);
          facts.edit = edited;
          save();
          assert.equal(edited.outcome, "APPLIED");
          const proof = await databaseVerify(
            fixture.date_edit_request_id,
            itemId,
            prepared,
          );
          assert.equal(proof.status, "SERVER_VERIFIED");
          facts.independentSupabase = proof;
          const readback = await call("get_trip_item", {
            trip_id: tripId,
            item_id: itemId,
          });
          const detail = itemSchema.parse(readback.item);
          assert.equal(detail.itemId, itemId);
          assert.equal(detail.tripId, tripId);
          assert.equal(detail.itemRevision, 2);
          assert.equal(detail.schedule.start?.localDate, "2026-12-12");
          facts.readbackSha256 = digest(detail);
          facts.ownDatePostCount =
            resumePostCounts.get(fixture.date_edit_request_id) ?? 0;
          facts.status = "NELSON_DATE_EDIT_CLOUD_PASS_NATIVE_AFTER_EDIT_PENDING";
          return;
        }
        if (stage === "NELSON_STATUS") {
          const plannedTrip = prepareTrip(context.accountId, {
            request_id: fixture.nelson_trip_request_id,
            name: "MCP Synthetic Nelson QA 20261031",
            destinations: ["Nelson", "Abel Tasman"],
            dates: { start_date: "2026-12-10", end_date: "2026-12-13" },
          });
          const tripId = mutationIdentity(context.accountId, plannedTrip).trip_id;
          facts.nelsonTripId = tripId;
          const statuses = [];
          for (const operationId of fixture.nelson_change_request_ids) {
            statuses.push(
              await call("get_operation_status", {
                trip_id: tripId,
                operation_id: operationId,
                target: "ITEM",
              }),
            );
            facts.statuses = statuses;
            save();
          }
          facts.status = "STATUS_QUERY_COMPLETE_NOT_NOCOMMIT_PROOF";
          return;
        }
        if (stage !== "P3_VERIFY" && stage !== "NELSON_RESUME") {
          facts.phase = "DIRECT_P3_BASELINE";
          save();
          const directP3 = await direct(
            `/v2/trips/${context.tripId}/core/objects/ITEM/${fixture.existing_p3_id}`,
          );
          facts.directP3HttpStatus = directP3.status;
          if (directP3.ok) {
            const parsed = itemSchema.safeParse(await directP3.json());
            facts.directP3Schema = parsed.success
              ? "PASS"
              : parsed.error.issues
                  .slice(0, 8)
                  .map((issue) => ({ code: issue.code, path: issue.path }));
          } else await directP3.body?.cancel();
          save();
          const tools = await client.listTools();
          facts.discovery = tools.tools.map((t) => t.name);
          const listed = await call("list_trips", {});
          const independent = await direct("/v2/trips?limit=20");
          assert.equal(independent.status, 200);
          assert.equal(digest(listed.trips), digest((await independent.json()).trips));
          facts.tripListIndependentHash = "MATCH";
          const trip = await call("get_trip", { trip_id: context.tripId });
          assert.equal((trip.trip as { id: string }).id, context.tripId);
          const items = await call("list_trip_items", {
            trip_id: context.tripId,
            limit: 25,
          });
          facts.itemCount = z.array(z.unknown()).parse(items.items).length;
          const p3 = await call("get_trip_item", {
            trip_id: context.tripId,
            item_id: fixture.existing_p3_id,
          });
          const r = await direct(
            `/v2/trips/${context.tripId}/core/objects/ITEM/${fixture.existing_p3_id}`,
          );
          assert.equal(r.status, 200);
          assert.equal(digest(p3.item), digest(itemSchema.parse(await r.json())));
          facts.p3IndependentHash = digest(p3.item);
          const denied = await client.callTool({
            name: "get_trip_item",
            arguments: {
              trip_id: "9a96becb-a10b-4c58-b50d-2547dd61b0b7",
              item_id: "85ef0df8-d9b2-42b7-98c3-e94404ff2033",
            },
          });
          assert.equal((denied as { isError?: boolean }).isError, true);
          const denyBackend = await direct(
            "/v2/trips/9a96becb-a10b-4c58-b50d-2547dd61b0b7/core/objects/ITEM/85ef0df8-d9b2-42b7-98c3-e94404ff2033",
          );
          assert([403, 404].includes(denyBackend.status));
          facts.foreignPrivateDenied = denyBackend.status;
          if (stage === "READ") {
            facts.status = "INTERNAL_READ_GOLDEN_PASS";
            return;
          }
          const caps = await direct(`/v2/trips/${context.tripId}/core/capabilities`);
          assert.equal(caps.status, 200);
          const capability = coreCapabilitiesSchema.parse(await caps.json());
          assert(
            capability.enabledFamilies.includes("P3") &&
              capability.enabledCommands.includes("CREATE_ITEM"),
          );
          facts.capability = "OWNING_P3_MANUAL_ENABLED";
        }
        if (stage === "P3_VERIFY") {
          const create = prepareCreate(context.accountId, fixture.create);
          const identity = mutationIdentity(context.accountId, create);
          const edit = prepareUpdate(context.accountId, {
            request_id: fixture.edit_request_id,
            trip_id: context.tripId,
            item_id: fixture.expected_item_id,
            expected_revision: 1,
            change: { kind: "TEXT", title: "MCP Synthetic Nelson Stay 1031 · Edited" },
          });
          for (const operationId of [identity.operation_id, fixture.edit_request_id]) {
            const status = await call("get_operation_status", {
              trip_id: context.tripId,
              operation_id: operationId,
              target: "ITEM",
            });
            facts[operationId === identity.operation_id ? "createStatus" : "editStatus"] =
              status;
            save();
            assert.equal(status.outcome, "APPLIED");
          }
          approved.add(identity.preview_digest);
          const replay = await call("create_trip_item", {
            ...fixedCreate,
            mode: "APPLY",
            preview_digest: identity.preview_digest,
          });
          assert.equal(replay.outcome, "APPLIED");
          assert.equal(replay.item_id, fixture.expected_item_id);
          facts.createReplay = "FORMAL_RECEIPT_APPLIED_WITH_GET_ONLY_PORT_NO_POST";
          const item = await call("get_trip_item", {
            trip_id: context.tripId,
            item_id: fixture.expected_item_id,
          });
          const detail = itemSchema.parse(item.item);
          assert.equal(detail.itemId, fixture.expected_item_id);
          assert.equal(detail.tripId, context.tripId);
          assert.equal(detail.itemRevision, 2);
          assert.equal(detail.title, "MCP Synthetic Nelson Stay 1031 · Edited");
          facts.itemReadbackSha256 = digest(detail);
          facts.finalSupabase = await databaseVerify(
            fixture.edit_request_id,
            fixture.expected_item_id,
            edit,
          );
          assert.equal(
            (facts.finalSupabase as { status: string }).status,
            "SERVER_VERIFIED",
          );
          await foreignWriteNegative();
          facts.status = "INTERNAL_P3_CLOUD_PASS_NATIVE_TITLE_EDIT_UNOBSERVABLE";
        } else if (stage === "P3") {
          const q = z.record(z.string(), z.unknown()).parse(fixture.create);
          let created: Record<string, unknown>;
          if (recoverP3) {
            const identity = mutationIdentity(
              context.accountId,
              prepareCreate(context.accountId, q),
            );
            const status = await call("get_operation_status", {
              trip_id: context.tripId,
              operation_id: identity.operation_id,
              target: "ITEM",
            });
            facts.originalCreateRecovery = status;
            save();
            assert.equal(status.outcome, "APPLIED", "SAME_OPERATION_NOT_APPLIED");
            assert(
              z.number().int().positive().safe().safeParse(status.current_revision)
                .success,
            );
            created = {
              ...identity,
              outcome: "APPLIED",
              current_revision: status.current_revision,
            };
          } else created = await approvedCall("create_trip_item", q);
          facts.create = created;
          save();
          assert.equal(created.outcome, "APPLIED");
          const id = z.uuid().parse(created.item_id);
          const own = await direct(`/v2/trips/${context.tripId}/core/objects/ITEM/${id}`);
          assert.equal(own.status, 200);
          const detail = itemSchema.parse(await own.json());
          assert(detail.itemRevision >= Number(created.current_revision));
          const createDb = await databaseVerify(
            z.uuid().parse(created.operation_id),
            id,
            prepareCreate(context.accountId, q),
          );
          facts.createSupabase = createDb;
          save();
          facts.phase = "WAITING_NATIVE_CREATE_OBSERVATION";
          save();
          console.info(
            JSON.stringify({
              phase: facts.phase,
              itemId: id,
              operationId: created.operation_id,
              outcome: created.outcome,
              revision: created.current_revision,
              committedAt: createDb.committedAt,
              at: new Date().toISOString(),
            }),
          );
          const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
          try {
            let continued = false;
            for await (const line of input) {
              assert.equal(line.trim(), "CONTINUE_AFTER_NATIVE_CREATE");
              continued = true;
              break;
            }
            assert(continued, "NATIVE_CREATE_OBSERVATION_REQUIRED");
          } finally {
            input.close();
          }
          const edited = await approvedCall("update_trip_item", {
            request_id: fixture.edit_request_id,
            trip_id: context.tripId,
            item_id: id,
            expected_revision: Number(created.current_revision),
            change: { kind: "TEXT", title: "MCP Synthetic Nelson Stay 1031 · Edited" },
          });
          facts.edit = edited;
          facts.editObservedAt = new Date().toISOString();
          save();
          assert.equal(edited.outcome, "APPLIED");
          facts.editSupabase = await databaseVerify(
            fixture.edit_request_id,
            id,
            prepareUpdate(context.accountId, {
              request_id: fixture.edit_request_id,
              trip_id: context.tripId,
              item_id: id,
              expected_revision: Number(created.current_revision),
              change: { kind: "TEXT", title: "MCP Synthetic Nelson Stay 1031 · Edited" },
            }),
          );
          assert.equal(
            (facts.editSupabase as { status: string }).status,
            "SERVER_VERIFIED",
          );
          if (!recoverP3) {
            const preview = mutationIdentity(
              context.accountId,
              prepareCreate(context.accountId, q),
            );
            approved.add(preview.preview_digest);
            const replay = await call("create_trip_item", {
              ...q,
              mode: "APPLY",
              preview_digest: preview.preview_digest,
            });
            assert.equal(replay.item_id, id);
            assert.equal(replay.outcome, "APPLIED");
            facts.replay = "SAME_TARGET_SAME_OPERATION";
          } else facts.replay = "UNKNOWN_CREATE_NOT_REPOSTED_STATUS_ONLY";
          const status = await call("get_operation_status", {
            trip_id: context.tripId,
            operation_id: fixture.edit_request_id,
            target: "ITEM",
          });
          assert.equal(status.outcome, "APPLIED");
          await foreignWriteNegative();
          facts.status = "INTERNAL_P3_BACKEND_PASS_IPAD_PENDING";
        } else {
          const createdTrip = await approvedCall("create_trip", {
            request_id: fixture.nelson_trip_request_id,
            name: "MCP Synthetic Nelson QA 20261031",
            destinations: ["Nelson", "Abel Tasman"],
            dates: { start_date: "2026-12-10", end_date: "2026-12-13" },
          });
          facts.tripCreate = createdTrip;
          save();
          assert.equal(createdTrip.outcome, "APPLIED");
          const nelsonTrip = z.uuid().parse(createdTrip.trip_id);
          const changes = [
            {
              kind: "CREATE",
              request_id: fixture.nelson_change_request_ids[0],
              item: {
                family: "P3",
                title: "Synthetic Nelson QA lodge (unbooked)",
                property_name: "Synthetic QA Lodge",
                dates: { start_date: "2026-12-10", end_date: "2026-12-13" },
                notes: "Synthetic QA only. No Booking/Ticket.",
              },
            },
            {
              kind: "CREATE",
              request_id: fixture.nelson_change_request_ids[1],
              item: {
                family: "P1",
                title: "Synthetic Abel Tasman QA walk",
                place: "Abel Tasman",
                dates: { start_date: "2026-12-11" },
                notes:
                  "Synthetic draft itinerary requested as Manual plan; no actual route or booking.",
              },
            },
            {
              kind: "CREATE",
              request_id: fixture.nelson_change_request_ids[2],
              item: {
                family: "P6",
                title: "Synthetic Nelson QA gallery visit",
                place: "Nelson",
                dates: { start_date: "2026-12-12" },
                notes: "Synthetic planned activity, no admission Ticket.",
              },
            },
          ];
          const plan = { trip_id: nelsonTrip, changes };
          const preview = await call("preview_trip_changes", plan);
          facts.preview = preview;
          save();
          assert.equal(preview.outcome, "PREVIEW");
          approved.add(z.string().parse(preview.preview_digest));
          let applied: Record<string, unknown>;
          if (stage === "NELSON_RESUME") {
            const original = z
              .object({
                accountId: z.uuid(),
                preview: z.object({
                  trip_id: z.uuid(),
                  operations: z.array(z.record(z.string(), z.unknown())).length(3),
                }),
              })
              .parse(
                JSON.parse(
                  readFileSync("docs/mcp/acceptance/NELSON_ATTEMPT_01.json", "utf8"),
                ),
              );
            assert.equal(original.accountId, context.accountId);
            assert.equal(original.preview.trip_id, nelsonTrip);
            for (let i = 0; i < changes.length; i++) {
              const { kind: _, ...change } = changes[i];
              void _;
              const current = mutationIdentity(
                context.accountId,
                prepareCreate(context.accountId, { ...change, trip_id: nelsonTrip }),
              );
              assert.equal(
                current.preview_digest,
                original.preview.operations[i].preview_digest,
                "ORIGINAL_INTENT_CHANGED",
              );
              assert.equal(
                current.operation_id,
                original.preview.operations[i].operation_id,
              );
              assert.equal(current.item_id, original.preview.operations[i].item_id);
            }
            facts.originalIntentBinding =
              "ALL_THREE_ORIGINAL_ACCOUNT_TRIP_TARGET_COMMAND_DIGESTS_MATCH";
            applied = {
              outcome: "RECOVERY_REQUIRED",
              operations: original.preview.operations.map((o) => ({
                ...o,
                outcome: "UNKNOWN",
                error_code: "ORIGINAL_BATCH_RESPONSE_LOST",
              })),
            };
          } else
            applied = await call("apply_trip_changes", {
              ...plan,
              preview_digest: preview.preview_digest,
            });
          facts.apply = applied;
          save();
          const rawOperations = z
            .array(z.record(z.string(), z.unknown()))
            .length(3)
            .parse(applied.operations);
          const completed = [];
          const verified = [];
          for (let i = 0; i < rawOperations.length; i++) {
            let result = rawOperations[i];
            assert.equal(result.operation_id, changes[i].request_id);
            if (stage === "NELSON_RESUME" && i === 2) {
              assert.equal(verified.length, 2, "ACCEPTED_PREFIX_NOT_VERIFIED");
              const response = await direct(`/v2/trips/${nelsonTrip}/core/capabilities`);
              assert.equal(response.status, 200);
              const caps = coreCapabilitiesSchema.parse(await response.json());
              assert(
                caps.activationState === "ENABLED" &&
                  caps.enabledCommands.includes("CREATE_ITEM") &&
                  caps.enabledFamilies.includes("P6") &&
                  caps.enabledAdmissionModes.includes("MANUAL"),
              );
              const { kind: _, ...change } = changes[i];
              void _;
              const prepared = prepareCreate(context.accountId, {
                ...change,
                trip_id: nelsonTrip,
              });
              allowedResumePosts.set(changes[i].request_id, prepared);
              facts.explicitManualRecovery = {
                requestedAt: new Date().toISOString(),
                operationId: changes[i].request_id,
                sameIntent: true,
                maximumOwnPostAttempts: 1,
                previous404IsNotNoCommit: true,
              };
              save();
              const subset = { trip_id: nelsonTrip, changes: [changes[i]] };
              const reviewed = await call("preview_trip_changes", subset);
              assert.equal(reviewed.outcome, "PREVIEW");
              approved.add(z.string().parse(reviewed.preview_digest));
              const attempt = await call("apply_trip_changes", {
                ...subset,
                preview_digest: reviewed.preview_digest,
              });
              facts.explicitManualRecoveryResult = attempt;
              save();
              result = z
                .array(z.record(z.string(), z.unknown()))
                .length(1)
                .parse(attempt.operations)[0];
            }
            if (
              result.outcome === "PREVIEW" &&
              result.error_code === "NOT_SUBMITTED_AFTER_STOP"
            ) {
              // Only the explicit unsubmitted suffix; exact same confirmed synthetic operation/fields.
              const subset = { trip_id: nelsonTrip, changes: [changes[i]] };
              const nextPreview = await call("preview_trip_changes", subset);
              assert.equal(nextPreview.outcome, "PREVIEW");
              const nextDigest = z.string().parse(nextPreview.preview_digest);
              approved.add(nextDigest);
              const next = await call("apply_trip_changes", {
                ...subset,
                preview_digest: nextDigest,
              });
              const operation = z
                .array(z.record(z.string(), z.unknown()))
                .length(1)
                .parse(next.operations)[0];
              assert.equal(operation.operation_id, changes[i].request_id);
              result = operation;
            }
            const { kind: _, ...change } = changes[i];
            void _;
            const prepared = prepareCreate(context.accountId, {
              ...change,
              trip_id: nelsonTrip,
            });
            result = await recoverApplied(result, prepared);
            completed.push(result);
            facts.compositeBatchProgress = completed;
            save();
            assert.equal(result.outcome, "APPLIED", "UNKNOWN_REQUIRES_QUERY_NOT_REPOST");
            const proof = await databaseVerify(
              z.uuid().parse(result.operation_id),
              z.uuid().parse(result.item_id),
              prepared,
            );
            assert.equal(proof.status, "SERVER_VERIFIED");
            verified.push(proof);
            facts.independentSupabase = verified;
            save();
          }
          facts.batchCompletionSource =
            "FORMAL_INDIVIDUAL_RECEIPTS_NOT_SERVER_ATOMIC_BATCH";
          const results = z
            .array(
              z.object({
                item_id: z.uuid(),
                operation_id: z.uuid(),
                outcome: z.literal("APPLIED"),
              }),
            )
            .parse(completed);
          assert.equal(results.length, 3);
          facts.independentSupabase = verified;
          facts.phase = "WAITING_NATIVE_NELSON_OBSERVATION";
          save();
          console.info(
            JSON.stringify({
              phase: facts.phase,
              tripId: nelsonTrip,
              items: results,
              commits: verified,
              at: new Date().toISOString(),
            }),
          );
          const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
          try {
            let continued = false;
            for await (const line of input) {
              assert.equal(line.trim(), "CONTINUE_AFTER_NATIVE_NELSON");
              continued = true;
              break;
            }
            assert(continued, "NATIVE_NELSON_OBSERVATION_REQUIRED");
          } finally {
            input.close();
          }
          if (stage === "NELSON_RESUME")
            allowedResumePosts.set(
              fixture.date_edit_request_id,
              prepareUpdate(context.accountId, {
                request_id: fixture.date_edit_request_id,
                trip_id: nelsonTrip,
                item_id: results[1].item_id,
                expected_revision: 1,
                change: { kind: "DATES", dates: { start_date: "2026-12-12" } },
              }),
            );
          const edited = await approvedCall("update_trip_item", {
            request_id: fixture.date_edit_request_id,
            trip_id: nelsonTrip,
            item_id: results[1].item_id,
            expected_revision: 1,
            change: { kind: "DATES", dates: { start_date: "2026-12-12" } },
          });
          facts.oneItemEdit = edited;
          save();
          assert.equal(edited.outcome, "APPLIED");
          facts.oneItemEditSupabase = await databaseVerify(
            fixture.date_edit_request_id,
            results[1].item_id,
            prepareUpdate(context.accountId, {
              request_id: fixture.date_edit_request_id,
              trip_id: nelsonTrip,
              item_id: results[1].item_id,
              expected_revision: 1,
              change: { kind: "DATES", dates: { start_date: "2026-12-12" } },
            }),
          );
          assert.equal(
            (facts.oneItemEditSupabase as { status: string }).status,
            "SERVER_VERIFIED",
          );
          const readback = await call("list_trip_items", { trip_id: nelsonTrip });
          assert.equal(z.array(z.unknown()).parse(readback.items).length, 3);
          facts.readbackSha256 = digest(readback.items);
          facts.status = "INTERNAL_NELSON_BACKEND_PASS_IPAD_PENDING";
        }
      } catch (error) {
        facts.failureClass =
          error instanceof z.ZodError
            ? "SCHEMA"
            : error instanceof Error && error.name === "TimeoutError"
              ? "TIMEOUT"
              : error instanceof Error && error.name === "AbortError"
                ? "ABORTED"
                : error instanceof Error && error.name === "AssertionError"
                  ? "ASSERTION"
                  : "REQUEST_OR_PROTOCOL";
        save();
        throw error;
      } finally {
        await client.close().catch(() => {});
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
    facts.sessionCleanup = sessionEvidence.ownSessionCleanup;
  } catch {
    facts.status =
      stage === "READ"
        ? "READ_FAILED_NO_BUSINESS_WRITE"
        : "FAILED_OR_UNKNOWN_QUERY_SAME_OPERATION";
  } finally {
    save();
  }
  return facts;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stage = z
    .enum([
      "READ",
      "P3",
      "NELSON",
      "P3_VERIFY",
      "NELSON_STATUS",
      "NELSON_RESUME",
      "NELSON_DATE_EDIT",
    ])
    .parse(process.env.OTR_MCP_QA_CASE);
  console.info(JSON.stringify(await runGolden(stage)));
}
