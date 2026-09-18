# AI Server Autopilot

An AI-powered dashboard to monitor and manage a fleet of Linux servers. Log in, add your
servers (SSH creds + optional BMC), and it watches them, flags anomalies, gives per-server AI
advice, runs fixes on its own, and lets you operate everything from a chat box.

## What it does

- **Server CRUD** — add/edit/remove servers by IP + SSH (password or key) and BMC IP. Secrets
  are encrypted at rest.
- **Monitoring** — polls every server over SSH on an interval, records CPU/mem/disk/load/uptime,
  and logs anomalies (with auto-recovery) to the DB.
- **AI analysis** — per-server issues, personalized actions, and solutions with a health score,
  from a local OpenAI-compatible model.
- **Automations** — you define actions that run automatically on anomalies, optionally gated by
  the AI deciding if it's safe. Full run history.
- **Chat** — a tool-calling assistant that actually does things: create/delete users, set disk
  quotas, check uptime, restart services, run commands, shut down/reboot one or all servers,
  and kick off security scans. There's a global chat page and a chat box on each server's
  detail page (scoped to that server).
- **On-demand pentesting** — run security scans against your registered servers via
  [HexStrike AI](https://github.com/0x4m4/hexstrike-ai) (150+ tools). Recon / vulnerability /
  web / AI-smart profiles from each server's **Security** panel or the fleet-wide **Security**
  page; findings are parsed, stored, and shown by severity. Scans only ever target a
  registered server's stored IP.
- **High-priority servers** get their own section up top.
- Fully mobile responsive, light/dark.

## Stack

- **Frontend:** Next.js 14 (App Router) + Tailwind + shadcn-style UI, TypeScript
- **Backend:** FastAPI (Python 3.12), SQLAlchemy, Paramiko for SSH, JWT auth
- **DB:** MySQL (runs persistently on the host)
- **AI:** any OpenAI-compatible endpoint (analysis + chat)
- Everything runs in Docker; the frontend proxies `/api/*` to the backend.

## Run it

MySQL runs on the host; containers reach it via `host.docker.internal`.

```bash
cp .env.example .env    # fill in DB creds, secrets, and AI endpoint/key
docker compose up -d --build
```

- UI → http://localhost:3010
- API → http://localhost:8010/api/health

Default login is `admin` / `admin123` (change `ADMIN_PASSWORD` in `.env`). The DB schema and
admin user are created automatically on first boot.

### Pentesting on demand

Pentesting is **off by default**. To enable it:

1. Set `PENTEST_ENABLED=true` in `.env`.
2. Provide a HexStrike AI engine (it runs the actual security tools):
   - **Bundled (self-contained):** `docker compose --profile pentest up -d --build` — builds a
     Kali-based image (`hexstrike/Dockerfile`) with the core tools and starts it as the
     `hexstrike` service. The backend reaches it at `http://hexstrike:8888` (the default).
   - **External:** run HexStrike on a dedicated scanner host and set
     `HEXSTRIKE_BASE_URL=http://<host>:8888`.

Then open any server → **Security** panel and run a scan, use the fleet-wide **Security**
page, or ask Clawdbot ("run a vuln scan on web01"). Scans target only the registered
server's stored IP. Intrusive/exploitation profiles stay disabled unless you also set
`PENTEST_ALLOW_AGGRESSIVE=true` and confirm per-scan.

> Only scan servers you are authorized to test. The credentials you store per server are
> what establish that authorization; the tool will not scan arbitrary hosts.

## Config (`.env`)

Key vars: `DB_*` (host MySQL), `SECRET_KEY` / `ENCRYPTION_KEY`, `ADMIN_*`, monitoring thresholds
(`CPU/MEM/DISK/LOAD_*`), `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` (case-sensitive),
`CLAWDBOT_*` for the chat backend, and `PENTEST_ENABLED` / `HEXSTRIKE_BASE_URL` /
`PENTEST_ALLOW_AGGRESSIVE` for pentesting. See `.env.example`.

## Layout

```
backend/    FastAPI app (auth, servers, events, automations, chat, pentest, monitor, ssh, ai)
frontend/   Next.js app (dashboard, servers, server detail + chat, events, automations, security, chat)
hexstrike/  Optional Dockerfile for the bundled HexStrike AI pentesting engine
docker-compose.yml
```
