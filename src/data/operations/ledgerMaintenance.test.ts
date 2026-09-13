import { describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("@/data/files/receiptFileStore", () => ({
  receiptBytesSha256: vi.fn(),
  resolveReceiptFile: vi.fn(),
}));
vi.mock("@/data/sync/ledgerReceiptTransport", () => ({
  createLedgerReceiptTransport: vi.fn(),
}));

// eslint-disable-next-line import/first
import {
  cleanupReconstructibleLedgerData,
  enforceReceiptCacheLimit,
  readLedgerSupportDiagnostics,
} from "./ledgerMaintenance";

describe("Ledger operational maintenance", () => {
  it("deletes only completed operational rows", async () => {
    const statements: string[] = [];
    const database = {
      async runAsync(sql: string) {
        statements.push(sql);
        return { changes: 1 } as never;
      },
      async getAllAsync() {
        return [] as never;
      },
      async getFirstAsync() {
        return null;
      },
    };
    await cleanupReconstructibleLedgerData(database, "2026-08-01T00:00:00.000Z");
    expect(statements[0]).toContain("status = 'COMPLETED'");
    expect(statements[0]).toContain("next_attempt_at = NULL");
    expect(statements.filter((sql) => sql.startsWith("DELETE"))).toEqual([
      "DELETE FROM sync_operations WHERE status = 'COMPLETED' AND updated_at < ?",
      "DELETE FROM ledger_asset_operations WHERE status = 'COMPLETED' AND updated_at < ?",
    ]);
  });

  it("never evicts pending, failed or unuploaded receipt originals", async () => {
    const download = vi.fn();
    const database = {
      async getAllAsync() {
        return [
          {
            id: "pending",
            serverId: null,
            journeyId: "journey",
            localUri: "file:///pending.jpg",
            sizeBytes: 10,
            sha256: "a".repeat(64),
            uploadStatus: "PENDING",
          },
          {
            id: "failed",
            serverId: "server",
            journeyId: "journey",
            localUri: "file:///failed.jpg",
            sizeBytes: 10,
            sha256: "b".repeat(64),
            uploadStatus: "FAILED",
          },
        ] as never;
      },
      async getFirstAsync() {
        return null;
      },
      async runAsync() {
        return { changes: 0 } as never;
      },
    };
    await expect(enforceReceiptCacheLimit(database, 0, download)).resolves.toMatchObject({
      evictedCount: 0,
      overLimit: true,
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("keeps an uploaded copy when canonical recovery is unavailable", async () => {
    const database = {
      async getAllAsync() {
        return [
          {
            id: "uploaded",
            serverId: "server",
            journeyId: "journey",
            localUri: "file:///uploaded.jpg",
            sizeBytes: 10,
            sha256: "a".repeat(64),
            uploadStatus: "UPLOADED",
          },
        ] as never;
      },
      async getFirstAsync() {
        return null;
      },
      async runAsync() {
        throw new Error("must not delete");
      },
    };
    await expect(
      enforceReceiptCacheLimit(database, 0, async () => {
        throw new Error("404");
      }),
    ).resolves.toMatchObject({
      evictedCount: 0,
      recoveryUnavailableCount: 1,
      overLimit: true,
    });
  });

  it("diagnostics select counts only and cannot expose sensitive canaries", async () => {
    const sql: string[] = [];
    const database = {
      async getAllAsync(statement: string) {
        sql.push(statement);
        return [] as never;
      },
      async getFirstAsync(statement: string) {
        sql.push(statement);
        if (statement.includes("page_count")) return { page_count: 1 } as never;
        if (statement.includes("page_size")) return { page_size: 4096 } as never;
        return { count: 1, bytes: 10 } as never;
      },
      async runAsync() {
        return { changes: 0 } as never;
      },
    };
    const output = JSON.stringify(await readLedgerSupportDiagnostics(database));
    expect(output).not.toMatch(/token-canary|name-canary|note-canary|amount-canary/);
    expect(sql.join("\n")).not.toMatch(/payload_json|title|notes|original_amount/);
  });
});
