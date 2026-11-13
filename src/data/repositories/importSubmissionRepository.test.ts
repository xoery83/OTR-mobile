import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import {
  readImportSubmission,
  retainImportSubmission,
  updateImportSubmission,
} from "./importSubmissionRepository";
const auth = vi.hoisted(() => ({ account: "10000000-0000-4000-8000-000000000001" }));
vi.mock("../auth/authRepository", () => ({
  requireAdoptedUserId: async () => auth.account,
}));
const storage = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  root: "file:///app/Documents",
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => randomUUID() }));
vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | Directory)[]) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part.replace(/\/$/, "") : part.uri))
        .join("/");
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: (string | Directory)[]) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part : part.uri))
        .join("/");
    }
    get exists() {
      return storage.files.has(this.uri);
    }
    get size() {
      return storage.files.get(this.uri)?.length ?? 0;
    }
    create() {
      storage.files.set(this.uri, new Uint8Array());
    }
    write(value: string | Uint8Array) {
      storage.files.set(
        this.uri,
        typeof value === "string" ? new TextEncoder().encode(value) : value.slice(),
      );
    }
    async bytes() {
      if (!this.exists) throw Error("missing");
      return storage.files.get(this.uri)!.slice();
    }
    async text() {
      return new TextDecoder().decode(await this.bytes());
    }
    textSync() {
      return new TextDecoder().decode(storage.files.get(this.uri));
    }
    copySync(next: File) {
      storage.files.set(next.uri, storage.files.get(this.uri)!.slice());
    }
    move(next: File, options: { overwrite: boolean }) {
      if (next.exists && !options.overwrite) throw Error("exists");
      storage.files.set(next.uri, storage.files.get(this.uri)!);
      storage.files.delete(this.uri);
      this.uri = next.uri;
    }
    moveSync(next: File, options: { overwrite: boolean }) {
      this.move(next, options);
    }
    delete() {
      storage.files.delete(this.uri);
    }
  }
  return {
    File,
    Directory,
    Paths: {
      get document() {
        return storage.root;
      },
    },
  };
});
const model = () =>
  ({
    batch: {
      accountId: auth.account,
      batchId: randomUUID(),
      context: { tripPrior: { id: randomUUID() } },
    },
  }) as unknown as CaptureJobReadModel;
beforeEach(() => {
  storage.files.clear();
  vi.stubEnv("EXPO_PUBLIC_OTR_SYNC_TRANSPORT", "dev");
  vi.stubEnv("EXPO_PUBLIC_OTR_IMPORT_CONFIRM_BEFORE_SAVE", "");
});
it("historical Activity has no Submit authority; dev retains one batch confirmation across reopen", async () => {
  const m = model();
  expect(await readImportSubmission(m)).toBeNull();
  expect(await retainImportSubmission(m)).toMatchObject({
    confirmBeforeSave: true,
    confirmed: false,
  });
  await updateImportSubmission(m, (p) => ({ ...p, confirmed: true }));
  expect(await readImportSubmission(structuredClone(m))).toMatchObject({
    confirmed: true,
  });
  expect(await retainImportSubmission(m)).toMatchObject({ confirmed: true });
  await expect(
    updateImportSubmission(m, (p) => ({ ...p, confirmed: false })),
  ).rejects.toThrow("SCOPE");
});
it("production Submit is sufficient; reading another batch never grants intent", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_SYNC_TRANSPORT", "production");
  const m = model();
  expect(await retainImportSubmission(m)).toMatchObject({
    confirmBeforeSave: false,
    confirmed: true,
  });
  expect(await readImportSubmission(model())).toBeNull();
});
it("account/Trip scope cannot reuse submission or resolution", async () => {
  const m = model();
  await retainImportSubmission(m);
  await expect(
    readImportSubmission({ ...m, batch: { ...m.batch, accountId: randomUUID() } }),
  ).rejects.toThrow("SCOPE");
  await expect(
    readImportSubmission({
      ...m,
      assignedTripId: null,
      batch: {
        ...m.batch,
        context: { ...m.batch.context, tripPrior: { id: randomUUID() } },
      },
    } as CaptureJobReadModel),
  ).rejects.toThrow("SCOPE");
});
it("serialized decisions cannot erase an earlier saved resolution", async () => {
  const m = model();
  await retainImportSubmission(m);
  const a = randomUUID(),
    b = randomUUID();
  const resolution = (id: string) => ({
    candidate: {
      candidateId: id,
      kind: "P1" as const,
      subtype: "ACTIVITY",
      fields: { title: "Synthetic" },
      documentIds: [randomUUID()],
    },
    decision: { action: "NEW" as const },
  });
  await Promise.all(
    [a, b].map((id) =>
      updateImportSubmission(m, (p) => ({
        ...p,
        resolutions: { ...p.resolutions, [id]: resolution(id) },
      })),
    ),
  );
  expect(Object.keys((await readImportSubmission(m))!.resolutions)).toHaveLength(2);
});
