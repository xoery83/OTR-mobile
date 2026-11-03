# Minimal MCP-owned runtime wiring

Consume exactly the two Auth binding/test files from the fixed new candidate.
The existing f1de4b47 four-stage implementation was reviewed but is absent from
deployed794/main5bb. The new candidate adds only safe method/coreStatus fields.
Do not copy its old mcpQaRuntime.ts or its Slice1 Notes configuration over current
Create. MCP remains sole Writer of its latest runtime/logger/schema/tests.

Add a z.object whitelist beside existing runtime log schemas:

```ts
const writeStageLogSchema = z.object({
  diagnosticId: z.uuid(),
  method: z.enum(["GET", "POST"]),
  stage: z.enum(["PRECHECK", "CORE_BOUNDARY_ENTERED", "CORE_RETURNED", "POSTCHECK"]),
  elapsedMs: z.number().min(0).max(120000),
  coreStatus: z.number().int().min(100).max(599).optional(),
  failure: z.enum(["EXPIRED", "CANCELED", "TIMEOUT", "GRANT_NOT_CURRENT", "UNCLASSIFIED"]).optional(),
});
```

Pass only this observer into the existing createMcpAccountWriteBinding call:

```ts
diagnostic: (event) => {
  const safe = writeStageLogSchema.safeParse(event);
  if (safe.success) console.info("MCP_QA_WRITE_STAGE", JSON.stringify(safe.data));
},
```

Keep the existing ports, Consent, active-grant check and Create/profile routing.
Use z.object's unknown-key stripping; do not log the event or a caught error raw.
Cover extra token/body/Actor/Trip/operation fields stripped; method/Core status
retained; callback throw cannot alter handling; actual Create branch unchanged.
Core response status persists if post-current rejects; no response body is read.
This is log-only and introduces no execution capability, retry, window or scope.
The original a8c1 receipt remains the only recovery authority for its UNKNOWN.
