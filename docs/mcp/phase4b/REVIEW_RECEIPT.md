# Phase4B review and validation receipt

1 November 2026. Independent branch `codex/mcp-01-read-only`.

- Baseline: `e20ad96f`, already integrates frozen accepted main `4e1bedfc`.
  Shared accepted main was read-only verified unchanged; no second main merge was
  necessary. Phase4B changes are MCP and documentation only.
- Independent reviewer: `/root/mcp_independent_review`; read-only review of changed
  MCP code and direct tests, with local reproductions. Final scoped verdict:
  **NO_BLOCKER**. Reviewer did not rerun the complete suite or use DEV/credentials/
  devices and did not qualify real cloud/consumer writes.
- Confirmed review findings fixed before final regression: Expense receipt lacked
  persisted exact original intent/actor/client binding; canonical minute clocks
  caused false updates; domain business permissions were exposed as provider OAuth
  request scopes. Corresponding regression cases now pass. No owning receipt
  fields, provider configuration or SQL were changed to fix these.
- Additional self/model failures fixed: missing synthetic collection bindings,
  pending amendments replacing accepted values, optional missing fields blocking
  valid Create, unsupported flight review paths, sparse flight Source dates being
  cleared by a detail setter, and transformed Zod metadata discovery schemas.
- Final commands: `npm --prefix mcp test` (263 tests /20 files PASS),
  `npm --prefix mcp run typecheck`, `npm run typecheck`, `npx eslint mcp --quiet`,
  `npm --prefix mcp run build`, `npm run ui:guard`, `git diff --check`: PASS.
  Socket tests run on isolated localhost; process fixture uses synthetic SQLite.
  Root types use the browser package's declared local React DOM type dependency.
- Code snapshot: `code-manifest.json` hashes all MCP source/tests/config/fixtures.
  Final code SHA is the commit containing this receipt (`git log -1 --format=%H --
docs/mcp/phase4b/REVIEW_RECEIPT.md`); no self-referential hash is embedded.
- No shared main write, bundled Host runtime repin/deploy, DEV/OAuth/SQL/Provider/
  device activity, real Nelson/Ledger mutation or historical UNKNOWN retry.
- NOT_TESTED: patched guide2 fresh actual-model comprehension, ChatGPT/Claude
  Phase4B consumer task, hosted domain binding/revocation, expanded Native results.
  The actual guide1 blank-model tool transcripts remain available separately.
