import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import { createLedgerReceiptRepository } from "@/data/repositories/ledgerReceiptRepository";
import { ApiClientError } from "@/data/api/client";
import { runLedgerReceiptSync } from "./ledgerReceiptCoordinator";

const mocks = vi.hoisted(() => ({ database: null as unknown, wake: vi.fn() }));
vi.mock("@/data/db/database", () => ({ openDatabase: async () => mocks.database }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => "user",
}));
vi.mock("@/data/sync/ledgerQueueActivity", () => ({
  announceLedgerQueueWorkAvailable: mocks.wake,
}));
vi.mock("@/data/files/receiptFileStore", () => ({ verifyReceiptFile: async () => {} }));
vi.mock("./ledgerReceiptTransport", () => ({ createLedgerReceiptTransport: vi.fn() }));
vi.mock("@/data/repositories/ledgerExpenseRepository", () => ({
  createLedgerExpenseRepository: () => ({
    getExpense: async () => ({ serverId: "remote-expense" }),
  }),
}));

const networkError = () => new ApiClientError("Response lost", "network");
let sqlite: DatabaseSync;
let repository: ReturnType<typeof createLedgerReceiptRepository>;
const query = (sql: string) => sqlite.prepare(sql).get() as Record<string, unknown>;
const link = () =>
  query("SELECT * FROM ledger_asset_operations WHERE operation_type = 'LINK_RECEIPT'");
const upload = () =>
  query("SELECT * FROM ledger_asset_operations WHERE operation_type = 'UPLOAD_RECEIPT'");
function transport() {
  const entity = {
    id: "remote-receipt",
    journeyId: "journey",
    expenseId: "remote-expense",
    localId: "asset",
    objectPath: "receipt/path",
    mimeType: "image/jpeg",
    sizeBytes: 3,
    sha256: "a".repeat(64),
    ocrStatus: "PENDING",
    ocrSuggestion: null,
    createdAt: "now",
    updatedAt: "now",
  };
  return {
    create: vi.fn(async () => ({ entity: { ...entity, uploadStatus: "PENDING" } })),
    upload: vi.fn(async () => "file:///asset.jpg"),
    complete: vi.fn(async () => ({ entity: { ...entity, uploadStatus: "UPLOADED" } })),
    link: vi.fn(async () => ({ entity: { ...entity, uploadStatus: "UPLOADED" } })),
  };
}
const run = (value: ReturnType<typeof transport>) =>
  runLedgerReceiptSync({ transport: value as never });

beforeEach(async () => {
  vi.clearAllMocks();
  sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration.sql);
  const database = serializeDatabaseTransactions({
    runAsync: async (sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).run(...(params as [])),
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).get(...(params as [])),
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...(params as [])),
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  });
  sqlite.exec(`INSERT INTO ledger_actor_context
    (user_id, journey_id, member_id, role, capabilities_json, updated_at)
    VALUES ('user', 'journey', 'member', 'owner', '{}', 'now')`);
  mocks.database = database;
  repository = createLedgerReceiptRepository(database as never, async () => "user");
  await repository.importReceipt({
    id: "asset",
    journeyId: "journey",
    personalPaymentId: "payment",
    localUri: "file:///asset.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 3,
    sha256: "a".repeat(64),
    requestOcr: false,
  });
  // Exercise the Expense LINK transport without unrelated authoring fixtures.
  sqlite.exec(
    "UPDATE ledger_receipt_assets SET personal_payment_id = NULL, expense_id = 'expense'",
  );
});
afterEach(() => sqlite.close());

describe("durable receipt dependency scheduling", () => {
  it("stores the upload dependency, guards claim, and drains LINK immediately after upload", async () => {
    expect(link().dependency_operation_id).toBe(upload().id);
    expect(await repository.claimOperation(link().id as string)).toBe(false);
    expect(await repository.listPendingOperations()).toHaveLength(1);
    const value = transport();
    await run(value);
    expect(link()).toMatchObject({ status: "COMPLETED", attempt_count: 0 });
    expect(value.link).toHaveBeenCalledTimes(1);
    expect(mocks.wake).toHaveBeenCalled();
  });

  it("does not charge LINK attempts while upload fails six times and recovers", async () => {
    const value = transport();
    value.upload.mockRejectedValue(networkError());
    for (let n = 1; n <= 6; n++) {
      await run(value);
      expect(upload().attempt_count).toBe(n);
      expect(link()).toMatchObject({
        status: "PENDING",
        failure_category: "DEPENDENCY",
        attempt_count: 0,
      });
      expect(value.link).not.toHaveBeenCalled();
      sqlite.exec(
        "UPDATE ledger_asset_operations SET next_attempt_at = NULL WHERE operation_type = 'UPLOAD_RECEIPT'",
      );
    }
    value.upload.mockResolvedValue("file:///asset.jpg");
    await run(value);
    expect(link()).toMatchObject({ status: "COMPLETED", attempt_count: 0 });
  });

  it.each([false, true])(
    "recovers legacy backoff without changing identity (already uploaded: %s)",
    async (ready) => {
      const original = link();
      sqlite.exec(`UPDATE ledger_asset_operations SET status = 'RETRYABLE', attempt_count = 6,
      dependency_operation_id = NULL, next_attempt_at = '2099-01-01T00:00:00Z',
      failure_category = 'UNKNOWN', last_error_code = 'SYNC_FAILED',
      last_error_message = 'Receipt upload must complete first.' WHERE operation_type = 'LINK_RECEIPT'`);
      if (ready) {
        sqlite.exec(
          "UPDATE ledger_receipt_assets SET server_id = 'remote-receipt', upload_status = 'UPLOADED'",
        );
        sqlite.exec(
          "UPDATE ledger_asset_operations SET status = 'COMPLETED' WHERE operation_type = 'UPLOAD_RECEIPT'",
        );
      }
      await run(transport());
      expect(link()).toMatchObject({
        status: "COMPLETED",
        attempt_count: 6,
        id: original.id,
        idempotency_key: original.idempotency_key,
        next_attempt_at: null,
      });
    },
  );

  it("keeps a durable wait across restart and records upstream permanent failure without spinning", async () => {
    await repository.refreshDependencies();
    await repository.markOperation(
      upload().id as string,
      "FAILED",
      new Error("File missing"),
      null,
      "VALIDATION",
    );
    expect(link()).toMatchObject({
      status: "FAILED",
      failure_category: "DEPENDENCY",
      last_error_code: "RECEIPT_DEPENDENCY_FAILED",
      attempt_count: 0,
    });
    const value = transport();
    await run(value);
    await run(value);
    expect(value.link).not.toHaveBeenCalled();
    expect(await repository.listPendingOperations()).toHaveLength(0);
    // Existing upload recovery/user retry succeeds; release the original LINK.
    sqlite.exec(
      "UPDATE ledger_receipt_assets SET server_id = 'remote-receipt', upload_status = 'UPLOADED'",
    );
    await repository.markOperation(upload().id as string, "COMPLETED");
    await run(value);
    expect(link()).toMatchObject({ status: "COMPLETED", attempt_count: 0 });
  });

  it("serializes concurrent claims and does not send duplicate LINK requests", async () => {
    const value = transport();
    await Promise.all([run(value), run(value)]);
    expect(value.upload).toHaveBeenCalledTimes(1);
    expect(value.link).toHaveBeenCalledTimes(1);
    expect(link().status).toBe("COMPLETED");
  });

  it("retains real LINK network backoff and replays the same key after response loss", async () => {
    const value = transport();
    const serverKeys = new Set<string>();
    let responseLost = true;
    const successfulLink = value.link.getMockImplementation()!;
    value.link.mockImplementation(async (...args: unknown[]) => {
      serverKeys.add(args[3] as string);
      if (responseLost) {
        responseLost = false;
        throw networkError();
      }
      return successfulLink();
    });
    const original = link();
    await run(value);
    expect(link()).toMatchObject({
      status: "RETRYABLE",
      attempt_count: 1,
      failure_category: "NETWORK",
    });
    const next = link().next_attempt_at;
    expect(Date.parse(next as string)).toBeGreaterThan(Date.now());
    await repository.refreshDependencies();
    await repository.markOperation(upload().id as string, "COMPLETED");
    expect(link().next_attempt_at).toBe(next);
    await run(value);
    expect(value.link).toHaveBeenCalledTimes(1);
    sqlite.exec(
      "UPDATE ledger_asset_operations SET next_attempt_at = NULL WHERE operation_type = 'LINK_RECEIPT'",
    );
    await run(value);
    expect(link()).toMatchObject({
      status: "COMPLETED",
      id: original.id,
      idempotency_key: original.idempotency_key,
      attempt_count: 1,
    });
    expect(value.link).toHaveBeenCalledTimes(2);
    expect(serverKeys.size).toBe(1);
  });

  it("runtime dependency waits preserve attempts and clear only dependency error/backoff", async () => {
    sqlite.exec(
      "UPDATE ledger_receipt_assets SET server_id = 'remote-receipt', upload_status = 'UPLOADED'",
    );
    await repository.markOperation(upload().id as string, "COMPLETED");
    expect(await repository.claimOperation(link().id as string)).toBe(true);
    await repository.waitForUpload(link().id as string);
    expect(link()).toMatchObject({
      status: "PENDING",
      failure_category: "DEPENDENCY",
      attempt_count: 0,
      next_attempt_at: null,
      last_error_code: null,
      last_error_message: null,
    });
  });

  it("handles an upload readiness race in the coordinator without retrying LINK", async () => {
    sqlite.exec(
      "UPDATE ledger_receipt_assets SET server_id = 'remote-receipt', upload_status = 'UPLOADED'",
    );
    await repository.markOperation(upload().id as string, "COMPLETED");
    const database = mocks.database as {
      runAsync: (sql: string, ...params: unknown[]) => Promise<unknown>;
    };
    const originalRun = database.runAsync;
    database.runAsync = async (sql, ...params) => {
      const result = await originalRun(sql, ...params);
      if (sql.includes("SET status = 'PROCESSING'"))
        sqlite.exec("UPDATE ledger_receipt_assets SET upload_status = 'UPLOADING'");
      return result;
    };
    const value = transport();
    await run(value);
    expect(link()).toMatchObject({
      status: "PENDING",
      failure_category: "DEPENDENCY",
      attempt_count: 0,
      next_attempt_at: null,
      last_error_code: null,
    });
    expect(value.link).not.toHaveBeenCalled();
  });

  it("recovers an interrupted upload on restart before releasing the original LINK", async () => {
    await repository.refreshDependencies();
    const original = link();
    sqlite.exec(
      "UPDATE ledger_asset_operations SET status = 'PROCESSING', claim_owner = 'old-process', lease_expires_at = '2000-01-01T00:00:00Z' WHERE operation_type = 'UPLOAD_RECEIPT'",
    );
    const value = transport();
    await run(value);
    expect(upload()).toMatchObject({ status: "COMPLETED", attempt_count: 1 });
    expect(link()).toMatchObject({
      status: "COMPLETED",
      attempt_count: 0,
      id: original.id,
      idempotency_key: original.idempotency_key,
    });
  });

  it("completes obsolete LINK work for a deleted receipt without uploading or linking", async () => {
    sqlite.exec("UPDATE ledger_receipt_assets SET deleted_at = '2026-10-05T00:00:00Z'");
    const value = transport();
    await run(value);
    expect(link()).toMatchObject({ status: "COMPLETED", attempt_count: 0 });
    expect(value.link).not.toHaveBeenCalled();
    expect(value.upload).not.toHaveBeenCalled();
  });

  it("legacy recovery cannot touch another account or a genuine LINK error", async () => {
    sqlite.exec(`UPDATE ledger_asset_operations SET owner_user_id = 'other',
      status = 'RETRYABLE', next_attempt_at = '2099-01-01T00:00:00Z',
      failure_category = 'UNKNOWN', last_error_code = 'SYNC_FAILED',
      last_error_message = 'Receipt upload must complete first.' WHERE operation_type = 'LINK_RECEIPT'`);
    const before = link();
    await run(transport());
    expect(link()).toEqual(before);
  });
});
