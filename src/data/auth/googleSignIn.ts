/* eslint-disable @typescript-eslint/no-require-imports -- native SDK must load only after checking binary capability */
import type { GoogleSignin } from "@react-native-google-signin/google-signin";
import { authenticateSupabaseDevProvider } from "./devSupabaseAuth";
import type { SignInAdapter } from "./provisionalSignIn";

export const googleSignInConfiguration = {
  iosClientId: "580120713844-sone6c0f8bd6srkr25v6fvnc8jmjj824.apps.googleusercontent.com",
  webClientId: "580120713844-t44tea8s903dbflo0oqfk35gq4dto5rm.apps.googleusercontent.com",
  offlineAccess: false,
};

type GoogleSdk = Pick<typeof GoogleSignin, "configure" | "signIn" | "signOut">;

function loadNativeGoogle(): GoogleSdk | null {
  const { Platform, TurboModuleRegistry } =
    require("react-native") as typeof import("react-native");
  if (Platform.OS !== "ios" || !TurboModuleRegistry.get("RNGoogleSignin")) return null;
  // Older binaries must remain launchable before this native dependency is installed.
  return (
    require("@react-native-google-signin/google-signin") as typeof import("@react-native-google-signin/google-signin")
  ).GoogleSignin;
}

export function createGoogleSignInAdapter(
  load: () => GoogleSdk | null = loadNativeGoogle,
  exchange = authenticateSupabaseDevProvider,
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
      try {
        if (signal.aborted) throw new Error("GOOGLE_SIGN_IN_CANCELLED");
        sdk.configure(googleSignInConfiguration);
        const response = await sdk.signIn();
        cancelled = response.type === "cancelled";
        if (response.type === "success") idToken = response.data.idToken;
      } catch {
        if (signal.aborted) throw new Error("GOOGLE_SIGN_IN_CANCELLED");
        throw new Error("GOOGLE_SIGN_IN_FAILED");
      } finally {
        // Clear only this SDK's local cache, never revoke the Google grant.
        try {
          await sdk.signOut();
        } catch {
          throw new Error("GOOGLE_SIGN_IN_FAILED");
        }
      }
      if (signal.aborted || cancelled) throw new Error("GOOGLE_SIGN_IN_CANCELLED");
      if (!idToken) throw new Error("GOOGLE_SIGN_IN_FAILED");
      return exchange({ provider: "google", idToken }, { signal });
    },
  };
}
