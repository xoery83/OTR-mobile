const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");
// Build-time only. Neither geo-tz nor its 71MB boundary files are bundled into Native.
const [catalogPath, geoTzPath] = process.argv.slice(2);
if (!catalogPath || !geoTzPath)
  throw new Error(
    "Usage: node build-airport-suggestions.cjs CATALOG_JSON GEO_TZ_PACKAGE_DIR",
  );
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const source = fs.readFileSync(catalogPath);
if (sha(source) !== "83a4d98c345a9ffc00712acfd2f3ed802db37d1d1622884fc0fd858156672073")
  throw new Error("AIRPORT_SOURCE_HASH");
const pkg = JSON.parse(fs.readFileSync(path.join(geoTzPath, "package.json")));
if (pkg.version !== "8.1.10") throw new Error("BOUNDARY_PACKAGE_VERSION");
const expectedFiles = {
  "dist/find-all.js": "af885ee04322fcf6f8f1bbeae02c793103adbcf1646343aac9ac76449105051f",
  "data/timezones.geojson.index.json":
    "21e347d90dc388e8028eb461c34af61ce8f65d75216fc0bb8f2b98fe0079aad9",
  "data/timezones.geojson.geo.dat":
    "f6ee7fb72fe804998c0b0542c2c0e6a36397c26ba26a485765c22c1cd175ea74",
};
for (const [name, hash] of Object.entries(expectedFiles)) {
  if (sha(fs.readFileSync(path.join(geoTzPath, name))) !== hash)
    throw new Error("BOUNDARY_SOURCE_HASH:" + name);
}
const { find } = require(path.resolve(geoTzPath, "dist/find-all.js"));
const canonical = (zone) =>
  new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
const stats = { records: 0, automatic: 0, unresolved: 0, conflicts: 0 };
const records = JSON.parse(source)
  .records.filter((r) => r.facilityStatus !== "CLOSED" && (r.iata || r.icao))
  .map((r) => {
    let zone = null;
    try {
      const { latitude, longitude } = r.coordinates;
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        (latitude === 0 && longitude === 0)
      )
        throw new Error("COORDINATE");
      const zones = find(latitude, longitude);
      if (zones.length === 1 && !zones[0].startsWith("Etc/")) {
        canonical(zones[0]);
        if (
          r.timezone &&
          r.timezoneEvidence &&
          canonical(r.timezone) !== canonical(zones[0])
        )
          stats.conflicts++;
        else zone = zones[0];
      }
    } catch {
      /* Missing/ambiguous data must remain a manual fallback. */
    }
    stats.records++;
    stats[zone ? "automatic" : "unresolved"]++;
    return { iata: r.iata, icao: r.icao, name: r.name, country: r.country, zone };
  });
const dest = path.resolve(
  path.dirname(require.resolve("./build-airport-suggestions.cjs")),
  "../../src/features/day-feed/data",
);
const bytes = JSON.stringify(records) + "\n";
fs.writeFileSync(path.join(dest, "airports.json"), bytes);
const manifest = {
  sourceCatalogSha256: sha(source),
  referenceVersion: "airport-ref-01-20261021-b529623d2a0b",
  geoTzVersion: pkg.version,
  expectedNpmArchiveIntegrity:
    "sha512-o7P79JIc9it6V0Nl1h3DlPJ12LMCnpuR0ePmJ+TqNggmGF+7snk6+7Q714te8XAGGvOiY2cJGxRiN/cA5xwFVw==",
  boundaryFiles: Object.fromEntries(
    ["timezones.geojson.index.json", "timezones.geojson.geo.dat"].map((name) => [
      name,
      sha(fs.readFileSync(path.join(geoTzPath, "data", name))),
    ]),
  ),
  description:
    "Explicit user-selected airport. Unique coordinate polygon IANA zone only; conflicting retained airport zone, overlap, ocean or invalid coordinates remain null. No civil-to-instant resolver, current UTC offset, Source proof or navigation identity.",
  attribution:
    "OurAirports contributors (Unlicense); timezone-boundary-builder / OpenStreetMap contributors (ODbL 1.0); geo-tz (MIT). Airport-zone derivative is distributed under ODbL 1.0.",
  outputSha256: sha(bytes),
  outputBytes: Buffer.byteLength(bytes),
  stats,
};
fs.writeFileSync(
  path.join(dest, "AIRPORT_BUILD.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(stats));
