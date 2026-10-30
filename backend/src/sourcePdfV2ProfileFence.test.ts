import { expect, it, vi } from "vitest";
import { createSourcePdfV2LinuxVerifier } from "./sourcePdfV2LinuxVerifier";
import { createSourcePdfV2Authority } from "./sourcePdfV2Authority";
import { createSourcePdfV2Registration } from "./sourcePdfV2Registration";
vi.mock("./sourcePdfV2LinuxVerifier", () => ({
  SOURCE_PDF_V2_LINUX_PROFILE_SHA: "0".repeat(64),
  createSourcePdfV2LinuxVerifier: vi.fn(),
}));
it("a different real decoder profile cannot reuse the frozen V2 contract", () => {
  const read = vi.fn(),
    hash = vi.fn();
  expect(() => createSourcePdfV2Authority({} as never, hash, read)).toThrow(
    "PDF_V2_PROFILE_MISMATCH",
  );
  expect(() => createSourcePdfV2Registration({} as never, hash, read)).toThrow(
    "PDF_V2_PROFILE_MISMATCH",
  );
  expect(createSourcePdfV2LinuxVerifier).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
