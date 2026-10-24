# Optional retained-original restoration

Default Compose closure is unchanged. For an API-cloned candidate whose original container is retained, add four runtime fields before sealing `windowId`:

- `originalContainerId`: exact 64-hex original Docker ID.
- `backupContainerName`: `otr-universal-original-` plus exact activation UUID.
- `baselineConfigSHA256` and `activeConfigSHA256`: SHA256 of existing canonical JSON of the entire respective Docker `Config`, including every label. Existing raw HostConfig/environment/mount hashes remain mandatory.

The candidate must carry exact `io.otr.universal.activation` and `io.otr.universal.original-container` labels. Its Compose config-files label still equals the baseline list plus this finite overlay. These labels are additional identity fences, not authority.

The existing shared service lock is held throughout. Closure first validates original ID, complete baseline Config/HostConfig/mounts and backup name. A running backup, missing original, name collision or any drift refuses mutation. Only the exact finite candidate ID may be stopped and removed (`docker rm ID`, without force or volume deletion). The original ID is renamed and started, then the existing full baseline and health checks run before finite-file removal. No original container is removed or recreated. An UNKNOWN command result is independently inspected without retry; unresolved stop/remove/rename/start fails closed. Restart recovery supports candidate-already-removed and original-already-renamed states. Read-only recovery never stops, removes, renames, starts or unlinks anything.

This patch implements recovery only. Root owns never-start clone qualification, captured hashes, activation and actual deployment. Local tests cover raw `OomKillDisable: null` preservation, original/candidate drift, partial recovery, lost responses, failed stop and read-only behavior. No DEV, SQL, Provider or actual service change was performed.
