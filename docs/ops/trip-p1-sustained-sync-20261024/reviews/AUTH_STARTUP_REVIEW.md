# Minimal Auth adapter candidate check

Base1d0c979, `src/data/auth/authRepository.ts` SHA256 `530388b12e81691c6cb6b78683d02481c80feb70869e7fe5a95ea459e5872d48`: **PASS Local; Native reload pending.**

Root's actual safe diagnostic confirms dynamic SecureStore import chunk resolves an invalid checkout/node_modules path before any Keychain read.09f36→1d0c relevant delta is only that adapter import; SQLite/session keys/adoption and Expo versions unchanged.

Candidate literal synchronous lazy require is the smallest fix: Metro statically includes dependency, while headless module import still avoids Native evaluation. typeofimport cast is erased; same get/set/delete/session behavior. Scoped lint suppression documents this exact reason, temporary diagnostics absent.

Independently17auth/sessiontests PASS, scoped eslint and tsc PASS. BundledNode+VM Native stub additionally proves0Native loads at moduleinit, firstload on storagecall, same account/session keys and synthetic write/readAdopted/requireActiveUserId/clear forwarding. No actual Keychain/Native/DEV read or mutation.

Root next: reload and verify old Session, Accounts and MyTrips withoutlogout/reset. Local tests do not claim actual Metro/Native acceptance.
