# PDF Source catalog-only preflight — approval pending

Purpose: obtain the current owning function preimages before preparing a PDF SQL
change packet. This is not installation or PDF execution authority. The attempted
Source-gateway diagnostic was rejected by automatic review as a new credential
use; it has not run and must not be substituted with a different credential or
management path while approval is pending.

## Exact proposed scope

- Existing DEV service `otr-dev-backend`, project `tuqigdxrvrerfewsxqgm` only.
- Expected current image `sha256:81ad4fdea800b38c1701dc9b6bafa0885ab31fad3de9798e94977ecd55454ed2`;
  fresh-match actual service/image before running; drift aborts. This pending
  document was updated after Native's separately completed normal-account rollout;
  the six catalog reads and requested principal remain unchanged. It does not
  authorize restoring094 or executing the preflight before Owner approval.
- Inside that existing container, use only the configured Source gateway connection
  as `otr_trip_source_command_gateway`. No credential, Session or Keychain is
  printed, copied out, changed, or used for another role/project.
- One bounded connection, connect timeout3s/query timeout5s, `BEGIN READ ONLY`,
  statement timeout4s, then `ROLLBACK` and connection close. Busy/failure stops;
  do not interrupt the running service or retry with a stronger identity.
- Read system catalog definitions, OID, definition MD5, Owner and ACL for exactly:

```
public.trip_sustained_universal_allowed(uuid,uuid)
public.trip_source_begin_universal_inputs(uuid,uuid,text)
public.trip_source_read_universal_inputs(uuid,uuid,uuid,uuid,uuid)
public.trip_source_universal_original_pin()
public.trip_source_acquire_universal_original(uuid,text)
public.trip_source_sustained_run_row(text,text,jsonb)
```

- Also read only current session/current role/current database/recovery identity.
  The listed business functions are not executed. No business table rows are read.
- Keep definitions in a private local0600 diagnostic artifact. Fixed repo evidence
  may contain only names/hashes/Owner/ACL and the diagnostic outcome, not secrets.

## Explicit exclusions and rollback

No deployment, parser/worker, Source/Task/Provider call, business Save, DDL, policy,
RLS, GRANT, role, budget or data mutation. No Production or real-user data.
No PDF gate activation. A failure rolls back/closes this read-only session; there
is no persistent database change to undo. Subsequent protected installation or
new PDF authority requires its own concrete reviewed packet.
