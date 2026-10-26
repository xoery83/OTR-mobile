import { beforeEach, expect, it, vi } from "vitest";
import { openCaptureFileLease, pickLeasedCaptureFiles } from "./captureFileLease";
const sdk = vi.hoisted(() => ({
  pick: vi.fn(),
  open: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
  release: vi.fn(),
  releaseAll: vi.fn(),
}));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => sdk }));
const id = "5325d363-215c-40ad-a6fc-4185f0204589";
beforeEach(() => {
  vi.resetAllMocks();
  sdk.releaseAll.mockResolvedValue(undefined);
  sdk.release.mockResolvedValue(undefined);
  sdk.close.mockResolvedValue(undefined);
});
it("stages opaque metadata without opening content and releases a late picker result", async () => {
  sdk.pick.mockResolvedValue({
    canceled: false,
    assets: [{ token: id, name: "QA.txt", mimeType: "text/plain" }],
  });
  const selected = await pickLeasedCaptureFiles(() => true);
  expect(selected?.[0]).toMatchObject({
    temporaryUri: `otr-capture-file://${id}`,
    source: "files",
  });
  expect(sdk.open).not.toHaveBeenCalled();
  expect(sdk.read).not.toHaveBeenCalled();
  selected![0].release!();
  expect(sdk.release).toHaveBeenCalledWith([id]);
  expect(await pickLeasedCaptureFiles(() => false)).toEqual([]);
  expect(sdk.release).toHaveBeenLastCalledWith([id]);
});
it("opens registered leases read-only, bounds native/decoded chunks and closes once", async () => {
  sdk.open.mockResolvedValue({ size: 3 });
  sdk.read.mockResolvedValueOnce("AQID").mockResolvedValueOnce("");
  const reader = await openCaptureFileLease(`otr-capture-file://${id}`);
  expect(reader.sizeHint).toBe(3);
  expect(await reader.read(3)).toEqual(new Uint8Array([1, 2, 3]));
  expect(await reader.read(1)).toBeNull();
  await expect(reader.read(65537)).rejects.toMatchObject({ code: "READER_FAILURE" });
  sdk.read.mockResolvedValue("AQID");
  await expect(reader.read(1)).rejects.toMatchObject({ code: "READER_FAILURE" });
  await reader.close();
  await reader.close();
  expect(sdk.close).toHaveBeenCalledOnce();
  await expect(reader.read(1)).rejects.toMatchObject({ code: "READER_FAILURE" });
});
it("rejects forged URIs, malformed data and failed native open without private details", async () => {
  await expect(
    openCaptureFileLease("otr-capture-file://../private"),
  ).rejects.toMatchObject({ code: "READER_FAILURE" });
  expect(sdk.open).not.toHaveBeenCalled();
  sdk.open.mockRejectedValue(new Error("private provider path"));
  await expect(openCaptureFileLease(`otr-capture-file://${id}`)).rejects.toMatchObject({
    code: "READER_FAILURE",
  });
  expect(sdk.release).toHaveBeenCalledWith([id]);
  sdk.open.mockResolvedValue({ size: 1 });
  sdk.read.mockResolvedValue("!!!!");
  const r = await openCaptureFileLease(`otr-capture-file://${id}`);
  await expect(r.read(4)).rejects.toMatchObject({ code: "READER_FAILURE" });
  await r.close();
});
it("closing a failed read destroys its lease; retry requires explicit new selection", async () => {
  sdk.open.mockResolvedValue({ size: 1 });
  sdk.read.mockRejectedValue(new Error("provider unavailable"));
  sdk.close.mockImplementation(async () => {
    sdk.open.mockRejectedValue(new Error("CAPTURE_FILE_LEASE_EXPIRED"));
  });
  const reader = await openCaptureFileLease(`otr-capture-file://${id}`);
  await expect(reader.read(1)).rejects.toMatchObject({ code: "READER_FAILURE" });
  await reader.close();
  await expect(openCaptureFileLease(`otr-capture-file://${id}`)).rejects.toMatchObject({
    code: "READER_FAILURE",
  });
  expect(sdk.pick).not.toHaveBeenCalled();
});

it("account generation changes invalidate every native lease and pending picker", async () => {
  const { advanceAccountGeneration } = await import("@/data/auth/accountGeneration");
  advanceAccountGeneration();
  expect(sdk.releaseAll).toHaveBeenCalledOnce();
});
