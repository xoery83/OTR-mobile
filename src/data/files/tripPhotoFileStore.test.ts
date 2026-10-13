import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discardRetainedTripPhoto,
  resolveRetainedTripPhoto,
  retainTripPhoto,
} from "./tripPhotoFileStore";

const stored = vi.hoisted(() => new Map<string, Uint8Array>());
const copy = vi.hoisted(() => ({ corrupt: false, fail: false, moveConflict: false }));

vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(parent: string | Directory, name: string) {
      this.uri = `${typeof parent === "string" ? parent : parent.uri}/${name}`;
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(parent: string | Directory, name?: string) {
      this.uri = name
        ? `${typeof parent === "string" ? parent : parent.uri}/${name}`
        : typeof parent === "string"
          ? parent
          : parent.uri;
    }
    get exists() {
      return stored.has(this.uri);
    }
    get size() {
      return stored.get(this.uri)?.byteLength ?? 0;
    }
    open() {
      let offset = 0;
      return {
        readBytes: (count: number) => {
          const chunk = stored.get(this.uri)!.slice(offset, offset + count);
          offset += chunk.byteLength;
          return chunk;
        },
        close() {},
      };
    }
    async copy(destination: File, options: { overwrite: boolean }) {
      if (!options.overwrite && destination.exists) throw new Error("exists");
      const source = stored.get(this.uri)!;
      stored.set(
        destination.uri,
        new Uint8Array(copy.corrupt ? source.slice(0, -1) : source),
      );
      if (copy.fail) throw new Error("copy interrupted");
    }
    async move(destination: File, options: { overwrite: boolean }) {
      if (copy.moveConflict || (!options.overwrite && destination.exists))
        throw new Error("destination exists");
      stored.set(destination.uri, stored.get(this.uri)!);
      stored.delete(this.uri);
      this.uri = destination.uri;
    }
    delete() {
      stored.delete(this.uri);
    }
  }
  return {
    Directory,
    File,
    FileMode: { ReadOnly: "r" },
    Paths: { document: "file:///documents" },
  };
});

const accountId = "3a44420f-1111-4111-8111-111111111111";
const tripId = "1cb68ab1-2222-4222-8222-222222222222";
const assetId = "aaaaaaaa-3333-4333-8333-333333333333";
const temporaryUri = "file:///picker/image.jpg";
const jpeg = new Uint8Array([255, 216, 255, 1, 2, 3, 4, 5]);
const input = { accountId, tripId, assetId, temporaryUri };

beforeEach(() => {
  stored.clear();
  stored.set(temporaryUri, jpeg);
  copy.corrupt = false;
  copy.fail = false;
  copy.moveConflict = false;
});

describe("retained Trip photo file store", () => {
  it("copies exact selected bytes into account/Trip documents and survives a cold lookup", async () => {
    const retained = await retainTripPhoto(input);
    const photo = retained.photo;
    expect(retained.createdNew).toBe(true);
    expect(photo.localUri).toBe(
      `file:///documents/trip-photos/${accountId}/${tripId}/${assetId}.jpg`,
    );
    expect(photo.mimeType).toBe("image/jpeg");
    expect(photo.sizeBytes).toBe(jpeg.byteLength);
    expect(photo.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.get(photo.localUri)).toEqual(jpeg);
    expect(resolveRetainedTripPhoto(photo)).toBe(photo.localUri);
    expect(
      resolveRetainedTripPhoto({
        ...photo,
        accountId: "bbbbbbbb-4444-4444-8444-444444444444",
      }),
    ).toBeNull();
    expect(stored.get(temporaryUri)).toEqual(jpeg);
  });

  it("returns null when retained bytes are missing or changed", async () => {
    const photo = (await retainTripPhoto(input)).photo;
    expect(
      resolveRetainedTripPhoto({ ...photo, mimeType: "text/plain" as "image/jpeg" }),
    ).toBeNull();
    stored.set(photo.localUri, new Uint8Array([255, 216, 255, 9]));
    expect(resolveRetainedTripPhoto(photo)).toBeNull();
    stored.delete(photo.localUri);
    expect(resolveRetainedTripPhoto(photo)).toBeNull();
  });

  it("rejects identity traversal, non-picker URIs and unsupported bytes; identical retries reuse bytes", async () => {
    await expect(retainTripPhoto({ ...input, tripId: "../other" })).rejects.toThrow(
      "identity",
    );
    await expect(retainTripPhoto({ ...input, tripId: "%2Fother" })).rejects.toThrow(
      "identity",
    );
    await expect(
      retainTripPhoto({ ...input, temporaryUri: "https://example.com/a.jpg" }),
    ).rejects.toThrow("picker");
    stored.set(temporaryUri, new Uint8Array([1, 2, 3, 4]));
    await expect(retainTripPhoto(input)).rejects.toThrow("JPEG");
    stored.set(temporaryUri, jpeg);
    const first = await retainTripPhoto(input);
    expect((await retainTripPhoto(input)).photo).toEqual(first.photo);
    expect((await retainTripPhoto(input)).createdNew).toBe(false);
    stored.set(temporaryUri, new Uint8Array([255, 216, 255, 9]));
    await expect(retainTripPhoto(input)).rejects.toThrow("different bytes");
    stored.set(temporaryUri, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    await expect(retainTripPhoto(input)).rejects.toThrow("different bytes");
    expect([...stored.keys()].filter((key) => key.includes("trip-photos/"))).toEqual([
      first.photo.localUri,
    ]);
    expect(stored.get(temporaryUri)).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });

  it("deletes only an interrupted or mismatched destination, preserving the selected original", async () => {
    copy.fail = true;
    await expect(retainTripPhoto(input)).rejects.toThrow("copy interrupted");
    expect([...stored.keys()]).toEqual([temporaryUri]);
    copy.fail = false;
    copy.corrupt = true;
    await expect(retainTripPhoto(input)).rejects.toThrow();
    expect([...stored.keys()]).toEqual([temporaryUri]);
    expect(stored.get(temporaryUri)).toEqual(jpeg);
  });

  it("does not remove another retained file when final placement is rejected", async () => {
    copy.moveConflict = true;
    await expect(retainTripPhoto(input)).rejects.toThrow("destination exists");
    expect([...stored.keys()]).toEqual([temporaryUri]);
    expect(stored.get(temporaryUri)).toEqual(jpeg);
  });

  it("discards only a fresh, unchanged app-owned copy after failed association", async () => {
    const fresh = await retainTripPhoto(input);
    const reused = await retainTripPhoto(input);
    expect(discardRetainedTripPhoto(reused)).toBe(false);
    expect(stored.has(fresh.photo.localUri)).toBe(true);
    expect(
      discardRetainedTripPhoto({
        ...fresh,
        photo: { ...fresh.photo, localUri: temporaryUri },
      }),
    ).toBe(false);
    stored.set(fresh.photo.localUri, new Uint8Array([255, 216, 255, 9]));
    expect(discardRetainedTripPhoto(fresh)).toBe(false);
    stored.set(fresh.photo.localUri, jpeg);
    expect(discardRetainedTripPhoto(fresh)).toBe(true);
    expect(stored.has(fresh.photo.localUri)).toBe(false);
    expect(stored.get(temporaryUri)).toEqual(jpeg);
  });
});
