# WP02 spatial semantics — current-main compatibility packet

Base: `fdb3146cace59c436bc823042a5e711d8bdffb2f`. Approved source correction: `841ff819bb73d0809fdeb7715f41dfda54d26d56`.

This isolated packet carries only the three semantic production changes and their direct fixtures/tests from the approved correction. TTR input accepts explicit `UNKNOWN` or provenance-bearing `SAME_LOCATION`; absent evidence remains `UNKNOWN`. Zero geometric distance no longer proves operational equivalence. Only explicit `SAME_LOCATION` suppresses the qualified TTR presentation and Lab ready predicate. Core currently emits `UNKNOWN` only; this packet does not create a Core proof adapter, formal Selection, or active runtime path. The `ttr-presentation/1` version and geometry computation are unchanged.

Current-main `scripts/ttr/tsconfig.json` is retained because it contains newer coverage. The archived `CURRENT_IMPLEMENTATION_STATE.md` and historical report are excluded. Four unchanged source/test files are not recopied. The ADR status is updated for this current-main isolated review.

Author validation: five focused suites, 195 tests passed; typecheck, UI guard, scoped ESLint, Prettier and diff check passed. Independent connected functional review and applicable synthetic TTR Lab Native Visual remain pending. The Lab must show the owned ready state and honest `UNKNOWN` behavior before intake; a fixture is not proof of accepted real Day or formal selection readiness.
