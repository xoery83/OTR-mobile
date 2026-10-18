# ER02 Members — independent review

Candidate `2929eeb0353fad863bf680dde376b210149721e9`, scoped against `6f094d4` to the five Members paths below. **QUALIFIED LOCAL CODE; no P1/P2 findings.** Other reviewed ER02 packages and their files were not re-reviewed.

- Read the repository guide/current state, canonical UI foundation and terminology glossary. Added entry uses existing localized labels/icon, existing GlobalMenu infrastructure and the existing themed `TripMembersSheet`; no new route, model, database access, invitation or member-management authority.
- Local workspace publishes Members only for exact selected Trip + current generation + `members.state=AVAILABLE`. Existing owning setup hook matches account/Trip/generation to its normal preparation Reader; unknown/failed setup remains unavailable rather than becoming an empty or authorized roster. Existing Repository retains actor membership and account apply fences; this patch does not grant permissions.
- Menu render requires the active Trip route to match the scoped quick actions. Click compares the current return lease and live account generation, so retained menu callbacks cannot navigate a changed Trip or account. Workspace content is keyed by generation/Trip/mode and marks itself dead on unmount; old closures cannot open a new Trip's sheet. The visible sheet separately checks selected Trip, generation and AVAILABLE. Scope changes suppress stale roster values.
- Existing Sheet groups exact `isCurrentActor` facts, retains LOCAL_PENDING labels, and honestly says member management is unavailable. No display-name matching, inferred account links, new invitations or Hosted grant is introduced.
- Independently ran only `GlobalMenu.tripReturn.test.ts` and `LocalTripWorkspace.test.ts`: **2 suites, 27/27 PASS, 856 ms**. Relevant new tests cover existing callback dispatch, generation change and cross-Trip stale action. Connected keyed-remount/lease/owning Reader code was inspected; these mocked React tests do not establish Native rendering.

Native/visual/permission Runtime acceptance remains unverified. No GUI, Simulator, A1A, AD5, Metro, Hosted or product code was changed. Existing overall ER02 status remains PARTIAL pending its separate integrated Native/Owner gate.

Exact reviewed file SHA-256:

```json
{
  "src/components/GlobalMenu.tsx": "27bd0e41074f517549838bd373624ce685631f51fc70188629d33f79342e5db4",
  "src/components/GlobalMenu.tripReturn.test.ts": "1702ba2840027d76f833679514df318eb496b60922e877c155314aed8621e4c9",
  "src/features/day-feed/LocalTripWorkspace.tsx": "784e2ec0ea7de90573db883d0494e5673f6491d5938414c29a413a30efd89198",
  "src/features/day-feed/LocalTripWorkspace.test.ts": "3c5ac23b73044db2543d3e42177a54891d94c926f34cd597a231a2f5132e9b0a",
  "src/features/day-feed/TripViewContext.tsx": "37deddb4ea1991b27ffa629cf8347497244dbad2ccca3a3292ec31e7dd9363d7"
}
```

Independent test log: `/private/tmp/otr-er02-members-independent-20261018.log`.
