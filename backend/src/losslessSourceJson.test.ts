import { expect, it } from "vitest";
import { losslessSourceJson } from "./losslessSourceJson";

it("preserves exact SQL source numeric tokens through a JSON request without changing preview calculations", () => {
  const source =
    '{"expenses":[{"valuation":{"decimalRate":0.011189760712298275},"revision":2}],"other":null}';
  expect(JSON.stringify(JSON.parse(source))).toContain("0.011189760712298274");
  const request = JSON.stringify({ expected_source_value: losslessSourceJson(source) });
  expect(request).toContain('"decimalRate":0.011189760712298275');
  expect(request).toContain('"revision":2');
  expect(request).toContain('"other":null');
  expect(JSON.stringify(losslessSourceJson(source))).toBe(source);
});
