import { expect, it, vi } from "vitest";
import { createPrivateAccountProfileRuntime } from "./privateAccountProfileRuntime";

it("does not construct an adapter or perform IO by default or when disabled", () => {
  const wire = vi.fn();
  expect(createPrivateAccountProfileRuntime()).toEqual({});
  expect(
    createPrivateAccountProfileRuntime({
      enabled: false,
      supabase: {
        url: "not-dev",
        publishableKey: "not-a-key",
        fetchImplementation: wire,
      },
    }),
  ).toEqual({});
  expect(wire).not.toHaveBeenCalled();
});
it("requires explicit DEV public configuration before returning the existing adapter", () => {
  expect(() => createPrivateAccountProfileRuntime({ enabled: true })).toThrow(
    "PROFILE_DEV_CONFIG_REQUIRED",
  );
  expect(() =>
    createPrivateAccountProfileRuntime({
      enabled: true,
      supabase: {
        url: "https://example.invalid",
        publishableKey: "sb_publishable_private_profile_fixture_only",
      },
    }),
  ).toThrow("PROFILE_DEV_CONFIG_REQUIRED");
  const wire = vi.fn();
  const runtime = createPrivateAccountProfileRuntime({
    enabled: true,
    supabase: {
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      publishableKey: "sb_publishable_private_profile_fixture_only",
      fetchImplementation: wire,
    },
  });
  expect(runtime.privateAccountProfilePort).toMatchObject({
    read: expect.any(Function),
    save: expect.any(Function),
    receipt: expect.any(Function),
  });
  expect(wire).not.toHaveBeenCalled();
});
