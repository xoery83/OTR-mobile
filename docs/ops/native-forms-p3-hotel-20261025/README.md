# P3 hotel-specific refinement — 25 October 2026

Owner requested this correction after visual acceptance of the preceding P1-parity candidate. This supersedes the old P3 rule that selection must preserve the authored hotel name.

## Delivered behavior

- Removed Find a Place link. Name-driven Apple candidates are immediately below accommodation name and before the address field. Explicit selection atomically fills resolved hotel name and address. “Use entered name” preserves authored name and existing address, cancels any pending hotel resolution, and ends the current name search. Subsequent typing, including the same name, starts a fresh search. Address focus still opens the established full-screen immediate/manual-address flow.
- Removed footer Save Item/Save Changes; the top Save remains the only commit action. Existing draft/cancel/freeze/conflict protections retained.
- P3 calendar starts each opened selection with check-in, then check-out. Trip dates remain reference shading, not automatic Stay dates or validity limits. Direct Edit now reads omitted Trip date context through the existing repository. Today has visible and accessible marking; P3 date-reference helper text uses Stay terminology in both languages.
- Optional time sheets use the existing StartTripSheet bottom-panel presentation pattern, canonical header and native spinner, with intrinsic content height and scroll support. Cancel keeps an unknown clock unknown. P3 Participants uses a64pt content-fitting card instead of the100pt growing action card.

## Owning interfaces

P3 editor/location presentation and tests. Minimal backwards-compatible UI-only options: `UiFormRow compact` → `PlanParticipantsField compact`; calendar `markToday` / `startWithCheckin`. Defaults remain false, and P3 is the only enabled caller. P1/Trip behavior unchanged. No repository mutation contract, Core authority, queue, Auth, global Navigation, schema or backend change. Foundation documents the compact action geometry.

## Actual dedicated Forms QA

One existing FormsQA device/Metro8096, normal retained Synthetic account. Cold process44628. Light/default text-size acceptance:

1. Typed `Park Hyatt`; real Apple results appeared below name. Explicit Keep preserved `Park Hyatt` and empty address. Retyping after Keep returned fresh results. Selecting Park Hyatt Auckland filled both canonical display name and99HalseySt address; keyboard dismissed. [Candidates](evidence/name-candidates.png), [Keep](evidence/keep-authored-name.png), [name+address](evidence/hotel-name-and-address.png).
2. Earlier QA Trip had no dates. Through normal Trip Edit, assigned this dedicated synthetic Trip20October–7November2026, then cold MyTrips restored the dates. P3 calendar shows that reference shading and Today25October. First26October tap selected check-in, second28October selected check-out. [Calendar](evidence/calendar-trip-and-today.png).
3. Time picker now occupies the bottom content-sized portion, not the whole page; Cancel kept optional time unset. [Compact time](evidence/compact-time-sheet.png). Participants card has no lower blank region and footer Save is absent: [compact summary](evidence/compact-participants-no-footer.png).
4. Verification Create draft discarded without a P3 write. Reopened existing saved ParkHyatt Item; direct Edit calendar shows original1–4November plus Trip shading. Cancel retained name/address/dates. [Edit reference](evidence/edit-trip-date-reference.png). FormsQA left on clean Edit for Owner: [ready](evidence/owner-edit-ready.png). Existing Owner-created Skycity record retained.

[Read-only own SQLite](LOCAL_QA_READBACK.json): Trip reference dates retained, all business queues attempt_count0; Cloud remains closed. No AD5 operation, data copy or new simulator. Exact final JS response bytes were not archived. This is Native UI evidence, not Cloud E2E or full ProductDelta readiness.

## Validation and limits

57/57 directed tests PASS (P3 editor/location, real SQLite Stay repository, calendar, Participants, UI controls); default action-card geometry remains100pt/growing while compact uses64pt/non-growing. Typecheck, scoped ESLint, UIguard140strictroots and whitespace PASS. Independent review reran56tests before the final regression, then static final review PASS. Existing search-session/sheet logic is reused. No new dependency or native build.

This round does not repeat the complete Chinese/Dark/DynamicType/physical-offline matrix. P3 Contact/Instructions owning-port gaps and Cloud gate remain pending. Owner visual acceptance is next.
