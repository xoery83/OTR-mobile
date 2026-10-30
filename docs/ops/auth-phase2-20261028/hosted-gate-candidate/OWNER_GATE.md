# Auth Hosted DEV protected gate — approval pending

Target: Supabase DEV `tuqigdxrvrerfewsxqgm`. Root is the sole SQL/Host writer.

Gate `fd671463e04c095197e20faaba223ed26eb1ea99d2ad64b207bd06aaaaefde5c`.
Install SHA256 `26f036d4ff4afca6a0580ca0f9a632da8e204dcdbca56442fafa53dac41c113e`.

The concrete [installation SQL](/private/tmp/otr-auth-hosted-gate-qql2h0_n/install.private.sql)
and [permission/parent manifest](MANIFEST.json) are ready for review. The SQL has
not been executed. Raw function definitions remain private0600.

The protected delta creates one private Adoption schema with6 tables, RLS and24
functions; patches14 exact existing owning function bodies while retaining their
normal logic/owner/ACL; and adds9 direct public-function EXECUTE permissions for
the existing Core Gateway. Private Gateway/Writer function grants are enumerated
in the manifest. No role/member or business-table grant is added. Native receives
no privileged credential and continues through the Backend.

The transaction checks all14 OIDs/definition hashes/owner/ACL and the latest Root
approved Source guard OID66410/hash6c7ef0d85cfd8893796ccc53e31f51f0. Its exact
signature is in the manifest; Auth does not patch that indirect dependency. All14
direct parent hashes remain unchanged at the fresh READ ONLY capture. Root must
also independently verify the external DEV target: GUC project/gate strings are
intent guards, not proof of Owner approval or actual project identity.

Installation starts and ends with policy CLOSED; it does not mount routes or
automatically activate a run. After approved installation and independent readback,
normal DEV configuration and one isolated Synthetic QA Guest Trip/P1 E2E continue
under the standing delivery authorization and Root's serial window. Commercial
limits remain disabled. Any UNKNOWN retains source and receipt identities; close
new mutations after the run, preserving recovery evidence and authenticated reads.

Independent bounded Review verified the exact generated body, default CLOSED,
permissions, hashes and0700/0600 files. Reused48 real isolated Gateway checks cover
the underlying candidate; this is neither an execution approval nor Hosted E2E.

Owner authorization is required by Standing Authorization3.B for the new protected
RLS/EXECUTE delta. The requested approval covers only this exact DEV installation;
ordinary tests/configuration continue within the already approved contracts.
