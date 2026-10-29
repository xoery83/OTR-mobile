# PDF V2 Source HTTP adapter — default-closed candidate

`sourcePdfV2Boundary` prepares normal-authenticated
`POST /v2/trips/:tripId/sources/pdf-v2/{verify-original,register-derived,seal}`
for the existing Source verification command and version-2 registration/seal
requests. It accepts bounded metadata JSON only, never a file path, URL, worker
image, provider choice or arbitrary execution command. The enclosing Backend
validates bearer identity; the adapter checks current Trip access, binds that
Actor/Trip to the existing owning PDF ports, and retains private/no-store replies.
Omitted ports return SOURCE_CAPABILITY_CLOSED before reading the body. The normal Backend router performs bearer Auth and delegates the three exact routes,
but its optional PDF port is absent by default. No parser deployment, worker/runtime
composition, SQL/profile activation or Source/Task/
Admission permission is introduced by the adapter alone. Existing /1 and UTF8
Source paths remain unchanged. Protected PDF execution/eligibility requires its
separate exact packet; HTTP success is not Core Admission or Save.

Status: LOCAL_PASS only. Boundary/owning suites33PASS; parent Backend Auth routing plus app regression69PASS. Types/scoped lint and capture Backend bundle PASS. Parent routing is default-closed; no worker/runtime startup composition, deployment, SQL/profile activation or Core Save claimed. Shared API_CONTRACT entry waits for Native's current Writer window.
