# Global Navigation IA Audit

Date: 2026-09-16
Status: contextual menu implemented; Option A bottom-tab migration deferred

## Current State

The current bottom tabs remain Today / Ledger / Capture / Trip. Every primary root
now has the same global-menu shell. Ledger adds My Ledger, Review and Ledger Settings;
the other current modules add no speculative secondary destinations. The menu does
not repeat primary tabs.

Capture remains a lightweight routing-boundary screen without persistent product
content state beyond its route. Removing it from the tab bar later requires a global
creation trigger and preservation of receipt/manual Expense entry routes; that
migration is outside this task.

## Approved Target

The long-term bottom navigation is Option A:

- Today.
- Ledger.
- Trip.
- Album.

Today is the daily cross-product dashboard. Ledger, Trip, and Album are the
three long-term pillars. Capture becomes a global creation action. No Album
product functionality or bottom-tab migration is authorized now.

## Global Menu Decision

The menu is a contextual utility menu, not a second bottom navigator:

- identity/global: current account, Settings, Language, Log out;
- Ledger context: My Ledger, Review, Ledger Settings;
- other module context: only real, implemented secondary destinations;
- Development: Switch test account and Diagnostics when explicitly enabled.

My Ledger is the permanent cross-Journey personal Ledger entry and reuses the
existing screen. It is distinct from the current Journey's Ledger tab. My Trips
and My Albums have no safe aggregate destinations yet and remain omitted.

## Implemented Account Boundary

- The identity row opens account management rather than changing a local role.
- Account management can add/login, switch remembered sessions, remove an inactive
  remembered account, and log out through the Production-safe switch coordinator.
- The current Journey actor context supplies Organizer/Member display; the auth session
  supplies explicit user identity and masked email.
- Dev quick switching is limited to approved Synthetic Owner/Member sessions already
  authenticated on the device. It is visible only under Dev transport with Debug Mode.
- Passwords are accepted only by the login form and are not persisted.

## Current Route Dependencies

- `/expenses/all-journeys` already provides My Ledger.
- `/expenses/review` already provides Ledger Review.
- `/expenses/settings` is the existing Ledger Settings destination.
- `/capture` is still registered as a tab route.
- Manual and receipt-first Expense creation currently live under the Ledger
  stack and can later be launched by a global creation action without making
  Capture a primary destination.

## Deferred Bottom-Tab Work

- Define the Album product and route before adding its tab.
- Replace the Capture tab with an accessible global creation action.
- Audit any deep links that still target `/capture`.
- Preserve existing receipt/manual creation routes and navigation state.
- Revalidate all four primary roots, restoration, and accessibility after the
  migration.
