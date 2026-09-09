import { describe, expect, it, vi } from "vitest";

import { createMigratedDatabaseOpener } from "./databaseConnection";

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
