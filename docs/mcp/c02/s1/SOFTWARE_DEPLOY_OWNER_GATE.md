# C02-S1 — exact default-closed software deployment authorization

DRAFT / NOT AUTHORITY. Package MCP-C02, S1. MCP Single DRI; Root privileged
resource Writer only. This Gate covers software qualification, not finite issuer
activation, Consumer access, Confirmation installation or any business save.

## Fixed candidate and current preimage

Existing source5343f4f5; latest metadata correction only freezes original receipt9ab.
Private package /private/tmp/otr-mcp-c02-s1-package-20261103:
- server-capture.mjs SHA25617d4812319262931dd27061a8d8f5a254dd80cd881dffdaf5acc0fafc2a92584
- c02-host.mjs SHA2566c9b722c8cee3563e0c4bf24dd434fd6c91288d4e7249322941dd11f2da3814d
- Dockerfile SHA256ab18a56f2d55d2dddf28890a3a80aa36cedc2725d599887f142489c4e8536008

Root read-only current21:47:27Z:
CID920f1038c3dd891971a2cb63c3e6b8c968df31060b25803f65f2d807db7b5ea6;
Config180d32be681ac4b017f6b6f67c0811f6ea6dc898db398d186abbcb402c4bc961;
image sha256:1efe1fad902475bcfe4047290e59c944c78453f6d32c88d24aac64cb60d8d6dc;
Capture48b128d2bf9a9a93877ec7bbf4aa4a80973d108b77ea7a12246c09d9d0079f85.
Fresh-CAS this exact preimage before deployment; drift stops deployment and returns
the new tuple to MCP. It does not permit overwriting another lane's release.

## Exact authorized work if Owner approves

1. Root stages only these pinned bytes and builds the fixed Dockerfile FROM1efe.
   Record resulting immutable image ID; candidate hash mismatch aborts.
2. Short resource lock: verify current tuple/Env/mount/config files/old bundles,
   require all three MCP QA config keys absent, deploy only the new software image
   preserving other Env/mounts/config files and all existing bundles. New branch
   stays unmounted because OTR_DEV_MCP_C02_QA_CONFIG remains absent.
3. Health200/protected401 and exact preservation readback; on failure use the
   pinned existing software deployment rollback to the exact retained preimage.
   Record receipt, resulting CID/config/image, then release the deployment lock.
4. Bind the new software-default as the future restore target. Run the existing
   unchanged-default close validation/probe under the resource-level short lock;
   require unchanged exact new-default CID/config and all3 QA keys absent.
   No timer, authority or finite window is started. Preserve old277/UNKNOWN and
   all QA data. Publish explicit PASS/FAIL receipts and release any acquired lock.

No SQL/RLS/GRANT/Role changes, issuer/hook changes, OAuth/Consent/OTP/Grant/session
activation, Provider, device, production or real travel access. Preserve approved
C04 additive objects/ACL; no whole-schema restore. No canonical command or trusted
confirmation is installed. All CREATE/EDIT APPLY remains unauthorized.

Local S1 tests/Review are already accepted and are not rerun. Root source/close
compatibility receipt is ROOT_QUALIFICATION.json. Actual software deployment and
close probe require this new precise human approval. After this software-only
qualification, any finite access Gate and actual Preview-specific save approval
remain separate, explicit prerequisites.
