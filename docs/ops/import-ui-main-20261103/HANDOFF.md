# IMP-C01 UI candidate on main

Base `4e1bedfc`; branch `codex/imp-c01-ui-main-20261103`. Fixed source patch (`SOURCE.patch.json` preserves exact UTF8 diff bytes) and
validation are in this directory. No deployment, device installation or main update.

- Activity shows retained filenames only for the current scope. Documents use
  localized MIME-based Image/PDF/Text display labels, preserving original filenames.
- Existing full accepted receipt overrides candidate tier display. Missing/404 and
  unavailable/STATUS_ONLY recovery remain distinct; UNKNOWN blocks confirm but
  keeps the original readable. Existing accepted facts are never downgraded.
- Before Results exist, retained metadata is called Original materials; only an
  actual result may establish an unmatched/not-processed Source.
- Optional `onOpenAcceptedItem({tripId,itemId})` flows through CaptureContent →
  CaptureProgress → Results. The Day button appears only for SERVER_ACCEPTED with
  the same Task's receipt-bound Item. Busy/stale views cannot invoke it. Without a
  Native-owned callback, existing callers and navigation remain unchanged.

Native integration must reuse the existing authorized Reader/Day/Details handler,
recheck Account/Trip/current route, dismiss the Import surface and open the actual
Item. This callback supplies no mutation, Source or navigation authority. No date
is inferred from an LLM field. Shared Navigation/Session/Day/Sync/catalog files
were not edited. Native consumption and actual device E2E remain pending.

The `13f166b0` Progress document shortcuts remain a next slice: that revision relies
on retained assignedTrip DTO/polling code not present on this main baseline.
Current main's detached Activity observation does not have the same blocking
loading branch. Do not replace those full files to hide the dependency.

128 checks/7 suites, scoped strict types and UI guard pass. Full repository types
are blocked only by unchanged Auth-browser react-dom/client declaration setup in
the reused dependency tree; see VALIDATION.json. Root must independently review
this exact main-context diff before serial integration. Existing isolated/DEV/AD5
receipts from the source lane do not certify this uninstalled main candidate.
