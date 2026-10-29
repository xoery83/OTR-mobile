# MCP-01: modular, read-only Backend adapter

Status: accepted scope by Owner 29 October 2026; public activation blocked on Auth.

Use stable official MCP SDK, stateless Streamable HTTP and four read-only tools.
Reuse Backend discovery/Core read2/detail ports. Prefer future mounting `/mcp` in
existing Backend with an Auth-owned MCP principal and no duplicate ACL. Prepare
an independently testable module and loopback-only ordinary-session harness now.
Default missing Auth port denies requests; ordinary Supabase sessions are not
public MCP OAuth credentials. No migrations or changes to business/identity ports.
SDK is an isolated `mcp/package.json` dependency, avoiding Mobile bundle/dependency
changes. Cost is a separate lockfile and SDK upgrades; benefit is interoperable
protocol handling without a hand-written JSON-RPC implementation.
