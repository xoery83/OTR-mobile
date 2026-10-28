import { createProvisionalSignIn } from "./provisionalSignIn";
import { verifySupabaseDevEmailOtp } from "./devSupabaseAuth";

// Reuse the reviewed provider boundary; unconfigured native providers remain unavailable.
export function createDevProvisionalSignIn() {
  return createProvisionalSignIn({
    email_otp: {
      capability: async () => ({ available: true }),
      verify: async (request, signal) => {
        if (request.provider !== "email_otp") throw new Error("INVALID_SIGN_IN_PROVIDER");
        return verifySupabaseDevEmailOtp(request.email, request.code, { signal });
      },
    },
  });
}
