# ADR 0059 — Shared semantic UI and device-local locale

Status: accepted for Phase B–C by owner on 2026-10-03.

Use React Native `useColorScheme` plus two semantic palettes and memoized style
factories. Native navigation receives resolved string colors; no appearance
preference or native-color bridge is needed. Extract accepted Ledger typography,
spacing and radii to the shared UI layer; retain the Ledger compatibility export.

Use typed populated English/Simplified Chinese catalogs, Intl formatting and a
small React external-store subscription. Persist the selected UI language through
the installed SecureStore native adapter under a separate UI preference key;
hydrate asynchronously without gating auth/bootstrap. No i18n/state dependency,
SQLite migration or account/business-state change is necessary. Additional
languages extend catalogs centrally. MoneyText and its formatter remain canonical.

A TypeScript AST guard enforces a reviewed content-sensitive legacy baseline in
normal runnable validation. Native chrome and financial behavior remain intact.
`docs/architecture/ui-foundation.md` owns the normative rules; root AGENTS points
there for fresh sessions. Full migration waits for owner device visual acceptance.

Device-gate remediation, 2026-10-03: ordinary forms now use the shared native
input/row/chip/picker adapters. Native picker appearance is explicitly supplied
from system state using its supported iOS API; no custom date picker is introduced.
Representative import trees and new UI files receive strict guard coverage with
zero historical baseline forgiveness. Legacy inventory is frozen; only resolved
violations are pruned. The architecture and protected business boundaries remain.
