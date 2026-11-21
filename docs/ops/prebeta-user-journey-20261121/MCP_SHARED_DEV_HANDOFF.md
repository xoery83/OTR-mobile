# Shared DEV MCP handoff

Owner accepted standing Shared DEV read/write activation, removal of the fixed QA account restriction and real Email QA readback on 21 November 2026 NZDT.

- Actual Shared DEV Backend source `4388a2d6aec22c08950f5db645c92a4c1ed8fb8e`, container `43715f6258dbd0ac71848ad452c7402e7ddd90b0c70d54eead87113f0b6e6806`. Health HTTP 200. Retained previous standing container `417392007b16…` and preactivation Native container `c89a4e06ad85…`. Core role limit remains 1.
- Real Email QA Consent approved with TTL 3600 s. On the deployed source, MCP `get_trip` returned HTTP 200 for synthetic Trip `cc44a705-6f43-41e0-a2f9-16f334b2a6b2`, Revision 4, end date 2026-12-19. Independent PostgreSQL readback agreed.
- Earlier formal revoke acceptance recorded first-party grant removal and HTTP 401 with the old connection. Current regression explicitly denies a revoked non-allowlisted Account before consulting stored Consent and denies foreign Consent. MCP Gateway suite 7/7, owning approval/Consent/browser suites 62/62, MCP typecheck passed. Ordinary-account online revocation remains pending.
- Remaining live acceptance uses an existing normally authorized DEV account, one dedicated synthetic Trip and a single formal write. Retain the original Receipt and independent PostgreSQL readback, then observe physical iPhone foreground sync and cold reopen. Google sign-in and one read may use that same account. The current plugin resolves only the original Email QA Account, and the physical iPhone was unavailable in CoreDevice at handoff. Do not replay the earlier synthetic write or revoke the retained connection merely to generate evidence.

## Native stability and Auth follow-up

Reproduction: with the standing policy and an approved email QA connection, request `get_trip_capabilities` on the above synthetic Trip during ordinary Shared DEV Core traffic. Same deployment returned a successful `get_trip` before or after capability failures. Report intermittent failure; the holder of the lease at the failing instant was not identified.

- 13:48:00 NZDT: `mcp_managed_consent_read_unavailable`, stage `lease`, 15001 ms, followed by `mcp_managed_authorization_unavailable` at `consent`.
- 13:50:14 NZDT: same Consent lease event at 7071 ms, then `mcp_backend_request_unavailable` for GET. Client received HTTP 503. Neither event emitted a PostgreSQL SQLSTATE.
- Apple Web authorize returned HTTP 400 `validation_failed` and reported a missing OAuth secret. Native Apple system sign-in and cold recovery in Build14 are separate accepted evidence. Google browser authorize reached the actual provider. Full Google DEV login/read is pending.

Use the [unified Beta backlog](../../BETA_PRODUCT_ACCEPTANCE.md) for open items. Promotion follows the ordinary-account validation. Production and real user Trips are outside this handoff.
