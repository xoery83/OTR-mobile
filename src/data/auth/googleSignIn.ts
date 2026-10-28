/* eslint-disable @typescript-eslint/no-require-imports -- native SDK must load only after checking binary capability */
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { authenticateSupabaseDevProvider } from "./devSupabaseAuth";
import type { SignInAdapter } from "./provisionalSignIn";

export const googleSignInConfiguration = {
  iosClientId: "580120713844-sone6c0f8bd6srkr25v6fvnc8jmjj824.apps.googleusercontent.com",
  webClientId: "580120713844-t44tea8s903dbflo0oqfk35gq4dto5rm.apps.googleusercontent.com",
  offlineAccess: false,
};

type GoogleResult =
  { type: "success"; data: { idToken: string | null } } | { type: "cancelled" };
type GoogleSdk = {
  signIn(nonceDigest: string): Promise<GoogleResult>;
  signOut(): Promise<unknown>;
};

export function createGoogleNonce(bytes?: Uint8Array) {
  const random =
    bytes ??
    (require("expo-crypto") as typeof import("expo-crypto")).getRandomValues(
      new Uint8Array(32),
    );
  if (random.length !== 32) throw new Error("GOOGLE_NONCE_INVALID");
  const raw = bytesToHex(random);
  return { raw, digest: bytesToHex(sha256(utf8ToBytes(raw))) };
}

function loadNativeGoogle(): GoogleSdk | null {
  const { Platform, TurboModuleRegistry } =
    require("react-native") as typeof import("react-native");
  if (Platform.OS !== "ios" || !TurboModuleRegistry.get("RNGoogleSignin")) return null;
  const { requireOptionalNativeModule } =
    require("expo-modules-core") as typeof import("expo-modules-core");
  const bridge = requireOptionalNativeModule<{
    signIn(
      iosClientId: string,
      webClientId: string,
      nonceDigest: string,
    ): Promise<GoogleResult>;
  }>("OtrGoogleSignIn");
  if (!bridge) return null;
  // Older binaries must not launch Google without the matching nonce protocol.
  const { GoogleSignin } =
    require("@react-native-google-signin/google-signin") as typeof import("@react-native-google-signin/google-signin");
  return {
    signIn: (digest) =>
      bridge.signIn(
        googleSignInConfiguration.iosClientId,
        googleSignInConfiguration.webClientId,
        digest,
      ),
    signOut: () => GoogleSignin.signOut(),
  };
}

export function createGoogleSignInAdapter(
  load: () => GoogleSdk | null = loadNativeGoogle,
  exchange = authenticateSupabaseDevProvider,
  makeNonce = createGoogleNonce,
): SignInAdapter {
  return {
    capability: async () =>
      load()
        ? { available: true }
        : { available: false, reason: "NATIVE_MODULE_MISSING" },
    async verify(request, signal) {
      if (request.provider !== "google") throw new Error("INVALID_SIGN_IN_PROVIDER");
      const sdk = load();
      if (!sdk) throw new Error("AUTH_PROVIDER_UNAVAILABLE");
      let idToken: string | null = null;
      let cancelled = false;
      let ownsAttempt = true;
      const nonce = makeNonce();
      try {
        if (signal.aborted) throw new Error("GOOGLE_SIGN_IN_CANCELLED");
        const response = await sdk.signIn(nonce.digest);
        cancelled = response.type === "cancelled";
        if (response.type === "success") idToken = response.data.idToken;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "GOOGLE_SIGN_IN_IN_PROGRESS"
        )
          ownsAttempt = false;
        if (signal.aborted) throw new Error("GOOGLE_SIGN_IN_CANCELLED");
        throw new Error("GOOGLE_SIGN_IN_FAILED");
      } finally {
        // Clear only this SDK's local cache, never revoke the Google grant.
        if (ownsAttempt) {
          try {
            await sdk.signOut();
          } catch {
            throw new Error("GOOGLE_SIGN_IN_FAILED");
          }
        }
      }
      if (signal.aborted || cancelled) throw new Error("GOOGLE_SIGN_IN_CANCELLED");
      if (!idToken) throw new Error("GOOGLE_SIGN_IN_FAILED");
      return exchange({ provider: "google", idToken, nonce: nonce.raw }, { signal });
    },
  };
}
