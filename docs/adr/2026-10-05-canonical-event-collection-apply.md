# Canonical Event complete collection apply

Status: B-T3I FULL PASS / ACCEPTED / CLOSED. Authority: explicit B-T3I task and
accepted B-T3E/F/G/H contracts. No command or background activation is authorized.

SQLite 46 stores a normalized complete certificate and certified ID relation plus
a separate durable Account/Trip refresh generation. This supersedes B-T3G's proposed
seven-column JSON-ID certificate and process-only generation layout as explicitly
required by B-T3I. Incomparable epoch changes require a whole validated snapshot and
current generation; no synthetic epoch ordering is introduced.

Buffer and verify the complete page chain outside SQLite. Use the existing canonical
Event repository and Account apply gate for one atomic reconciliation/certificate/
absence transaction. Retain B-T3F per-aggregate reconciliation, reject older facts,
and rehash resulting mirrors before commit. Capture and compare a scoped baseline
to reject intervening individual observations; persist membership as the restart-safe
anti-resurrection fence. Certificate hash freshness is derived independently of its
historic membership authority.

Extract the accepted B-T3H byte serializer/cursor schema into one platform-neutral
codec; Backend retains Node hashing/cursor wire encoding, Mobile uses existing
expo-crypto hashing and strict portable cursor decoding. Golden/equivalence tests
must establish unchanged Backend bytes/hashes. No dependencies, server migrations,
UI, scheduler, background recovery or timer are added.
