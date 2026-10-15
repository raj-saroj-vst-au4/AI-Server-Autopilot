# Single-container ("monolith") image for the Autopilot core app:
# MariaDB + FastAPI backend + Next.js frontend + nginx, run by supervisord, and
# the docker CLI so the backend can spin pentest-engine containers up/down on the
# mounted host socket. Served under /autopilot on port 80.
#
# Build context is the repo root:  docker compose build   (see docker-compose.yml)

# ---- 1. build the frontend (standalone, under basePath /autopilot) ----
FROM node:22-slim AS fe
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_BASE_PATH=/autopilot \
    BACKEND_URL=http://127.0.0.1:8000
RUN npm run build

# ---- 2. the monolith ----
FROM node:22-slim
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip gcc \
      mariadb-server mariadb-client \
      nginx supervisor curl ca-certificates gnupg procps \
    && rm -rf /var/lib/apt/lists/*
# docker CLI + compose plugin — used at runtime against the mounted host socket
RUN install -m0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# backend (into a venv; bookworm is PEP-668 externally-managed)
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /app/requirements.txt
COPY backend/app /app/app

# frontend standalone output
COPY --from=fe /fe/.next/standalone /app/frontend
COPY --from=fe /fe/.next/static /app/frontend/.next/static
COPY --from=fe /fe/public /app/frontend/public

# service config
COPY deploy/nginx.conf /etc/nginx/sites-available/default
COPY deploy/supervisord.conf /etc/supervisor/conf.d/autopilot.conf
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# pentest-engine compose files, driven at runtime via the mounted docker socket
COPY deploy/engines /app/engines

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD curl -fs http://127.0.0.1/autopilot/api/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]
