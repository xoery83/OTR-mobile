import { createPrivateAccountProfilePort } from "./privateAccountProfileSupabase";
import type { PrivateAccountProfilePort } from "./privateAccountProfile";

// Optional composition only; no environment flag, Bootstrap call or Hosted activation.
export function createPrivateAccountProfileRuntime(input?: {
  enabled?: boolean;
  supabase?: Parameters<typeof createPrivateAccountProfilePort>[0];
}): { privateAccountProfilePort?: PrivateAccountProfilePort } {
  if (input?.enabled !== true) return {};
  if (!input.supabase) throw Error("PROFILE_DEV_CONFIG_REQUIRED");
  return { privateAccountProfilePort: createPrivateAccountProfilePort(input.supabase) };
}
