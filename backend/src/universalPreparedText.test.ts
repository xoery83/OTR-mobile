import { expect, it } from "vitest";
import { universalPreparedText } from "../../src/domain/capture/universalPreparedText";
import { prepare } from "../frozen-workbench/scripts/import-workbench/llm-first";

it.each([
  "plain",
  "\uFEFFActivity: BOM QA\r\n",
  "\uFEFF\uFEFFDouble BOM remains one literal BOM",
  "middle\uFEFFliteral",
  "中文😀\r\nnext",
  "a \t\r\nb",
  "a\n\n\n\nb",
  "a\rnotLF",
  "trailing \t",
])("matches frozen direct UTF8 preparation for %j", (text) => {
  const r = prepare(
    {
      id: "S0",
      name: "fixture",
      mime: "text/plain",
      bytes: Buffer.from(text),
      preparedText: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(text)),
    },
    "B_PREPARED",
    { mimes: ["text/plain"], modalities: ["TEXT"] },
  );
  expect(r.status).toBe("READY");
  if (r.status === "READY") expect(r.bytes.toString()).toBe(universalPreparedText(text));
});
it("does not silently qualify the separate BOM dispatch mismatch", () => {
  const text = "\uFEFFActivity: QA";
  const r = prepare(
    {
      id: "S0",
      name: "fixture",
      mime: "text/plain",
      bytes: Buffer.from(text),
      preparedText: text,
    },
    "B_PREPARED",
    { mimes: ["text/plain"], modalities: ["TEXT"] },
  );
  expect(r).toMatchObject({ status: "UNSUPPORTED", reason: "PREPARED_SOURCE_MISMATCH" });
  expect(universalPreparedText(text)).toBe("Activity: QA");
});
