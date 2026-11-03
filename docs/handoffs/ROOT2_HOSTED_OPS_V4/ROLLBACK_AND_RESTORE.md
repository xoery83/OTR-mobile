# Rollback / restore — do not execute for this handoff

**Primary future rollback pin is the current healthy default 0c723 /68aa.**
Retain that exact container with its existing configuration, mounts and authority boundary when a future qualified deployment stages a candidate. Existing machine-local config stays in place; never reconstruct it from copied tokens/env output.
Historical fallback `c213f5dd69ef1e8e4f469450a7985ff731b04ada6f514a48c91e2b4008dba682` /image`039810d82ad18344afc9b4ddade1e352b340792b3ffea6f384acf28ef3725058` exists stopped, name`otr-mcp-c02-closed-2b71f8c5-before`. It predates the C02 loader repair: **not the automatic target for a new window**. Its presence is not compatibility approval or an instruction to start it.

## Existing mechanism

All service CAS mutations use `/run/lock/otr-universal-finite-service.lock`, nonblocking exclusive flock. Read-only transfer checks use stat + `/proc/locks` only, never acquire/release a writer's lock.
Existing deploy operator is `/opt/otr/dev-backend/build/mcp-c02-closed-2b71f8c5/release.py`; the checked source is retained locally at the matching path above. It verifies exact beforeCID/image/Config/Env/mount/file/HostConfig, stages a new container, retains the old container, switches names, checks health, bundles and protected HTTP boundary, restores old on failure. Its old deploy-plan cannot be reused: old preimage is c213 and old candidate is68aa. This is mechanism reference, not a new executable deployment plan.
Auth current qualified controller sources: `docs/ops/root-auth-original-resume-20261103/`; pending driver/Gate under c91 `docs/ops/auth-c04-original-id-resume-20261103/`. MCP old a2f8 operators are in `/private/tmp/otr-mcp-c02-diagnostic-a2f8c128ba794de4bcf3c98d324ffc63/operators/`; old absolute deadlines/plan IDs are consumed.

## Required restore order for a future approved packet

1. Fresh affected-resource CAS and exact approval; verify actual retained current healthy default. No unexplained drift or active competing window. Arm/verify independent absolute close before activation.
2. On failure/expiry, close only the owned finite scope/Issuer/Provider/worker as its contract requires. Do not delete or inverse accepted Source/Core data. UNKNOWN means recover old receipt, not another dispatch.
3. Within the same short flock, compare live finite CID/config to the qualified packet. Stop only that owned finite container; preserve its journal/evidence. Restore the retained current default's service name/start state through the existing qualified operator. Do not replace an unrelated later deployment.
4. Independently read default CID/image/Config/env-map/mounts/bundles, local/external health, selector absence, scope/worker/Issuer closure and own session cleanup. If ambiguous, keep activation blocked; preserve timers until closure is proven.
5. Only then disarm owned timers, release resource and publish receipt. Do not roll back database business changes or remove historical originals to make health pass.

Transfer executes **no stop/start, rename, restart, SQL inverse or rollback drill**. Healthy/no-window readback is sufficient; an untested rollback drill must not be reported PASS.
