import { loadDevPublicationCatalog } from "./tripPublicationCatalogRuntime";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  stat: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
  driver: vi.fn(),
}));
vi.mock("node:fs", () => ({
  constants: { O_RDONLY: 0, O_NOFOLLOW: 1, O_NONBLOCK: 2 },
  openSync: mocks.open,
  fstatSync: mocks.stat,
  readFileSync: mocks.read,
  closeSync: mocks.close,
}));
vi.mock("./tripPublicationCatalogPgConnection", () => ({
  createPublicationCatalogPgConnection: mocks.driver,
}));
const url = "https://tuqigdxrvrerfewsxqgm.supabase.co";
const config = () => ({
  password: "synthetic-private-value",
  ca: "fixture CA",
  expiry: new Date(Date.now() + 20000).toISOString(),
});
function setup() {
  vi.useFakeTimers();
  mocks.open.mockReturnValue(7);
  mocks.stat.mockReturnValue({
    isFile: () => true,
    uid: 0,
    gid: 999,
    mode: 0o100440,
    nlink: 1,
    size: 500,
  });
  mocks.read.mockReturnValue(JSON.stringify(config()));
  mocks.driver.mockReturnValue({ close: vi.fn().mockResolvedValue(undefined) });
}
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
it("keeps an unmounted runtime closed", () => {
  mocks.open.mockImplementation(() => {
    throw { code: "ENOENT" };
  });
  expect(loadDevPublicationCatalog("host", url)).toBeUndefined();
  expect(mocks.driver).not.toHaveBeenCalled();
});
it("pins DEV Direct identity and retires at the credential expiry", async () => {
  setup();
  const connection = loadDevPublicationCatalog("host", url)!;
  expect(mocks.driver).toHaveBeenCalledWith({
    host: "db.tuqigdxrvrerfewsxqgm.supabase.co",
    port: 5432,
    database: "postgres",
    password: "synthetic-private-value",
    ca: "fixture CA",
  });
  await vi.advanceTimersByTimeAsync(20000);
  expect(mocks.driver.mock.results[0].value.close).toHaveBeenCalledOnce();
  await connection.close();
  expect(vi.getTimerCount()).toBe(0);
  expect(mocks.close).toHaveBeenCalledWith(7);
});
it.each([
  "bridge",
  "wrong-url",
  "permissions",
  "link",
  "size",
  "expiry",
  "overlong",
  "malformed",
])("rejects %s without disclosing input", (failure) => {
  setup();
  let network = "host",
    endpoint = url;
  if (failure === "bridge") network = "bridge";
  if (failure === "wrong-url") endpoint = "https://other.supabase.co";
  if (failure === "permissions")
    mocks.stat.mockReturnValue({
      isFile: () => true,
      uid: 0,
      gid: 999,
      mode: 0o100444,
      nlink: 1,
      size: 500,
    });
  if (failure === "link")
    mocks.stat.mockReturnValue({
      isFile: () => true,
      uid: 0,
      gid: 999,
      mode: 0o100440,
      nlink: 2,
      size: 500,
    });
  if (failure === "size")
    mocks.stat.mockReturnValue({
      isFile: () => true,
      uid: 0,
      gid: 999,
      mode: 0o100440,
      nlink: 1,
      size: 99999,
    });
  if (failure === "expiry" || failure === "overlong")
    mocks.read.mockReturnValue(
      JSON.stringify({
        ...config(),
        expiry: new Date(
          Date.now() + (failure === "expiry" ? -1 : 91 * 86400000),
        ).toISOString(),
      }),
    );
  if (failure === "malformed") mocks.read.mockReturnValue("synthetic-private-value");
  expect(() => loadDevPublicationCatalog(network, endpoint)).toThrowError(
    "DEV_CATALOG_CUSTODY_UNAVAILABLE",
  );
  expect(mocks.driver).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledWith(7);
});

it("keeps a 90-day DEV credential active past day14 and rearms long timers", async () => {
  setup();
  mocks.read.mockReturnValue(
    JSON.stringify({
      ...config(),
      expiry: new Date(Date.now() + 90 * 86400000).toISOString(),
    }),
  );
  const connection = loadDevPublicationCatalog("host", url)!;
  await vi.advanceTimersByTimeAsync(14 * 86400000);
  expect(mocks.driver.mock.results[0].value.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(76 * 86400000);
  expect(mocks.driver.mock.results[0].value.close).toHaveBeenCalledOnce();
  await connection.close();
  expect(vi.getTimerCount()).toBe(0);
});
