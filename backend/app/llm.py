"""LLM server lifecycle.

The model runs as a container (vLLM) on another fleet host. We show live status
(by probing its OpenAI-compatible endpoint) and let admins start/stop the
container over SSH using the host's stored fleet credentials.
"""
import logging

import httpx
from sqlalchemy import select

from . import config, models, ssh

log = logging.getLogger("autopilot.llm")


def _host(db):
    return db.scalars(
        select(models.Server).where(models.Server.ip == config.LLM_HOST_IP)
    ).first()


def _key() -> str:
    return config.LLM_API_KEY or config.CLAWDBOT_API_KEY or ""


def reachable() -> tuple[bool, str | None]:
    """Is the model endpoint answering? Returns (up, model_id)."""
    try:
        headers = {"Authorization": f"Bearer {_key()}"} if _key() else {}
        r = httpx.get(config.LLM_STATUS_URL, headers=headers, timeout=5)
        if r.status_code == 200:
            data = r.json().get("data", [])
            return True, (data[0]["id"] if data else None)
    except Exception:
        pass
    return False, None


def container_running(db) -> bool | None:
    """True/False if we could check over SSH, None if the host/SSH is unavailable."""
    s = _host(db)
    if not s:
        return None
    try:
        rc, out, _ = ssh.run(
            s, f"docker inspect -f '{{{{.State.Running}}}}' {config.LLM_CONTAINER}", timeout=20
        )
        return out.strip() == "true" if rc == 0 else False
    except Exception as e:  # noqa: BLE001
        log.warning("llm container check failed: %s", e)
        return None


def status(db) -> dict:
    up, model = reachable()
    s = _host(db)
    return {
        "host": config.LLM_HOST_IP,
        "host_name": s.name if s else None,
        "container": config.LLM_CONTAINER,
        "reachable": up,
        "model": model,
        "container_running": container_running(db),
    }


def start(db) -> None:
    s = _host(db)
    if not s:
        raise RuntimeError(f"No fleet server registered with IP {config.LLM_HOST_IP}")
    rc, out, err = ssh.run(s, f"docker start {config.LLM_CONTAINER}", timeout=30)
    if rc != 0:
        raise RuntimeError((err or out).strip()[:400] or "docker start failed")
    log.info("llm container %s started on %s", config.LLM_CONTAINER, s.name)


def stop(db) -> None:
    s = _host(db)
    if not s:
        raise RuntimeError(f"No fleet server registered with IP {config.LLM_HOST_IP}")
    rc, out, err = ssh.run(s, f"docker stop {config.LLM_CONTAINER}", timeout=60)
    if rc != 0:
        raise RuntimeError((err or out).strip()[:400] or "docker stop failed")
    log.info("llm container %s stopped on %s", config.LLM_CONTAINER, s.name)
