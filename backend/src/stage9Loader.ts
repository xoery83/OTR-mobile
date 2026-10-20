import { createClient } from "@supabase/supabase-js";

import {
  scanStage9Privacy,
  stage9Sha256,
  STAGE9_TARGET_PROJECT_REF,
  type Stage9Dataset,
  type Stage9PrivateApprovalManifest,
  validateStage9Dataset,
} from "./stage9Import";

export type Stage9LoadTarget = "local" | "hosted-dev";

export async function loadStage9Dataset(input: {
  target: Stage9LoadTarget;
  url: string;
  secretKey: string;
  actorUserId: string;
  dataset: Stage9Dataset;
  manifest: Stage9PrivateApprovalManifest;
}) {
  const parsedUrl = new URL(input.url);
  const local = ["127.0.0.1", "localhost"].includes(parsedUrl.hostname);
  if (
    (input.target === "local" && !local) ||
    (input.target === "hosted-dev" &&
      parsedUrl.hostname !== `${STAGE9_TARGET_PROJECT_REF}.supabase.co`)
  ) {
    throw new Error("STAGE9_TARGET_REJECTED");
  }
  const dataset = validateStage9Dataset(input.dataset);
  const payloadHash = stage9Sha256(dataset);
  if (
    payloadHash !== input.manifest.transformedDatasetSha256 ||
    input.manifest.target.projectRef !== STAGE9_TARGET_PROJECT_REF ||
    input.manifest.target.journeyId !== dataset.journey.id ||
    !input.manifest.privacyPassed ||
    (input.target === "hosted-dev" && input.manifest.state !== "PRELOAD_VALIDATED")
  ) {
    throw new Error("STAGE9_MANIFEST_REJECTED");
  }
  if (!scanStage9Privacy(dataset).passed) throw new Error("STAGE9_PRIVACY_REJECTED");

  const client = createClient(input.url, input.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.rpc("ledger_import_stage9_v1", {
    p_actor_user_id: input.actorUserId,
    p_payload_hash: payloadHash,
    p_dataset: dataset,
  });
  if (error)
    throw new Error(`STAGE9_LOAD_FAILED:${error.code ?? "UNKNOWN"}:${error.message}`);
  return data as {
    journeyId: string;
    counts: Record<string, number>;
    idempotentReplay: boolean;
  };
}
