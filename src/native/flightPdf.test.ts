import { createFlightPdfExtractor } from "./flightPdf";
import { requireNativeModule } from "expo";
import { expect, it, vi } from "vitest";
vi.mock("expo", () => ({ requireNativeModule: vi.fn() }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

it("uses the installed native capability without touching the caller's retained bytes", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const extractFlightPdf = vi.fn(async (copy: Uint8Array) => {
    copy[0] = 9;
    return { engine: "apple-pdfkit" };
  });
  expect(await createFlightPdfExtractor("ios", { extractFlightPdf })(bytes)).toEqual({
    engine: "apple-pdfkit",
  });
  expect(bytes[0]).toBe(1);
});
it("reports an older app binary as unavailable and never falls back to a provider", async () => {
  vi.mocked(requireNativeModule).mockReturnValue({});
  await expect(createFlightPdfExtractor()(new Uint8Array([1]))).rejects.toThrow(
    "FLIGHT_PDF_CAPABILITY_UNAVAILABLE",
  );
  await expect(
    createFlightPdfExtractor("android" as never)(new Uint8Array([1])),
  ).rejects.toThrow("FLIGHT_PDF_UNSUPPORTED_PLATFORM");
});
it("rejects bounds and preserves explicit native PDF errors", async () => {
  const extractFlightPdf = vi.fn(async () => ({ error: "PDF_TEXT_UNAVAILABLE" }));
  const extract = createFlightPdfExtractor("ios", { extractFlightPdf });
  await expect(extract(new Uint8Array())).rejects.toThrow("PDF_LIMIT");
  expect(extractFlightPdf).not.toHaveBeenCalled();
  await expect(extract(new Uint8Array([1]))).rejects.toThrow("PDF_TEXT_UNAVAILABLE");
});
