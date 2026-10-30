import { expect, it, vi } from "vitest";
import { loadDevGuestAdoptionPorts } from "./guestAdoptionRuntime";
const environment = {
  OTR_DEV_AUTH_GUEST_ADOPTION: "1",
  OTR_DEV_BACKEND_NETWORK_MODE: "host",
  OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
};
it("stays closed by default without acquiring any database lease", () => {
  const withLease = vi.fn();
  expect(loadDevGuestAdoptionPorts({}, { withLease })).toBeUndefined();
  expect(
    loadDevGuestAdoptionPorts(
      { ...environment, OTR_DEV_AUTH_GUEST_ADOPTION: "0" },
      { withLease },
    ),
  ).toBeUndefined();
  expect(withLease).not.toHaveBeenCalled();
});
it.each([
  { ...environment, OTR_DEV_AUTH_GUEST_ADOPTION: "true" },
  { ...environment, OTR_DEV_BACKEND_NETWORK_MODE: "bridge" },
  { ...environment, OTR_DEV_SUPABASE_URL: "https://other-project.example.test" },
])("rejects explicit selection outside the exact existing DEV host", (env) => {
  const withLease = vi.fn();
  expect(() => loadDevGuestAdoptionPorts(env, { withLease })).toThrow(
    "RUNTIME_UNAVAILABLE",
  );
  expect(withLease).not.toHaveBeenCalled();
});
it("requires the existing Core connection; does not create a fallback driver", () => {
  expect(() => loadDevGuestAdoptionPorts(environment)).toThrow("RUNTIME_UNAVAILABLE");
});
it("constructs only dormant ports around the supplied connection", () => {
  const withLease = vi.fn();
  const ports = loadDevGuestAdoptionPorts(environment, { withLease });
  expect(ports).toMatchObject({
    preflight: expect.any(Function),
    stage: expect.any(Function),
    publish: expect.any(Function),
    readStatus: expect.any(Function),
    readReceipt: expect.any(Function),
    cancel: expect.any(Function),
  });
  expect(withLease).not.toHaveBeenCalled();
});
