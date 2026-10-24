# Narrow Expo Native fetch diagnostic

No fetch implementation, redirect policy, byte bound, credentials or business retry was changed. Actual Metro showed stage FETCH with an unknown thrown name; headless GET succeeds. The candidate expands only fixed metadata classification. Three suites20 tests PASS; Typecheck/scoped lint PASS. No DEV/GUI operation performed.

Installed Expo source was checked directly: `expo/src/winter/runtime.native.ts` installs streaming fetch by default; `expo/ios/Fetch/NativeRequestInit.swift` exposes redirect, and NativeRequestRedirect explicitly supports follow/manual/error. `FetchExceptions.swift` supplies exact redirect/cancellation reasons; JS FetchErrors wraps errors and native exceptions need not pass same-realm instanceof Error. These facts do not prove the running binary's exact failure or justify removing redirect:error.

FETCH diagnostics now accept only finite structural error names and thrown type, fixed fetchClass, and known integer NSURLErrorDomain codes from at most two cause links. Error text is inspected only for bounded SDK fixed phrases/domain-code syntax and converted to an enum; it is never returned/logged/hashed. No URL/message/stack/header/body/token or arbitrary code/name is retained. Native data getters are guarded. Unknown error content stays UNCLASSIFIED. Root must reproduce against the actual Native call before choosing a repair.

## Focused Bug Context — Native P1 result recovery

- Symptom/reproduction: both exact P1 operations are APPLIED on DEV, Native retains pending state; normal receipt GET fails. Last actual Native replay: 04:39:51–04:41:41 UTC, six observed FETCH/network failures. No new Item or replacement Operation is authorized.
- First failing boundary: Native bounded API FETCH, before response/body validation. Identical normal Synthetic Auth headless GET with redirects prohibited returns200; no evidence justifies removing strict redirects or byte limits.
- Root cause at initial diagnostic checkpoint: not yet qualified (resolved below). Shared My Trips/Account startup regression already fixed8618c1b and Native login/account switch/cold My Trips observed; no repeated audit.
- Patch/tests: stage/class-only diagnostics, original error behavior retained; exact-operation read-only recovery8d1994a /41 Root tests /71 independent checks. These do not themselves prove actual P1 client recovery.
- Remaining: install durable Owner-approved96-read guard before any further Native/Operator reads, obtain finite FETCH classification, repair that root cause and finish original Create/Edit P1 recovery.

Focused Repair trial measurement starts 2026-10-24T05:00:58Z. This bug predates the directive: prior diagnostic/Coding/test/review phase splits are NOT_MEASURED, rather than inferred. Further actual phase boundaries and verified counts will be appended here; subsequent real bugs use their existing task contexts. The three-bug trial is not yet complete.

### Root-cause evidence — 05:11:30 UTC

Native durable ordinals2/4 began05:09:09.589/05:09:30.033 and failed05:09:24.611/05:09:45.036:15.022s/15.003s at FETCH, thrownType OTHER. Same exact receipt via normal Synthetic Auth/no redirects returned200 APPLIED in17.872s (10414bytes). The15s client deadline is shorter than observed real read, and the Native abort reason is lost rather than classified as timeout. Assigned Writer is fixing that boundary and a finite normal-P1-only timeout; no fetch replacement or Backend/permission change. Added allowance consumed4 Native+1 Operator=5/96; App stopped after this minimal reproduction.

Measured environment event: Metro cold bundle16.770s. This is a measured sub-event, not an invented total Native environment wait. Timing/reproduction phase details before trial remain NOT_MEASURED.


Focused repair actual root cause: two Native receipt failures occurred at15.022/15.003seconds; a counted normal-Auth GET returned FULL APPLIED in17.872seconds. Native Abort reason was absent. Fixed92dd508 (candidate9aab884), independent27scoped tests PASS: retain first internal terminal reason and bound the three normal Core transport instances at60seconds, including their existing submit method. Global/Source default, authorization, write retry and queue identity unchanged. First actual Native recovery now APPLIED/reconciled_revision2 and original queue COMPLETED without POST replay; second original operation also APPLIED/reconciled_revision4 and queue COMPLETED. Both actual collections restored. Original historical read allowance is not reset; fixed96 supplement ledger remains authoritative.

Actual recovery checkpoint05:22 UTC: two original P1 IDs remain unchanged, original queue attempts remain7 and queues COMPLETED. Native ledger12/72 plusOperator1/24 =13/96. AD5 then stopped after observing next distinct accepted-item navigation/edit gap; no open draft. Root92dd508 incorporated4files; independentReview27targeted checks, no permission/Schema change. Exact pre-trial Coding/review durations remain NOT_MEASURED.
