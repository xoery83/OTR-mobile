import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  serializeParticipationVector,
  encodeSharedLedgerCursor,
  decodeSharedLedgerCursor,
  participationObservationTimeSchema,
} from "./participationSnapshot";

const p1 = "20000000-0000-4000-8000-000000000001",
  p2 = "20000000-0000-4000-8000-000000000002";
const trip = "10000000-0000-4000-8000-000000000001",
  user = "30000000-0000-4000-8000-000000000001";
const row = (id: string, active: boolean, revision: number) => ({
  id,
  isParticipating: active,
  participationRevision: revision,
});
const hash = (rows: unknown[]) =>
  createHash("sha256").update(serializeParticipationVector(rows)).digest("hex");
const empty = "4a6d75d6a0fe1895b047dd33440dbb6548bd6d2ceb14186782989f9c55b5588d";
describe("participation fingerprint v1", () => {
  it.each([
    [[], empty, 28],
    [
      [row(p1, true, 0)],
      "3da17f966a308730772995ddf5936ee934621141927ebf0ccdcb15573b934c04",
      77,
    ],
    [
      [row(p1, false, 1)],
      "5157a50224e70aa1ddc5f14b35d6a3016eb15c39c72af94fe06a955ff47e7c9c",
      78,
    ],
    [
      [row(p1, true, 2)],
      "c1aec134d1ab5774e94e3950322a30a40f0dbc95f177d1f0662e98f0813ad737",
      77,
    ],
    [
      [row(p1, true, 0), row(p2, false, 7)],
      "32e4d4e995a1f9471bd2f36260b1c25023bc656758e7c93c5452a58840009592",
      128,
    ],
    [
      [row(p1, false, Number.MAX_SAFE_INTEGER)],
      "edbd32344002232b7d72e618d160b0b8ffc16845a72706c6aa63ce0b12028edc",
      93,
    ],
  ] as [unknown[], string, number][])(
    "matches exact golden vector %j",
    (rows, digest, bytes) => {
      expect(hash(rows)).toBe(digest);
      expect(Buffer.byteLength(serializeParticipationVector(rows))).toBe(bytes);
    },
  );
  it("sorts vector independently without reordering wire rows and normalizes UUID case", () => {
    const rows = [row(p2, false, 7), row(p1, true, 0)];
    const before = structuredClone(rows);
    expect(hash(rows)).toBe(hash([...rows].reverse()));
    expect(rows).toEqual(before);
    const id = "abcdef00-0000-4000-8000-000000000001";
    expect(hash([row(id.toUpperCase(), true, 0)])).toBe(hash([row(id, true, 0)]));
    expect(() => hash([row(id, true, 0), row(id.toUpperCase(), true, 0)])).toThrow(
      /Duplicate/,
    );
    expect(hash([row(p1, true, 7)])).not.toBe(hash([row(p1, false, 7)]));
  });
  it.each(
    [
      [{ id: "bad", isParticipating: true, participationRevision: 0 }],
      [{ id: p1, isParticipating: "true", participationRevision: 0 }],
      [{ id: p1, isParticipating: null, participationRevision: 0 }],
      [{ id: p1, isParticipating: true }],
      [{ id: p1, participationRevision: 0 }],
      [row(p1, true, -1)],
      [row(p1, true, 1.5)],
      [row(p1, true, Number.MAX_SAFE_INTEGER + 1)],
      [row(p1, true, 0), row(p1, true, 0)],
    ].map((rows) => [rows] as [unknown[]]),
  )("rejects malformed vector %j", (rows) => expect(() => hash(rows)).toThrow());
  it.each([
    "0000-01-01T00:00:00.000000Z",
    "2026-02-30T00:00:00.000000Z",
    "2026-10-04T00:00:00.000Z",
  ])("rejects invalid observation time %s", (value) =>
    expect(() => participationObservationTimeSchema.parse(value)).toThrow(),
  );
});
describe("shared cursor v2", () => {
  const token = encodeSharedLedgerCursor(0, trip, user, empty);
  const payload = {
    version: 2,
    purpose: "LEDGER_SHARED",
    sequence: 0,
    tripId: trip,
    userId: user,
    snapshotContractVersion: 1,
    participationFingerprintVersion: 1,
    participationFingerprint: empty,
  };
  it("encodes the exact canonical eight keys, including sequence zero", () => {
    expect(token).toBe(Buffer.from(JSON.stringify(payload)).toString("base64url"));
    expect(decodeSharedLedgerCursor(token, trip, user)).toEqual(payload);
  });
  it.each([
    token + "=",
    token + "==",
    "",
    "!",
    "A".repeat(1025),
    Buffer.from(JSON.stringify({ ...payload, extra: 1 })).toString("base64url"),
    Buffer.from(JSON.stringify({ ...payload, purpose: "PRIVATE" })).toString("base64url"),
    Buffer.from(JSON.stringify({ ...payload, version: 1 })).toString("base64url"),
    Buffer.from(JSON.stringify({ ...payload, sequence: -1 })).toString("base64url"),
    Buffer.from(
      JSON.stringify({ ...payload, sequence: Number.MAX_SAFE_INTEGER + 1 }),
    ).toString("base64url"),
    Buffer.from(JSON.stringify(payload, null, 2)).toString("base64url"),
    Buffer.from(
      JSON.stringify(payload).replace('"sequence":0', '"sequence":-0'),
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify(payload).replace('"sequence":0', '"sequence":0,"sequence":0'),
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify(payload).replace('"sequence":0', '"sequence":0.0'),
    ).toString("base64url"),
    Buffer.from(JSON.stringify({ ...payload, userId: trip })).toString("base64url"),
    Buffer.from(JSON.stringify({ ...payload, tripId: user })).toString("base64url"),
    Buffer.from(
      JSON.stringify({ version: 1, sequence: 42, tripId: trip, userId: user }),
    ).toString("base64url"),
  ])("rejects malformed/scope/legacy token %s", (bad) =>
    expect(() => decodeSharedLedgerCursor(bad, trip, user)).toThrow("INVALID_CURSOR"),
  );
});
