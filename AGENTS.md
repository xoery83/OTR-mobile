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
# Codex Context & Token Efficiency Rules

These rules exist to reduce unnecessary repository scanning, repeated context reconstruction, and oversized completion reports while preserving correctness.

## 1. Start From Current State, Not From Zero

Before beginning a task, read:

`docs/CURRENT_IMPLEMENTATION_STATE.md`

Treat it as the primary handoff document for:

- current milestone and stage;
- completed work;
- active architecture decisions;
- current Dev environment;
- authoritative documents;
- known blockers;
- next approved checkpoint.

Do not reconstruct the entire project history unless the current-state document is missing, contradictory, or clearly outdated.

## 2. Read Only Task-Relevant Files

Default behavior:

- inspect only files directly relevant to the requested task;
- follow imports/references only when necessary;
- do not recursively read entire directories without a concrete reason;
- do not perform repository-wide searches merely "to be safe";
- do not reread already-approved design documents unless the task depends on them.

If additional context is required, expand scope incrementally.

Prefer:

task file → direct dependencies → immediate tests → relevant contract/docs

Avoid:

whole repo → all docs → all migrations → legacy repo

unless explicitly required.

## 3. Legacy OTR Web Is Reference-Only

Do not inspect `/Users/xoery/Project/otr` unless:

- the task explicitly requests legacy comparison;
- an approved implementation plan identifies a specific legacy behavior to reuse;
- a concrete blocker cannot be resolved from OTR Mobile documentation/code.

Ledger legacy auditing is already complete.

Do not repeatedly reaudit the legacy Ledger implementation during Ledger 2.0 implementation.

Never modify the legacy repository unless separately authorized.

## 4. Use Authoritative Documents

When a design has already been approved, do not independently redesign it during implementation.

For Ledger 2.0, prefer the approved canonical documents under:

`docs/ledger/`

and the implementation plan.

Only reopen a design decision when:

- implementation proves it impossible;
- two approved documents conflict;
- a security/correctness issue is discovered;
- user approval is required by an existing checkpoint.

Otherwise implement the approved decision.

## 5. Keep Planning Short

Before implementation, produce only a concise execution plan, normally 5–10 steps.

Do not generate a new architecture essay for every task.

A plan should identify:

- files/components likely involved;
- migration/API impact;
- tests;
- safety boundaries;
- completion criteria.

Then execute.

## 6. Avoid Repeated Global Audits

Do not repeatedly run broad commands such as:

- full-repository semantic audits;
- exhaustive searches for every architectural term;
- complete migration reviews;
- full dependency inventories;

unless the task explicitly requires them.

For normal vertical-slice development, scope checks to the affected domain.

Repository-wide validation commands such as typecheck, lint, tests, formatting, or architecture guards are allowed when appropriate because they are execution validation rather than context reconstruction.

## 7. Vertical Slice Scope

Implement one approved vertical slice end-to-end.

A slice may include:

- domain logic;
- SQLite migration/repository;
- durable queue;
- API transport;
- backend endpoint;
- Supabase Dev persistence;
- UI;
- tests;
- concise documentation updates.

Do not opportunistically implement adjacent future features.

If unrelated cleanup is discovered, record it rather than expanding the task unless it blocks correctness.

## 8. Do Not Repeat Stable Architecture Rules In Every Output

Stable rules are already documented.

Examples include:

- Mobile does not access Supabase business tables directly.
- SQLite is the Mobile local source of truth.
- Remote business writes go through OTR Backend.
- Production Supabase is not a development target.
- Financially material Ledger conflicts are not silent LWW.
- Money uses integer minor units.
- Network failure must not block valid local Ledger entry.

Apply these rules silently unless a task specifically concerns them.

## 9. Completion Reports Must Be Concise

Default completion report should contain only:

1. what changed;
2. important files/migrations/endpoints;
3. validation performed;
4. blockers or unresolved decisions;
5. Git commit if requested;
6. final readiness status.

Do not restate the full original task, architecture, or design documents.

Target roughly 5–15 concise bullets unless a detailed audit/report was explicitly requested.

## 10. Do Not Re-Explain Successful Existing Infrastructure

If a previously validated subsystem is unchanged, treat it as trusted unless current tests fail.

Examples:

- Foundation;
- Auth bootstrap;
- durable sync queue;
- Hosted Dev Supabase canonical baseline;
- Expense/Itinerary Phase 3B transport;
- Production project safety guard.

Do not reread or re-document these systems for every new feature.

## 11. Prefer Existing Tests And Helpers

Before creating new frameworks or abstractions:

- find the closest existing implementation;
- reuse established repository/sync/auth/test patterns;
- extend narrowly.

Do not rebuild infrastructure already proven by a previous vertical slice.

## 12. Search With Intent

When searching code, use precise identifiers first:

- entity names;
- repository names;
- operation types;
- API routes;
- schema/table names;
- test names.

Avoid broad generic searches such as `trip`, `user`, `data`, `sync` across the whole repository unless necessary.

## 13. Documentation Updates Should Be Incremental

Do not rewrite large approved documents after every implementation slice.

Update only:

- current implementation status;
- relevant API/schema/runbook section;
- ADR when a real architectural decision changed.

Historical design documents should remain stable unless the approved design itself changes.

## 14. Maintain A Short Current-State Handoff

At the end of every substantial stage, update:

`docs/CURRENT_IMPLEMENTATION_STATE.md`

Keep it short enough to read quickly.

Recommended maximum: approximately 1,500–2,500 words.

It should contain:

- current milestone;
- latest completed checkpoint;
- active schema/API versions;
- current test status;
- relevant Dev environment identifiers;
- authoritative documents for the next task;
- unresolved blockers;
- next approved task;
- critical safety rules.

Do not turn this file into a project history log.

## 15. New Chat Handoff Rule

A new Codex chat should normally begin with:

"Read `docs/CURRENT_IMPLEMENTATION_STATE.md` first.
Only inspect additional files directly relevant to this task.
Do not perform a repository-wide audit unless blocked.
Do not reread the legacy Web repository unless explicitly required.
Use approved architecture/design documents as authoritative.
Keep planning and completion reports concise."

This is the default context-loading strategy for OTR Mobile.

## 16. When Broad Analysis Is Appropriate

Full audits are still appropriate for tasks such as:

- security review;
- schema lineage audit;
- production drift analysis;
- major architecture redesign;
- dependency upgrades with broad impact;
- release readiness;
- data migration planning.

For those tasks, breadth is intentional and these efficiency rules should not reduce necessary validation.

Correctness and safety always take priority over token reduction.
