"""PentAGI engine client (GraphQL).

PentAGI runs long autonomous pentest *flows* (createFlow with a natural-language
objective). Results are the flow's tasks/subtasks + status rather than a
structured severity list, so we create a flow, poll it, map its tasks into our
scan findings, and link out to PentAGI's UI for the full interactive report.
"""
import logging

import httpx

from . import config

log = logging.getLogger("autopilot.pentagi")


class PentagiError(Exception):
    pass


_CREATE = ("mutation($p:String!,$i:String!){createFlow(modelProvider:$p,input:$i)"
           "{id title status}}")
_FLOW = ("query($id:ID!){flow(flowId:$id){id title status} "
         "tasks(flowId:$id){title status result subtasks{title description status result}}}")


def _gql(query: str, variables: dict | None = None, timeout: int | None = None) -> dict:
    if not config.PENTAGI_API_TOKEN:
        raise PentagiError("PENTAGI_API_TOKEN is not set — create a token in PentAGI.")
    url = f"{config.PENTAGI_BASE_URL}/api/v1/graphql"
    try:
        r = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {config.PENTAGI_API_TOKEN}",
                "Content-Type": "application/json",
            },
            json={"query": query, "variables": variables or {}},
            timeout=timeout or config.PENTAGI_TIMEOUT,
            verify=config.PENTAGI_VERIFY_SSL,
        )
        r.raise_for_status()
        payload = r.json()
        if payload.get("errors"):
            msg = "; ".join(e.get("message", "?") for e in payload["errors"])
            raise PentagiError(msg[:400])
        return payload.get("data") or {}
    except httpx.HTTPError as e:
        raise PentagiError(f"PentAGI request failed: {e}")


def create_flow(objective: str) -> dict:
    """Start an autonomous flow; returns {id, title, status}."""
    data = _gql(_CREATE, {"p": config.PENTAGI_MODEL_PROVIDER, "i": objective})
    flow = data.get("createFlow") or {}
    if not flow.get("id"):
        raise PentagiError("createFlow returned no flow id")
    return flow


def get_flow(flow_id: str) -> dict:
    """Return {flow: {status,title}, tasks: [...]} for a flow."""
    data = _gql(_FLOW, {"id": flow_id})
    return {"flow": data.get("flow") or {}, "tasks": data.get("tasks") or []}


def ui_url(flow_id: str) -> str:
    return f"{config.PENTAGI_PUBLIC_URL}/flows/{flow_id}"
