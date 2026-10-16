import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "scripts/import-workbench/*.test.ts",
      "src/native/captureLocalExtraction.test.ts",
      "src/domain/capture/captureLocalInterpretation.test.ts",
      "src/data/interpretation/flightPdfExtraction.test.ts",
    ],
  },
  resolve: { alias: { "@": new URL("../../src", import.meta.url).pathname } },
});
