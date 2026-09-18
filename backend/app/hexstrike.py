"""HTTP client for a HexStrike AI engine (https://github.com/0x4m4/hexstrike-ai).

HexStrike exposes a Flask REST API (default :8888) that wraps 150+ security
tools (nmap, nuclei, sqlmap, ...). Autopilot talks to it over HTTP and never
runs the tools itself. Endpoints used here:

    GET  /health                          -> which tools are installed
    POST /api/command   {command}         -> {stdout, stderr, return_code, success, ...}
    POST /api/tools/<t> {target, ...}     -> same result shape, per tool
    POST /api/intelligence/smart-scan {target, objective, max_tools}
"""
import logging

import httpx

from . import config

log = logging.getLogger("autopilot.hexstrike")


class HexStrikeError(Exception):
    pass


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if config.HEXSTRIKE_API_KEY:
        h["Authorization"] = f"Bearer {config.HEXSTRIKE_API_KEY}"
    return h


def _url(path: str) -> str:
    return f"{config.HEXSTRIKE_BASE_URL}{path}"


def health(timeout: int = 20) -> dict:
    """Return the engine's health/tool-availability report, or raise."""
    try:
        r = httpx.get(_url("/health"), headers=_headers(), timeout=timeout)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        raise HexStrikeError(
            f"HexStrike engine unreachable at {config.HEXSTRIKE_BASE_URL}: {e}"
        )


def _post(path: str, payload: dict, timeout: int | None = None) -> dict:
    try:
        r = httpx.post(
            _url(path), headers=_headers(), json=payload,
            timeout=timeout or config.HEXSTRIKE_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        raise HexStrikeError(f"HexStrike request to {path} failed: {e}")


def run_tool(tool: str, params: dict, timeout: int | None = None) -> dict:
    """POST /api/tools/<tool> and return the execution result."""
    return _post(f"/api/tools/{tool}", params, timeout=timeout)


def run_command(command: str, use_cache: bool = False, timeout: int | None = None) -> dict:
    """POST /api/command — run an arbitrary tool command on the engine host."""
    return _post("/api/command", {"command": command, "use_cache": use_cache}, timeout=timeout)


def smart_scan(target: str, objective: str = "comprehensive", max_tools: int = 5,
               timeout: int | None = None) -> dict:
    """POST /api/intelligence/smart-scan — let HexStrike pick and run tools."""
    return _post(
        "/api/intelligence/smart-scan",
        {"target": target, "objective": objective, "max_tools": max_tools},
        timeout=timeout,
    )
