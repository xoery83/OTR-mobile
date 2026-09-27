import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => new Set<string>());
const failDelete = vi.hoisted(() => ({ value: false }));
vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
  }
  class File {
    uri: string;
    constructor(parent: string | Directory, name?: string) {
      this.uri = typeof parent === "string" ? parent : `${parent.uri}/${name}`;
    }
    get exists() {
      return files.has(this.uri);
    }
    delete() {
      if (failDelete.value) throw new Error("interrupted deletion");
      files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: { uri: "file:///docs" } } };
});
vi.mock("@/data/files/receiptFileStore", () => ({
  receiptBytesSha256: vi.fn(async (bytes: Uint8Array) =>
    bytes.toString() === "1,2,3" ? "a".repeat(64) : "b".repeat(64),
  ),
  resolveReceiptFile: vi.fn((uri: string) => ({
    uri,
    get exists() {
      return files.has(uri);
    },
    delete() {
      if (failDelete.value) throw new Error("interrupted deletion");
      files.delete(uri);
    },
  })),
  verifyReceiptFile: vi.fn(async () => undefined),
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
            localUri: "file:///docs/ledger-receipts/uploaded.jpg",
            sizeBytes: 10,
            sha256: "a".repeat(64),
            mimeType: "image/jpeg",
            objectPath: "journey/server/original",
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
    files.add("file:///docs/ledger-receipts/uploaded.jpg");
    await expect(
      enforceReceiptCacheLimit(
        database,
        0,
        async () => {
          throw new Error("404");
        },
        async () => ({
          objectPath: "journey/server/original",
          sizeBytes: 10,
          sha256: "a".repeat(64),
          mimeType: "image/jpeg",
        }),
      ),
    ).resolves.toMatchObject({
      evictedCount: 0,
      recoveryUnavailableCount: 1,
      overLimit: true,
    });
    files.clear();
  });

  it("requires fresh stat, matching downloaded bytes and no pending operation", async () => {
    const uri = "file:///docs/ledger-receipts/receipt.jpg";
    const row = {
      id: "receipt",
      serverId: "server",
      journeyId: "journey",
      localUri: uri,
      sizeBytes: 3,
      sha256: "a".repeat(64),
      mimeType: "image/jpeg" as const,
      objectPath: "journey/server/original",
      uploadStatus: "UPLOADED",
      deletedAt: null,
      personalPaymentLinkStatus: null,
    };
    let pending = false;
    const writes: string[] = [];
    const database = {
      async getAllAsync() {
        return [row] as never;
      },
      async getFirstAsync() {
        return pending ? { id: "pending" } : null;
      },
      async runAsync(sql: string) {
        writes.push(sql);
        row.localUri = null as never;
        return { changes: 1 } as never;
      },
    };
    const remote: {
      objectPath: string;
      sizeBytes: number;
      sha256: string;
      mimeType: string;
    } = {
      objectPath: row.objectPath,
      sizeBytes: 3,
      sha256: row.sha256,
      mimeType: row.mimeType,
    };
    const download = vi.fn(async () => Uint8Array.from([1, 2, 3]));
    const stat = vi.fn(async () => remote);
    const check = async () => enforceReceiptCacheLimit(database, 0, download, stat);
    files.add(uri);

    pending = true;
    expect((await check()).evictedCount).toBe(0);
    expect(stat).not.toHaveBeenCalled();
    pending = false;
    stat.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await check()).evictedCount).toBe(0);
    stat.mockResolvedValueOnce({ ...remote, sizeBytes: 4 });
    expect((await check()).evictedCount).toBe(0);
    stat.mockResolvedValueOnce({ ...remote, sha256: "b".repeat(64) });
    expect((await check()).evictedCount).toBe(0);
    stat.mockResolvedValueOnce({ ...remote, mimeType: "application/pdf" });
    expect((await check()).evictedCount).toBe(0);
    download.mockRejectedValueOnce(new Error("offline"));
    expect((await check()).evictedCount).toBe(0);
    download.mockResolvedValueOnce(Uint8Array.from([4, 5, 6]));
    expect((await check()).evictedCount).toBe(0);
    expect(files.has(uri)).toBe(true);
    expect(writes).toEqual([]);

    expect((await check()).evictedCount).toBe(1);
    expect(row.localUri).toBeNull();
    expect(files.has(uri)).toBe(false);
    expect(writes[0]).toContain("NOT EXISTS");
    files.clear();
  });

  it("excludes tombstones, unconfirmed and working paths, and preserves DB-first interruption", async () => {
    const uri = "file:///docs/ledger-receipts/receipt.jpg";
    const row = {
      id: "receipt",
      serverId: "server",
      journeyId: "journey",
      localUri: uri,
      sizeBytes: 3,
      sha256: "a".repeat(64),
      mimeType: "image/jpeg" as const,
      objectPath: "journey/server/original",
      uploadStatus: "UPLOADED",
      deletedAt: null as string | null,
      personalPaymentLinkStatus: null as string | null,
    };
    const database = {
      async getAllAsync() {
        return [row] as never;
      },
      async getFirstAsync() {
        return null;
      },
      async runAsync() {
        row.localUri = null as never;
        return { changes: 1 } as never;
      },
    };
    const stat = vi.fn(async () => ({
      objectPath: row.objectPath,
      sizeBytes: 3,
      sha256: row.sha256,
      mimeType: row.mimeType,
    }));
    const check = async () =>
      enforceReceiptCacheLimit(database, 0, async () => Uint8Array.from([1, 2, 3]), stat);
    files.add(uri);
    row.deletedAt = "deleted";
    expect((await check()).evictedCount).toBe(0);
    row.deletedAt = null;
    row.personalPaymentLinkStatus = "DELETE_PENDING";
    expect((await check()).evictedCount).toBe(0);
    row.personalPaymentLinkStatus = null;
    row.uploadStatus = "FAILED";
    expect((await check()).evictedCount).toBe(0);
    row.uploadStatus = "UPLOADED";
    row.localUri = "file:///docs/ledger-receipt-drafts/receipt.jpg";
    expect((await check()).evictedCount).toBe(0);
    row.localUri = uri;
    expect(stat).not.toHaveBeenCalled();

    failDelete.value = true;
    await expect(check()).rejects.toThrow("interrupted deletion");
    expect(row.localUri).toBeNull();
    expect(files.has(uri)).toBe(true);
    failDelete.value = false;
    files.clear();
  });

  it("rechecks the real SQLite row and retains domain data", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE ledger_receipt_assets (
      id TEXT PRIMARY KEY, server_id TEXT, journey_id TEXT, local_uri TEXT,
      size_bytes INTEGER, sha256 TEXT, mime_type TEXT, object_path TEXT,
      upload_status TEXT, deleted_at TEXT, personal_payment_link_status TEXT,
      updated_at TEXT);
      CREATE TABLE ledger_asset_operations (id TEXT, asset_id TEXT, status TEXT);`);
    const uri = "file:///docs/ledger-receipts/receipt.jpg";
    sqlite
      .prepare(
        `INSERT INTO ledger_receipt_assets VALUES
      ('receipt','server','journey',?,3,?,'image/jpeg',
       'journey/server/original','UPLOADED',NULL,NULL,'now')`,
      )
      .run(uri, "a".repeat(64));
    sqlite.exec(`INSERT INTO ledger_asset_operations VALUES ('op','receipt','PENDING')`);
    const database = {
      getAllAsync: async (sql: string, ...args: unknown[]) =>
        sqlite.prepare(sql).all(...(args as [])),
      getFirstAsync: async (sql: string, ...args: unknown[]) =>
        sqlite.prepare(sql).get(...(args as [])),
      runAsync: async (sql: string, ...args: unknown[]) =>
        sqlite.prepare(sql).run(...(args as [])),
    };
    const stat = vi.fn(async () => ({
      objectPath: "journey/server/original",
      sizeBytes: 3,
      sha256: "a".repeat(64),
      mimeType: "image/jpeg",
    }));
    const check = async () =>
      enforceReceiptCacheLimit(
        database as never,
        0,
        async () => Uint8Array.from([1, 2, 3]),
        stat,
      );
    files.add(uri);
    expect((await check()).evictedCount).toBe(0);
    expect(stat).not.toHaveBeenCalled();
    sqlite.exec(`UPDATE ledger_asset_operations SET status='COMPLETED'`);
    expect((await check()).evictedCount).toBe(1);
    expect(
      sqlite.prepare(`SELECT id, local_uri FROM ledger_receipt_assets`).get(),
    ).toEqual({ id: "receipt", local_uri: null });
    expect(files.has(uri)).toBe(false);
    sqlite.close();
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
