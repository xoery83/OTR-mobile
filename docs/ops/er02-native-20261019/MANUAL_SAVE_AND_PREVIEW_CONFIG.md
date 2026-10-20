# ER02 manual save and preview configuration — 19 October 2026

## Existing lawful function: TH-01 / TH-09 / ET-01 / ET-03

Original AD5, original App/account, loaded043/8083. No new installation or
Source switch occurred during this check. The existing isolated QA Trip is
`0b2e24bd-42be-4dff-b6e0-62308eaf0279`, ER02 Local Edit QA · Saved.

Through the normal Editor, changed bundled cover Coast to Mountain and optional
manual destination Auckland to Wellington. Normal Save closed the sheet and
updated the Home Hero. Closed only OTR through App Switcher, reopened its original
icon, entered the same Trip through My Trips, and read Wellington and selected
Mountain in the Editor. Name and explicit Dec30–Jan3 range remained unchanged.

Then restored Auckland and Coast through normal Save, closed/reopened OTR again,
and read Auckland plus selected Coast with Save disabled. Cancel returned to QA
Home. No temporary values or unsaved draft were intentionally left. Evidence:
`qa-cold-saved-list.ax.txt`, `qa-cold-saved-editor.ax.txt`,
`qa-cold-saved-cover.ax.txt`, `qa-cold-restored-editor.ax.txt`,
`qa-restored-home.ax.txt`. Save display screenshot is
`qa-saved-wellington-home.png`.

This validates local Repository Save, display, cold read and restoration for the
existing scalar destination and bundled cover. It does not validate Hosted sync,
user-photo cover persistence, multi-place identity, permission replacement or
error recovery. Those missing owning subinterfaces remain explicitly blocked.
Reference/Japan Trip data, account, dates, financial data and schema were untouched.

## Limited compatible preview configuration

Coordinator read-only checked the resident8083 launch/bundle and approved faithful
reuse of exactly the old ignored `.env.local` public DEV Supabase URL and public
publishable-key fields. No values are included in this receipt. Only those two
fields were copied to the delivery tree ignored `.env.local`, mode0600.

`EXPO_PUBLIC_OTR_SYNC_TRANSPORT` and `EXPO_PUBLIC_OTR_API_BASE_URL` remain absent,
matching the resident source configuration. The existing implementation defaults
transport to fake. Do not introduce a guessed API URL, claim normal DEV Backend
or Hosted/Sync PASS, perform Ledger/Import writes to qualify this presentation
preview, or read/copy process secrets or old authentication Sessions.

Candidate ca7875a remains CODE_READY / NATIVE_PENDING until actual8083 source
binding and Currency normal Back are observed. Preserve original043 tree and
host binary/account/database for source rollback. GUI lease was safely released
to Coordinator after the second cold restore, before any Metro switch.

## iOS production JavaScript packaging check

Expo offline iOS export completed: 1,902 modules, 29 assets and Hermes bundle
`entry-f6d554045c0d37dc36903468f29b274c.hbc`, approximately7.8MB. Export directory
`/private/tmp/otr-er02-export-ca7875a`. No Native host was installed or replaced.
This is a production JS packaging check, not a native Release build/run or an
offline cold-launch PASS. The existing @noble/hashes crypto.js export-map warning
falls back to file resolution; bundling exited0. Initial task-private cache path
was absent, then created and export repeated successfully without that cache error.
No shared Metro cache was cleared, and8083/8085 listeners were not changed.

Subsequent entry/return Native qualification supersedes the earlier pending
status: unchanged ca7875a is now loaded on AD5/8083 using its independent child
cache. See CURRENCY_NATIVE_BINDING.md. Public configuration/Hosted restrictions
remain unchanged.
