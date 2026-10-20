import { describe, expect, it, vi } from "vitest";

import { retrySQLiteRollbackOnce } from "./retryLedgerRead";

describe("Ledger read retry", () => {
  it("retries a rolled-back read once and does not retry other failures", async () => {
    const rolledBack = vi
      .fn()
      .mockRejectedValueOnce(new Error("abort due to ROLLBACK"))
      .mockResolvedValueOnce("loaded");
    await expect(retrySQLiteRollbackOnce(rolledBack)).resolves.toBe("loaded");
    expect(rolledBack).toHaveBeenCalledTimes(2);
    const corrupt = vi.fn().mockRejectedValue(new Error("database is corrupt"));
    await expect(retrySQLiteRollbackOnce(corrupt)).rejects.toThrow("database is corrupt");
    expect(corrupt).toHaveBeenCalledOnce();
  });
});
