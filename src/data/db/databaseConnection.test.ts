import { describe, expect, it, vi } from "vitest";

import {
  createMigratedDatabaseOpener,
  serializeDatabaseTransactions,
} from "./databaseConnection";

describe("migrated database opener", () => {
  it("shares one open and migration while startup callers arrive concurrently", async () => {
    const database = { name: "otr-mobile.db" };
    const open = vi.fn().mockResolvedValue(database);
    const migrate = vi.fn().mockResolvedValue(undefined);
    const openMigratedDatabase = createMigratedDatabaseOpener(open, migrate);

    const [first, second] = await Promise.all([
      openMigratedDatabase(),
      openMigratedDatabase(),
    ]);

    expect(first).toBe(database);
    expect(second).toBe(database);
    expect(open).toHaveBeenCalledOnce();
    expect(migrate).toHaveBeenCalledOnce();
  });
});

describe("shared SQLite transactions", () => {
  it("runs writers in order and continues after a rollback", async () => {
    const events: string[] = [];
    let release!: () => void;
    const database = serializeDatabaseTransactions({
      async withTransactionAsync(task: () => Promise<void>) {
        events.push("begin");
        await task();
        events.push("commit");
      },
    });
    const first = database.withTransactionAsync(async () => {
      events.push("first");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      throw new Error("rolled back");
    });
    const second = database.withTransactionAsync(async () => {
      events.push("second");
    });
    await vi.waitFor(() => expect(events).toEqual(["begin", "first"]));
    release();
    await expect(first).rejects.toThrow("rolled back");
    await second;
    expect(events).toEqual(["begin", "first", "begin", "second", "commit"]);
  });
});
