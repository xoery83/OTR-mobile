import { getAccountGeneration, subscribeAccountGeneration } from "./accountGeneration";
import type { LocalSession } from "@/domain/auth/localSession";

export type SignInProvider = "apple" | "google" | "email_otp";
export type ProviderCapability =
  | { available: true }
  | { available: false; reason: "NATIVE_MODULE_MISSING" | "CONFIGURATION_UNVERIFIED" };
export type SignInRequest =
  | { provider: "apple" | "google" }
  | { provider: "email_otp"; email: string; code: string };
export type SignInAdapter = {
  capability(): Promise<ProviderCapability>;
  verify(request: SignInRequest, signal: AbortSignal): Promise<LocalSession>;
};
export type ProvisionalSignInResult =
  | { status: "VERIFIED"; provider: SignInProvider; session: LocalSession }
  | { status: "CANCELLED" }
  | {
      status: "UNAVAILABLE";
      reason: Exclude<ProviderCapability, { available: true }>["reason"];
    };

// Verification never installs a session: Guest adoption requires a separate full preflight.
export function createProvisionalSignIn(
  adapters: Partial<Record<SignInProvider, SignInAdapter>>,
) {
  let current: AbortController | null = null;
  return {
    cancel() {
      current?.abort();
      current = null;
    },
    async verify(request: SignInRequest): Promise<ProvisionalSignInResult> {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const generation = getAccountGeneration();
      const cancelled = () =>
        controller.signal.aborted ||
        current !== controller ||
        getAccountGeneration() !== generation;
      const stopGeneration = subscribeAccountGeneration(() => controller.abort());
      let stopCancellation = () => {};
      const cancellation = new Promise<ProvisionalSignInResult>((resolve) => {
        const abort = () => resolve({ status: "CANCELLED" });
        controller.signal.addEventListener("abort", abort, { once: true });
        stopCancellation = () => controller.signal.removeEventListener("abort", abort);
      });
      const verification = async (): Promise<ProvisionalSignInResult> => {
        const adapter = adapters[request.provider];
        if (!adapter)
          return { status: "UNAVAILABLE", reason: "CONFIGURATION_UNVERIFIED" };
        const capability = await adapter.capability();
        if (cancelled()) return { status: "CANCELLED" };
        if (!capability.available)
          return { status: "UNAVAILABLE", reason: capability.reason };
        const session = await adapter.verify(request, controller.signal);
        if (cancelled()) return { status: "CANCELLED" };
        if (!session.identity?.userId || !session.accessToken || !session.refreshToken)
          throw new Error("PROVIDER_SESSION_INVALID");
        return { status: "VERIFIED", provider: request.provider, session };
      };
      try {
        return await Promise.race([verification(), cancellation]);
      } catch (error) {
        if (cancelled()) return { status: "CANCELLED" };
        throw error;
      } finally {
        stopGeneration();
        stopCancellation();
        if (current === controller) current = null;
      }
    },
  };
}
