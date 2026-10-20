import { requireNativeModule } from "expo";
import { digest, CryptoDigestAlgorithm } from "expo-crypto";
import { Platform } from "react-native";
import {
  createCaptureLocalExtractorCore,
  type CaptureLocalBridge,
} from "@/native/captureLocalExtractionCore";
export type { CaptureLocalExtraction } from "@/native/captureLocalExtractionCore";

async function sha256(bytes: Uint8Array) {
  const result = await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
  return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
}
export function createCaptureLocalExtractor(
  dependencies: {
    platform?: string;
    bridge?: CaptureLocalBridge;
    hash?: typeof sha256;
  } = {},
) {
  return createCaptureLocalExtractorCore({
    hash: dependencies.hash ?? sha256,
    getBridge() {
      if ((dependencies.platform ?? Platform.OS) !== "ios")
        throw new Error("CAPTURE_LOCAL_CAPABILITY_UNAVAILABLE");
      try {
        return (
          dependencies.bridge ?? requireNativeModule<CaptureLocalBridge>("ReceiptOcr")
        );
      } catch {
        throw new Error("CAPTURE_LOCAL_CAPABILITY_UNAVAILABLE");
      }
    },
  });
}
export const extractCaptureLocal = (bytes: Uint8Array, mediaType: string) =>
  createCaptureLocalExtractor().extract(bytes, mediaType);
export const readCaptureLocalModelCapability = () =>
  createCaptureLocalExtractor().modelCapability();

export const enrichCaptureFlightLocal = (text: string) =>
  createCaptureLocalExtractor().enrich(text);
