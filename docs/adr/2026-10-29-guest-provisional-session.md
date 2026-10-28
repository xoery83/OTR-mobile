# Guest verification credentials remain in the existing Session authority

Status: default-unwired persistence candidate; no Provider or launch consumer activation.

AUTH requires provisional verification before adoption and restart recovery during
transfer. A verified Provider Session must not make the Guest an active Account or
start Account cache/sync. Keep the one existing Auth repository and canonical
per-Account secure credential key; never put credentials in adoption JSON/SQLite,
copy another App's Keychain or introduce a second Session store/authority.

Add a small secure metadata binding (Guest/adoption/target UUID and persistence
phase) before writing a newly verified Session into its existing per-Account key.
No Account index, legacy Session or launch marker is installed/changed. The normal
Guest installation guard remains. Existing unbound credential slots are collisions,
not credentials to reuse or overwrite. Refreshed writes need the previous refresh
token CAS; scope/generation and JWT subject must match before/after persistence.

Internal trusted-adapter revocation now marks credentials for normal current-session server revocation; it
does not cancel a protected business publication. The adoption coordinator must
still query server commit status once publication was requested. Only after the
normal revocation acknowledgment may the repository clear the bound credential;
record that acknowledgment before deletion so interrupted cleanup is recoverable.
No global sign-out, Account deletion, key reset or irreversible recovery policy.

This source slice supplies secure persistence ports only, not the Provider/refresh/
revocation caller or adoption activation. It stores real normal Provider results
when wired; unit JWT fixtures certify binding logic only, never real login. No
normal Account session behavior or business permission/entitlement is changed.

Implemented internal ports are store/read/revoke. PERSISTING and READY bind
credentials; REVOKING and REVOKED track current-login revocation. They
are exposed by the existing Auth repository for internal composition, not by the
default Native Auth module. No caller may enable this flow until the real Provider revocation adapter, business cancellation and
publication-status recovery are wired and independently accepted.

Metadata pins the canonical credential SHA256, plus the explicitly bound previous
SHA256 only while a refresh write is PERSISTING. READY accepts only the current
pin; a pending empty slot cannot accept an unrelated new same-Account Session.
Recovering a matching cached credential is not server validation or permission to
publish. The normal Provider/refresh path must establish that authority separately.

Revocation invokes the trusted normal current-login adapter outside the apply gate.
Only an acknowledgment permits a durable REVOKED marker, followed by deletion of
that exact fingerprint-bound slot. UNKNOWN retains REVOKING and blocks refresh;
resumed acknowledged cleanup never repeats server revocation. In-flight calls on
the same storage/binding coalesce across repository instances. New attempts need a
new adoption ID after acknowledged cleanup; old callbacks cannot delete new tokens.
No adapter may treat a timeout or arbitrary authentication error as acknowledgment.
This does not cancel or query a business publication and grants no new authority.
