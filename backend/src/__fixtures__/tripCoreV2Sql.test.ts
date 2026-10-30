import { beforeEach, expect, it, vi } from "vitest";
import { session } from "./tripCoreV2Sql";
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.spawn.mockImplementation(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    stdin: { end: vi.fn(), write: vi.fn() },
    kill: vi.fn(),
  }));
});
it.each(["otr-core-v2-test-012345abcdef", "otr-trip-sustained-012345abcdef"])(
  "keeps existing %s connection defaults",
  (fixture) => {
    const handle = session(fixture);
    const args = mocks.spawn.mock.calls[0][1];
    expect(args).toContain("supabase_admin");
    expect(args).toContain("postgres");
    expect(args).not.toContain("-h");
    expect(args).not.toContain("-e");
    handle.close();
  },
);
it("uses an actual Core login only in an explicit owned Auth database", () => {
  const handle = session("otr-auth-authority-012345abcdef", {
    database: "otr_auth_composite_012345abcdef",
  });
  const args = mocks.spawn.mock.calls[0][1];
  expect(args).toContain("otr_trip_core_v2_gateway");
  expect(args).toContain("otr_auth_composite_012345abcdef");
  expect(args).toContain("127.0.0.1");
  expect(args).not.toContain("supabase_admin");
  handle.close();
});
it.each([
  ["otr-auth-authority-012345abcdef", undefined],
  ["otr-auth-authority-012345abcdef", { database: "postgres" }],
  ["otr-auth-authority-012345abcdef", { database: "tuqigdxrvrerfewsxqgm" }],
  ["otr-trip-sustained-012345abcdef", { database: "otr_auth_composite_012345abcdef" }],
  ["arbitrary-container", { database: "otr_auth_composite_012345abcdef" }],
] as const)(
  "refuses invalid fixture/database pair %s before starting a process",
  (fixture, options) => {
    expect(() => session(fixture, options)).toThrow("OWNED_FIXTURE_REQUIRED");
    expect(mocks.spawn).not.toHaveBeenCalled();
  },
);
