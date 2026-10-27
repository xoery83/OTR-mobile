# Statement guard NULL repair

Independent review found the new P5 statement exemption used NOT(predicate); a missing GUC can make predicate NULL and PL/pgSQL then skips the rejection. Row guards still denied business-row writes, but the statement boundary itself must fail closed.

Actual isolated PG reproduction omits each GUC from a fresh gateway session while exact P5 capability is active. set_config(NULL) resets a custom GUC to an empty string and is not the missing-value test. Correct reproduction initially allowed a no-row INSERT (RED). Requiring the complete exemption predicate IS TRUE closes this path. All five missing-GUC INSERT negatives and prior Manual/foreign scope/wrong family/nonCreate/UPDATE negatives now pass; exact P5 normal save, service/two-endpoint readback, finalize, replay and guarded reverse rollback remain PASS in the same network-none256MiB fixture (58.30s). No DEV installation or activation occurred.
