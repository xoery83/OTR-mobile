import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import { createUniversalV3Execution } from "./universalV3Execution";
import { createUniversalV3Intake } from "./universalV3Intake";

type Stores = Parameters<typeof createUniversalV3Execution>[0]["stores"];
type Pin = { reference: string; sha256: string; byteCount: number };
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

it.each(["review without usage", "unknown"] as const)(
  "uses the normal HTTP and durable Wake path without CP14/CP15 for %s",
  async (outcome) => {
    const root = await mkdtemp(join(tmpdir(), "otr-v3-ordinary-"));
    const database = join(root, "task.sqlite");
    let sql = new DatabaseSync(database);
    try {
      const actor = randomUUID(),
        reader = randomUUID(),
        trip = randomUUID();
      const analysis = randomUUID(),
        fileId = randomUUID(),
        documentId = randomUUID();
      const original = Buffer.from("Rail museum on 2026-12-14");
      const manifest = {
        version: "otr.import.local-first/1",
        tripId: trip,
        mode: "UNIVERSAL",
        files: [
          {
            fileId,
            documentId,
            mediaType: "text/plain",
            length: original.length,
            sha256: sha(original),
          },
        ],
      };
      const gateway = {
        async validateAccessToken(token: string) {
          if (token === "editor") return { id: actor, accountClass: "NORMAL_ACCOUNT" };
          if (token === "reader") return { id: reader, accountClass: "NORMAL_ACCOUNT" };
          return null;
        },
        async canReadTrip(account: string, id: string) {
          return id === trip && (account === actor || account === reader);
        },
        async canWriteTrip(account: string, id: string) {
          return id === trip && account === actor;
        },
      } as DevBackendGateway;
      const bytes = new Map<string, Uint8Array>();
      const raw = new Map<string, { pin: Pin; binding: unknown }>();
      const retained = new Map<string, Pin>();
      const stores = {
        custody: {
          async put(input: {
            reservationId: string;
            accountId: string;
            bytes: Uint8Array;
            sha256: string;
          }) {
            expect(sha(input.bytes)).toBe(input.sha256);
            bytes.set(input.accountId + input.reservationId, input.bytes);
          },
          async read(input: { reference: string; accountId: string; sha256: string }) {
            const found = bytes.get(input.accountId + input.reference);
            if (!found || sha(found) !== input.sha256)
              throw Error("FIXTURE_PRIVATE_CUSTODY");
            return found;
          },
        },
        retained: {
          async put(a: { attempt_id: string }, pin: Pin) {
            retained.set(a.attempt_id, pin);
          },
          async read(a: { attempt_id: string }) {
            return retained.get(a.attempt_id);
          },
        },
        async retainRaw(account: string, call: string, pin: Pin, binding: unknown) {
          raw.set(account + call, { pin, binding });
        },
        async readRaw(account: string, call: string) {
          return raw.get(account + call);
        },
      } as unknown as Stores;
      const send = vi.fn(async () => {
        if (outcome === "unknown") throw Error("FIXTURE_CONNECTION_LOST");
        return {
          status: 200,
          redirected: false,
          body: (async function* () {
            yield Buffer.from(
              JSON.stringify({
                id: "fixture-deepseek-request",
                model: "deepseek-flash",
                choices: [
                  {
                    finish_reason: "stop",
                    message: {
                      content: JSON.stringify({
                        items: [
                          {
                            kind: "P1",
                            subtype: "ACTIVITY",
                            fields: { "activity.name": "Rail museum" },
                            inputs: [0],
                          },
                        ],
                      }),
                    },
                  },
                ],
              }),
            );
          })(),
        };
      });
      const legacySelect = vi.fn(() => {
        throw Error("LEGACY_SCOPE_UNAVAILABLE");
      });
      const coreCapability = vi.fn(() => {
        throw Error("CORE_GATE_UNAVAILABLE");
      });
      const make = () => {
        const db = initializeUniversalTaskDatabase(sql);
        const intake = createUniversalV3Intake(db, join(root, "spool"));
        const execution = createUniversalV3Execution({
          db,
          intake,
          stores,
          send,
          ordinaryProvider: () => "fixture-key",
          validateImage: async () => {
            throw Error("UNEXPECTED_IMAGE");
          },
          async provision(scope, request, write) {
            const token =
              request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
            return {
              selectProvider: legacySelect,
              async assertCurrent() {
                const user = await gateway.validateAccessToken(token);
                const allowed = write ? gateway.canWriteTrip : gateway.canReadTrip;
                if (
                  user?.id !== scope.accountId ||
                  !(await allowed(scope.accountId, scope.tripId))
                )
                  throw Error("FIXTURE_FORBIDDEN");
              },
            };
          },
        });
        return createDevBackendHandler({
          gateway,
          coreConnection: { read: { capabilities: coreCapability } } as never,
          universalV3Intake: intake,
          universalV3Execution: execution,
        });
      };
      let handle = make();
      const base = `http://localhost/v2/import-batches/${analysis}/interpretations/intake`;
      const get = (path = "", token = "editor", query = "") =>
        handle(
          new Request(`${base}${path}?tripId=${trip}${query}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
      const start = (token = "editor") =>
        handle(
          new Request(`${base}?tripId=${trip}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": analysis },
            body: JSON.stringify(manifest),
          }),
        );
      const upload = (data: Buffer = original) =>
        handle(
          new Request(`${base}/files/${fileId}?tripId=${trip}`, {
            method: "PUT",
            headers: {
              Authorization: "Bearer editor",
              "Content-Type": "application/octet-stream",
              "Content-Length": String(data.length),
            },
            body: new Uint8Array(data),
          }),
        );

      expect(await (await get("/capability")).json()).toEqual({
        localFirst: true,
        existing: null,
      });
      expect(await (await get("/capability", "reader")).json()).toEqual({
        localFirst: false,
        existing: null,
      });
      expect((await start("reader")).status).toBe(403);
      expect((await start("invalid")).status).toBe(401);
      expect((await start()).status).toBe(202);
      expect((await upload(Buffer.alloc(original.length, 1))).status).toBe(422);
      expect(send).not.toHaveBeenCalled();
      expect((await upload()).status).toBe(204);
      const expectedState = outcome === "unknown" ? "OUTCOME_UNKNOWN" : "REVIEW_READY";
      await vi.waitFor(async () => {
        const result = await (await get("", "editor", "&execution=1")).json();
        expect(result.state).toBe(expectedState);
        if (outcome !== "unknown")
          expect(result.candidates[0].documentIds).toEqual([documentId]);
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect(legacySelect).not.toHaveBeenCalled();
      expect(coreCapability).not.toHaveBeenCalled();
      expect((await get("", "reader", "&execution=1")).status).toBe(404);
      const attempt = sql
        .prepare(
          "SELECT request_sha256,reported_usage_summary FROM intelligence_continuation_attempts",
        )
        .get();
      expect(attempt?.request_sha256).toMatch(/^[0-9a-f]{64}$/);
      if (outcome !== "unknown")
        expect(JSON.parse(String(attempt?.reported_usage_summary)).usage_quality).toBe(
          "UNKNOWN",
        );

      await vi.waitFor(() => {
        const wake = sql.prepare("SELECT status FROM sync_operations").get();
        expect(wake?.status).toBe("COMPLETED");
      });
      sql.close();
      sql = new DatabaseSync(database);
      handle = make();
      expect((await start()).status).toBe(202);
      expect((await upload()).status).toBe(204);
      expect((await (await get("", "editor", "&execution=1")).json()).state).toBe(
        expectedState,
      );
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      sql.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
