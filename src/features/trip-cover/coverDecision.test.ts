import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createHash } from "node:crypto";
import { tripCoverAssetIds, isTripCoverAssetId } from "@/domain/trip/tripCoverAssets";
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
it("keeps 48 frozen images byte exact and all52 literal resource mappings finite", () => {
  const allow = JSON.parse(readFileSync("vendor/otr-cover-core/allowlist.json", "utf8"));
  const map = readFileSync("src/features/trip-cover/tripCoverSources.ts", "utf8");
  expect(allow.items).toHaveLength(48);
  expect(
    createHash("sha256")
      .update(readFileSync("vendor/otr-cover-core/allowlist.json"))
      .digest("hex"),
  ).toBe(nativeTripCoverAllowlistSha256);
  expect(tripCoverAssetIds).toHaveLength(52);
  let bytes = 0;
  for (const item of allow.items) {
    expect(isTripCoverAssetId(item.id)).toBe(true);
    const content = readFileSync(`assets/trips/covers/v2/${item.id}.jpg`);
    expect(createHash("sha256").update(content).digest("hex")).toBe(item.sha256);
    expect(map).toContain(`v2/${item.id}.jpg`);
    bytes += content.length;
  }
  expect(bytes).toBe(12750269);
  expect(coverCatalog).toHaveLength(48);
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
