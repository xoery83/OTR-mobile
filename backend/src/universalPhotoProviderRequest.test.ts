import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import { universalAdvisoryInstruction, universalInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";

function request(
  bytes = Buffer.from([255, 216, 255, 1, 2]),
): Parameters<typeof buildUniversalDeepSeekRequest>[0] {
  return {
    taskId: randomUUID(),
    actorId: randomUUID(),
    accountId: randomUUID(),
    tripId: randomUUID(),
    batchId: randomUUID(),
    promptVersion: COMPACT_PROMPT_VERSION,
    instruction: universalInstruction,
    advisoryInstruction: universalAdvisoryInstruction,
    sources: [
      {
        index: 0,
        sourceId: "S0",
        mime: "image/jpeg",
        modality: "IMAGE" as const,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes,
      },
    ],
  };
}
it("the existing Image request retains exact submitted pixels and the original image hash", () => {
  const input = request();
  const built = buildUniversalDeepSeekRequest(input);
  const message = JSON.parse(built.body).messages[1];
  const images = message.content.filter(
    (part: { type: string }) => part.type === "image_url",
  );
  expect(built.imageCount).toBe(1);
  expect(images).toEqual([
    {
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${input.sources[0].bytes.toString("base64")}`,
      },
    },
  ]);
  expect(
    message.content.some(
      (part: { type: string; text?: string }) =>
        part.type === "text" && part.text?.includes(input.sources[0].sha256),
    ),
  ).toBe(true);
  expect(createHash("sha256").update(built.body).digest("hex")).toBe(built.requestSha256);
});
it("rejects pixel/hash mismatch instead of silently falling back to OCR text", () => {
  const input = request();
  input.sources[0].bytes[3] = 99;
  expect(() => buildUniversalDeepSeekRequest(input)).toThrow(
    "UNIVERSAL_REQUEST_BINDING_INVALID",
  );
});
it("preserves existing one-image and 4MiB limits", () => {
  const input = request();
  input.sources.push({ ...input.sources[0], index: 1, sourceId: "S1" });
  expect(() => buildUniversalDeepSeekRequest(input)).toThrow("UNIVERSAL_IMAGE_BOUND");
  expect(() => buildUniversalDeepSeekRequest(request(Buffer.alloc(4194305)))).toThrow(
    "UNIVERSAL_IMAGE_BOUND",
  );
});
