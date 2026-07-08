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
  quotas, check uptime, restart services, run commands, shut down/reboot one or all servers.
  There's a global chat page and a chat box on each server's detail page (scoped to that server).
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

## Config (`.env`)

Key vars: `DB_*` (host MySQL), `SECRET_KEY` / `ENCRYPTION_KEY`, `ADMIN_*`, monitoring thresholds
(`CPU/MEM/DISK/LOAD_*`), `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` (case-sensitive), and
`CLAWDBOT_*` for the chat backend. See `.env.example`.

## Layout

```
backend/    FastAPI app (auth, servers, events, automations, chat, monitor, ssh, ai)
frontend/   Next.js app (dashboard, servers, server detail + chat, events, automations, chat)
docker-compose.yml
```
