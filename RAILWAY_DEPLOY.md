# Railway Deployment — Pach

End-to-end playbook for deploying Pach to Railway. Mirrors the Ardia setup: one
Railway project, one GitHub repo (`axelpach/pach`), four services.

```
Railway Project: pach
├── postgres   (custom Docker service — needs wal_level=logical for Zero)
├── zero       (Railway-UI-only, official rocicorp image)
├── server     (NIXPACKS, server/nixpacks.toml)
└── portal     (DOCKERFILE, portal/Dockerfile)
```

Custom domain: `pach.mx` (portal), `api.pach.mx` (server).

---

## 1. One-time prerequisites

- Railway account with the GitHub `axelpach/pach` repo connected.
- Doppler project `pach-server`, config `prd` (you already have `dev`). Mirror
  every var from `dev` and override the `localhost` ones.
- `pach.mx` DNS managed somewhere you can add CNAME records.

Create a new Railway **project** named `pach`. All four services live inside it.

---

## 2. Service: `postgres`

Railway's managed Postgres plugin **does not expose `wal_level=logical`**, which
Zero requires. So we run our own Postgres container — same image and flags as
`docker-compose.yml`.

1. **New service → Empty service**, name it `postgres`.
2. **Settings → Source → Image** → `postgres:16`.
3. **Settings → Deploy → Custom Start Command**:
   ```
   docker-entrypoint.sh postgres -c wal_level=logical -c max_wal_senders=10 -c max_replication_slots=10
   ```
4. **Variables**:
   ```
   POSTGRES_USER=pach
   POSTGRES_PASSWORD=<generate strong>
   POSTGRES_DB=pach
   PGDATA=/var/lib/postgresql/data/pgdata
   ```
5. **Settings → Volumes** → mount `/var/lib/postgresql/data`.
6. **Settings → Networking** → enable a private TCP port on `5432`. No public
   port (only `server` and `zero` need to reach it).

Once running, capture the internal URL:
`postgres://pach:<password>@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/pach`

> **Alternative if you don't need self-managed:** the Railway Postgres plugin
> works for everything *except* Zero replication. Acceptable if you decide to
> deploy Zero against a separate replica later. For now, self-host.

---

## 3. Service: `zero`

Mirrors how Ardia deploys Zero — no files in the repo, configured in Railway UI.

1. **New service → Empty service**, name it `zero`.
2. **Settings → Source → Image** → `rocicorp/zero-cache:0.24` (pin to the same
   minor as the `@rocicorp/zero` server dep — currently `^0.24.3000000000`).
3. **Variables**:
   ```
   ZERO_UPSTREAM_DB=postgres://pach:<password>@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/pach
   ZERO_REPLICA_FILE=/data/pach-zero-replica.db
   ZERO_AUTH_SECRET=<generate strong>
   ZERO_PUSH_URL=https://api.pach.mx/zero/push
   PORT=4848
   ZERO_LOG_LEVEL=info
   ```
4. **Settings → Volumes** → mount `/data` (replica file lives here).
5. **Settings → Networking** → expose public TCP/HTTP on `4848`. Note the
   public URL — `portal` needs it as `VITE_ZERO_SERVER_URL`.
6. Make sure `postgres` is `wal_level=logical` and reachable **before** zero
   first starts; otherwise the replication slot creation fails.

---

## 4. Service: `server`

NIXPACKS via `server/nixpacks.toml` (already in repo). The toml escapes to
the monorepo root for `pnpm install` and uses `pnpm db:migrate && start`.

1. **New service → Deploy from GitHub** → select `axelpach/pach`.
2. **Settings → Source → Root Directory** → `server`.
3. Railway picks up `server/railway.json` + `server/nixpacks.toml` automatically.
4. **Variables** (sync via the Railway ↔ Doppler integration; pull from
   `pach-server / prd`):
   ```
   PORT=3002
   DATABASE_URL=postgres://pach:<password>@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/pach
   ZERO_UPSTREAM_DB=postgres://pach:<password>@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/pach
   ZERO_AUTH_SECRET=<same as zero service>
   ARDIA_KAPSO_API_KEY=...
   ARDIA_WHATSAPP_PHONE_NUMBER_ID=...
   ARDIA_WHATSAPP_BUSINESS_ACCOUNT_ID=...
   WHATSAPP_VERIFY_TOKEN=<generate strong, NOT the dev token>
   ```
5. **Settings → Networking** → public domain. Add custom domain `api.pach.mx`
   (CNAME to the Railway-provided hostname).
6. **Settings → Deploy → Healthcheck Path** is `/health` (already in
   `railway.json`).

**Migration runs on every deploy** (`pnpm db:migrate && pnpm --filter server start`).
For the very first deploy, point migrations at the prod DB and let the boot
take care of it.

---

## 5. Service: `portal`

DOCKERFILE at `portal/Dockerfile`. Vite needs `VITE_*` env vars baked in at
**build time**, so they're declared as `ARG`/`ENV` in the Dockerfile and must
be set in Railway as build-time variables.

1. **New service → Deploy from GitHub** → select `axelpach/pach`.
2. **Settings → Source → Root Directory** → `portal`.
3. Railway picks up `portal/railway.json` + `portal/Dockerfile`.
4. **Build-time variables** (Railway: Variables tab, set them — Railway passes
   them as `ARG`s to the Dockerfile):
   ```
   VITE_ZERO_SERVER_URL=https://<zero-public-domain>
   VITE_API_URL=https://api.pach.mx
   ```
5. **Runtime variables**:
   ```
   PORT=4173
   ```
6. **Networking** → public domain. Add custom domain `pach.mx` (CNAME).

> If you change a `VITE_*` var, you must **redeploy** (Vite bakes them at build
> time; runtime changes don't apply).

---

## 6. Doppler integration

Railway has a first-class Doppler integration. Per service:

- **server** ↔ Doppler `pach-server / prd` (the WhatsApp + auth secrets live here)
- **zero** ↔ same Doppler config (it shares `ZERO_AUTH_SECRET`, `ZERO_UPSTREAM_DB`)
- **portal** ↔ no Doppler needed (only public `VITE_*` vars, set directly)
- **postgres** ↔ no Doppler needed (only its own `POSTGRES_*` creds)

Connect via Railway → Service → Variables → "Add Integration" → Doppler.

---

## 7. Migrate local DB to prod (one-time)

Once `postgres` is running:

```bash
# On your laptop, dump local DB
pg_dump --no-owner --no-acl postgres://pach:pach@localhost:5435/pach > pach.sql

# Get prod URL — temporarily expose postgres publicly OR use Railway's
# proxy (Settings → Networking → "Generate TCP Proxy Domain")
psql postgres://pach:<password>@<railway-proxy>:<port>/pach -f pach.sql

# Then disable the public TCP proxy
```

Verify rows landed (1 company `Ardia`, 16 templates, 36 CRM companies, 13
contacts).

---

## 8. Wire the Meta webhook (after deploy)

Only relevant once you add the new marketing WABA (handoff step 7), but once
`api.pach.mx` is live:

- Webhook URL: `https://api.pach.mx/whatsapp/webhook`
- Verify token: `WHATSAPP_VERIFY_TOKEN` env var (the strong one, not the dev
  token)
- Subscribe to: `messages`, `message_template_status_update`

> TODO: implement `X-Hub-Signature-256` verification in `server/src/services/whatsapp/webhook.ts`
> before exposing the webhook publicly. Current code accepts unsigned payloads.

---

## 9. Service URL cheatsheet (post-deploy)

| Service | Internal | Public |
|---|---|---|
| postgres | `${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432` | (none, or temporary proxy) |
| zero | `${{zero.RAILWAY_PRIVATE_DOMAIN}}:4848` | `https://<railway-zero-domain>` |
| server | `${{server.RAILWAY_PRIVATE_DOMAIN}}:3002` | `https://api.pach.mx` |
| portal | — | `https://pach.mx` |

---

## 10. Deploy order (first-time)

1. `postgres` — must be running with `wal_level=logical` before anything else.
2. Run the SQL dump from §7.
3. `zero` — needs Postgres reachable to create the replication slot on first boot.
4. `server` — runs `db:migrate` on boot (idempotent if you already imported).
5. `portal` — needs `VITE_ZERO_SERVER_URL` from §3 and `VITE_API_URL` from §4
   to bake into the bundle.
6. Add custom domains last, after each service's Railway-generated URL is healthy.
