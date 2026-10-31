import { z } from "zod";
import { sourcePngPreparationCommandSchema } from "../../domain/trip/sourcePngPreparationCommands";
import {
  assertCaptureCustodyBytes,
  captureMaterialBindingSchema,
} from "../../domain/capture/captureCustody";
import type { Json } from "../../domain/trip/eventIntentJson";
import type { PngOriginalPreparationPort } from "../operations/universalPngOriginalPreparation";
import { createUniversalSourceJsonRequest } from "./universalOriginalSourceTransport";

// Same Auth/request boundary and canonical Source commands; no retry or IDs here.
export function createSourcePngPreparationTransport(
  getAccountId: () => Promise<string>,
  options: Omit<Parameters<typeof createUniversalSourceJsonRequest>[1], "timeoutMs">,
): PngOriginalPreparationPort {
  const request = createUniversalSourceJsonRequest(getAccountId, {
    ...options,
    timeoutMs: 90000,
  });
  async function send(
    context: Parameters<PngOriginalPreparationPort["lookup"]>[0],
    raw: Parameters<PngOriginalPreparationPort["lookup"]>[1],
    action: "result" | "execute" | "reconcile",
    material?: Parameters<PngOriginalPreparationPort["execute"]>[2],
  ) {
    const command = sourcePngPreparationCommandSchema.parse(raw);
    if (
      command.actor_account_id !== context.accountId ||
      command.trip_id !== context.tripId
    )
      throw Error("SOURCE_CAPTURE_SCOPE_INVALID");
    z.uuid().parse(context.tripId);
    let originalBase64: string | undefined;
    if (material) {
      const binding = captureMaterialBindingSchema.parse(material.binding);
      assertCaptureCustodyBytes(binding, material.bytes);
      if (
        action !== "execute" ||
        command.command !== "UPLOAD_ORIGINAL" ||
        binding.accountId !== context.accountId ||
        binding.version !== 2 ||
        (binding.kind !== "IMAGE" && binding.kind !== "FILE") ||
        binding.mediaType !== "image/png" ||
        binding.byteCount > 1048576 ||
        binding.sha256 !== command.payload.payload_sha256 ||
        binding.byteCount !== command.payload.byte_count
      )
        throw Error("SOURCE_CAPTURE_SCOPE_INVALID");
      // Native has no Buffer dependency. Size is capped before conversion.
      originalBase64 = btoa(
        Array.from(material.bytes, (byte) => String.fromCharCode(byte)).join(""),
      );
    } else if (action === "execute" && command.command === "UPLOAD_ORIGINAL") {
      throw Error("PNG_ORIGINAL_REQUIRED");
    }
    const result = await request(
      context,
      {
        command: command as Json,
        ...(originalBase64 === undefined ? {} : { originalBase64 }),
      },
      `png/${action}`,
      action === "result",
    );
    return result === null ? null : JSON.parse(result);
  }
  return {
    lookup: (c, q) => send(c, q, "result"),
    execute: (c, q, material) => send(c, q, "execute", material),
    reconcile: (c, q) => send(c, q, "reconcile"),
  };
}
