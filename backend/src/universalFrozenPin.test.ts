import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const pins: Record<string, string> = {
  "llm-first.ts": "72aa1f770eb427a84a20fddff46dac463de15e7a6fb6de5b6bb12ef005fc48a6",
  "real-llm-compact.ts":
    "3511993db3926f19a774309cc20ee92f619e24dfe26e7bd96801889fe3683d91",
  "real-llm-evidence.ts":
    "c46d6fc318eabc5d9540f986d68446eb77af7baca13b4e091b5ccb8ee51abb86",
  "import-quality.ts": "cd91aba95e122b7f442b1a6e9192d9742d4987144097ca22465557da7b584052",
  "import-dual-mode.ts":
    "2c23a50f130793b2085b7aaae73a95c5a43251288c3c0a5aa4e0b376e98684ab",
  "store.ts": "9dde47d468b495cdbaae2abf0317f00ab27c1a6ff50c372a1c695961351d450f",
};
it("keeps the Workbench behavior 49c9516e snapshot byte-pinned", () => {
  for (const [file, pin] of Object.entries(pins)) {
    const bytes = readFileSync(
      join(process.cwd(), "backend/frozen-workbench/scripts/import-workbench", file),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(pin);
  }
});
