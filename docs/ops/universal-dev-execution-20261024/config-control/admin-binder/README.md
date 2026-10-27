# Root-only existing CP14 command binder

```sh
python3 scripts/import/build_universal_admin_plan.py --bind-proposed \
  --plan /PRIVATE/source-provider-plan.json \
  --facts /PRIVATE/actual-admin-facts.json --out /PRIVATE/bound-plan.json
```

Fill `UNBOUND_ACTUAL_FACTS.json` from actual reviewed rows and trusted issuer facts; nulls deliberately fail. `connection` is the existing validated admin connection object, not credentials. `authContextBase` must already be a trusted OTR_ADMIN context, including real verification/session references and expiry. The binder does not turn normal user Auth into admin authority. Use explicit seven request/audit pairs and two grant IDs; all sixteen IDs must differ. Outer expiry must fit the actual Auth session; existing validator enforces the inner/outer deadlines and restoration tail.

The three full CP14 rows are consumed verbatim; decimal rate strings and DISJOINT units preserve exact price facts. No price/model/Auth defaults or actual identity values are supplied. Only request hash/binding fields are derived. Existing CP14 command validation, CAS, grant checks and immutable audits remain authoritative. `ownerAuthorized` is preserved, never enabled. Output is PROPOSED packaging, not an execution or authorization receipt.

The CLI performs no network/SQL/service/credential reads. Output is exclusive 0600 in an owned 0700 directory. Runtime control still independently checks actual authority, zero DEV integration baseline, current role/grants, windows and existing service closure. Never use the synthetic test fixture as actual Auth or price proof.

Validation: three binder tests; existing control/watchdog regression; actual owned network-none PostgreSQL executes all seven generated commands with synthetic Auth/price fixtures, including post-COMMIT UNKNOWN reconciliation, CAS rejection and exact restore/revocation. No DEV writes or Provider calls.
