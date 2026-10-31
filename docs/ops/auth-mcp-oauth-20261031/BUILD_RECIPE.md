# Rebuild the default-closed OAuth read runtime

Use a clean reviewed checkout and the project's existing root dependency setup.
Do not change the Native lockfile to solve isolated browser or MCP dependencies.
From the repository root:

```sh
npm ci --prefix mcp
npm ci --prefix browser/auth-consent
node scripts/auth/build-oauth-consent.mjs
node scripts/auth/build-mcp-qa-runtime.mjs
node scripts/auth/test-mcp-qa-build.mjs
node scripts/auth/smoke-mcp-qa-runtime.mjs
```

The runtime builder validates backend/mcp/source-pins.json against all first-party
SDK inputs and the root/MCP dependency manifests and locks, builds the SDK from
those sources, checks the actual esbuild input graph for unreviewed files, then
bundles the existing Node bridge. Dist artifacts and their measured hashes are
outputs, not a required temporary SNAPSHOT directory. Public dependencies remain
isolated; no SDK package is added to the Native dependency graph.

A changed source, lock or additional first-party build input fails closed. Review
and update the pin manifest for a new owning change; there is no bypass option.
The test exercises both modified source and an unlisted extension-shadow input,
then restores a normal build. It does not contact a Provider or deploy anything.

Live SDK and ChatGPT receipts used the previous 8812 frozen runtime. All public
Read and transitive Core sources are identical here; the only SDK differences are
three reviewed closed-write helpers from the MCP Phase2 slice. No write binding,
new grant, SQL or config activation is part of this source/build integration.
Backend runtime still performs no SDK/asset IO without its explicit finite QA
configuration. Historical activation/closure receipts are not a current lease.
