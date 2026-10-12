import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  readCapturePayload,
  type CapturePayloadInput,
  type CaptureSha256,
} from "@/data/files/capturePayloadReader";
import { LocalCaptureError, type CaptureKind } from "@/domain/capture/localCapture";

// Transient local read only. C2 retains originals; Import alone admits Source representations.
export async function readFlightSourcePayload(
  context: AccountRequestContext,
  kind: CaptureKind,
  input: CapturePayloadInput,
  sha256: CaptureSha256,
  getAccountId: () => Promise<string>,
) {
  await assertAccountRequestContext(context, getAccountId);
  const original = await readCapturePayload(kind, input, sha256);
  await assertAccountRequestContext(context, getAccountId);
  if (kind !== "TEXT")
    return {
      status: "CAPABILITY_UNAVAILABLE" as const,
      mediaVerification: "UNKNOWN" as const,
      original,
      text: null,
    };
  if (original.byteCount > 262144) throw new LocalCaptureError("PAYLOAD_TOO_LARGE");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    original.bytes,
  );
  if (text.includes("\0")) throw new LocalCaptureError("INVALID_INPUT");
  return {
    status: "TEXT_AVAILABLE" as const,
    mediaVerification: "UTF8_TEXT" as const,
    original,
    text,
  };
}
