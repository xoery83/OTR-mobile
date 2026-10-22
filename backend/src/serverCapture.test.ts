import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  custody: vi.fn(),
  trip: vi.fn(),
  metadata: vi.fn(),
  start: vi.fn(),
  server: { once: vi.fn(), close: vi.fn() },
}));
vi.mock("./captureCustodyRuntime", () => ({ loadDevCaptureCustody: mocks.custody }));
vi.mock("./tripCreateRuntime", () => ({ loadDevTripCreateRuntime: mocks.trip }));
vi.mock("./tripMetadataRuntime", () => ({
  loadDevTripMetadataV2Runtime: mocks.metadata,
}));
vi.mock("./serverStartup", () => ({ startDevBackend: mocks.start }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.custody.mockResolvedValue(undefined);
  mocks.trip.mockResolvedValue(undefined);
  mocks.metadata.mockResolvedValue(undefined);
  mocks.start.mockReturnValue(mocks.server);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "once").mockImplementation(() => process);
});
afterEach(() => vi.restoreAllMocks());
it.each(["expired", "malformed", "permission denied", "missing"])(
  "optional custody %s leaves ordinary Backend available without a custody or Trip/Metadata port",
  async (reason) => {
    if (reason !== "missing")
      mocks.custody.mockRejectedValueOnce(
        new Error(reason + " private-diagnostic-secret"),
      );
    await import("./serverCapture");
    await vi.waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith({
        captureMaterialCustody: undefined,
        tripCreatePort: undefined,
        tripMetadataV2Port: undefined,
      }),
    );
    expect(console.error).not.toHaveBeenCalled();
    if (reason !== "missing")
      expect(console.info).toHaveBeenCalledWith("CAPTURE_RUNTIME_CLOSED");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      "private-diagnostic-secret",
    );
  },
);
it("valid custody remains available and all acquired finite resources close with the server", async () => {
  const custody = {
      captureMaterialCustody: { read: vi.fn(), put: vi.fn() },
      close: vi.fn(),
    },
    trip = { tripCreatePort: {}, close: vi.fn() },
    metadata = { tripMetadataV2Port: {}, close: vi.fn() };
  mocks.custody.mockResolvedValue(custody);
  mocks.trip.mockResolvedValue(trip);
  mocks.metadata.mockResolvedValue(metadata);
  await import("./serverCapture");
  await vi.waitFor(() =>
    expect(mocks.server.once).toHaveBeenCalledWith("close", expect.any(Function)),
  );
  expect(mocks.start).toHaveBeenCalledWith({
    captureMaterialCustody: custody.captureMaterialCustody,
    tripCreatePort: trip.tripCreatePort,
    tripMetadataV2Port: metadata.tripMetadataV2Port,
  });
  mocks.server.once.mock.calls[0][1]();
  expect(custody.close).toHaveBeenCalledOnce();
  expect(trip.close).toHaveBeenCalledOnce();
  expect(metadata.close).toHaveBeenCalledOnce();
});
it("unavailable Trip and Metadata still fail closed independently", async () => {
  mocks.trip.mockRejectedValue(new Error("bad trip"));
  mocks.metadata.mockRejectedValue(new Error("bad metadata"));
  await import("./serverCapture");
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalled());
  expect(mocks.start).toHaveBeenCalledWith({
    captureMaterialCustody: undefined,
    tripCreatePort: undefined,
    tripMetadataV2Port: undefined,
  });
});
