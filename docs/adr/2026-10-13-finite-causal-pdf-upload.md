# Finite causal PDF upload completion

Owner accepted TIMING02 with conditions; TIMING03 implements an isolated CLOSED profile.

`PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3` uses the existing Source operation, execution and staging rows. A Source-owned immutable stage discriminator isolates the V3 CHECK branch. Journal/stage commit visibility, initial dispatch ownership, immutable complete ACK, a committed ACK-bound Source read permit, independent retained-byte evidence and current pins/access replace relative wall-clock ordering. `observedAt` remains canonical finite UTC and immutable audit evidence. No clock tolerance, lease, scheduler or global transaction ordering is introduced.

Old v1/v2/PNG CHECK branches, RPCs and receipts retain their timestamp rules. The only preexisting function extended is the finite custody predicate used by the existing Source seal; VERIFY/REGISTER/SEAL and Core are unchanged. Logical FINAL/PENDING never certifies WRITER_TERMINAL, releases quota, permits retry or grants cleanup.

SQL establishes committed Source facts, not independent network execution. One trusted Backend producer must hold the fresh dispatch response, confirm committed current authorization, write once without retries/upsert, commit ACK, acquire/commit the Source read permit, and then perform a new no-cache GET. Cached evidence relabelled by a malicious trusted producer cannot be detected by SQL alone. Lost dispatch responses and uncertain writes stay UNKNOWN. Real Provider/Backend integration remains a separate gate.

Normative DTO/RPC contract: `docs/trip/CP_FLIGHT_PDF_CAUSAL_UPLOAD_AUTHORITY_V3.md`. No canonical integration or runtime activation is authorized by this ADR.
