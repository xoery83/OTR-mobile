# Realtime client fixture slice — Photo Focus

Golden Slice: a foreground Account/Trip context activates the existing trigger;
a qualified, injected private hint invokes existing Downstream invalidation →
authorized Pull → normal notification. Repeated hints coalesce. Background/exit,
Account generation or Trip changes cancel pending hints and close the old channel.
Reconnect activates a fresh authorized subscription and performs the existing
initial catch-up Pull, covering hints missed while disconnected.

Keep the existing optional subscription port absent by default: no network
subscription, Publisher, Gate, version endpoint or Backend deployment is enabled.
Owning adapter must authorize, expire/revoke, honor abort and validate hints.
Known Trip UUID/404/channel join is not revoke proof. This is an isolated client
fixture result, not physical/Backend/private multiplayer Realtime PASS.

First bounded failures to verify: repeat activation of the same current context
reopens the channel; short spaced hint bursts can produce multiple fast Pulls.
Reuse the current trigger, 15-second opening deadline, Account generation fences
and Downstream backoff. Add a fixed short coalescing timer, canceled at stop; no
new Queue, persistent cache, parser, Provider, retry engine or configurable knobs.
Native mounting and foreground low-frequency version activation remain separate
until the missing authorized private/version ports and performance qualify.

Only Native-owned trigger/tests and this handoff change. No Auth/Profile/Nav/
Bootstrap/SQLite registry/main/DEV/Provider/AD5/DeviceHub operation in this slice.
