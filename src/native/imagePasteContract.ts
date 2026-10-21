import { z } from "zod";

export const IMAGE_PASTE_LIMIT = 20 * 1024 * 1024;
const token = z.uuid().regex(/^[0-9a-f-]{36}$/);
const requestId = z.string().regex(/^[!-~]{1,80}$/);
export const imagePasteItemSchema = z
  .strictObject({
    token,
    uri: z
      .string()
      .max(2048)
      .refine((uri) => {
        try {
          const value = new URL(uri);
          const owned = decodeURIComponent(value.pathname).split("/otr-image-paste-v1/");
          return (
            value.protocol === "file:" &&
            value.host === "" &&
            !value.search &&
            !value.hash &&
            owned.length === 2 &&
            /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg|heic|heif|webp)$/i.test(
              owned[1],
            )
          );
        } catch {
          return false;
        }
      }),
    byteSize: z.number().int().positive().max(IMAGE_PASTE_LIMIT),
    mimeType: z.enum([
      "image/png",
      "image/jpeg",
      "image/heic",
      "image/heif",
      "image/webp",
    ]),
    source: z.literal("clipboard"),
    representation: z.literal("item-provider"),
  })
  .refine((item) => {
    try {
      return (
        decodeURIComponent(new URL(item.uri).pathname)
          .split("/")
          .at(-1)
          ?.split(".")[0] === item.token
      );
    } catch {
      return false;
    }
  });
export const imagePastePayloadSchema = z
  .object({ requestId, items: z.array(imagePasteItemSchema).min(1).max(10) })
  .refine(
    (p) =>
      new Set(p.items.map((i) => i.token)).size === p.items.length &&
      p.items.reduce((n, i) => n + i.byteSize, 0) <= IMAGE_PASTE_LIMIT,
  );
export type ImagePasteItem = z.infer<typeof imagePasteItemSchema>;
export type ImagePastePayload = z.infer<typeof imagePastePayloadSchema>;
export const imagePasteFailureSchema = z.object({
  requestId,
  code: z.enum([
    "unsupported",
    "limit",
    "load_failed",
    "invalid_image",
    "storage",
    "failed",
  ]),
});
export type ImagePasteFailure = z.infer<typeof imagePasteFailureSchema>;

// Each opaque token crosses this gate once: adoption and release are both terminal.
export function createImagePasteDeliveryGate(options: {
  current(requestId: string): boolean;
  release(tokens: string[]): void;
  images(payload: ImagePastePayload): void;
  failure(payload: ImagePasteFailure): void;
}) {
  const terminal = new Set<string>();
  const releaseRaw = (value: unknown) => {
    const items = (value as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return;
    const tokens = [
      ...new Set(
        items.flatMap((i) => {
          const parsed = token.safeParse(i?.token);
          return parsed.success && !terminal.has(parsed.data) ? [parsed.data] : [];
        }),
      ),
    ];
    // Fence before invoking consumer code, including synchronous reentrant events.
    for (const value of tokens) terminal.add(value);
    for (let i = 0; i < tokens.length; i += 10) options.release(tokens.slice(i, i + 10));
  };
  return {
    images(value: unknown) {
      const result = imagePastePayloadSchema.safeParse(value);
      if (
        !result.success ||
        !options.current(result.data.requestId) ||
        result.data.items.some((item) => terminal.has(item.token))
      ) {
        releaseRaw(value);
        return;
      }
      for (const item of result.data.items) terminal.add(item.token);
      try {
        options.images(result.data);
      } catch {
        // The consumer may have adopted files before throwing. Only that owner
        // can release them now; deleting here could destroy an existing draft.
      }
    },
    failure(value: unknown) {
      const result = imagePasteFailureSchema.safeParse(value);
      if (result.success && options.current(result.data.requestId))
        options.failure(result.data);
    },
  };
}
