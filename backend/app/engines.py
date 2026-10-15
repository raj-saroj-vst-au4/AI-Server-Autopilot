"""Pentest engine lifecycle.

A single global switch selects the active engine (hexstrike | pentagi). Admins
start and stop the engine's containers from the UI; we drive them with
`docker compose` against the mounted host Docker socket. The UI polls status()
to show a live loader while containers are coming up.
"""
import logging
import subprocess

import httpx

from . import config, hexstrike, models

log = logging.getLogger("autopilot.engines")

PROVIDER_KEY = "pentest_provider"

# Each engine: the compose file (baked into the image under /app/engines), the
# compose project name, and the container names we expect to be running.
ENGINES: dict[str, dict] = {
    "hexstrike": {
        "label": "HexStrike AI",
        "compose": "/app/engines/hexstrike.yml",
        "project": "hexstrike",
        "containers": ["hexstrike"],
    },
    "pentagi": {
        "label": "PentAGI",
        "compose": "/app/engines/pentagi/docker-compose.yml",
        "env_file": "/app/engines/pentagi/pentagi.env",
        "project": "pentagi",
        "containers": ["pentagi", "pgvector", "scraper"],
    },
}


# ---- global provider setting (runtime, DB-backed) -------------------------

def get_provider(db) -> str:
    row = db.get(models.Setting, PROVIDER_KEY)
    p = (row.value if row else config.PENTEST_PROVIDER or "pentagi").lower()
    return p if p in ENGINES else "pentagi"


def set_provider(db, p: str) -> str:
    p = (p or "").lower()
    if p not in ENGINES:
        raise ValueError(f"unknown engine '{p}'")
    row = db.get(models.Setting, PROVIDER_KEY)
    if row:
        row.value = p
    else:
        db.add(models.Setting(key=PROVIDER_KEY, value=p))
    db.commit()
    return p


# ---- docker / compose helpers ---------------------------------------------

def _docker(*args, timeout=600) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout)


def _compose(prov: str, *args, timeout=600) -> subprocess.CompletedProcess:
    e = ENGINES[prov]
    base = ["compose", "-p", e["project"], "-f", e["compose"]]
    if e.get("env_file"):
        base += ["--env-file", e["env_file"]]
    return _docker(*base, *args, timeout=timeout)


def _running_count(prov: str) -> tuple[int, int]:
    """(running, expected) engine containers."""
    e = ENGINES[prov]
    running = 0
    for name in e["containers"]:
        r = _docker("inspect", "-f", "{{.State.Running}}", name, timeout=15)
        if r.returncode == 0 and r.stdout.strip() == "true":
            running += 1
    return running, len(e["containers"])


def _reachable(prov: str) -> bool:
    try:
        if prov == "hexstrike":
            hexstrike.health(timeout=5)
            return True
        if prov == "pentagi":
            # Self-signed TLS; any HTTP answer means the API is up.
            httpx.get(config.PENTAGI_BASE_URL, timeout=5, verify=config.PENTAGI_VERIFY_SSL)
            return True
    except Exception:
        return False
    return False


# ---- public API -----------------------------------------------------------

def status(prov: str) -> dict:
    running, total = _running_count(prov)
    if running == 0:
        state = "stopped"
    elif running < total:
        state = "starting"
    else:
        state = "running" if _reachable(prov) else "starting"
    return {
        "provider": prov,
        "label": ENGINES[prov]["label"],
        "containers_running": running,
        "containers_total": total,
        "state": state,
        "reachable": state == "running",
    }


def start(prov: str) -> None:
    """Bring the engine's containers up (blocking — run in a background thread)."""
    log.info("engine %s: docker compose up", prov)
    r = _compose(prov, "up", "-d", timeout=1200)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[:800] or "compose up failed")


def stop(prov: str) -> None:
    log.info("engine %s: docker compose down", prov)
    r = _compose(prov, "down", timeout=300)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[:800] or "compose down failed")
