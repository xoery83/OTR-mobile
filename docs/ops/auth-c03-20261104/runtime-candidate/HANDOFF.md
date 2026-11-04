# AUTH-C03 default-closed private Profile source candidate

Request `AUTH-C03-DEFAULT-CLOSED-PRIVATE-PROFILE-MOUNT-20261104-01`.
Contract packet2394b935 and Root1's authoring-only handoff are the scope. C04 stays
Primary. No Profile storage, runtime activation, Nickname write, new AKA lifecycle
or business execution is authorized by this source candidate.

## Source integration

Shared app change is only16 inserted lines: imports, optional dependency, destructure
and exact route branch. Root1 applies SHARED_APP.patch to fresh main, preserving all
Source/MCP/Native changes. Do not replace main with the old Auth app blob or merge
this whole Auth branch. AUTHORING_BASE pins both app preimages and reference43280495.
Initial old-context patch did not apply to adjacent concurrent edits; the final
patch mechanically inserts exactly the same16 tested lines on that reference.
A disposable source-snapshot git apply --check passed; no other checkout was edited.

DEPENDENCIES records5 Auth-owned modules absent on that reference: Profile boundary,
Supabase adapter, optional Runtime, DTO and domain. Take those exact candidate Git
blobs, plus the direct tests listed in PACKAGE_MANIFEST. Existing resource/public-key/
qualification helpers match main and must not be replaced. The manifest pins6 product
files and6 direct tests; two new suites are the8 changed tests, other unchanged direct
Profile/domain test sources are supplied for ownership/CI and were not rerun here.

Auth authoring coordination is released at fixed delivery. Root1 is still sole main
Writer and must fresh-CAS source integration, typecheck and return exact main evidence.

## Behavior / verification

Only root, operations and valid UUID receipt/recovery routes match. No sibling or
extra suffix interception. Existing authenticateNormalAccount runs first, then the
existing Profile boundary uses server user.id; no caller Account or Trip authority.
Fixed safe route logging, requestId and exception flow remain in the enclosing app.
Bootstrap ensure stays independent. Missing injected port returns PROFILE_CLOSED.

Optional Runtime has no environment reader or Startup caller. Absent/disabled input
creates no adapter and performs no IO. Explicit enablement requires existing DEV-only
public config and returns the existing subject-verifying Supabase adapter. Integration
must not add a ServerCapture call, config flag, storage install or port injection.
Normal application startup therefore remains closed.

8 targeted tests and independent8/8 PASS: exact paths, invalid/Guest/unknown rejection,
server Account scope, explicit save/receipt/recovery, foreign result/body denial,
closed defaults, Bootstrap separation, request ID and safe logs. Typecheck, scoped
lint and diff check PASS. No old Auth/Profile/PG suite rerun; no Hosted/SQL/Provider/
OTP/device IO. Existing reviews support unchanged Profile/AKA/receipt code.

Private storage candidatec84671f4 still requires separate exact protected approval,
fresh metadata and runtime/client qualification before Cloud use. C04 read-state
Gate d136bf63 does not approve Profile storage or write. Full Cloud Profile/Native
cold save is NOT_RUN. Original C04 opf5e13639 remains UNKNOWN, with no replay or new
business mutation authorized by this candidate.
