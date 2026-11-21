# Preserved preparation failures

- Initial offline test fixture for current guards lacked `otr_auth_guest_composite.mutation_allowed()`. No Hosted call occurred. It failed at receipt persistence and the disposable local container was removed by the existing finally block. Private log retained in the sibling private directory `isolated-pg/PG.private.log`.
- Existing synthetic normal-auth fixture dependency allowed initial compatibility checks. This was not treated as Hosted Auth evidence. Root2 then supplied the exact unchanged helper844f7438… and described its live qualification. Final runner uses that body and its actual ACL shape; no permissive stub remains in the fresh-manifest branch.
- Independent Review found old profile actor fingerprint omission. Both profiles now pin unchanged e25bc2c9…; actor drift and mixed guard generations are tested. Original source/Hosted states were not changed to make tests pass.
- Final exact-Auth isolated run:30 PASS. All raw function definitions, intermediate logs and private SQL remain outside Git.
