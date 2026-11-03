# P3 retained UNKNOWN status projection

Current main9bdc469e already contains the Native10c Source scan port, existing
Import DTO/default composition and Actor/Account fence. No new port is required.
The earliest local mismatch is the DTO's activity gate: the existing consumer can
return an owning UNKNOWN Task and EXECUTION_OUTCOME_UNKNOWN/UNKNOWN empty result,
but projection rejected everything except RESULTS_READY. Native already has an
explicit UNKNOWN empty-state branch; the mismatch made it unreachable here.

Only that exact UNKNOWN Task + unknown Result + UNKNOWN Provider + no candidates
combination may now project through the existing v1 advisory envelope. This does
not convert UNKNOWN into success, permit any field, wake a Task, allocate IDs,
prepare Sources or enable another Provider send. All Form/context/Actor/Source/
request fences and the owning consumer's passive recovery remain unchanged.
Pending/failed/canceled/stale activity and contradictory/usable candidates remain
rejected. No Native-owned UI, Auth, Navigator, Session, Day or Sync change.

Validation: two exact regressions RED on main;10 targeted checks across DTO and
real Source interpreter/Native consumer are GREEN (52 unrelated checks skipped).
Three-root strict types, scoped lint/format and diff check PASS. The local test
starts with an owning UNKNOWN fixture, then reopens through the real Native
consumer; original Task/request/Source pins remain, no new durable IDs or SQLite
changes occur and Source preparation stays at one local fixture setup. Provider
execute is never called. No model, Host, Hosted SQL, device or Session access.

Native's existing SOURCE_STAY_SUGGESTIONS emptyMessage now receives the original
UNKNOWN status rather than a generic unavailable exception. It has no suggestions
to adopt and does not permit another paid dispatch. Actual Form/device rendering
and Provider UNKNOWN recovery remain NOT_RUN; this is LOCAL_PASS, not AI E2E.
