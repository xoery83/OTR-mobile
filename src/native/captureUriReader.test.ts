import { expect, it, vi } from "vitest";
import { openCaptureUriReader } from "./captureUriReader";
const native = vi.hoisted(() => ({ open: vi.fn(), readBytes: vi.fn(), close: vi.fn() }));
vi.mock("expo-file-system", () => ({
  File: class {
    open = native.open;
  },
  FileMode: { ReadOnly: "r" },
}));
it("opens read-only at submit, honors bounded reads, EOF and closes once", async () => {
  native.open.mockReturnValue({
    size: 3,
    readBytes: native.readBytes,
    close: native.close,
  });
  native.readBytes
    .mockReturnValueOnce(new Uint8Array([1, 2, 3]))
    .mockReturnValue(new Uint8Array());
  const reader = await openCaptureUriReader("file://read-only");
  expect(native.open).toHaveBeenCalledWith("r");
  expect(reader.sizeHint).toBe(3);
  expect(await reader.read(65536)).toEqual(new Uint8Array([1, 2, 3]));
  expect(native.readBytes).toHaveBeenCalledWith(65536);
  expect(await reader.read(1)).toBeNull();
  await expect(reader.read(65537)).rejects.toMatchObject({ code: "READER_FAILURE" });
  await reader.close();
  await reader.close();
  expect(native.close).toHaveBeenCalledOnce();
  await expect(reader.read(1)).rejects.toMatchObject({ code: "READER_FAILURE" });
});
it("expired/unreadable native URI fails safely without provider error disclosure", async () => {
  native.open.mockImplementation(() => {
    throw new Error("secret provider path");
  });
  await expect(openCaptureUriReader(null)).rejects.toMatchObject({
    code: "READER_FAILURE",
  });
  await expect(openCaptureUriReader("expired://selection")).rejects.toMatchObject({
    code: "READER_FAILURE",
  });
});
