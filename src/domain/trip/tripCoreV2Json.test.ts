import { describe, it, expect } from "vitest";
import { parseCoreJson, canonicalCoreJson } from "./tripCoreV2Json";
import { parseEventJson, canonicalEventJson } from "./eventIntentJson";
describe("Core v2 fractional canonical codec", () => {
  it("round trips real coordinates and bounded original-page regions", () => {
    const value = {
      latitude: -36.8485,
      longitude: 174.7633,
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    };
    expect(canonicalCoreJson(parseCoreJson(JSON.stringify(value)))).toBe(
      canonicalCoreJson(value),
    );
  });
  it("matches ECMAScript number formatting and UTF-16 key ordering", () => {
    expect(canonicalCoreJson({ z: 1e-7, a: 0.123456789, b: -0 })).toBe(
      '{"a":0.123456789,"b":0,"z":1e-7}',
    );
  });
  it("rejects duplicate keys, unsafe/lossy integers, nonfinite and invalid Unicode", () => {
    for (const value of [
      '{"a":0.1,"a":0.2}',
      '{"n":9007199254740992}',
      '{"n":1.0000000000000000001}',
      '{"n":1e999}',
      '{"s":"\\ud800"}',
    ])
      expect(() => parseCoreJson(value)).toThrow();
  });
  it("keeps v1 integer-only wire and hash behavior untouched", () => {
    expect(() => parseEventJson('{"lat":0.1}')).toThrow();
    expect(() => canonicalEventJson({ lat: 0.1 })).toThrow();
    expect(canonicalEventJson({ a: 1 })).toBe(canonicalCoreJson({ a: 1 }));
  });
});
