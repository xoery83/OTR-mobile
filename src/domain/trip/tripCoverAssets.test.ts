import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  isTripCoverAssetId,
  parseTripPhotoCoverRef,
  tripPhotoCoverRef,
  legacyTripCoverAssetIds,
  nativeTripCoverAllowlistSha256,
  nativeTripCoverAssetIds,
  ownerPhotoTripCoverAllowlistSha256,
  ownerPhotoTripCoverAssetIds,
  tripCoverAssetIds,
} from "./tripCoverAssets";

it("pins the approved 48-ID candidate pool alongside the unchanged legacy four", () => {
  expect(nativeTripCoverAllowlistSha256).toBe(
    "25a8ebf674d33369c8369eeae245ff586de90a788db04ea1feb843e8390a445a",
  );
  expect(legacyTripCoverAssetIds).toEqual([
    "city",
    "coast",
    "mountain",
    "cultural-oldtown",
  ]);
  expect(nativeTripCoverAssetIds).toHaveLength(48);
  expect(nativeTripCoverAssetIds.filter((id) => id.startsWith("wc-"))).toHaveLength(31);
  expect(nativeTripCoverAssetIds.filter((id) => id.startsWith("gen-"))).toHaveLength(17);
  const original52 = [...legacyTripCoverAssetIds, ...nativeTripCoverAssetIds];
  expect(new Set(original52).size).toBe(52);
  expect(tripCoverAssetIds.slice(0, 52)).toEqual(original52);
  expect(
    createHash("sha256")
      .update([...original52].sort().join("\n"))
      .digest("hex"),
  ).toBe("f08794d8e11b57f67e3439cd9f54dca147a45fc6993398bfe46d4d3ae8e9368d");
  for (const id of tripCoverAssetIds) expect(id).toMatch(/^[a-z0-9_-]{1,64}$/);
});

it("recognises only registered IDs, without accepting pattern-valid future or excluded assets", () => {
  expect(isTripCoverAssetId("wc-142191115")).toBe(true);
  expect(isTripCoverAssetId("gen-b1-001")).toBe(true);
  for (const value of [
    null,
    undefined,
    1,
    "",
    "CITY",
    " city",
    "gen-b1-011",
    "gen-b1-012",
    "gen-b1-020",
    "future-valid-id",
    "owner-photo-1",
    "../city",
  ])
    expect(isTripCoverAssetId(value)).toBe(false);
});

it("appends exactly the authorized22 static Owner IDs without replacing the original52", () => {
  expect(ownerPhotoTripCoverAllowlistSha256).toBe(
    "1d9fcbe05882645f7846d253989a2720bb8bf55765c1fd8b1677b4c085051927",
  );
  expect(ownerPhotoTripCoverAssetIds).toHaveLength(22);
  expect(new Set(tripCoverAssetIds).size).toBe(74);
  expect(tripCoverAssetIds.slice(52)).toEqual(ownerPhotoTripCoverAssetIds);
  expect(
    createHash("sha256")
      .update([...ownerPhotoTripCoverAssetIds].sort().join("\n"))
      .digest("hex"),
  ).toBe("fcbce5092af365700fe8853bdef7f87e00f7593a37867fb7781df9b68d0bee98");
  for (const id of ownerPhotoTripCoverAssetIds) {
    expect(id).toMatch(/^owner-photo-[0-9a-f]{12}$/);
    expect(isTripCoverAssetId(id)).toBe(true);
    expect(legacyTripCoverAssetIds.some((legacy) => legacy === String(id))).toBe(false);
    expect(nativeTripCoverAssetIds.some((native) => native === String(id))).toBe(false);
  }
  expect(Object.isFrozen(ownerPhotoTripCoverAssetIds)).toBe(true);
  for (const invalid of [
    "owner-photo-a348f66b8ca6",
    "OWNER-PHOTO-A348F66B8CA5",
    " owner-photo-a348f66b8ca5",
    "owner-photo-a348f66b8ca5.jpg",
    "owner-photo-a348f66b8ca5/..",
  ])
    expect(isTripCoverAssetId(invalid)).toBe(false);
});

it("keeps retained photo references canonical and outside the static registry", () => {
  const id = "cd1d8549-4cb8-4166-8d79-c1adc10391e7";
  expect(tripPhotoCoverRef(id)).toBe(`photo-${id}`);
  expect(parseTripPhotoCoverRef(`photo-${id}`)).toBe(id);
  expect(isTripCoverAssetId(`photo-${id}`)).toBe(false);
  expect(tripCoverAssetIds).toHaveLength(74);
  for (const raw of [
    id,
    `photo-${id.toUpperCase()}`,
    `PHOTO-${id}`,
    ` photo-${id}`,
    `photo-${id}/x`,
    "photo-../a",
    null,
    {},
  ])
    expect(parseTripPhotoCoverRef(raw)).toBeNull();
  expect(() => tripPhotoCoverRef(id.toUpperCase())).toThrow();
});
