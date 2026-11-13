import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createCaptureStaging } from "@/features/capture/captureStaging";
import {
  readCaptureDraft,
  readCaptureDraftPreview,
  retainCaptureDraftSelection,
  saveCaptureDraft,
} from "./captureDraftRepository";

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
const owner = {
  accountId: "10000000-0000-4000-8000-000000000001",
  tripPrior: "20000000-0000-4000-8000-000000000001",
};
const other = "20000000-0000-4000-8000-000000000002";
beforeEach(() => {
  storage.files.clear();
  storage.root = "file:///app/Documents";
});
async function draft() {
  storage.files.set(
    "file:///picker/test.txt",
    new TextEncoder().encode("Original travel text"),
  );
  const selection = await retainCaptureDraftSelection(owner.accountId, {
    source: "files",
    temporaryUri: "file:///picker/test.txt",
    name: "test.txt",
    typeHint: "text/plain",
  });
  const staging = createCaptureStaging(
    async () => [selection],
    () => true,
    owner,
  );
  await staging.pick("files");
  staging.setEditorText("Additional note");
  saveCaptureDraft(owner, staging.getDraftSnapshot());
  return { staging, selection };
}
it("restores a mixed draft after process/container replacement without storing picker URIs", async () => {
  const { selection } = await draft();
  const json = [...storage.files.entries()].find(([path]) => path.endsWith(".json"))!;
  expect(new TextDecoder().decode(json[1])).not.toContain("file://");
  for (const [key, value] of [...storage.files])
    if (key.startsWith(storage.root)) {
      storage.files.delete(key);
      storage.files.set(
        key.replace(storage.root, "file:///replacement/Documents"),
        value,
      );
    }
  storage.root = "file:///replacement/Documents";
  const saved = (await readCaptureDraft(owner))!;
  expect(saved.editorText).toBe("Additional note");
  expect(saved.items[0]).toMatchObject({
    draftOriginal: selection.draftOriginal,
    availability: "unverified",
  });
  const fresh = createCaptureStaging(
    async () => [],
    () => true,
    owner,
  );
  expect(fresh.restore(saved)).toBe(true);
  expect(fresh.prepareSubmit()).toHaveLength(2);
  expect(await readCaptureDraftPreview(owner.accountId, saved.items[0])).toEqual({
    text: "Original travel text",
  });
});
it("keeps Account and Trip namespaces isolated and rejects a forged record owner", async () => {
  await draft();
  expect(await readCaptureDraft({ ...owner, tripPrior: other })).toBeNull();
  expect(await readCaptureDraft({ ...owner, accountId: other })).toBeNull();
  const [path, bytes] = [...storage.files.entries()].find(([path]) =>
    path.endsWith(".json"),
  )!;
  const value = JSON.parse(new TextDecoder().decode(bytes));
  value.owner.accountId = other;
  storage.files.set(path, new TextEncoder().encode(JSON.stringify(value)));
  await expect(readCaptureDraft(owner)).rejects.toThrow("CAPTURE_DRAFT_OWNER_MISMATCH");
});
it("keeps missing or changed files visible as unavailable instead of trusting an old URI", async () => {
  const { selection } = await draft();
  storage.files.set(selection.temporaryUri!, new Uint8Array([1, 2]));
  const saved = (await readCaptureDraft(owner))!;
  expect(saved.items[0]).toMatchObject({
    temporaryUri: null,
    availability: "unavailable",
  });
  await expect(
    readCaptureDraftPreview(owner.accountId, saved.items[0]),
  ).rejects.toThrow();
});
it("Clear All persists an empty draft without removing originals or affecting another Trip", async () => {
  const { staging, selection } = await draft();
  saveCaptureDraft({ ...owner, tripPrior: other }, staging.getDraftSnapshot());
  staging.clearAllConfirmed();
  saveCaptureDraft(owner, staging.getDraftSnapshot());
  expect((await readCaptureDraft(owner))?.items).toEqual([]);
  expect((await readCaptureDraft({ ...owner, tripPrior: other }))?.items).toHaveLength(1);
  expect(storage.files.has(selection.temporaryUri!)).toBe(true);
  storage.files.delete(
    [...storage.files.keys()].find((key) => key.endsWith(`${owner.tripPrior}.json`))!,
  );
  expect((await readCaptureDraft(owner))?.items).toEqual([]);
});
it("Close hides the UI without replacing the persisted draft with its hidden empty projection", async () => {
  const { staging } = await draft();
  const stop = staging.subscribe(() => {
    if (staging.isVisible()) saveCaptureDraft(owner, staging.getDraftSnapshot());
  });
  staging.hide();
  expect(staging.getDraftSnapshot().items).toHaveLength(0);
  expect((await readCaptureDraft(owner))?.items).toHaveLength(1);
  expect(staging.resume(owner, () => true)).toBe(true);
  expect(staging.getDraftSnapshot().editorText).toBe("Additional note");
  stop();
});
it("never serializes a clipboard token or restores it as an executable native capability", async () => {
  const staging = createCaptureStaging(
    async () => [],
    () => true,
    owner,
  );
  staging.stagePastedImages(
    [
      {
        token: "session-only-secret",
        uri: "file:///paste/a.png",
        byteSize: 5,
        mimeType: "image/png",
        source: "clipboard",
        representation: "item-provider",
      },
    ],
    () => {},
  );
  saveCaptureDraft(owner, staging.getDraftSnapshot());
  const json = [...storage.files.entries()].find(([path]) => path.endsWith(".json"))![1];
  expect(new TextDecoder().decode(json)).not.toContain("session-only-secret");
  expect((await readCaptureDraft(owner))?.items[0]).toMatchObject({
    source: "clipboard",
    availability: "unavailable",
    token: "",
    temporaryUri: "",
  });
});
it("recovers the previous valid roster if the process stops during Expo replacement", async () => {
  const { staging } = await draft();
  staging.setEditorText("Newer note");
  saveCaptureDraft(owner, staging.getDraftSnapshot());
  const path = [...storage.files.keys()].find((key) => key.endsWith(".json"))!;
  storage.files.delete(path);
  expect((await readCaptureDraft(owner))?.editorText).toBe("Additional note");
  storage.files.set(path, new TextEncoder().encode("{incomplete"));
  expect((await readCaptureDraft(owner))?.items).toHaveLength(1);
});
it("restores five legal text inputs whose combined roster exceeds three MiB", async () => {
  const items = Array.from({ length: 5 }, (_, i) => ({
    source: "magic_input" as const,
    stagingId: i + 1,
    text: `${i}:` + "a".repeat(800_000),
  }));
  saveCaptureDraft(owner, { items, editorText: "", selecting: false, error: null });
  expect((await readCaptureDraft(owner))?.items).toEqual(items);
});
