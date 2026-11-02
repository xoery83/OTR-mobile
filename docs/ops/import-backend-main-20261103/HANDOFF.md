# IMP-C01 minimal Backend read candidate

Base main `a5161ad0`; original fixes `f5aad5ff` / `2146e9a7` were already verified
on DEV and AD5 in the source lane. This main-context port is LOCAL_PASS and
independently reviewed; it is not deployed and does not inherit runtime PASS.

- Reuse the owning current Source snapshot/proof and sealed PUBLISHED/INSTALLED
  response. Verify original marker bytes/hash, every cross-boundary Source pin,
  Actor/Trip, Run and current Task/publication fences before disclosure.
- Core-held reads reuse the existing lease/locks. Metadata cannot fetch bytes or
  use a second Source connection. The read-only continuation cannot dispatch or
  install a response. New Admission still uses the full material path.
- Historical receipt audit fallback requires the exact existing APPLIED/NO_CHANGE
  receipt and COMPLETE Source Slot with same operation/target/candidate/body/hash;
  it applies only after the original full path rejects SOURCE_CAPABILITY_CLOSED
  without a mutation witness. Current Source/Actor/Trip permission remains required.
- Runtime/Capture receive only retained-read factory opt-in and safe requestId
  forwarding; preserve the original Core-held Source argument position. No PNG
  worker/bootstrap or new QA fence/config was copied from the long Root branch.

A real direct dependency was exposed by the first local run: main only declared
ARM PNG fingerprint526b, while the existing DEV proof is x64 fingerprint0e22. The
previously accepted `ca0b3dab` two-file strict declaration is reused. Source's
registry/proof still qualifies both exact fingerprints; no new profile, SQL,
capability or fabricated ARM proof is added. All other ca0 runtime/product work
remains outside this slice. The optional MIME discriminator is the existing binary
reader contract, not a new storage path.

117 checks pass, one existing test remains skipped; 22-root strict types and local
Capture build pass. SOURCE.patch.json preserves exact frozen UTF8 diff bytes;
MANIFEST lists actual source hashes. INDEPENDENT_REVIEW.json is NO_BLOCKER.

Latest main405 contains only the separate Native C01 slice after a516. Candidate
will ordinary-merge that main after its own fixed commit, preserving Native and
rechecking these exact Backend source hashes. No main/remote update, Hosted SQL,
deployment, Session, device or Provider action is performed here. Parent must
freshly serialize actual main integration and separately verify any later DEV
release. This historical fallback does not cover accepted-but-not-COMPLETE Source
recovery or other formats; their original full-material qualification remains.
