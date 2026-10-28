# Google native ID Token integration

Status: implementation authorized by Owner on 28 October 2026; Native/runtime
acceptance remains separate. Existing Auth/Lang V1 and Session authority apply.

Use the public `@react-native-google-signin/google-signin` 16.1.5 iOS bridge and
its Expo plugin, wrapping Google's native SDK. This dependency is needed for the
approved native login; it avoids a custom OAuth/browser implementation and custom
Swift bridge. No paid Universal module, Firebase, Drive scopes or Google offline
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

The public Original Google SDK does not expose custom nonce support; follow
Supabase's documented native Google ID-token flow without a caller nonce. Apple
continues to require its nonce. Do not disable Supabase nonce checking or token
signature/issuer/audience validation. No provider credential is persisted by OTR;
the SDK's local sign-out clears its temporary provider cache after interactive
acquisition, without disconnecting/revoking the user's Google grant. Supabase
SecureStore sessions remain the only OTR launch/refresh authority.

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
