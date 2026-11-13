# Import V3 B2 Slice 1 — Capture Entry & Composer

13 November 2026 · codex/import-v3-local-first · Owner review checkpoint

Scope: pre-submit Capture only. Production auto-import/Development confirmation
remains the approved product direction; no admission implementation in this slice.
No SQL, Schema, Core, Queue, Receipt, ACL/RLS, Backend deployment or Production
changes. ZERO Submit, Analyze, Confirm/Save or Provider actions during acceptance.
No main merge or remote push. Pre-existing Root2 operational edits are excluded.

## Implementation

- Keep October 21 compact Files/Photos/Camera menu and existing B1 format intake.
- Compact growing Magic Input; visible Inline Add stages text only. Existing
  prepareSubmit includes unadded valid editor text once. Horizontal tray has
  count, previews, per-input removal and unavailable/over-limit feedback.
- Native confirmation before Clear All; clear only unsent contents and stay open.
  Close hides rather than clears; normal overlay returns to its launching page.
- Reuse importOriginalFileStore for bounded private original copies. New narrow
  captureDraftRepository writes account/launch-Trip JSON metadata, not SQL or a
  second custody system. No Picker URI, paste capability or auth secret is saved.
- Restore text, staging order, chosen target and stable original digests; rebuild
  paths after container changes and verify actual original hashes/lengths.
- Keep a last-valid roster because installed Expo overwrite deletes its target
  before move. Clear All replaces both copies to prevent later resurrection.
- Hidden UI projects an empty draft; persistence ignores hidden callbacks rather
  than treating Close as Clear. Includes a regression for the observed defect.
- Camera permission rejection retains siblings and explains Photos/Files options.

## Actual full App acceptance

Uses the existing ExpoRoot/app route tree and normal retained test account, not
a standalone Capture Harness. Simulator 1B2252F4-4F90-4F93-9223-545269EAA06C;
bundle com.xoery.otrmobile.b1full20261113. App updated in place; no uninstall,
Session/Keychain/SQLite copying, queue reset or B1 replay.

| Scenario | Result / evidence |
| --- | --- |
| My Trips → Start a Trip → Import | Unassigned empty workspace; Close returned to My Trips. [A](screenshots/A-empty-my-trips.png) |
| Trip Home → Quick Add → Import | Correct Trip shown, unassigned draft not reused. [A Trip](screenshots/A-empty-trip.png) |
| Photos multi-select | GIF/JPEG/PNG synthetic originals entered one horizontal tray. [B](screenshots/B-three-files.png) |
| Files | Existing system Files picker selected Travel details.pdf; appended to the same draft. [B combined](screenshots/B-files-and-photos.png) |
| Mixed input | Three files + staged text + unadded editor displayed five inputs, no submission. [C](screenshots/C-mixed-text-files.png) |
| Inline Add | First tap with software keyboard visible staged text, emptied editor and did not submit. See interaction-log.txt. |
| Software keyboard | Actual iPad software keyboard displayed; tray, editor and actions remained visible. [E](screenshots/E-keyboard.png) |
| Close / Day reentry | Returned to Trip Home without Quick Add reopening; entered from Day and restored the same five inputs. [D](screenshots/D-close-restored.png) |
| Process termination | simctl terminate exit 0; normal cold launch restored three files, staged text and unadded editor. [D cold](screenshots/D-process-restored.png), process-termination.json |
| Original integrity | Three retained originals matched length and SHA256 after termination. cold-original-readback.json |
| Preview | GIF content actually rendered through existing native original viewer; Done returned to Composer. [Original](screenshots/preview-original.png) |
| Remove | Removed GIF from tray; JPEG/PNG/text/editor remained. Original bytes were not deleted. interaction-log.txt |
| Clear All cancel | Native confirmation appeared; Cancel kept all five inputs. [Confirmation](screenshots/D-clear-confirmation.png) |
| Clear All confirm | Capture remained open and empty; Submit disabled. Both roster copies empty, originals retained. [D empty](screenshots/D-clear-empty.png), final-local-readback.json |
| Close back to Day | Actual Day Feed restored without reopening Quick Add. [Return](screenshots/return-day-feed.png) |

Operation records distinguish actual observations from intended actions. Native
system picker/Quick Look accessibility content was incomplete, so visible
coordinates were used only after observing the actual screen. No App automation
bridge or product testing hook was added.

## Validation and remaining limits

- Focused tests cover Composer, staging, draft files, content and origin navigation;
  59 checks in five suites passed; see validation.json. UI guard retains its original
  baseline; no new literal colors or untranslated copy.
- Whole-project typecheck still has the same two presentationTier fixture errors
  and missing browser react-dom/client declaration. No errors in changed sources.
- The old captureLifecycle harness already fails native initialization; briefly
  loading it also exposed stale B1-era fixtures. It was left unchanged and is not
  claimed PASS. Actual full App observations and focused tests are separate.
- The final metadata read ceiling follows the existing 48 MiB Batch technical
  ceiling, rather than rejecting a legal combined multi-text draft at 3 MiB.
  This bound-only difference is covered by a five-text recovery regression; the
  unchanged Composer interactions above are reused, not repeated.
- Runtime account isolation was not tested by logging into another account.
  Namespace, forged-owner rejection, Trip isolation and stale selection fences
  are covered by targeted tests; unassigned/current-Trip separation was observed.
- Clipboard image capability is session-only. Following process death its visible
  unavailable placeholder requires reselection; no stale native token is replayed.
  A durable Clipboard recovery ownership contract is a precise remaining gap,
  not grounds to add a generic draft framework. Text paste uses normal saved text.
- Camera hardware/permission behavior on physical iPad, broad VoiceOver/Dynamic
  Type/device-size coverage and system-level offline acceptance remain unverified.
- Existing Trip Home summary copy, Activity, automatic admission, Documents and
  full field UPDATE are outside Slice 1. Do not begin Slice 2 automatically.
