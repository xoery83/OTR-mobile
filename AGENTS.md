# OTR Mobile 2.0 Agent Guide

Every agent must read these files before making product or architecture changes:

- `AGENTS.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/API_CONTRACT.md`
- `docs/OFFLINE_SYNC.md`
- `docs/ENVIRONMENT_AUDIT.md`
- `docs/legacy/OTR_LEGACY_AUDIT.md`

## Project Boundary

OTR Mobile 2.0 is a new native mobile product for group travel operations. It is not a port of OTR Web.

The legacy OTR Web repository at `/Users/xoery/Project/otr` is read-only reference material. Do not modify it from this project.

## Hard Rules

- Do not copy Web UI, page structure, sidebar patterns, desktop navigation, CSS, Story UI, Poster UI, Chat UI, or Highlights UI.
- Do not let UI code call Supabase directly.
- Do not bypass the repository layer for reads or writes.
- Do not let feature modules own sync, upload, or retry lifecycles.
- Do not let feature modules write directly to SQLite except through repositories.
- Do not add new product scope without updating `docs/PRODUCT.md` and getting confirmation.
- Do not introduce large dependencies without documenting the reason and tradeoffs.
- Do not add a complex ORM, state framework, P2P transfer, face recognition, photo uploader, or core business UI during initialization.
- Update docs before changing architecture.
- Record important technical decisions in `docs/adr/`.

## Highest Principles

- Mobile UX first.
- Offline first.
- Offline-tolerant auth.
- Local writes first.
- Cloud sync second.
- Backend contract over direct database access.
- Native capability when needed.
- Shared business logic where practical.
- Do not inherit Web product assumptions.
- Reliability over feature count.
- Travel reality over theoretical architecture.

## Auth Launch Rule

App launch must never require network re-authentication when a valid local session exists. Cached trip data remains accessible offline even if the access token has expired. Token refresh and session validation happen silently in the background. Network or auth refresh failures pause synchronization rather than blocking app access.

Only explicit server rejection, revoked or invalid refresh session, disabled account, user logout, maximum trust expiry confirmed by the server, or a clear security event may transition the app to `REAUTH_REQUIRED`.

## Repository Status

The intended GitHub repository is `https://github.com/xoery83/OTR-mobile`.

At initialization time this local checkout is intentionally documentation-first. Do not start building core Today, Expenses, Tickets, or Capture screens until the architecture decisions listed in the first delivery are confirmed.
