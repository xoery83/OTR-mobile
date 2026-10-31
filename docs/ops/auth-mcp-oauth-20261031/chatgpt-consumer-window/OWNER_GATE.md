# ChatGPT consumer-only finite DEV QA window

Previous Gate02971807 was closed and independently verified. Standard SDK real
Code/S256/read/foreign-denial/refresh/revoke already PASS (9691bd83); do not rerun it.
ChatGPT metadata discovery PASS, draft not Created; its at-action user confirmation
was received in the MCP chat after the old window closed. Never reuse the old window.

Request: one new finite window only in DEV tuqigdxrvrerfewsxqgm, not before
2026-10-31T07:30:00Z, absolute expiry 2026-10-31T08:00:00Z (maximum30 minutes).
Same QA1f3d7935-1bdc-4952-8d7f-0f72077368c1 and same public client
83504d3f-59d4-43fd-99b1-bebc54c40f7d/none; exact ChatGPT callback
https://chatgpt.com/connector/oauth/CYUxrs56rSrW and existing SDK callback
http://127.0.0.1:18764/callback retained. No new registration/client/secret.
Provider scopes only openid+offline_access; business only otr.trips.read,
resource https://api-dev.xoery.art/mcp, token maximum60 seconds, DCR off.

Only the existing private Hook body deadline changes (closed-body CAS), plus
re-enable its existing config, existing OAuth server/consent Site URL, and the
same default-closed runtime public finite config. No new functions/ACL/RLS/GRANT,
roles, schema, business authority, Production or real-user data. Exact SQL is
ACTIVATE_CANDIDATE.sql and CLOSE_CANDIDATE.sql; prior template/renderer unchanged.
Existing browser9264/image4781 and defaultce09 are the restoration baseline;
coordinate Root before acquiring Host writer. No software rebuild needed.

Normal QA control OTP/session stays only in Auth process memory for grant revoke.
After consumer attempt, timeout or failure: close Hook and independently read back,
attempt normal grant DELETE (404 requires fresh absence proof), revoke own normal
Session/negative refresh, restore retained default runtime under shared Host lock,
OAuth OFF/Hook disabled/URI null/Site localhost:3000 and independent ACL/config readback.
Fail closed; do not extend expiry or retry client registration. ChatGPT at-action
confirmation must be valid for the actual connection; preserve draft if unavailable.
