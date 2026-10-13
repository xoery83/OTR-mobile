# TTR spatial equivalence is independent of geometry

Status: Owner-authorized CP-TTR-04B2B-S correction; current-main isolated
implementation, pending independent functional and synthetic Native review.
2026-10-14.

Core `otr-core-ttr-input/1` permits qualified endpoints/continuity with UNKNOWN
equivalence and zero distance. Coordinate equality cannot prove operational
SAME_LOCATION, including terminal and access differences.

TTR input accepts explicit UNKNOWN or provenance-bearing SAME_LOCATION. Omitted
evidence means UNKNOWN for existing inputs. Qualified output retains that explicit
representation; the geometric `sameLocation` boolean is removed. Geometry remains
unchanged and only explicit SAME_LOCATION suppresses ordinary presentation.
Identity and personal selection schema are independent of equivalence evidence.

Core currently emits UNKNOWN only. No DISTINCT or access-exception authority is
invented. Unsupported assertions fail strict validation; production proof/exception
admission requires a separately accepted Core port. Synthetic proof fixtures
validate domain mechanics, not real equivalence authority.

The public `ttr-presentation/1` structure/version is unchanged. Its internal qualified
state consumer in the dormant Sheet uses the explicit equivalence. Existing
Controller/Repository/React source otherwise remains exact archival source.
Core/G2, migrations, runtime activation and the Core authority adapter remain closed.
