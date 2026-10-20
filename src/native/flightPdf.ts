import { requireNativeModule } from "expo";
import { Platform } from "react-native";
import type { FlightPdfExtract } from "@/data/interpretation/flightPdfExtraction";

type NativeFlightPdf = { extractFlightPdf(bytes: Uint8Array): Promise<unknown> };
export function createFlightPdfExtractor(
  platform = Platform.OS,
  native: NativeFlightPdf | null = null,
): FlightPdfExtract {
  return async (bytes) => {
    if (platform !== "ios") throw new Error("FLIGHT_PDF_UNSUPPORTED_PLATFORM");
    if (!bytes.length || bytes.length > 10485760) throw new Error("PDF_LIMIT");
    let bridge: NativeFlightPdf;
    try {
      bridge = native ?? requireNativeModule<NativeFlightPdf>("ReceiptOcr");
    } catch {
      throw new Error("FLIGHT_PDF_CAPABILITY_UNAVAILABLE");
    }
    if (typeof bridge.extractFlightPdf !== "function")
      throw new Error("FLIGHT_PDF_CAPABILITY_UNAVAILABLE");
    const result = await bridge.extractFlightPdf(new Uint8Array(bytes));
    if (typeof result === "object" && result !== null && "error" in result)
      throw new Error(String(result.error));
    return result;
  };
}
