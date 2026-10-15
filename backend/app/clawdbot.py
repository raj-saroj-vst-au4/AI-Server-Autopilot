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


# Friendly names for the chat/tool-capable models we surface in the picker.
# We only offer the ones the endpoint actually lists (see list_models).
CURATED_MODELS: dict[str, str] = {
    "moonshotai/kimi-k3": "Kimi K3",
    "moonshotai/kimi-k2.6": "Kimi K2.6",
    "z-ai/glm-5.3": "GLM 5.3",
    "z-ai/glm-5.3-flash": "GLM 5.3 Flash",
    "deepseek-ai/deepseek-v4-flash-0731": "DeepSeek V4 Flash",
    "nvidia/nemotron-3-super-120b-a12b": "Nemotron 3 Super 120B",
    "nvidia/nemotron-3.5-lightning-30b-a3b": "Nemotron 3.5 Lightning 30B",
    "nvidia/nemotron-nano-3-30b-a3b": "Nemotron Nano 3 30B",
    "nvidia/llama-3.1-nemotron-70b-instruct": "Llama 3.1 Nemotron 70B",
    "openai/gpt-oss-20b": "GPT-OSS 20B",
    "mistralai/mistral-large-2-instruct": "Mistral Large 2",
}

_catalog_cache: tuple[float, list[str]] | None = None


def _catalog_ids() -> list[str]:
    """Model ids the endpoint currently advertises, cached for 5 minutes."""
    global _catalog_cache
    import time
    now = time.time()
    if _catalog_cache and now - _catalog_cache[0] < 300:
        return _catalog_cache[1]
    r = httpx.get(f"{config.CLAWDBOT_BASE_URL}/models", headers=_headers(), timeout=15)
    r.raise_for_status()
    ids = [m["id"] for m in r.json().get("data", []) if m.get("id")]
    _catalog_cache = (now, ids)
    return ids


def list_models() -> list[dict]:
    """Selectable chat models: our curated set intersected with what the
    endpoint advertises, with the active default flagged. Falls back to the
    configured model alone if the catalog can't be reached."""
    default = config.CLAWDBOT_MODEL
    try:
        available = set(_catalog_ids())
    except Exception as e:
        raise ClawdbotError(f"Could not list models: {e}")
    out = [
        {"id": mid, "label": label, "default": mid == default}
        for mid, label in CURATED_MODELS.items()
        if mid in available
    ]
    # Make sure the configured default is always selectable, even if not curated.
    if default and not any(m["id"] == default for m in out):
        out.insert(0, {"id": default, "label": default, "default": True})
    return out


def _resolve_model(override: str | None = None) -> str:
    global _model_cache
    if override:
        return override
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


def _completion(messages: list[dict], model: str | None = None) -> dict:
    payload = {
        "model": _resolve_model(model),
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


def run_turn(db, history: list[dict], extra_system: str | None = None,
             model: str | None = None) -> list[dict]:
    """Given prior chat history (list of role/content dicts), drive the tool loop.
    Returns the list of NEW messages produced this turn (assistant + tool messages).
    extra_system, if given, is appended to the system prompt (e.g. per-server context).
    model, if given, overrides the configured default for this turn."""
    system = SYSTEM_PROMPT + (f"\n\n{extra_system}" if extra_system else "")
    messages = [{"role": "system", "content": system}] + history
    produced: list[dict] = []

    for _ in range(config.CHAT_MAX_TOOL_ROUNDS):
        msg = _completion(messages, model)
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
