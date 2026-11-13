# Root2 SDK source execution input contract

This is a future producer/consumer contract, not a current receipt or permission.
No actual values, clock, ready state or platform approval are synthesized here.

The original private `ROOT2_NORMAL_CONTROL_START_BINDING.json` keeps all existing
Python prelogin/actual-human/pin/close/resource/UI fields. Add exactly
`sdkSourcePackageSHA256`, the hash of the final reviewed SDK `PACKAGE.json` bytes.
The Python wrapper forwards its original binding path and Gate to Node. Node
calls that same wrapper's `--validate-entry-only` before any own Session work;
that mode runs original validation and source pins, then returns before env,
launch records or Auth. Missing/invalid binding cannot directly launch main.

After actual Root2 activation/readbacks/close mechanism qualification, Root2's
existing execution child publishes a real final release receipt at:

`<Root2 checkout>/docs/handoffs/ROOT2_HOSTED_OPS_V4/requests/ROOT2-MCP-FRESH-P3-QUALIFICATION-20261105/sdk6d49/SDK_RELEASE_READINESS.json`

Its minimum fields are:

```
status: SDK_PREVIEW_ONLY_RELEASE_READY
windowId: original 6d49 hex (no hyphens)
gateSHA256, scopeSHA256, sourcePackageSHA256: exact reviewed source identities
accountId, clientId, resource: original approved QA identities
startsAt, normalCloseAt, hardExpiresAt: actual original binder ISO milliseconds
command: null
confirmations: []
```

Normal/hard must equal original T+28/T+30, never newly calculated from activation
or relay time. Status can be published only after existing Root2 real Host,
Issuer, Console, timers/watch, current restore and resource checks have passed;
carry their actual evidence/hash references as additional receipt fields. This
is Root2's actual release, not a model-created copy of an arbitrary status.
The final source package hash must match the prelogin binding and current bytes.
Receipt is an owned single-link regular file, no symlink/group/world write.

`produceSdkReleaseRelay(controlDirectory, qualifiedOwnerUid, binding)` is the
reviewable Root2-only local writer. Its source is exported from the same pinned
SDK bundle. It reads only the fixed actual Root2 receipt, validates identity,
EMPTY and clock, then wx+0600+fsync writes `SDK_WINDOW_RELEASE.json` inside the
existing0700 control directory. That relay contains **only**
`releaseReceiptSHA256`; it cannot assert or supply a time or Ready boolean.
It returns only a nonsecret derived-receipt status. This helper does not create
release state or authorize execution. Root2 runs it once after its actual final
release and includes actual output/path/hash in the return; child does not run it.

MCP `readSdkRelease` reads that private relay and the fixed actual Root2 receipt
itself, checks SHA equality, all source/actor/EMPTY bindings and original times,
then captures immutable normalClose for SDK and FIFO deadlines. Missing actual
receipt, caller-only time/hash, wrong package/scope, future T or expired release
fails before SDK construction. A previous receipt with different package/hash
cannot be promoted by a new relay. No signature, broker, server or new authority.

Root2 has not yet accepted or produced this contract's future artifacts. If its
existing release format cannot support the minimum fields, it must return the
precise producer delta; MCP cannot guess an actual receipt or replace it with
operator comments. No current values or live readiness are claimed by this file.
