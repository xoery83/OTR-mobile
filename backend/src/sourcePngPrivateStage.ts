import { createPrivateStage } from "./sourcePdfPrivateStage";
import { sourcePngStorageBindingSchema } from "./sourcePngStorageProducer";

// Durable pending original, not format qualification. Sandbox/journal verification follows seal.
export function createSourcePngPrivateStage(root: string) {
  return createPrivateStage(
    root,
    sourcePngStorageBindingSchema,
    async (bytes) => {
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (signature.some((value, i) => bytes[i] !== value))
        throw Error("PNG_INPUT_SIGNATURE");
    },
    1048576,
    "otr-png-pending-stage/1",
  );
}
