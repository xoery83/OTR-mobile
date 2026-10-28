# Focused repair verification

Fixed `9deccc81872c575ca31a097375d08acb269a5401` (QA allowlist fix `b4bc798`): **PASS LOCAL/L2; both P2 findings closed.**

CLI now pins exact approved EXPECTED_INPUTS bytes SHA `318dac3f…` before SQLite open; altered whitelist rejects both job/list exports without database changes. Independent actual bundled reader tests4 PASS. Loopback server uses daemon threaded handlers, shared deadline/socket timeout and response-time expiry check; actual idle-client finite-expiry test1 PASS (1.123s). No re-audit of unchanged code.

No DEV/Native/Provider action; original findings and reproduction remain retained. Real Native C3 preparation and authenticated Source proof remain separate Root acceptance.
