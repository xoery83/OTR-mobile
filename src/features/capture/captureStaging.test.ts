import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createCaptureStaging, emptyCaptureStaging } from "./captureStaging";
import { pickCaptureMaterial } from "@/native/capturePicker";
import {
  advanceAccountGeneration,
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  assertAccountRequestGeneration,
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";

const native = vi.hoisted(() => ({
  files: vi.fn(),
  photos: vi.fn(),
  cameraPermission: vi.fn(),
  requestCameraPermission: vi.fn(),
  camera: vi.fn(),
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: native.files }));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: native.photos,
  getCameraPermissionsAsync: native.cameraPermission,
  requestCameraPermissionsAsync: native.requestCameraPermission,
  launchCameraAsync: native.camera,
}));
afterEach(() => vi.resetAllMocks());
function scope() {
  const context = {
    accountId: "real-account",
    tripId: "",
    generation: getAccountGeneration(),
  };
  return () => {
    try {
      assertAccountRequestGeneration(context);
      return true;
    } catch {
      return false;
    }
  };
}
const file = (name: string, uri = "temporary://file") => ({
  name,
  uri,
  size: 7,
  mimeType: "application/pdf",
});
const photo = {
  fileName: null,
  uri: "temporary://photo",
  width: 800,
  height: 600,
  fileSize: 3,
  mimeType: "image/heic",
};
it("stages ordered multiple Files, then Photos, then repeated Files; removal is session-only", async () => {
  native.files.mockResolvedValue({
    canceled: false,
    assets: [file("one.pdf"), file("中文".repeat(100) + ".pdf")],
  });
  native.photos.mockResolvedValue({ canceled: false, assets: [photo] });
  const staging = createCaptureStaging(pickCaptureMaterial, scope());
  expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
  await staging.pick("files");
  await staging.pick("photos");
  await staging.pick("files");
  const items = staging.getSnapshot().items;
  expect(items.map((item) => item.source)).toEqual([
    "files",
    "files",
    "photos",
    "files",
    "files",
  ]);
  expect(items.map((item) => item.stagingId)).toEqual([1, 2, 3, 4, 5]);
  expect(items[2]).toMatchObject({
    name: null,
    width: 800,
    height: 600,
    size: 3,
    availability: "unverified",
  });
  expect(native.files).toHaveBeenCalledWith({
    multiple: true,
    copyToCacheDirectory: false,
    base64: false,
  });
  expect(native.photos).toHaveBeenCalledWith(
    expect.objectContaining({
      allowsMultipleSelection: true,
      orderedSelection: true,
      base64: false,
      exif: false,
      quality: 1,
    }),
  );
  staging.remove(2);
  expect(staging.getSnapshot().items.map((item) => item.stagingId)).toEqual([1, 3, 4, 5]);
  staging.getSnapshot().items.forEach((item) => staging.remove(item.stagingId));
  expect(staging.getSnapshot().items).toEqual([]);
});
it("both picker cancellations preserve the tray; missing URI is not accepted evidence", async () => {
  native.files
    .mockResolvedValueOnce({ canceled: false, assets: [file("missing.pdf", "")] })
    .mockResolvedValue({ canceled: true, assets: null });
  native.photos.mockResolvedValue({ canceled: true, assets: null });
  const staging = createCaptureStaging(pickCaptureMaterial, scope());
  await staging.pick("files");
  const items = staging.getSnapshot().items;
  await staging.pick("files");
  await staging.pick("photos");
  expect(staging.getSnapshot().items).toEqual(items);
  expect(items[0]).toMatchObject({ temporaryUri: null, availability: "unavailable" });
});
it("serializes rapid taps, suppresses private native errors and permits a fresh retry", async () => {
  let reject!: (error: Error) => void;
  native.files
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue({ canceled: false, assets: [file("retry.pdf")] });
  const staging = createCaptureStaging(pickCaptureMaterial, scope());
  const pending = staging.pick("files");
  await staging.pick("photos");
  expect(native.photos).not.toHaveBeenCalled();
  reject(new Error("private temporary path"));
  await pending;
  expect(staging.getSnapshot()).toEqual({ items: [], selecting: false, error: "picker" });
  await staging.pick("files");
  expect(staging.getSnapshot().items).toHaveLength(1);
  expect(staging.getSnapshot().error).toBeNull();
});
it("A→B→A generations hide old items and reject old callbacks, including transition-in-progress", async () => {
  native.files.mockResolvedValueOnce({ canceled: false, assets: [file("A.pdf")] });
  let resolve!: (value: unknown) => void;
  native.photos.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const staging = createCaptureStaging(pickCaptureMaterial, scope());
  await staging.pick("files");
  const pending = staging.pick("photos");
  const observer = vi.fn();
  const unsubscribe = subscribeAccountGeneration(observer);
  const lease = await beginAccountTransition();
  expect(observer).toHaveBeenCalledOnce();
  expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
  endAccountTransition(lease);
  advanceAccountGeneration();
  resolve({ canceled: false, assets: [photo] });
  await pending;
  expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
  unsubscribe();
});
it("cancel and unmount during a picker never resurrect a choice; fresh session starts empty", async () => {
  for (const close of ["cancel", "unmount"] as const) {
    let resolve!: (value: unknown) => void;
    native.files.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const staging = createCaptureStaging(pickCaptureMaterial, scope());
    const unmount = staging.attach();
    const listener = vi.fn();
    staging.subscribe(listener);
    const pending = staging.pick("files");
    if (close === "cancel") staging.cancel();
    else unmount();
    const calls = listener.mock.calls.length;
    resolve({ canceled: false, assets: [file("late.pdf")] });
    await pending;
    expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
    expect(listener).toHaveBeenCalledTimes(calls);
  }
});
it("host context invalidation rejects stale Trip selections without rebinding them", async () => {
  let current = true;
  let resolve!: (value: unknown) => void;
  native.files.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const staging = createCaptureStaging(pickCaptureMaterial, () => current);
  const pending = staging.pick("files");
  current = false;
  resolve({ canceled: false, assets: [file("old-trip.pdf")] });
  await pending;
  expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
});
it("staging and acquisition remain volatile; content uses operations without direct custody or scheduler dependencies", () => {
  for (const path of [
    "src/features/capture/captureStaging.ts",
    "src/native/capturePicker.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(
      /from ["'][^"']*(?:repositories|operations|sync|expo-file-system|expo-crypto|expo-sqlite)/,
    );
    expect(source).not.toMatch(/\.intake\(|getForSourceHandoff|createSource|setInterval/);
  }
});

const draftOwner = { accountId: "real-account", tripPrior: "trip-one" };
const selection = (name = "one.pdf", identity?: { key: string; revision: string }) => ({
  source: "files" as const,
  temporaryUri: "temporary://file",
  name,
  typeHint: "application/pdf",
  ...(identity ? { identity } : {}),
});
it("retained editor Add and immutable Submit roster include unadded text once in selection order", async () => {
  const staging = createCaptureStaging(async () => [selection()], scope(), draftOwner);
  staging.setEditorText("   ");
  expect(staging.prepareSubmit()).toEqual([]);
  staging.setEditorText(" First text \n");
  staging.addEditorText();
  expect(staging.getDraftSnapshot().editorText).toBe("");
  await staging.pick("files");
  staging.setEditorText("Unadded text");
  const prepared = staging.prepareSubmit()!;
  expect(prepared.map((item) => item.source)).toEqual([
    "magic_input",
    "files",
    "magic_input",
  ]);
  expect(prepared[0]).toMatchObject({ text: " First text \n" });
  expect(prepared[2]).toMatchObject({ text: "Unadded text" });
  expect(Object.isFrozen(prepared)).toBe(true);
  prepared.forEach((item) => expect(Object.isFrozen(item)).toBe(true));
  staging.setEditorText("Later edit");
  staging.remove(prepared[0].stagingId);
  expect(prepared[0]).toMatchObject({ text: " First text \n" });
  expect(prepared[2]).toMatchObject({ text: "Unadded text" });
  staging.clearAllConfirmed();
  staging.setEditorText("Same text");
  expect(staging.addEditorText()).toBe("added");
  staging.setEditorText("Same text");
  expect(staging.prepareSubmit()).toHaveLength(1);
  expect(staging.addEditorText()).toBe("duplicate");
  expect(staging.getDraftSnapshot().items).toHaveLength(1);
});
it("Close and unmount retain exact-owner draft; Clear All removes only draft while remaining open", async () => {
  const staging = createCaptureStaging(async () => [selection()], scope(), draftOwner);
  const detach = staging.attach();
  await staging.pick("files");
  staging.setEditorText("Not added");
  staging.hide();
  expect(staging.getDraftSnapshot().items).toEqual([]);
  expect(staging.prepareSubmit()).toBeNull();
  expect(staging.resume({ ...draftOwner, tripPrior: null }, scope())).toBe(false);
  expect(staging.resume({ ...draftOwner, accountId: "foreign" }, scope())).toBe(false);
  expect(staging.resume(draftOwner, scope())).toBe(true);
  const freshDetach = staging.attach();
  detach(); // Old host cleanup cannot hide a resumed invocation.
  expect(staging.getDraftSnapshot()).toMatchObject({ editorText: "Not added" });
  expect(staging.getDraftSnapshot().items).toHaveLength(1);
  freshDetach();
  expect(staging.getDraftSnapshot().items).toEqual([]);
  expect(staging.resume(draftOwner, scope())).toBe(true);
  expect(staging.getDraftSnapshot().items).toHaveLength(1);
  staging.clearAllConfirmed();
  expect(staging.getDraftSnapshot()).toMatchObject({ items: [], editorText: "" });
  staging.setEditorText("Fresh start");
  expect(staging.getDraftSnapshot().editorText).toBe("Fresh start");
});
it("Account ABA and resumed draft reject old picker callbacks and stale-generation leases", async () => {
  let complete!: (value: ReturnType<typeof selection>[]) => void;
  const oldLease = scope();
  const staging = createCaptureStaging(
    () =>
      new Promise((done) => {
        complete = done;
      }),
    oldLease,
    draftOwner,
  );
  staging.setEditorText("A private draft");
  const pending = staging.pick("files");
  advanceAccountGeneration();
  expect(staging.getDraftSnapshot().editorText).toBe("");
  expect(staging.resume(draftOwner, oldLease)).toBe(false);
  expect(staging.resume({ ...draftOwner, accountId: "foreign" }, scope())).toBe(false);
  advanceAccountGeneration();
  expect(staging.resume(draftOwner, scope())).toBe(true);
  complete([selection("Late old account file")]);
  await pending;
  expect(staging.getDraftSnapshot()).toMatchObject({
    items: [],
    editorText: "A private draft",
    selecting: false,
  });
});
it("same selection identity/revision suppresses duplicates; name, URI and size alone never do", async () => {
  const identity = { key: "provider-material-id", revision: "revision-one" };
  const staging = createCaptureStaging(
    async () => [
      selection("same.pdf", identity),
      selection("renamed.pdf", identity),
      selection("same.pdf", { ...identity, revision: "revision-two" }),
      selection("same.pdf"),
      selection("same.pdf"),
    ],
    scope(),
    draftOwner,
  );
  expect(await staging.pick("files")).toEqual({ added: 4, duplicates: 1 });
  identity.revision = "changed-outside";
  expect(staging.getDraftSnapshot().items[0]).toMatchObject({
    identity: { revision: "revision-one" },
    availability: "unverified",
  });
  expect(staging.getDraftSnapshot().items).toHaveLength(4);
});
it("hiding a retained picker or clearing it cannot resurrect unsubmitted selections", async () => {
  for (const clear of [false, true]) {
    let complete!: (value: ReturnType<typeof selection>[]) => void;
    const staging = createCaptureStaging(
      () =>
        new Promise((done) => {
          complete = done;
        }),
      scope(),
      draftOwner,
    );
    staging.setEditorText("Retained");
    const pending = staging.pick("files");
    expect(staging.prepareSubmit()).toBeNull();
    if (clear) staging.clearAllConfirmed();
    else {
      staging.hide();
      staging.resume(draftOwner, scope());
    }
    complete([selection("Late file")]);
    await pending;
    expect(staging.getDraftSnapshot().items).toEqual([]);
    expect(staging.getDraftSnapshot().editorText).toBe(clear ? "" : "Retained");
  }
});

it("Camera stays explicit across retained draft, cancellation and stale picker ABA", async () => {
  const camera = {
    source: "camera" as const,
    temporaryUri: "temporary://shot",
    name: "shot.jpg",
    typeHint: "image/jpeg",
  };
  const current = scope();
  const staging = createCaptureStaging(async () => [camera], current, {
    accountId: "real-account",
    tripPrior: null,
  });
  await staging.pick("camera");
  expect(staging.prepareSubmit()?.map((i) => i.source)).toEqual(["camera"]);
  staging.hide();
  staging.resume({ accountId: "real-account", tripPrior: null }, scope());
  expect(staging.prepareSubmit()?.[0]).toMatchObject({
    source: "camera",
    availability: "unverified",
  });
  const canceled = createCaptureStaging(async () => [], scope());
  await canceled.pick("camera");
  expect(canceled.getSnapshot().items).toEqual([]);
  let release!: (items: readonly (typeof camera)[]) => void;
  const late = createCaptureStaging(
    () =>
      new Promise((done) => {
        release = done;
      }),
    scope(),
  );
  const pending = late.pick("camera");
  advanceAccountGeneration();
  advanceAccountGeneration();
  release([camera]);
  await pending;
  expect(late.getSnapshot().items).toEqual([]);
});
it("a Camera provider cannot silently substitute Photos provenance", async () => {
  const staging = createCaptureStaging(
    async () => [
      {
        source: "photos",
        temporaryUri: "temporary://photo",
        name: null,
        typeHint: "image/jpeg",
      },
    ],
    scope(),
  );
  await staging.pick("camera");
  expect(staging.getSnapshot()).toMatchObject({ items: [], error: "picker" });
});

it("Camera permission denial keeps previously selected Files intact and never launches the camera", async () => {
  native.files.mockResolvedValue({ canceled: false, assets: [file("plan.pdf")] });
  native.cameraPermission.mockResolvedValue({ granted: false });
  native.requestCameraPermission.mockResolvedValue({ granted: false });
  const staging = createCaptureStaging(pickCaptureMaterial, scope());
  await staging.pick("files");
  const prior = staging.getSnapshot().items;
  await staging.pick("camera");
  expect(staging.getSnapshot()).toMatchObject({
    items: prior,
    selecting: false,
    error: "picker",
  });
  expect(native.camera).not.toHaveBeenCalled();
});
