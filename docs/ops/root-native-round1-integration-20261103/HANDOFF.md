# Native round1 isolated main rehearsal

Base is fixed origin/main58134238. Only d220f1df and db06bad2 were cherry-picked,
as1b8aaf78/449128c3. Both conflicts were CURRENT_IMPLEMENTATION_STATE.md only;
latest main is retained byte-for-byte and short truthful Native entries appended.
All final src blobs, including catalogs and four Auth-reviewed data/test blobs,
match the fixed Native db06 source. No long Native branch merge or Auth/MCP/Import
replacement occurred.53a18c0b's Import Activity source does not intersect this patch;
that independent commit is not silently included here.

Evidence is verbatim from fixed Native6034483e FINAL_REVIEW and Auth7052b7d2.
The Guest factory adds only two imports/two repository fields on the existing Guest
database/owner; default Photo/Cover factories select current committed Guest lazily.
Adoption, census/fileless hold and schema are unchanged. Auto retains the photo;
metadata+Cover save is sequential and can retain already successful metadata when
Cover fails, with exact same-operation retry. No atomic save is claimed.

Local integration checks:22 targeted tests, five-root strict types, eight-file
product lint, UI guard473/168 and diff check PASS. Native369/GuestUI6 and Auth data/
census review remain reused evidence; no full-suite/build/device repetition.
Root may review the isolated branch for serial integration. Native/Vision owns
latest-integrated-main full Native build, schema/assets verification, existing
sandbox preservation, device repeat and explicit Owner review. None was performed
by this rehearsal. Status: LOCAL_INTEGRATION_PASS_NOT_FINAL_ACCEPTANCE.
