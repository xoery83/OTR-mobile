# Actor-visible conditional Core read consumer — local candidate

The only Golden Slice is the existing foreground Downstream read: an injected
owning version reader compares the current authorized visible collection with an
already Accepted Core certificate. If unchanged, skip the full collection. If
changed, use the existing collection → Repository refresh → notification path.
No injected reader means the existing full Pull is unchanged.

`CoreVisibleVersionRead(context, accepted)` is a trusted in-process owning port,
not an HTTP API or evidence of authorization. Its adapter must authorize the
current Account/Actor/Trip and evaluate item visibility before returning. The
stamp includes epoch/revision/accessRevision/roster/Actor binding/order version;
matching a Trip-global counter alone is prohibited. `unchanged` is a conditional
comparison against that complete supplied stamp. The returned context and
compared stamp must match the frozen request exactly. Request generation is
local binding and grants no server rights.

The consumer rechecks the real Account-scoped Accepted snapshot after the read.
A response about an old snapshot cannot suppress a Pull after a concurrent
Accepted receipt. Errors, denial and malformed responses remain failed reads
under the existing coordinator backoff; they do not imply revoked access,
reauthentication, SQLite deletion or completion of Pending/UNKNOWN. No token is
stored or advanced: the existing accepted certificate advances only through
existing validated Core apply. A first read without a certificate uses full Pull.

The default port is absent. Formal authorized server comparison, post-COMMIT
publisher and revocable private subscription remain Auth/Core owning gaps. This
candidate adds no endpoint, schema, permission, provider call or timer.
