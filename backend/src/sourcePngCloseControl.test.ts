import { expect, it, vi } from "vitest";
import { createSourcePngCloseControl } from "./sourcePngCloseControl";
const identity = {
  principal: "otr_trip_source_command_gateway",
  role: "otr_trip_source_command_gateway",
};
const state = {
  actorId: "f4b059c5-8241-4ffb-aa15-37fa25474543",
  tripId: "825f79b2-4a9d-4535-a62e-43000ca50c4a",
  closed: true,
};
function fixture(fault?: "lostCommit" | "stillOpen" | "admin") {
  let writes = 0,
    reads = 0,
    commits = 0;
  const query = vi.fn(async (sql: string, args?: unknown[]) => {
    if (sql.startsWith("SELECT session_user"))
      return {
        rows: [
          fault === "admin" ? { principal: "postgres", role: "postgres" } : identity,
        ],
      };
    if (sql.startsWith("SELECT public.trip_source_png_close_state")) {
      if (args?.[0]) writes++;
      else reads++;
      return { rows: [{ state: { ...state, closed: fault !== "stillOpen" } }] };
    }
    if (sql === "COMMIT" && ++commits === 1 && fault === "lostCommit")
      throw Error("connection lost");
    return { rows: [] };
  });
  const connection = {
    withLease: async <T>(
      fn: (lease: { query: typeof query; retire(): void }) => Promise<T>,
    ) => fn({ query, retire: vi.fn() }),
  };
  return {
    port: createSourcePngCloseControl(connection),
    query,
    count: () => ({ writes, reads }),
  };
}
it("closes once and independently reads the exact same QA scope", async () => {
  const f = fixture();
  expect(await f.port.close()).toMatchObject({
    status: "CLOSED_VERIFIED",
    writeDisposition: "ACKNOWLEDGED",
  });
  expect(f.count()).toEqual({ writes: 1, reads: 1 });
  expect(f.query).toHaveBeenCalledWith("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
});
it("lost COMMIT is read back without repeating close", async () => {
  const f = fixture("lostCommit");
  expect(await f.port.close()).toMatchObject({
    status: "CLOSED_VERIFIED",
    writeDisposition: "UNKNOWN",
  });
  expect(f.count()).toEqual({ writes: 1, reads: 1 });
});
it("a positive reply cannot override independently open state", async () => {
  const f = fixture("stillOpen");
  expect(await f.port.close()).toMatchObject({
    status: "RECONCILE_REQUIRED",
    closed: false,
  });
});
it("administrator cannot substitute the normal Source gateway", async () => {
  const f = fixture("admin");
  await expect(f.port.close()).rejects.toThrow("PNG_CLOSE_PRINCIPAL_DENIED");
  expect(f.count()).toEqual({ writes: 0, reads: 0 });
});
