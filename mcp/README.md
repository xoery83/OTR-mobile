# OTR MCP-01

Independent read-only Streamable HTTP adapter, official SDK2.4.0. Public activation
is closed pending Auth-owned OAuth; see `../docs/mcp/MCP_01_AUTH_DESIGN.md`.

From the repository root (Node24 and repository dependencies installed):

```sh
npm ci --prefix mcp --ignore-scripts
npm --prefix mcp test
npm --prefix mcp run typecheck
npm --prefix mcp run build
```

Build emits `../dist/mcp-server.mjs` from this package (root ignored dist). No normal
Backend startup or Mobile bundle imports this module. SDK is isolated so the
Mobile package/lock do not change. Existing root tools supply TS/Vitest/esbuild.

An explicitly authorized internal test may set OTR_MCP_INTERNAL_SESSION_TEST=1,
OTR_MCP_DEV_PUBLISHABLE_KEY to this DEV project's public publishable key and optional
OTR_MCP_PORT (default8798), then run `npm --prefix mcp run start:internal` or the
built root `dist/mcp-server.mjs`. No activation flag means no listener. The only
listener is `http://127.0.0.1:8798/mcp`; Client sends its own fresh QA Session using
the transport Authorization header, never tool parameters. Session credentials
must stay in memory/private custody and must not be pasted into chat or logs.
This is INTERNAL_SESSION_TEST_ONLY. Do not expose it through proxy/tunnel.

For a future public mount, import createMcpHandler and provide the Auth-owned
verified resource context bound to the existing Backend read ports. Use approved
HTTPS resource URL and issuer metadata; no Session-to-OAuth compatibility fallback.
Host owns TLS, auth discovery, rate/concurrency limits and deployment window.
Deploy only after actual A/B permission, token/resource/revocation, client and
independent readback qualification. Keep the adapter unmounted until then.

Operational bounds:16KiB request,30s total,10s Backend calls,25 Items per page,
up to64MiB read2 collection. A page uses one collection plus up to25 separate owning
detail reads. No scale/load claim; add an owning aggregate projection port only
when measured need and owner contract justify it. No DB credentials, new schemas,
queues, mutations, background lifecycle, auto retries or provider calls.
