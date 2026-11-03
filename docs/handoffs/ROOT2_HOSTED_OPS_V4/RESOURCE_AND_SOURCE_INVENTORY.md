# Resource inventory and source provenance

| Resource | Before transfer → after completed transfer | Current evidence / boundary |
|---|---|---|
| main / Core contracts / schema design | Root1 → Root1 | Remote b16; c91 local pending Auth package, never install its Gate just because code exists. |
| DEV SSH Host178.105.151.143 / Backend8787 / Docker / runtime env and mounts | Root1 → Root2 | HOST_CURRENT.json; one shared process for Auth/MCP/Import/Flight. Bind127.0.0.1; reverse proxy exposes the approved DEV endpoint. |
| PostgreSQL schema/permission/function installation | Root1/Core designs/reviews; Root2 installs only explicitly qualified package | PG_CURRENT.json; no standing right to arbitrary migration/EXEC/RLS/GRANT. |
| Supabase OAuth/Issuer settings | Root1 → Root2 only within an exact still-valid Gate | Last MCP console OFF/localhost SiteURL/DCRfalse evidence at08:02Z; **not freshly reread in this handoff**. No active finite selector/timer now. |
| Shared custody/task stores | Existing owning Source/Task/Provider business authority | Mount paths/fingerprints only, no data copy/reset/cleanup. Root2 operates runtime, not business rows. |
| AI Provider config/price/scope | Root2 runtime installation; owning usage/admission contracts unchanged | Fresh Source/provider scope/Actor expired; price snapshot09:47Z all expired. No model call probe. |
| Native binary/simulators | Native/Vision, never Root2 | No device operations required by transfer. |

## Exact fingerprints

Use canonical JSON with sorted keys, compact separators. Environment hash uses a key/value map (not raw/sorted Env list); mount hash uses sorted `(Source,Destination,RW)` triples.
The alternate list digests in ROOT2_INITIAL_READONLY are a canonicalization difference, not drift.
Current config `eb99ebf60049e076085f517d9dc06a69440749de0d02ee553ebacaf46413cedf`;
env-map `1f63f946d5713e38418b4210f59acd033c206e7a20f242818f418978fc8fa020`;
HostConfig `d50118467f4c6d4548e84b898f06116f03850202b81629f40abdbc032d89bd4c`;
mount triples `14ee2d11251165df925fe3e096b51ecb5fd08eaa759a253ec9c31140e21de696`.
All actual mounts/RW and config-file hashes are in HOST_CURRENT.json. File bodies/credentials are intentionally excluded.
PNG config still has its Nov1 expiry; PDF runtime mount is absent. Mount existence does not imply qualification.

## Build/release provenance

Main `docs/ops/mcp-c02-loader-repair-20261103/VALIDATION.json` records fixed main-context server builds and scoped review/test evidence; `HOST_DEFAULT_CLOSED.json` records actual deployment/readback.
Actual bundles: server7cbfdad3…, capture6f4c4cdc…, fixed C02Host6c9b722c…, consent6040fcfd… (complete hashes in HOST_CURRENT).
Historical exact local release directory `/private/tmp/otr-mcp-c02-closed-2b71f8c5/` retains Dockerfile, two bundles, release.py, make_plan.py and receipt; Host directory `/opt/otr/dev-backend/build/mcp-c02-closed-2b71f8c5` retains actual release operator/plan. Do not copy its private deploy-plan.json: it contains runtime Env values.
Dockerfile overlays only the two server bundles on `otr-dev-backend:auth-recovery-closed-acbe0b70`; base source `acbe0b70f7496f7a64fc1c8be36bdc5f22bf9a84`. Image digest plus four bundle hashes are the measured software pins; no single image-label git SHA was independently established.

Schema migration ledger:68 entries/max20261004000300; protected Source/Auth function patches later than that ledger are separate owner-governed installs. Fresh five Source OID/hash/owner/ACL snapshots are partial fingerprints, not proof every shared function matches main. Root2 must demand each future packet's exact affected preimage. No complete schema dump or credential transfer.
