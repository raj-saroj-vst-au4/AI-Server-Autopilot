# Optional HexStrike AI engine for on-demand pentesting.
# Heavy image (Kali + security tools) — only built when you opt in with:
#   docker compose --profile pentest up -d --build
#
# It bundles the core CLI tools autopilot's scan profiles use (recon/vuln/web/
# smart). Binary-analysis extras (angr, pwntools) are intentionally omitted to
# keep the build tractable; add them here if you need those HexStrike endpoints.
FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive

# Core CLI security tools (nmap/nuclei/sqlmap/ffuf/gobuster/...) + python runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates curl \
        python3 python3-pip python3-venv \
        nmap masscan gobuster ffuf nikto sqlmap nuclei whatweb dnsutils \
    && rm -rf /var/lib/apt/lists/*

# httpx (ProjectDiscovery) ships as a separate Kali package; best-effort.
RUN apt-get update \
    && (apt-get install -y --no-install-recommends httpx-toolkit || true) \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone --depth=1 https://github.com/0x4m4/hexstrike-ai.git
WORKDIR /opt/hexstrike-ai

# Only the deps the API server imports at boot, plus common web deps. This skips
# angr/pwntools from the upstream requirements.txt (multi-GB, slow to build).
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
        "flask>=2.3,<4" "requests>=2.31,<3" "psutil>=5.9,<6" \
        "beautifulsoup4>=4.12,<5" "aiohttp>=3.8,<4" \
        "selenium>=4.15,<5" "webdriver-manager>=4,<5" "mitmproxy>=9,<11"

ENV HEXSTRIKE_PORT=8888
EXPOSE 8888

# Health: the engine exposes GET /health once up.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8888/health >/dev/null || exit 1

CMD ["/opt/venv/bin/python", "hexstrike_server.py", "--port", "8888"]
