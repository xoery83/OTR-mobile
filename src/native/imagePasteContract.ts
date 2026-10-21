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

// A queued native event may arrive after a context change. Release tokens, never adopt it.
export function createImagePasteDeliveryGate(options: {
  current(requestId: string): boolean;
  release(tokens: string[]): void;
  images(payload: ImagePastePayload): void;
  failure(payload: ImagePasteFailure): void;
}) {
  const releaseRaw = (value: unknown) => {
    const items = (value as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return;
    const tokens = [
      ...new Set(
        items.flatMap((i) => {
          const parsed = token.safeParse(i?.token);
          return parsed.success ? [parsed.data] : [];
        }),
      ),
    ];
    for (let i = 0; i < tokens.length; i += 10) options.release(tokens.slice(i, i + 10));
  };
  return {
    images(value: unknown) {
      const result = imagePastePayloadSchema.safeParse(value);
      if (!result.success || !options.current(result.data.requestId)) {
        releaseRaw(value);
        return;
      }
      try {
        options.images(result.data);
      } catch {
        releaseRaw(value);
      }
    },
    failure(value: unknown) {
      const result = imagePasteFailureSchema.safeParse(value);
      if (result.success && options.current(result.data.requestId))
        options.failure(result.data);
    },
  };
}
