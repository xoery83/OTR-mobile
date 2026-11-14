/* eslint-disable @typescript-eslint/no-require-imports -- keep older native binaries loadable */
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type * as Apple from "expo-apple-authentication";
import {
  authenticateSupabaseDevProvider,
  saveSupabaseDevAppleName,
  SupabaseDevAuthError,
} from "./devSupabaseAuth";
import type { SignInAdapter } from "./provisionalSignIn";

type AppleSdk = Pick<
  typeof Apple,
  "isAvailableAsync" | "signInAsync" | "AppleAuthenticationScope"
>;

export function createAppleNonce() {
  const { getRandomValues } = require("expo-crypto") as typeof import("expo-crypto");
  const raw = bytesToHex(getRandomValues(new Uint8Array(32)));
  return { raw, digest: bytesToHex(sha256(utf8ToBytes(raw))) };
}

export function loadNativeApple(): AppleSdk | null {
  const { Platform } = require("react-native") as typeof import("react-native");
  if (Platform.OS !== "ios") return null;
  const { default: Constants } =
    require("expo-constants") as typeof import("expo-constants");
  if (!Constants.expoConfig?.ios?.usesAppleSignIn) return null;
  const { requireOptionalNativeModule } =
    require("expo-modules-core") as typeof import("expo-modules-core");
  if (!requireOptionalNativeModule("ExpoAppleAuthentication")) return null;
  return require("expo-apple-authentication") as typeof Apple;
}

export function createAppleSignInAdapter(
  load: () => AppleSdk | null = loadNativeApple,
  exchange = authenticateSupabaseDevProvider,
  makeNonce = createAppleNonce,
  saveName = saveSupabaseDevAppleName,
): SignInAdapter {
  return {
    async capability() {
      const sdk = load();
      return sdk && (await sdk.isAvailableAsync())
        ? { available: true }
        : { available: false, reason: "NATIVE_MODULE_MISSING" };
    },
    async verify(request, signal) {
      if (request.provider !== "apple") throw new Error("INVALID_SIGN_IN_PROVIDER");
      const sdk = load();
      if (!sdk) throw new Error("AUTH_PROVIDER_UNAVAILABLE");
      const nonce = makeNonce();
      try {
        if (signal.aborted) throw new Error("APPLE_SIGN_IN_CANCELLED");
        const credential = await sdk.signInAsync({
          requestedScopes: [
            sdk.AppleAuthenticationScope.EMAIL,
            sdk.AppleAuthenticationScope.FULL_NAME,
          ],
          nonce: nonce.digest,
        });
        if (signal.aborted) throw new Error("APPLE_SIGN_IN_CANCELLED");
        if (!credential.identityToken) throw new Error("APPLE_SIGN_IN_FAILED");
        const session = await exchange(
          { provider: "apple", idToken: credential.identityToken, nonce: nonce.raw },
          { signal },
        );
        if (signal.aborted) throw new Error("APPLE_SIGN_IN_CANCELLED");
        if (
          credential.fullName?.givenName ||
          credential.fullName?.familyName ||
          credential.fullName?.middleName
        ) {
          if (!session.identity) throw new Error("APPLE_SIGN_IN_FAILED");
          session.identity = {
            ...session.identity,
            appleFirstSignInName: {
              givenName: credential.fullName.givenName,
              familyName: credential.fullName.familyName,
              middleName: credential.fullName.middleName,
            },
          };
          try {
            await saveName(session, session.identity.appleFirstSignInName!, { signal });
          } catch (error) {
            if (
              !(error instanceof SupabaseDevAuthError) ||
              error.kind === "invalid_session"
            )
              throw error;
            // The existing secure Session install retains the first-name suggestion
            // even when the optional metadata update is temporarily unavailable.
          }
        }
        if (signal.aborted) throw new Error("APPLE_SIGN_IN_CANCELLED");
        return session;
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof Error && error.message === "APPLE_SIGN_IN_CANCELLED") ||
          (error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ERR_REQUEST_CANCELED")
        ) {
          throw new Error("APPLE_SIGN_IN_CANCELLED");
        }
        // Native errors may contain identity credentials or provider diagnostics.
        throw new Error("APPLE_SIGN_IN_FAILED");
      }
    },
  };
}
