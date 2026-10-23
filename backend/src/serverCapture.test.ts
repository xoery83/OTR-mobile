import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  custody: vi.fn(),
  trip: vi.fn(),
  metadata: vi.fn(),
  universal: vi.fn(),
  originals: vi.fn(),
  start: vi.fn(),
  server: { once: vi.fn(), close: vi.fn() },
}));
vi.mock("./captureCustodyRuntime", () => ({ loadDevCaptureCustody: mocks.custody }));
vi.mock("./tripCreateRuntime", () => ({ loadDevTripCreateRuntime: mocks.trip }));
vi.mock("./tripMetadataRuntime", () => ({
  loadDevTripMetadataV2Runtime: mocks.metadata,
}));
vi.mock("./serverStartup", () => ({ startDevBackend: mocks.start }));
vi.mock("./universalFiniteRuntime", () => ({ loadDevUniversalRuntime: mocks.universal }));
vi.mock("./universalOriginalSourceRuntime", () => ({ loadDevUniversalOriginalSourceRuntime: mocks.originals }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.custody.mockResolvedValue(undefined);
  mocks.trip.mockResolvedValue(undefined);
  mocks.metadata.mockResolvedValue(undefined);
  mocks.universal.mockResolvedValue(undefined);
  mocks.originals.mockResolvedValue(undefined);
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
        universalImportPort: undefined,
        publicationCatalogConnection: undefined,
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
    universalImportPort: undefined,
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
    universalImportPort: undefined,
  });
});

it("mounts the explicit normal Trip ports without loading a second Metadata runtime", async () => {
  const trip = {
    tripCreatePort: {},
    tripMetadataV2Port: {},
    coreConnection: {},
    close: vi.fn(),
  };
  mocks.trip.mockResolvedValue(trip);
  await import("./serverCapture");
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalled());
  expect(mocks.metadata).not.toHaveBeenCalled();
  expect(mocks.start).toHaveBeenCalledWith(
    expect.objectContaining({
      tripCreatePort: trip.tripCreatePort,
      tripMetadataV2Port: trip.tripMetadataV2Port,
      coreConnection: trip.coreConnection,
    }),
  );
  mocks.server.once.mock.calls[0][1]();
  expect(trip.close).toHaveBeenCalledOnce();
});
it("mounts Source-only custody without inventing a Task or losing the normal Trip ports", async () => {
  const trip = { tripCreatePort: {}, tripMetadataV2Port: {}, coreConnection: {}, close: vi.fn() };
  const originals = { universalOriginalSourcePort: {}, catalogConnection: {}, close: vi.fn() };
  mocks.trip.mockResolvedValue(trip);
  mocks.originals.mockResolvedValue(originals);
  await import("./serverCapture");
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalled());
  expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
    tripCreatePort: trip.tripCreatePort,
    coreConnection: trip.coreConnection,
    universalImportPort: undefined,
    universalOriginalSourcePort: originals.universalOriginalSourcePort,
    publicationCatalogConnection: originals.catalogConnection,
  }));
  mocks.server.once.mock.calls[0][1]();
  expect(trip.close).toHaveBeenCalledOnce();
  expect(originals.close).toHaveBeenCalledOnce();
});
it("closes all acquired resources when shared startup fails and logs no private failure", async () => {
  const trip = { tripCreatePort: {}, tripMetadataV2Port: {}, coreConnection: {}, close: vi.fn() };
  const originals = { universalOriginalSourcePort: {}, catalogConnection: {}, close: vi.fn() };
  const universal = { universalImportPort: {}, catalogConnection: {}, close: vi.fn() };
  mocks.trip.mockResolvedValue(trip);
  mocks.originals.mockResolvedValue(originals);
  mocks.universal.mockResolvedValue(universal);
  mocks.start.mockImplementation(() => { throw Error("private-startup-value"); });
  const before = process.exitCode;
  try {
    await import("./serverCapture");
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith("CAPTURE_RUNTIME_UNAVAILABLE"));
    expect(mocks.originals).toHaveBeenCalledWith(process.env, universal.catalogConnection);
    expect(trip.close).toHaveBeenCalledOnce();
    expect(originals.close).toHaveBeenCalledOnce();
    expect(universal.close).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-startup-value");
  } finally { process.exitCode = before; }
});
