import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import {
  cloudSourceP1Command,
  cloudSourceP1QueueSql,
  createNormalTripSyncWake,
} from "./tripNormalSync";
import { getNormalTripQueueActivity } from "./tripNormalQueueActivity";
import { p1SharedParticipantsReady } from "./p1SharedParticipantQualification";
import { universalP1SourceFixture } from "../../../backend/src/__fixtures__/universalP1Source";
import { universalP2SourceFixture } from "../../../backend/src/__fixtures__/universalP2Source";
import { validateCoreCommand } from "../../domain/trip/tripCoreV2Commands";
it.each(["P3", "P2"] as const)(
  "selects reviewed %s on a cloud-only Trip without enabling Manual",
  async (family) => {
    const sql = new DatabaseSync(":memory:");
    try {
      sql.exec("PRAGMA foreign_keys=ON");
      for (const migration of migrations) sql.exec(migration.sql);
      const database = serializeDatabaseTransactions({
        async getFirstAsync<T>(query: string, ...args: unknown[]) {
          return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
        },
        async getAllAsync<T>(query: string, ...args: unknown[]) {
          return sql.prepare(query).all(...(args as never[])) as T[];
        },
        async runAsync(query: string, ...args: unknown[]) {
          return sql.prepare(query).run(...(args as never[])) as never;
        },
        async withTransactionAsync(work: () => Promise<void>) {
          sql.exec("BEGIN");
          try {
            await work();
            sql.exec("COMMIT");
          } catch (e) {
            sql.exec("ROLLBACK");
            throw e;
          }
        },
      });
      const f =
          family === "P2"
            ? await universalP2SourceFixture()
            : await universalP1SourceFixture(undefined, undefined, "2026-11-03", "P3"),
        p = await f.run(),
        slot = p.body.plan.slots[0];
      const account = async () => f.input.context.accountId;
      const core = createTripCoreV2Repository(database, account, async (bytes) =>
        createHash("sha256").update(bytes).digest("hex"),
      );
      const context = await core.captureContext(f.input.context.tripId);
      const command = validateCoreCommand({
        contractVersion: 2,
        intentVersion: 2,
        tripId: context.tripId,
        operationId: slot.operationId,
        target: slot.target,
        baseVector: slot.baseVector,
        command: slot.command,
        payload: slot.payload,
        admission: {
          mode: "REVIEWED_SOURCE",
          sourceIntentId: slot.slotId,
          policyVersion: null,
        },
      });
      await core.enqueue(context, command);
      const manual = {
        ...command,
        operationId: randomUUID(),
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      };
      await core.enqueue(context, manual);
      const scope = {
        accountId: context.accountId,
        newTripsFrom: "2000-01-01T00:00:00Z",
      };
      expect((await getNormalTripQueueActivity(database, scope)).actionableNow).toBe(1);
      const rows = await database.getAllAsync<any>(
        cloudSourceP1QueueSql,
        context.accountId,
        scope.newTripsFrom,
      );
      expect(rows).toHaveLength(2);
      expect(rows.map(cloudSourceP1Command).filter(Boolean)).toEqual([command]);
      expect(p1SharedParticipantsReady(command, [])).toBe(true);
      expect(p1SharedParticipantsReady(validateCoreCommand(manual), [])).toBe(false);
      const runP1 = vi.fn(async () => {});
      const wake = createNormalTripSyncWake(
        {
          database,
          account,
          enabled: () => true,
          deferred: { materializeDeferredMetadata: vi.fn() },
          recoverP1Readback: vi.fn(),
          recoverTripReadback: vi.fn(),
          runCreate: vi.fn(),
          runMetadata: vi.fn(),
          runP1,
          runPerson: vi.fn(),
          isManualItem: async () => false,
          participantsReady: async (_trip, c) => p1SharedParticipantsReady(c, []),
        },
        scope,
      );
      expect((await wake("AUTHENTICATED_ONLINE")).runnerCalls).toBe(1);
      expect(runP1).toHaveBeenCalledExactlyOnceWith({
        accountId: context.accountId,
        tripId: context.tripId,
        operationId: command.operationId,
      });
      expect((await wake("OFFLINE")).runnerCalls).toBe(0);
    } finally {
      sql.close();
    }
  },
);
