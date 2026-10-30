import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import {
  serializeUniversalSourceConnection,
  serializeUniversalSourceConnections,
} from "./universalSourceConnection";

function fixture() {
  let active = 0,
    maximum = 0;
  const workStarted = vi.fn();
  const connection: CorePgConnection = {
    async withLease(work) {
      if (active) throw Error("SOURCE_ROLE_CONNECTION_LIMIT_ONE");
      active++;
      maximum = Math.max(maximum, active);
      workStarted();
      try {
        return await work({} as CorePgLease);
      } finally {
        active--;
      }
    },
  };
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = vi.fn();
  return {
    connection,
    serial: serializeUniversalSourceConnection(connection, current),
    blocked,
    release,
    current,
    workStarted,
    maximum: () => maximum,
  };
}
afterEach(() => vi.useRealTimers());
it("preserves one principal connection while queuing overlapping requests, with bounded backlog", async () => {
  const f = fixture();
  const first = f.serial.withLease(async () => {
    await f.blocked;
    return 1;
  });
  const next = [2, 3, 4].map((n) => f.serial.withLease(async () => n));
  await expect(f.serial.withLease(async () => 5)).rejects.toThrow("CORE_CONNECTION_BUSY");
  f.release();
  await expect(Promise.all([first, ...next])).resolves.toEqual([1, 2, 3, 4]);
  expect(f.maximum()).toBe(1);
  expect(f.workStarted).toHaveBeenCalledTimes(4);
});
it("timed-out waiters do not connect later or release an active predecessor", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const first = f.serial.withLease(async () => {
    await f.blocked;
    return 1;
  });
  const skipped = vi.fn(async () => 2);
  const second = f.serial.withLease(skipped);
  const rejected = expect(second).rejects.toThrow("REQUEST_TIMEOUT");
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(f.workStarted).toHaveBeenCalledTimes(1);
  expect(skipped).not.toHaveBeenCalled();
  const third = f.serial.withLease(async () => 3);
  expect(f.workStarted).toHaveBeenCalledTimes(1);
  f.release();
  await expect(first).resolves.toBe(1);
  await expect(third).resolves.toBe(3);
  expect(f.maximum()).toBe(1);
  expect(skipped).not.toHaveBeenCalled();
});
it("rechecks runtime closure after waiting and preserves lease failures", async () => {
  const f = fixture(),
    failure = Error("OWNING_SOURCE_FAILURE");
  const first = f.serial.withLease(async () => {
    await f.blocked;
    throw failure;
  });
  const next = f.serial.withLease(vi.fn());
  const rejected = expect(first).rejects.toBe(failure);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  f.current.mockImplementationOnce(() => {
    throw Error("UNIVERSAL_CONTINUOUS_CLOSED");
  });
  f.release();
  await rejected;
  await expect(next).rejects.toThrow("UNIVERSAL_CONTINUOUS_CLOSED");
  expect(f.workStarted).toHaveBeenCalledTimes(1);
  await expect(f.serial.withLease(async () => 3)).resolves.toBe(3);
});

const fixtureContainer = process.env.OTR_UNIVERSAL_SOURCE_QUEUE_SQL_FIXTURE;
it.skipIf(!fixtureContainer)(
  "serializes real PostgreSQL sessions under the Source role connection limit one",
  async () => {
    if (!/^otr-source-serial-[a-f0-9]{12}$/.test(fixtureContainer!))
      throw Error("OWNED_FIXTURE_REQUIRED");
    const connection: CorePgConnection = {
      async withLease(work) {
        const { stdout } = await promisify(execFile)("/opt/homebrew/bin/docker", [
          "exec",
          "-e",
          "PGPASSWORD=source-synthetic-only",
          fixtureContainer!,
          "psql",
          "-XqAt",
          "-h",
          "127.0.0.1",
          "-U",
          "otr_trip_source_command_gateway",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          "SELECT pg_sleep(0.3); SELECT session_user;",
        ]);
        expect(stdout.trim()).toBe("otr_trip_source_command_gateway");
        return work({} as CorePgLease);
      },
    };
    const [normal, pdf] = serializeUniversalSourceConnections(
      [connection, { withLease: connection.withLease }],
      () => {},
    );
    await expect(
      Promise.all([
        pdf.withLease(async () => 1),
        normal.withLease(async () => 2),
        pdf.withLease(async () => 3),
      ]),
    ).resolves.toEqual([1, 2, 3]);
  },
  10000,
);

it("normal and PDF handles share one FIFO and one backlog under connlimit=1", async () => {
  const f = fixture();
  const [normal, pdf] = serializeUniversalSourceConnections(
    [f.connection, { withLease: f.connection.withLease }],
    f.current,
  );
  const first = pdf.withLease(async () => {
    await f.blocked;
    return "PDF";
  });
  const next = normal.withLease(async () => "TXT");
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(f.workStarted).toHaveBeenCalledTimes(1);
  f.release();
  expect(await Promise.all([first, next])).toEqual(["PDF", "TXT"]);
  expect(f.maximum()).toBe(1);
});
