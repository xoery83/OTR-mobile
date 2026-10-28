import { createGoogleSignInAdapter } from "./googleSignIn";
import { createProvisionalSignIn } from "./provisionalSignIn";
import { verifySupabaseDevEmailOtp } from "./devSupabaseAuth";

// Provider credentials remain provisional until the existing account transition accepts them.
export function createDevProvisionalSignIn() {
  return createProvisionalSignIn({
    google: createGoogleSignInAdapter(),
    email_otp: {
      capability: async () => ({ available: true }),
      verify: async (request, signal) => {
        if (request.provider !== "email_otp") throw new Error("INVALID_SIGN_IN_PROVIDER");
        return verifySupabaseDevEmailOtp(request.email, request.code, { signal });
      },
    },
  });
}
