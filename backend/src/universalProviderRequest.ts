import { createHash } from "node:crypto";
import type { UniversalProvider } from "./universalImport";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";

type Input = Parameters<UniversalProvider["interpret"]>[0];
export function buildUniversalDeepSeekRequest(input: Input) {
  if (
    input.promptVersion !== COMPACT_PROMPT_VERSION ||
    input.instruction !== universalInstruction ||
    input.advisoryInstruction !== universalAdvisoryInstruction ||
    input.sources.length < 1 ||
    input.sources.length > 64 ||
    input.sources.some(
      (s, i) =>
        s.index !== i ||
        !/^S\d+$/.test(s.sourceId) ||
        createHash("sha256").update(s.bytes).digest("hex") !== s.sha256,
    )
  )
    throw new Error("UNIVERSAL_REQUEST_BINDING_INVALID");
  const images = input.sources.filter((s) => s.modality === "IMAGE");
  if (images.length > 1 || images.some((s) => s.bytes.length > 4194304))
    throw new Error("UNIVERSAL_IMAGE_BOUND");
  const systemContent = input.instruction + "\n" + input.advisoryInstruction;
  const content: (
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  )[] = [
    {
      type: "text",
      text: images.length
        ? "Interpret these source representations. Image evidence refers to the submitted image SHA256 and pixel regions, not OCR text offsets."
        : "Path B_PREPARED. Interpret these source representations. Each payload starts after its SOURCE marker; offsets exclude the marker.",
    },
  ];
  for (const source of input.sources) {
    const marker = `SOURCE ${source.index} ${source.sourceId} MIME ${source.mime} MODALITY ${source.modality} SHA256 ${source.sha256}\n`;
    if (source.modality === "TEXT") {
      const value = source.bytes.toString("utf8");
      if (!Buffer.from(value).equals(source.bytes))
        throw new Error("UNIVERSAL_UTF8_INVALID");
      const text = marker + value;
      content.push({ type: "text", text });
    } else {
      content.push({ type: "text", text: marker });
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${source.mime};base64,${source.bytes.toString("base64")}`,
        },
      });
    }
  }
  const textBytes =
    Buffer.byteLength(systemContent) +
    content.reduce(
      (sum, part) => sum + (part.type === "text" ? Buffer.byteLength(part.text) : 0),
      0,
    );
  if (textBytes > 32768) throw new Error("UNIVERSAL_TEXT_BOUND");
  const body = JSON.stringify({
    model: "deepseek-flash",
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content },
    ],
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
  });
  return {
    body,
    requestSha256: createHash("sha256").update(body).digest("hex"),
    textBytes,
    imageCount: images.length,
    promptVersion: COMPACT_PROMPT_VERSION,
  };
}
