import { beforeEach, expect, it, vi } from "vitest";
import { pickCaptureMaterial } from "./capturePicker";
const sdk = vi.hoisted(() => ({
  permission: vi.fn(),
  request: vi.fn(),
  camera: vi.fn(),
  photos: vi.fn(),
  files: vi.fn(),
}));
vi.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: sdk.permission,
  requestCameraPermissionsAsync: sdk.request,
  launchCameraAsync: sdk.camera,
  launchImageLibraryAsync: sdk.photos,
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: sdk.files }));
const image = {
  uri: "temporary://camera",
  fileName: "shot.jpg",
  mimeType: "image/jpeg",
  fileSize: 12,
  width: 80,
  height: 60,
};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.permission.mockResolvedValue({ granted: true });
});
it("preserves an explicit Camera IMAGE selection without asking library or broad permissions", async () => {
  sdk.camera.mockResolvedValue({ canceled: false, assets: [image] });
  expect(await pickCaptureMaterial("camera")).toEqual([
    {
      source: "camera",
      temporaryUri: image.uri,
      name: image.fileName,
      typeHint: image.mimeType,
      size: 12,
      width: 80,
      height: 60,
    },
  ]);
  expect(sdk.request).not.toHaveBeenCalled();
  expect(sdk.photos).not.toHaveBeenCalled();
  expect(sdk.files).not.toHaveBeenCalled();
  expect(sdk.camera).toHaveBeenCalledWith({
    mediaTypes: ["images"],
    quality: 1,
    base64: false,
    exif: false,
  });
});
it("requests only explicit Camera permission, denying without launching or creating a selection", async () => {
  sdk.permission.mockResolvedValue({ granted: false });
  sdk.request.mockResolvedValue({ granted: false });
  await expect(pickCaptureMaterial("camera")).rejects.toThrow(
    "CAPTURE_CAMERA_PERMISSION_DENIED",
  );
  expect(sdk.request).toHaveBeenCalledOnce();
  expect(sdk.camera).not.toHaveBeenCalled();
  sdk.request.mockResolvedValue({ granted: true });
  sdk.camera.mockResolvedValue({ canceled: true, assets: null });
  expect(await pickCaptureMaterial("camera")).toEqual([]);
});
it("camera cancellation does not relabel or invoke existing Files/Photos selections", async () => {
  sdk.camera.mockResolvedValue({ canceled: true, assets: null });
  expect(await pickCaptureMaterial("camera")).toEqual([]);
  sdk.photos.mockResolvedValue({ canceled: false, assets: [image] });
  expect((await pickCaptureMaterial("photos"))[0].source).toBe("photos");
  sdk.files.mockResolvedValue({
    canceled: false,
    assets: [
      { uri: "temporary://pdf", name: "a.pdf", mimeType: "application/pdf", size: 2 },
    ],
  });
  expect((await pickCaptureMaterial("files"))[0]).toMatchObject({
    source: "files",
    typeHint: "application/pdf",
  });
  expect(sdk.camera).toHaveBeenCalledOnce();
});

it("reviewer: closing a retained draft during permission request must not open a late Camera", async () => {
  const { createCaptureStaging } = await import("@/features/capture/captureStaging");
  let grant!: (value: { granted: boolean }) => void;
  sdk.permission.mockResolvedValue({ granted: false });
  sdk.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  sdk.camera.mockResolvedValue({ canceled: true, assets: null });
  const staging = createCaptureStaging(pickCaptureMaterial, () => true, {
    accountId: "account",
    tripPrior: null,
  });
  staging.setEditorText("Keep this draft");
  const pending = staging.pick("camera");
  await Promise.resolve();
  expect(sdk.request).toHaveBeenCalledOnce();
  staging.hide();
  grant({ granted: true });
  await pending;
  expect(sdk.camera).not.toHaveBeenCalled();
});

it.each(["clear", "close-resume", "account-ABA", "initial-permission"] as const)(
  "a stale %s acquisition cannot revive a Camera permission continuation",
  async (invalidate) => {
    const { createCaptureStaging } = await import("@/features/capture/captureStaging");
    const { getAccountGeneration, advanceAccountGeneration } =
      await import("@/data/auth/accountGeneration");
    const generation = getAccountGeneration();
    let release!: (value: { granted: boolean }) => void;
    if (invalidate === "initial-permission")
      sdk.permission.mockImplementation(
        () =>
          new Promise((done) => {
            release = done;
          }),
      );
    else {
      sdk.permission.mockResolvedValue({ granted: false });
      sdk.request.mockImplementation(
        () =>
          new Promise((done) => {
            release = done;
          }),
      );
    }
    sdk.camera.mockResolvedValue({ canceled: true, assets: null });
    const owner = { accountId: "account", tripPrior: null };
    const staging = createCaptureStaging(
      pickCaptureMaterial,
      () => generation === getAccountGeneration(),
      owner,
    );
    const pending = staging.pick("camera");
    await Promise.resolve();
    if (invalidate === "clear") staging.clearAllConfirmed();
    else if (invalidate === "close-resume") {
      staging.hide();
      expect(staging.resume(owner, () => true)).toBe(true);
    } else if (invalidate === "account-ABA") {
      advanceAccountGeneration();
      advanceAccountGeneration();
    } else staging.hide();
    release({ granted: true });
    await pending;
    expect(sdk.camera).not.toHaveBeenCalled();
    if (invalidate === "initial-permission") expect(sdk.request).not.toHaveBeenCalled();
    expect(staging.getSnapshot().items).toEqual([]);
  },
);
