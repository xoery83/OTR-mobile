# P1 Create form UX

Bounded AD5 Simulator PASS; no phone installation.

- Reused calendar range picker with optional Trip reference highlight; no Trip-range restriction or Temporal change.
- Location follows Name, caption and Find a place share a row. Focus opens full-screen search; P1 opts into immediate selection, fills only Location. Other search callers retain confirmation default.
- Activity date and two optional time fields share canonical field captions; participants use staged selection picker with Cancel/Done.
- Header Create/Save retains existing repository/idempotency/draft guards. Old header test expectations corrected; no permission or schema change.
- 6suites74tests, TS/UI guard/scoped lint PASS; independent5suites44tests PASS. Actual Simulator create→Day→Edit restores authored title, real Apple Maps address, out-of-Trip/cross-day dates, times and participant choice.

See NATIVE_RECEIPT.json for observed actions, QA item and exact limits. Original Owner test draft discarded only after explicit consent. Real business Trip data and photos retained; sole new clearly named QA Plan retained for review. No physical installation.
