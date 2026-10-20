import { describe, expect, it } from "vitest";
import {
  canonicalCoordinate,
  canonicalEventJson,
  eventIntentCodec,
  parseEventJson,
} from "./tripEventIntent";

const envelope = {
  contractVersion: 1,
  intentVersion: 1,
  command: "CREATE_EVENT",
  commandVersion: 1,
  operationKey: "00000000-0000-4000-8000-000000000006",
  actorAccountId: "00000000-0000-4000-8000-000000000001",
  tripId: "00000000-0000-4000-8000-000000000003",
  eventId: "00000000-0000-4000-8000-000000000005",
  baseSemanticRevision: null,
  payload: { title: "A\n🚆", clear: null },
};
describe("Event intent codec, no command activation", () => {
  it("sorts recursively while retaining exact strings/null and array order", () => {
    expect(
      canonicalEventJson(parseEventJson('{"z":[2,1],"a":{"b":null,"a":"雪\\n"}}')),
    ).toBe('{"a":{"a":"雪\\n","b":null},"z":[2,1]}');
    expect(eventIntentCodec(JSON.stringify(envelope)).intentSha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(eventIntentCodec(JSON.stringify(envelope)).intentSha256).toBe(
      eventIntentCodec(
        JSON.stringify(Object.fromEntries(Object.entries(envelope).reverse())),
      ).intentSha256,
    );
  });
  it("binds command, actor, target, null/absence and exact text", () => {
    const hash = eventIntentCodec(JSON.stringify(envelope)).intentSha256;
    for (const changed of [
      { ...envelope, eventId: "00000000-0000-4000-8000-000000000008" },
      { ...envelope, payload: { title: "A\n🚆" } },
      { ...envelope, payload: { title: " A\n🚆", clear: null } },
    ])
      expect(eventIntentCodec(JSON.stringify(changed)).intentSha256).not.toBe(hash);
  });
  for (const raw of [
    '{"a":1,"a":2}',
    '{"a":{"b":1,"b":2}}',
    '{"x":-0}',
    '{"x":1.0}',
    '{"x":1e0}',
    '{"x":9007199254740992}',
    '{"x":NaN}',
    '{"x":"\\u0000"}',
    '{"x":"\\ud800"}',
    '{"x":"\\udc00"}',
    "[1,]",
    '{"x":1} trailing',
    '{"x":undefined}',
  ])
    it(`rejects unsafe raw input ${raw}`, () =>
      expect(() => parseEventJson(raw)).toThrow("INVALID_COMMAND"));
  it("rejects non-ASCII keys, oversized/deep input, reserved keys and unsafe numbers", () => {
    for (const raw of [
      JSON.stringify({ ...envelope, extra: true }),
      JSON.stringify({ ...envelope, payload: { 雪: 1 } }),
      JSON.stringify({ ...envelope, payload: { text: "x".repeat(32768) } }),
      "[".repeat(34) + "0" + "]".repeat(34),
    ])
      expect(() => eventIntentCodec(raw)).toThrow("INVALID_COMMAND");
    expect(() => canonicalEventJson(-0)).toThrow();
    expect(() => canonicalEventJson(Infinity)).toThrow();
  });
  it("treats prototype-like keys as inert data", () =>
    expect(canonicalEventJson(parseEventJson('{"__proto__":{"x":1}}'))).toBe(
      '{"__proto__":{"x":1}}',
    ));
  it("preserves coordinate decimal intent and rejects alternate spelling/range", () => {
    expect(canonicalCoordinate("-36.848461", 90)).toBe("-36.848461");
    for (const value of [
      "-0",
      "1.0",
      "01",
      "1e0",
      "+1",
      "91",
      "NaN",
      "0.123456789012345678",
    ])
      expect(() => canonicalCoordinate(value, 90)).toThrow();
  });
  for (const [limit, values] of [
    [90, ["90", "-90", "89.999999999999999", "-89.999999999999999"]],
    [180, ["180", "-180", "179.99999999999999", "-179.99999999999999"]],
  ] as const) {
    for (const value of values)
      it(`accepts exact coordinate ${value}`, () =>
        expect(canonicalCoordinate(value, limit)).toBe(value));
  }
  for (const [limit, values] of [
    [90, ["90.000000000000001", "-90.000000000000001"]],
    [180, ["180.00000000000001", "-180.00000000000001"]],
  ] as const) {
    for (const value of values)
      it(`rejects exact out-of-range coordinate ${value}`, () =>
        expect(() => canonicalCoordinate(value, limit)).toThrow("INVALID_COMMAND"));
  }
});
