# CREATE-TRIP-01 — local Traveler form completion

Baseline: `725d143671d977849da709e46307573f28db1350` (Coordinator's reviewed
atomic local Person initialization and Sync hard-close already integrated).
Branch: `codex/create-trip01-travelers-ui-20261017`.
Worktree: `/private/tmp/otr-create-trip01-travelers-ui-20261017`.
Authority: original approved Product Delta / Blueprint; local Person owning
contract in `docs/ops/create-trip01-local-persons-20261017/HANDOFF.md`.

## Change

- Create-only Travelers is collapsed by default. Expanding starts with one blank
  name, never Account/Apple identity. Minus, editable integer and Plus change the
  number of visible optional fields. Nonblank names prevent a reduction that
  would hide them; invalid counts retain all values and block Create, including
  its handler. Correcting the count clears the error. Edit has no Traveler form.
- The mounted form supports 1–100 fields as an explicit UI allocation safeguard,
  approved by Coordinator. This is not a total-Trip or Repository business limit.
  Larger groups need a virtualized/paged editor; the source has a `shortcut:` note.
  Invalid/101/1000 inputs are retained and explained, never truncated into a valid
  count or submitted using the previous count. More than ten fields is supported.
- Allocate operation/person UUIDs once per draft slot, preserve the high-water
  slot array when empty fields are hidden, and reuse the same IDs on failed save.
  Keep the Trip Create UUID pair for the mounted draft until normal navigation
  unmounts it, making a navigation failure replay the same intent. Existing busy,
  account-generation and mounted-save guards remain intact.
- Only trimmed nonblank names enter optional local-only `CreateTripInput.travelers`;
  all-blank input omits it. No writer runs on field/count changes, collapse or
  Cancel. Normal Repository transaction remains the only persistence path.
- Existing actual named-Person summary retains the separately required creator
  when present and explains that names do not mean connected Accounts or invites.
  Three entered names are three additional local Persons, not three financial
  participants or three Hosted memberships. No names enter the Hosted Trip proof.

## Verification

- **Six suites / 76 tests PASS**: UI Workspace, Setup rows, existing Edit, normal
  Trip Repository, local Person Repository and Preparation Setup Reader.
- The UI test uses the actual `createTripRepository` factory and real in-memory
  SQLite/current migrations: seven visible slots, three nonblank names (including
  duplicate names), three distinct `LOCAL_PENDING` Persons plus separate named
  creator = four actual read-back records through `TripPersonRepository`.
  Same intent replay keeps the same four people; actual queued Hosted Create
  JSON has no travelers. This is component/SQLite evidence, not Native acceptance.
- New regressions cover stable Trip/person/operation IDs after failed save,
  preserved entered names on count reduction, invalid counts blocking even an
  explicit handler call, eleven fields and account-generation isolation of names
  and IDs. Existing Cancel/no-write and owning atomic rollback/cold replay tests
  remain passing.
- Typecheck, UI guard, scoped ESLint, Prettier and whitespace checks passed.
- Independent read-only review: no confirmed P1/P2; no Native execution claimed.

## Protection and handoff

Only LocalTripWorkspace and its tests, explanatory Setup summary/copy and its
test changed, plus this receipt. No Repository/Sync, TripScreen, Calendar, Day,
Schema, Auth, Capture, financial eligibility, CURRENT or Tracker edits. No Native,
Metro, installation, Hosted operation, account/session operation, main merge or
Push. GUI approvals remain Coordinator-owned; no new request was sent.

Hosted Person synchronization, invitation, account linkage and financial
participation remain unavailable. The owning operation stays hard-closed;
the form never represents these as completed. Native keyboard/large text and
normal create/reopen still need integrated validation. Deliver this fixed
candidate, return these UI files to Coordinator, then stop.
