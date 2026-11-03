# Normal member Core read scope repair

Request AUTH-C04-POST-LINK-MEMBER-READ-20261104-01.
Golden Slice: a legally linked normal Account B reads the existing QA Trip through
the normal Core collection and receives only its existing actor-visible projection.
Actual failure: Root2 c885bc35 proves the sustained Core scope requires the caller
to be Owner with a v2 Create Receipt; B is linked but cannot satisfy that write gate.

Reuse the existing Reader, actor lock, graph projection and response contract.
Add an independent read-only owning predicate for sustained collection/item reads.
Do not modify finite/write scope, command capabilities, Admission or Core mutation.
Existing non-sustained/finite reads retain their current qualification.

SQL is a protected candidate only; exact preimages and independent negative tests
are required before a single precise installation Gate. No Hosted changes, login,
Claim replay or membership change are authorized by this code preparation.
