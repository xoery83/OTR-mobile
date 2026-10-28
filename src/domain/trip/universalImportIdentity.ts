import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { z } from "zod";

export function universalP1Identity(task: string, token: string, purpose: string) {
  z.uuid().parse(task);
  const bytes = sha256(
    new TextEncoder().encode(
      JSON.stringify(["otr.universal.p1-source/1", task, token, purpose]),
    ),
  ).subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytesToHex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
