# Google native ID Token integration

Status: implementation authorized by Owner on 28 October 2026; Native/runtime
acceptance remains separate. Existing Auth/Lang V1 and Session authority apply.

Use the public `@react-native-google-signin/google-signin` 16.1.5 iOS bridge and
its Expo plugin, wrapping Google's native SDK. This dependency is needed for the
approved native login; it avoids a custom OAuth/browser implementation. No paid Universal module, Firebase, Drive scopes or Google offline
access is introduced. Android Google integration remains unconfigured.

The Owner-provided nonsecret iOS Client ID identifies `com.xoery.otrmobile`; its
reversed URL scheme is registered by the Expo plugin. The Web Client ID is the
native SDK's server audience and the Supabase Google Provider client. Secret stays
in Supabase only. The separate retained physical `.formsqa` bundle needs its own
iOS client before Google acceptance on that bundle.

The SDK obtains a Google ID Token. The existing Mobile Auth adapter submits it to
the fixed DEV `/auth/v1/token?grant_type=id_token` endpoint and returns a provisional
Supabase Session. Only the existing account transition can install it. Google
subject/email/name never substitutes for canonical Supabase Account identity.

Native acceptance correction: actual DEV Auth logs at18:09/18:19 on28 October
returned400: "Passed nonce and nonce in id token should either both exist or not."
The wrapper's public Original API does not expose a caller nonce; its underlying
GoogleSignIn9.2.0 **does** expose the official nonce overload. The earlier no-nonce
example does not qualify this runtime. Keep server skip_nonce_check=false.

Expose only that official nonce sign-in overload through one small local Expo
module, alongside the existing wrapper's branded button, URL callback adapter and
local sign-out. Pin the already resolved native SDK9.2.0 in the local podspec; do
not patch upstream node_modules or acquire a paid wrapper. This is a credential
bridge, not another Auth/Session authority. Generate a fresh32-byte CSPRNG nonce
per attempt, send its SHA256 hex digest to Google and the original raw nonce to
Supabase. Never derive the raw nonce from an ID Token claim. Keep both transient;
Apple's nonce requirement remains intact. No validation is disabled.

No provider credential is persisted by OTR; local SDK sign-out clears temporary
provider cache without revoking the Google grant. Supabase SecureStore sessions
remain the only OTR launch/refresh authority. Older binaries without the nonce
bridge report unavailable before launching Google; a native rebuild is required.

Native module absence in an older binary must return unavailable before loading
the SDK, preserving ordinary startup. Cancel/focus loss/account generation changes
discard late credentials and never install a Session. No silent Google restore is
used at App startup. A native rebuild is required; JS export alone is insufficient.

Verification: exact client/bundle/scheme config checks, injected native SDK and
provisional cancellation/identity tests, existing Session regression, independent
review, then coordinated native build/device and real Google login/restore/logout.
No business schema, permissions, sharing, identity linking or commercial policy
is expanded.

Sources: [Expo plugin](https://react-native-google-signin.github.io/docs/setting-up/expo),
[Original SDK](https://react-native-google-signin.github.io/docs/original),
[Supabase native Google example](https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-sign-in).

Nonce references: [Google public SDK release notes](https://developers.google.com/identity/sign-in/ios/release),
[Supabase Google nonce binding](https://supabase.com/docs/guides/auth/social-login/auth-google).
Installed9.2.0 header: GIDSignIn.h public signInWithPresentingViewController,
hint, additionalScopes, nonce, completion overload.
