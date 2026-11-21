import { expect, it, vi } from "vitest";
import Module from "node:module";
import { recordQaMetadataTiming } from "./recordQaMetadataTiming";

it("keeps timing disabled by default, bounded and unable to fail the owning read", () => {
  const modules = Module as unknown as { _load(request: string, ...args: unknown[]): unknown };
  const original = modules._load;
  const write = vi.fn();
  const native = vi.fn(() => ({ File: class { exists = true; write = write; }, Paths: { document: "synthetic" } }));
  const load = vi.spyOn(modules, "_load").mockImplementation((request, ...args) =>
    request === "expo-file-system" ? native() : original.call(modules, request, ...args));
  vi.stubEnv("EXPO_PUBLIC_OTR_QA_METADATA_TIMING_TRIP", undefined);
  try {
    recordQaMetadataTiming("synthetic", "SYNC_REQUEST");
    expect(native).not.toHaveBeenCalled();
    vi.stubEnv("EXPO_PUBLIC_OTR_QA_METADATA_TIMING_TRIP", "synthetic");
    recordQaMetadataTiming("other-trip", "SYNC_REQUEST");
    expect(native).not.toHaveBeenCalled();
    for (let i = 0; i < 81; i++) recordQaMetadataTiming("synthetic", "SYNC_RESPONSE", i);
    const retained = JSON.parse(write.mock.lastCall![0]);
    expect(retained).toHaveLength(72);
    expect(retained[0]).toEqual({stage:"SYNC_RESPONSE",at:expect.any(Number),revision:9});
    expect(Object.keys(retained.at(-1))).toEqual(["stage", "at", "revision"]);
    write.mockImplementation(() => { throw Error("UNAVAILABLE"); });
    expect(() => recordQaMetadataTiming("synthetic", "SQLITE_COMMIT", 81)).not.toThrow();
  } finally { vi.unstubAllEnvs(); load.mockRestore(); }
});
