import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  isTripCoverAssetId,
  legacyTripCoverAssetIds,
  nativeTripCoverAllowlistSha256,
  nativeTripCoverAssetIds,
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
  expect(new Set(tripCoverAssetIds).size).toBe(52);
  expect(
    createHash("sha256")
      .update([...tripCoverAssetIds].sort().join("\n"))
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
