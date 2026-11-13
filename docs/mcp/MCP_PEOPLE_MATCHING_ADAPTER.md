# People matching adapter — local only

`peopleExpenseAdapter.ts` validates a scoped complete roster projection and compares
visible names, nickname, document name and confirmed visible AKA. Unicode/punctuation
normalization yields suggestions only. Even one match requires user choice; two
same-name Persons remain ambiguous. Missing reader returns BLOCKED.

`prepareTravelerPlan` uses actual `personCloudCreateSchema`: original Trip-create
operation, stable new Person/operation, unlinked status; no invitation or Account
connect. The default-closed domain adapter now dispatches this exact owning request and recovers its receipt when explicitly bound. Confirmed choice precedes participation/splits.

`aliasIntent` describes ADD/CORRECT/SUPPRESS, exact Person, TRIP vs GLOBAL_SELF,
revision and source references. Correction/suppression require exact alias ID.
Every alias plan remains BLOCKED pending Auth's scoped reader/mutation/provenance
contract. This candidate is not a new Person identity system or a granted API.

The existing Bootstrap reader now projects verified Trip display names and participation only.
It returns revision:null plus a scoped fingerprint; empty visible AKA is not proof
that private aliases do not exist. No private Profile or financial rows are exposed.
Choices MATCH_EXISTING/CREATE_UNLINKED/UNRESOLVED bind that revision/fingerprint;
corrections retain original observation/source references and advance choice version.

Seven-person tests cover spelling variants, Chinese names, reordered tokens, nickname/document name, corrected choice, two identical names, new traveler,
cross-account projection and unavailable reader. No real People/AKA writes.
