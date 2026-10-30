import { expect, it } from "vitest";
import { createSourcePdfV2StorageProducer } from "./sourcePdfStorageProducer";

it("the approved narrow PDF custody purpose has its own real producer fingerprint", () => {
  const storage = {
    instanceId: "OTR_DEV_PDF_SOURCE_CUSTODY_V1",
    origin: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    credentialRef: "vault:otr/dev/backend/supabase-secret-key#universal-pdf-custody",
    serviceToken: "synthetic-no-network",
    timeoutMs: 15000,
  };
  const scope = {
    accountId: "f4b059c5-8241-4ffb-aa15-37fa25474543",
    tripId: "825f79b2-4a9d-4535-a62e-43000ca50c4a",
  };
  const producer = createSourcePdfV2StorageProducer(storage, undefined, scope);
  expect(producer.configurationSha256).toBe(
    "8f144d3137cad4e173644b7281a07346514c952cde6c3b7e41c4b19c073f62a4",
  );
  expect(createSourcePdfV2StorageProducer(storage).configurationSha256).not.toBe(
    producer.configurationSha256,
  );
});
