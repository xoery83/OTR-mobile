# Auth business driver — prepared, not authorized or invoked

Export: runMemberClaimQaResumeDriver in scripts/auth/member-claim-qa-resume-driver.ts.
It uses existing normal Auth callbacks for the two registered synthetic Accounts,
explicit same-Trip cases, existing resume scenario/readback, and Root's bounded SSH
qualifier. Do not use the older hardbound convenience Session wrapper.

Root control-read.ts is the byte-identical e282 dependency already in mainb16.
Root alone owns future edits; exclude the unchanged dependency from duplicate main
integration. Integrate Auth's new driver/test and Review evidence by fixed hashes.

Before invocation the existing approved operator harness must validate Owner's new
exact Gate/manifest and supply independent frozen expected={qaCase,image,containerId,
configSHA256,planSHA256} plus actual windowId. Never derive expected from the same wire.
Auth supplies the existing accepted receivers A/B, normal public options, safe
noteAuth and fsynced original-command retain callbacks in a new private0700/0600
custody scope with durable one-challenge reservations. Do not reuse old started/
challenge files. Keychain/Resend credentials stay in memory; do not read SMTP keys.
Use only the two approved public config variables from the existing runbook.
Root supplies the existing bounded, project-checked read-only query transport.

The driver checks Root's actual active qualification BEFORE invoking any Session.
The existing scenario rechecks it after both logins. No OTP/registration/admin or
credential loader is reimplemented. Each normal helper verifies the real user and
locally revokes its own temporary Session. New3tests mock Session/scenario and
prove composition only; they do not prove any actual OTP, cleanup or Hosted result.

Headless build reuses the existing Node crypto adapter. Keep unused Native default
Session/Guest paths external: real headless calls always supply normal token
providers and empty in-memory Session storage. Do not provide fake Native modules;
an accidental default-path invocation must fail closed.

```sh
npx --no-install esbuild scripts/auth/member-claim-qa-resume-driver.ts \
  --bundle --platform=node --target=node24 --format=esm --alias:@=./src \
  --alias:expo-crypto=./backend/src/headlessExpoCrypto.ts \
  '--external:*/guestLocalWorkspace' '--external:*/sessionAccessToken' \
  --external:react-native '--external:expo-*' \
  --outfile=/private/tmp/otr-auth-c04-resume-driver.mjs \
  --banner:js='import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'
```

Bundle/import was checked with fetch forbidden and no driver invocation. Actual
runtime expiry, source pins, Root plan/CAS/timers/close, A/B receiving quota, normal
Auth and original-ID outcomes remain live acceptance duties. Importing/exporting
the driver grants no authority and performs no IO. The consumed windows stay closed.
