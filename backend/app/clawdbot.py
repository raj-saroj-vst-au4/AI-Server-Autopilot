"""Clawdbot chat orchestration: an OpenAI-compatible tool-calling loop that
lets the admin get things done in natural language."""
import json
import logging

import httpx

from . import config, tools

log = logging.getLogger("autopilot.clawdbot")

SYSTEM_PROMPT = """You are Clawdbot, an operations assistant for a server fleet.
You can inspect and manage Linux servers through the provided tools: check uptime and
metrics, create/delete users, set disk quotas, restart services, run commands, shut
down or reboot servers (individually or the whole fleet), and run on-demand security
scans (pentests) against registered servers via HexStrike AI.

Guidelines:
- Use tools to actually perform requested actions; don't just describe them.
- For destructive actions (shutdown, reboot, delete user, fleet-wide shutdown), briefly
  confirm intent in your reply, but if the user clearly asked for it, proceed.
- shutdown_all_servers requires confirm=true — set it when the user clearly wants all
  servers shut down.
- Pentests: use run_pentest to start a scan (profiles: recon, vuln, web, smart). It runs
  in the background, so tell the user it started and use get_pentest_result to fetch
  findings. Scans only target registered servers. The 'exploit' profile is intrusive and
  needs confirm=true.
- When a server isn't specified for an action that needs one, ask which server.
- Be concise. Report exactly what happened, including any errors returned by tools."""

_model_cache: str | None = None


class ClawdbotError(Exception):
    pass


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if config.CLAWDBOT_API_KEY:
        h["Authorization"] = f"Bearer {config.CLAWDBOT_API_KEY}"
    return h


def _resolve_model() -> str:
    global _model_cache
    if config.CLAWDBOT_MODEL:
        return config.CLAWDBOT_MODEL
    if _model_cache:
        return _model_cache
    try:
        r = httpx.get(f"{config.CLAWDBOT_BASE_URL}/models", headers=_headers(), timeout=15)
        r.raise_for_status()
        data = r.json().get("data", [])
        if data:
            _model_cache = data[0]["id"]
            return _model_cache
    except Exception as e:
        raise ClawdbotError(f"Could not reach Clawdbot to list models: {e}")
    raise ClawdbotError("Clawdbot returned no models; set CLAWDBOT_MODEL")


def _completion(messages: list[dict]) -> dict:
    payload = {
        "model": _resolve_model(),
        "messages": messages,
        "tools": tools.TOOLS,
        "tool_choice": "auto",
        "temperature": 0.3,
    }
    try:
        r = httpx.post(
            f"{config.CLAWDBOT_BASE_URL}/chat/completions",
            headers=_headers(),
            json=payload,
            timeout=config.CLAWDBOT_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]
    except httpx.HTTPError as e:
        raise ClawdbotError(f"Clawdbot request failed: {e}")


def run_turn(db, history: list[dict], extra_system: str | None = None) -> list[dict]:
    """Given prior chat history (list of role/content dicts), drive the tool loop.
    Returns the list of NEW messages produced this turn (assistant + tool messages).
    extra_system, if given, is appended to the system prompt (e.g. per-server context)."""
    system = SYSTEM_PROMPT + (f"\n\n{extra_system}" if extra_system else "")
    messages = [{"role": "system", "content": system}] + history
    produced: list[dict] = []

    for _ in range(config.CHAT_MAX_TOOL_ROUNDS):
        msg = _completion(messages)
        assistant_msg = {"role": "assistant", "content": msg.get("content") or ""}
        tool_calls = msg.get("tool_calls") or []
        if tool_calls:
            assistant_msg["tool_calls"] = tool_calls
        messages.append(assistant_msg)
        produced.append(assistant_msg)

        if not tool_calls:
            break

        for tc in tool_calls:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            result = tools.call(db, name, args)
            tool_msg = {
                "role": "tool",
                "tool_call_id": tc.get("id"),
                "name": name,
                "content": result,
            }
            messages.append(tool_msg)
            produced.append(tool_msg)
    return produced
