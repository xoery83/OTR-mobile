import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createHash } from "node:crypto";
import {
  nativeTripCoverAllowlistSha256,
  ownerPhotoTripCoverAllowlistSha256,
  tripCoverAssetIds,
  isTripCoverAssetId,
} from "@/domain/trip/tripCoverAssets";
import {
  coverCatalog,
  rankedTripCovers,
  rawTripCover,
  resolveTripCover,
  legacyTripCover,
} from "./coverDecision";
const automatic = (name: string, destination: string | null) => ({
  id: "cover-test-trip",
  name,
  destination,
  selectedCoverAssetIdRaw: null,
});
it("uses selected destination labels for automatic covers without changing manual priority", () => {
  for (const displayLabel of ["Tokyo", "Iceland"]) {
    const trip = {
      ...automatic("My holiday", "Legacy location"),
      destinations: [{ displayLabel }],
    };
    expect(rankedTripCovers(trip, 6)).toEqual(
      rankedTripCovers({ ...trip, destination: displayLabel, destinations: [] }, 6),
    );
    expect(resolveTripCover({ ...trip, selectedCoverAssetIdRaw: "city" })).toEqual({
      assetId: "city",
      mode: "manual",
    });
    expect(trip.destination).toBe("Legacy location");
  }
});
it("keeps 48 frozen images byte exact and all74 literal resource mappings finite", () => {
  const allow = JSON.parse(readFileSync("vendor/otr-cover-core/allowlist.json", "utf8"));
  const map = readFileSync("src/features/trip-cover/tripCoverSources.ts", "utf8");
  expect(allow.items).toHaveLength(48);
  expect(
    createHash("sha256")
      .update(readFileSync("vendor/otr-cover-core/allowlist.json"))
      .digest("hex"),
  ).toBe(nativeTripCoverAllowlistSha256);
  expect(tripCoverAssetIds).toHaveLength(74);
  let bytes = 0;
  for (const item of allow.items) {
    expect(isTripCoverAssetId(item.id)).toBe(true);
    const content = readFileSync(`assets/trips/covers/v2/${item.id}.jpg`);
    expect(createHash("sha256").update(content).digest("hex")).toBe(item.sha256);
    expect(map).toContain(`v2/${item.id}.jpg`);
    bytes += content.length;
  }
  expect(bytes).toBe(12750269);
  expect(coverCatalog).toHaveLength(70);
});
it("distinguishes true automatic null from future/manual or uncertified legacy DTOs", () => {
  const trip = automatic("Tokyo winter", "Tokyo");
  expect(rawTripCover(trip)).toBeNull();
  expect(resolveTripCover(trip).mode).toBe("automatic");
  expect(resolveTripCover({ ...trip, selectedCoverAssetIdRaw: "future-cover" })).toEqual({
    assetId: legacyTripCover(trip.id),
    mode: "unavailable_manual",
  });
  expect(resolveTripCover({ id: trip.id, selectedCoverAssetId: null }).mode).toBe(
    "unavailable_manual",
  );
  for (const id of tripCoverAssetIds)
    expect(resolveTripCover({ ...trip, selectedCoverAssetIdRaw: id })).toEqual({
      assetId: id,
      mode: "manual",
    });
});
it.each([
  ["Tokyo winter", "Tokyo"],
  ["Nelson hiking", "Nelson"],
  ["Iceland road trip", "Iceland"],
  ["Bali family", "Bali"],
  ["Kyoto cherry blossom", "Kyoto"],
  ["Unknown", null],
  ["Springfield", "Springfield"],
])(
  "derives deterministic bundled suggestions for %s without mutating Trip metadata",
  (name, destination) => {
    const trip = Object.freeze(automatic(name, destination));
    const first = rankedTripCovers(trip);
    expect(first.length).toBeGreaterThan(0);
    expect(rankedTripCovers({ ...trip }).map((row) => row.asset.id)).toEqual(
      first.map((row) => row.asset.id),
    );
    expect(first.every((row) => isTripCoverAssetId(row.asset.id))).toBe(true);
    expect(trip.selectedCoverAssetIdRaw).toBeNull();
    for (const row of first)
      if (row.asset.provenance.kind === "generated_illustration")
        expect(row.destinationPhoto).toBe(false);
  },
);
it("uses source-linked Tokyo only under explicit frozen pending-preview policy", () => {
  const top = rankedTripCovers(automatic("Tokyo", "Tokyo"))[0];
  expect(top.tier).toBe("EXACT");
  expect(top.asset.actualCaptureGeo.label).toMatch(/Tokyo|東京|tokyo/);
  expect(top.rights.review).toBe("pending");
});

it("retains the frozen TypeScript bytes and emits only type-erased portable JS", () => {
  const root = "vendor/otr-cover-core/";
  const manifest = JSON.parse(readFileSync(root + "FROZEN_SOURCE.json", "utf8"));
  expect(manifest.commit).toBe("9555ed42197bb0c955f12146317d2889757a7fd8");
  for (const [name, hash] of Object.entries(manifest.sourceHashes)) {
    const source = readFileSync(root + name, "utf8");
    expect(createHash("sha256").update(source).digest("hex")).toBe(hash);
    expect(readFileSync(root + name.replace(/\.ts$/, ".js"), "utf8")).toBe(
      ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
        fileName: name,
      }).outputText,
    );
  }
});

it("keeps the authorized Owner22 supplement finite, byte-exact and geographically unknown", () => {
  const root = "vendor/otr-cover-core/";
  const allow = JSON.parse(readFileSync(root + "owner22-allowlist.json", "utf8"));
  const origin = JSON.parse(readFileSync(root + "OWNER22_SOURCE.json", "utf8"));
  expect(
    createHash("sha256")
      .update(readFileSync(root + "owner22-allowlist.json"))
      .digest("hex"),
  ).toBe(ownerPhotoTripCoverAllowlistSha256);
  expect(allow.items).toHaveLength(22);
  expect(
    createHash("sha256")
      .update(JSON.stringify(coverCatalog.slice(0, 48)))
      .digest("hex"),
  ).toBe(origin.previous48CanonicalSha256);
  const map = readFileSync("src/features/trip-cover/tripCoverSources.ts", "utf8");
  expect(map.match(/require\(/g)).toHaveLength(74);
  let bytes = 0;
  for (const item of allow.items) {
    const image = readFileSync(`assets/trips/covers/v2/${item.id}.jpg`);
    expect(createHash("sha256").update(image).digest("hex")).toBe(item.sha256);
    expect(isTripCoverAssetId(item.id)).toBe(true);
    expect(map).toContain(`v2/${item.id}.jpg`);
    const asset = coverCatalog.find((row) => row.id === item.id)!;
    expect(asset.provenance.kind).toBe("owner_photograph");
    expect(asset.provenance.sourceUrl).toBe("");
    expect(asset.provenance.licenseUrl).toBe("");
    expect(asset.geoSpecificity).toBe("generic");
    expect(asset.actualCaptureGeo.entityIds).toEqual([]);
    expect(asset.actualCaptureGeo.confidence).toBe("unknown");
    expect(asset.recommendationEligibility.exactGeoIds).toEqual([]);
    expect(asset.provenance.humanReview).toBe("pending");
    bytes += image.length;
  }
  expect(bytes).toBe(5579363);
  expect(
    allow.items
      .filter((item: any) => item.cropQA.mobileFit === "contain")
      .map((item: any) => item.id),
  ).toEqual(origin.cropContainIds);
});

it("multi-destination UI shortening does not change full geography or its ranking cache", () => {
  const trip = {
    ...automatic("Holiday", "Legacy"),
    id: "cover-full-multidest-regression",
    destinations: [
      { displayLabel: "Cambridge, United Kingdom" },
      { displayLabel: "Cambridge, Massachusetts, United States" },
    ],
  };
  const ranked = rankedTripCovers(trip, 6);
  expect(
    rankedTripCovers(
      {
        ...trip,
        destinations: [],
        destination:
          "Cambridge, United Kingdom · Cambridge, Massachusetts, United States",
      },
      6,
    ),
  ).toBe(ranked);
  expect(trip.destinations.map((place) => place.displayLabel)).toEqual([
    "Cambridge, United Kingdom",
    "Cambridge, Massachusetts, United States",
  ]);
});
