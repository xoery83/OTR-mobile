import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";

const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
const input = {
  actorId: "a", accountId: "a", tripId: "t", batchId: "b", taskId: "task",
  promptVersion: COMPACT_PROMPT_VERSION,
  instruction: universalInstruction,
  advisoryInstruction: universalAdvisoryInstruction,
  sources: [{ index: 0, sourceId: "S0", mime: "image/png", modality: "IMAGE" as const,
    sha256: createHash("sha256").update(bytes).digest("hex"), bytes }],
} satisfies Parameters<typeof buildUniversalDeepSeekRequest>[0];
it("supplies actual image geometry and keeps the original image in the request", () => {
  const request = buildUniversalDeepSeekRequest(input);
  const content = JSON.parse(request.body).messages[1].content;
  expect(content[1].text).toContain("IMAGE_SIZE_PIXELS 1 1");
  expect(content[0].text).toContain("Never guess a region");
  expect(content[2].image_url.url).toBe("data:image/png;base64," + bytes.toString("base64"));
  expect(request.requestSha256).toBe(createHash("sha256").update(request.body).digest("hex"));
});
it("preserves the exact legacy image request for existing paid-response recovery", () => {
  expect(buildUniversalDeepSeekRequest(input, "LEGACY").requestSha256).toBe(
    "cd904dc5092062c5882e8cdb5cc6c28a732ecbdd7d0ad67136117fc312a3c725",
  );
});
it("leaves text requests identical across image request formats", () => {
  const text = Buffer.from("Activity: Walk\n");
  const value = { ...input, sources: [{ ...input.sources[0], modality: "TEXT" as const,
    mime: "text/plain", bytes: text, sha256: createHash("sha256").update(text).digest("hex") }] };
  expect(buildUniversalDeepSeekRequest(value)).toEqual(buildUniversalDeepSeekRequest(value, "LEGACY"));
});

it("rejects missing image geometry instead of making up a coordinate space", () => {
  const bad = Buffer.from(bytes);
  bad.writeUInt32BE(0, 16);
  const value = { ...input, sources: [{ ...input.sources[0], bytes: bad,
    sha256: createHash("sha256").update(bad).digest("hex") }] };
  expect(() => buildUniversalDeepSeekRequest(value)).toThrow("UNIVERSAL_IMAGE_DIMENSIONS_INVALID");
});
