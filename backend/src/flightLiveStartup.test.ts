import { it, expect, vi, afterEach } from "vitest";
import { initializeDevFlightLiveHost } from "./flightLiveHost";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});
const cases = [
  {},
  { OTR_DEV_FLIGHT_REMOTE_TRANSPORT: "enabled" },
  { OTR_DEV_DEEPSEEK_API_KEY: "FAKE_STARTUP" },
  { OTR_DEV_FLIGHT_PRIVATE_CUSTODY: "/absent" },
  { OTR_DEV_FLIGHT_SQL_SESSION_REF: "vault:fake" },
  { NODE_ENV: "production", OTR_ENVIRONMENT: "TEST" },
  {
    OTR_DEV_FLIGHT_REMOTE_TRANSPORT: "enabled",
    OTR_DEV_FLIGHT_ONE_SHOT: "enabled",
    OTR_DEV_DEEPSEEK_API_KEY: "FAKE_STARTUP",
    OTR_DEV_FLIGHT_SQL_SESSION_REF: "vault:fake",
    OTR_DEV_FLIGHT_WORKLOAD_SESSION_REF: "vault:fake",
  },
];
it.each(cases)("actual normal server startup CLOSED %j", async (extra) => {
  vi.resetModules();
  vi.stubEnv("OTR_DEV_SUPABASE_URL", "https://tuqigdxrvrerfewsxqgm.supabase.co");
  vi.stubEnv("OTR_DEV_SUPABASE_PUBLISHABLE_KEY", "FAKE_PUBLIC");
  vi.stubEnv("OTR_DEV_SUPABASE_SECRET_KEY", "FAKE_BACKEND");
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value as string);
  const listen = vi.fn();
  vi.doMock("node:http", () => ({ createServer: () => ({ on: () => {}, listen }) }));
  await import("./server");
  expect(listen).toHaveBeenCalledOnce();
  const get = vi.fn((key: string) => (extra as Record<string, string>)[key]);
  expect(await initializeDevFlightLiveHost(get)).toEqual({ status: "CLOSED" });
  expect(get).not.toHaveBeenCalled();
});
