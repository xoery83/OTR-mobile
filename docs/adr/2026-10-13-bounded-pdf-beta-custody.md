# Bounded Beta PDF custody completion

Owner accepts Recovery-02 with corrections, implemented only for Recovery-03A CLOSED scope.

Use the existing Source/execution/staging journal. Add finite `PDF_PRIVATE_UPLOAD_BETA_ACK_V2`: one sealed payload and authorized producer, exact complete response attestation, independent retained GET, fresh owner/access/CAS, then existing immutable UPLOAD FINAL/APPLIED(PENDING). A separate logical custody closure permits unchanged owning VERIFY/REGISTER/SEAL and Core admission. It is not physical termination: attempt remains nonterminal, outstanding remote writes and staging quota survive. No cleanup or new retry authority is granted.

Strict v1 and PNG remain unchanged; the forward migration extends only the existing Source result seal and operation transition guard with a finite durable-custody predicate. No new Publisher/writer/ledger. SQL can validate binding and receipt immutability, not certify real Provider behavior or fsync/network execution. Backend must enforce the sole producer/key/payload isolation assumption and durable response recording. Missing ACK stays UNKNOWN even when GET matches. Exceptional re-import succession/dedup is excluded.

Normative contract: `docs/trip/CP_FLIGHT_PDF_UPLOAD_BETA_ACK_V2.md`. Implementation remains isolated pending Owner Review. Hosted/provider/Backend/Native activation is CLOSED. Retention and quota exhaustions require separate policy/cleanup approval.
