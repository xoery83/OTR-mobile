import { OtpQaError } from "./resend-inbound-otp";

// Cleanup is authorized only after trusted /user proves this run's new QA identity.
export function createQaSessionRevoker(revoke: (token: string) => Promise<void>) {
  let provenToken: string | undefined,
    attempted = false;
  async function revokeOnce() {
    if (!provenToken) throw new OtpQaError("NO_PROVEN_SESSION_TO_REVOKE");
    if (attempted) throw new OtpQaError("SESSION_REVOKE_ALREADY_ATTEMPTED");
    attempted = true; // Reserve before wire; UNKNOWN never refunds this attempt.
    await revoke(provenToken);
  }
  return {
    bindProvenToken(token: string) {
      if (!token || attempted) throw new OtpQaError("SESSION_CLEANUP_BINDING_INVALID");
      provenToken = token;
    },
    revokeOnce,
    async cleanupIfUnattempted() {
      if (!provenToken || attempted) return false;
      try {
        await revokeOnce();
        return true;
      } catch {
        return false;
      }
    },
  };
}
