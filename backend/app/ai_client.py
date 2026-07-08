"""Client for the locally hosted OpenAI-compatible AI endpoint."""
import json
import logging
import re

import httpx

from . import config

log = logging.getLogger("autopilot.ai")

_model_cache: str | None = None


class AIError(Exception):
    pass


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if config.AI_API_KEY:
        h["Authorization"] = f"Bearer {config.AI_API_KEY}"
    return h


def resolve_model() -> str:
    global _model_cache
    if config.AI_MODEL:
        return config.AI_MODEL
    if _model_cache:
        return _model_cache
    try:
        r = httpx.get(f"{config.AI_BASE_URL}/models", headers=_headers(), timeout=15)
        r.raise_for_status()
        data = r.json().get("data", [])
        if data:
            _model_cache = data[0]["id"]
            return _model_cache
    except Exception as e:
        raise AIError(f"Could not list models from AI endpoint: {e}")
    raise AIError("AI endpoint returned no models; set AI_MODEL")


def chat(messages: list[dict], json_mode: bool = False, temperature: float = 0.2) -> str:
    payload = {
        "model": resolve_model(),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 4096,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    try:
        r = httpx.post(
            f"{config.AI_BASE_URL}/chat/completions",
            headers=_headers(),
            json=payload,
            timeout=config.AI_TIMEOUT,
        )
        if r.status_code == 400 and json_mode:
            # endpoint may not support response_format — retry without it
            payload.pop("response_format", None)
            r = httpx.post(
                f"{config.AI_BASE_URL}/chat/completions",
                headers=_headers(),
                json=payload,
                timeout=config.AI_TIMEOUT,
            )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"] or ""
    except httpx.HTTPError as e:
        raise AIError(f"AI request failed: {e}")


def extract_json(text: str) -> dict:
    """Parse JSON from a model reply, tolerating markdown fences and prose."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break
    raise AIError("AI reply was not valid JSON")


ANALYSIS_PROMPT = """You are an expert Linux SRE analyzing a monitored server.
Given the server's recent metrics and events, return STRICT JSON with this shape:
{
  "summary": "one-paragraph plain-language health summary",
  "health_score": 0-100 integer (100 = perfectly healthy),
  "issues": [{"title": str, "severity": "info"|"warning"|"critical", "detail": str}],
  "actions": [{"action": str, "priority": "low"|"medium"|"high", "command": "exact shell command or null"}],
  "solutions": [{"issue": str, "solution": str}]
}
Be specific and personalized to THIS server's data. If the server is healthy, say so
with an empty issues list. Return ONLY the JSON object."""


def analyze_server(server_info: dict) -> dict:
    content = json.dumps(server_info, default=str)
    reply = chat(
        [
            {"role": "system", "content": ANALYSIS_PROMPT},
            {"role": "user", "content": f"Server data:\n{content}"},
        ],
        json_mode=True,
    )
    data = extract_json(reply)
    data.setdefault("summary", None)
    data.setdefault("health_score", None)
    for key in ("issues", "actions", "solutions"):
        if not isinstance(data.get(key), list):
            data[key] = []
    try:
        data["health_score"] = max(0, min(100, int(data["health_score"])))
    except (TypeError, ValueError):
        data["health_score"] = None
    return data


DECIDE_PROMPT = """You are the automation gatekeeper for a server fleet.
An anomaly event occurred and an admin pre-approved a remediation action for it.
Decide if running the action NOW is safe and appropriate. Return STRICT JSON:
{"run": true|false, "reason": "short explanation"}
Only approve actions that plausibly address the event and cannot make things worse."""


def approve_action(event_info: dict, action_info: dict) -> tuple[bool, str]:
    """Ask the AI whether an admin-defined auto-action should run for this event."""
    reply = chat(
        [
            {"role": "system", "content": DECIDE_PROMPT},
            {
                "role": "user",
                "content": "Event:\n%s\n\nProposed action:\n%s"
                % (json.dumps(event_info, default=str), json.dumps(action_info, default=str)),
            },
        ],
        json_mode=True,
    )
    data = extract_json(reply)
    return bool(data.get("run")), str(data.get("reason", ""))
