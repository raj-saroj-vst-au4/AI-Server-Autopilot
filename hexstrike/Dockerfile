# Optional HexStrike AI engine for on-demand pentesting.
# Heavy image (Kali + security tools) — only built when you opt in with:
#   docker compose --profile pentest up -d --build
#
# It bundles the core CLI tools autopilot's scan profiles use (recon/vuln/web/
# smart). Binary-analysis extras (angr, pwntools) are intentionally omitted to
# keep the build tractable; add them here if you need those HexStrike endpoints.
FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive

# The default http.kali.org redirector round-robins to community mirrors, some
# of which have broken TLS certs or dead DNS and fail package downloads. Recent
# Kali images declare the repo in /etc/apt/sources.list.d/kali.sources, so we
# remove that and pin to Kali's official Cloudflare CDN (kali.download) — a
# single reliable endpoint. We use plain HTTP because this host's network breaks
# TLS cert verification to the mirrors; apt still verifies the repo's GPG
# signature, so package integrity is preserved. Retries cover transient hiccups.
RUN echo 'Acquire::Retries "8";' > /etc/apt/apt.conf.d/80-retries \
    && rm -f /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list \
    && printf 'deb http://kali.download/kali kali-rolling main contrib non-free non-free-firmware\n' \
        > /etc/apt/sources.list

# Core CLI security tools + the Python runtime and libraries the HexStrike API
# server imports at boot (flask/psutil/requests/aiohttp/bs4/selenium/mitmproxy).
# Kali ships Python 3.14, which lacks prebuilt wheels for mitmproxy's native
# deps (cffi/zstandard/cryptography), so we install those from apt (prebuilt)
# rather than compiling them with pip. `python3-venv` provides the stdlib `venv`
# module the server imports.
RUN for i in 1 2 3 4 5 6; do apt-get update && break || { echo "apt update retry $i"; sleep 15; }; done \
    && apt-get install -y --no-install-recommends \
        git ca-certificates curl \
        python3 python3-venv \
        python3-flask python3-psutil python3-requests python3-aiohttp \
        python3-bs4 python3-selenium mitmproxy \
        nmap masscan gobuster ffuf nikto sqlmap nuclei whatweb dnsutils \
    && rm -rf /var/lib/apt/lists/*

# httpx (ProjectDiscovery) ships as a separate Kali package; best-effort. Its
# binary is named httpx-toolkit, so symlink it to `httpx` where both HexStrike's
# tool detection and the web scan profile expect it.
RUN for i in 1 2 3 4 5 6; do apt-get update && break || { echo "apt update retry $i"; sleep 15; }; done \
    && (apt-get install -y --no-install-recommends httpx-toolkit || true) \
    && { [ -x /usr/bin/httpx-toolkit ] && ln -sf /usr/bin/httpx-toolkit /usr/bin/httpx || true; } \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone --depth=1 https://github.com/0x4m4/hexstrike-ai.git
WORKDIR /opt/hexstrike-ai

ENV HEXSTRIKE_PORT=8888
EXPOSE 8888

# Health: the engine exposes GET /health once up.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8888/health >/dev/null || exit 1

CMD ["python3", "hexstrike_server.py", "--port", "8888"]
