# Dev Backend Runbook

Domain: `https://api-dev.xoery.art`

Host: `root@178.105.151.143`

Directory: `/opt/otr/dev-backend`

Service/container: `backend` / `otr-dev-backend`

Always pass `-f deploy/dev-backend/compose.yml`; without it, Compose may discover the
unrelated `/opt/otr` AI/media project.

## Check

```sh
curl --fail https://api-dev.xoery.art/health
ssh root@178.105.151.143
cd /opt/otr/dev-backend/source
docker compose -f deploy/dev-backend/compose.yml ps
curl --fail http://127.0.0.1:8787/health
```

## Operate Only This Service

```sh
docker compose -f deploy/dev-backend/compose.yml restart backend
docker compose -f deploy/dev-backend/compose.yml stop backend
docker compose -f deploy/dev-backend/compose.yml start backend
docker compose -f deploy/dev-backend/compose.yml logs --tail=100 backend
```

Expected server env names: `OTR_DEV_SUPABASE_URL`,
`OTR_DEV_SUPABASE_PUBLISHABLE_KEY`, `OTR_DEV_SUPABASE_SECRET_KEY`, and
`OTR_DEV_BACKEND_PORT`. Never print or commit their values.

## Update

Replace `/opt/otr/dev-backend/source` with a clean canonical source snapshot, then:

```sh
cd /opt/otr/dev-backend/source
docker compose -f deploy/dev-backend/compose.yml build backend
docker compose -f deploy/dev-backend/compose.yml up -d backend
curl --fail https://api-dev.xoery.art/health
```

Rollback by restoring the previous source snapshot and rebuilding only `backend`.
Do not reboot the host, run the root `/opt/otr` Compose project, or touch Production.
