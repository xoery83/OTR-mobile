# Independent finite transition watchdog

`script`: `scripts/trip/sustained_transition_watchdog.py`. Default mode **prepare**, no SQL/network/credential/runtime implementation. Root owns actual closure entry and runs the independent process. Existing sustained service is not a finite QA policy: a verified successful handoff ends this watcher without disabling the service.

Plan fields:

```json
{
  "approvedGateSHA256": "0f6c8bf72e41c17a939424cbf821770ac355b7b235ce300abbb7eb6e46058bf0",
  "actorId": "1f65e932-b6d8-4ea4-9cc9-fe9da331b424",
  "adoptionCutoff": "ACTUAL_IMMUTABLE_UTC_Z",
  "transitionId": "ROOT_NEW_UUID",
  "startsAt": "ACTUAL_TRANSITION_START_UTC_Z",
  "expiresAt": "ACTUAL_DEADLINE_UTC_Z_MAX_900_SECONDS",
  "closeCommand": {
    "argv": ["/absolute/python", "/absolute/ROOT_CLOSE_ENTRY.py", "ROOT_FIXED_NON_SECRET_ARGUMENTS"],
    "entryFile": "/absolute/ROOT_CLOSE_ENTRY.py",
    "entrySHA256": "EXACT_ROOT_ENTRY_SHA256"
  }
}
```

Root's closure entry must disable this exact policy/four roles, verify zero sessions/closed gates, restore/reconcile the runtime as appropriate, and return **only** JSON `{ "verified": true, "status": "CLOSED_VERIFIED" }` on verified completion. No passwords/tokens/private runtime contents in argv. Interpreter/entry are absolute, shells forbidden, entry hash is checked at preparation/start and immediately before invocation. No automatic retry. The watcher consumes Root's safe contract, not the details of SQL or deployment.

Prepare a fresh private directory, then start an independent process (Root's existing detached launch mechanism):

```sh
python3 scripts/trip/sustained_transition_watchdog.py --plan /private/plan-input.json --run-dir /private/new-run
python3 scripts/trip/sustained_transition_watchdog.py watch --run-dir /private/new-run --plan-sha PREPARED_MANIFEST_SHA
```

`planSHA256` is the canonical plan hash returned by prepare, not a raw JSON file hash. Plan/run files use0600/0700 and require current-owner/no symlink. Root verifies `watch-claimed.json` and live PID before business activation; missing/failed startup is not an armed watchdog. Exclusive claim refuses a second watcher/retry. Root keeps the shutdown/rollback reserve when fixing the <=900second transition, independently of the ordinary sustained service lifetime.

After Root independently verifies successful deployment, policy/role safety and service ownership, it may atomically write private0600 `handoff.json` with exactly:

```json
{
  "status": "SUSTAINED_HANDOFF_VERIFIED",
  "planSHA256": "PREPARED_MANIFEST_SHA",
  "approvedGateSHA256": "0f6c8bf72e41c17a939424cbf821770ac355b7b235ce300abbb7eb6e46058bf0",
  "actorId": "1f65e932-b6d8-4ea4-9cc9-fe9da331b424",
  "adoptionCutoff": "EXACT_PLAN_VALUE",
  "transitionId": "EXACT_PLAN_VALUE",
  "serviceAndPolicyVerified": true
}
```

Only an exact marker observed after start and **before deadline** preserves service. Invalid/foreign markers do not qualify; late markers cannot cancel closure. At expiry the pinned close argv runs once with a180second subprocess timeout. Raw stdout/stderr/errors are discarded; nonzero/malformed/unverified/timeout reports RECONCILE_REQUIRED, never retry or guess closed. `watch-result.json` records the transition/hash/outcome and whether sustained service was retained. Root must independently check this result and actual resource state. This is not a general deployment manager and does not restore an image by itself.

Nine local tests PASS: default private preparation, exact handoff, timeout/single claim, foreign marker, late marker, failed closure/no secret leakage, tampered plan/entry, bad authority/window/shell, actual local-only child safe result. No actual remote closure, credential read, Native, deployment or DEV operation occurred in this preparation.
