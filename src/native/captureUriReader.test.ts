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
it("diagnoses API versus permission failures without URI, message or stack", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    native.open.mockImplementation(() => { throw Object.assign(new Error("file:///private/secret-token"), { name: "MissingPermissionException", code: "ERR_MISSING_PERMISSION" }); });
    await expect(openCaptureUriReader("file:///private/user-document")).rejects.toMatchObject({ code: "READER_FAILURE" });
    expect(warn).toHaveBeenLastCalledWith("OTR_CAPTURE_URI_READER_FAILURE", { stage: "open", name: "MissingPermissionException", code: "ERR_MISSING_PERMISSION" });
    native.open.mockImplementation(() => { throw new TypeError("private native API detail"); });
    await expect(openCaptureUriReader("file:///private/user-document")).rejects.toMatchObject({ code: "READER_FAILURE" });
    expect(warn).toHaveBeenLastCalledWith("OTR_CAPTURE_URI_READER_FAILURE", { stage: "open", name: "TypeError", code: "OTHER" });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/file:|private|secret|stack|message/);
  } finally { warn.mockRestore(); }
});
it("bounds untrusted names/codes and reports late native reads separately", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    native.open.mockReturnValue({ size: 1, readBytes() { throw { name: "private/path", code: "secret-token", message: "private" }; }, close: native.close });
    const reader = await openCaptureUriReader("file://unreported");
    await expect(reader.read(1)).rejects.toMatchObject({ code: "READER_FAILURE" });
    expect(warn).toHaveBeenLastCalledWith("OTR_CAPTURE_URI_READER_FAILURE", { stage: "read", name: "OTHER", code: "OTHER" });
    warn.mockImplementation(() => { throw new Error("logger unavailable"); });
    await expect(reader.read(1)).rejects.toMatchObject({ code: "READER_FAILURE" });
    await reader.close();
  } finally { warn.mockRestore(); }
});
