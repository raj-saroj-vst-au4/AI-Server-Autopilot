from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import ai_client, clawdbot, models, monitor, schemas, security, ssh
from ..database import get_db
from ..models import utcnow

router = APIRouter(prefix="/api/servers", tags=["servers"])
Auth = Depends(security.current_user)


def _latest_metric(db, server_id):
    return db.scalars(
        select(models.MetricSample)
        .where(models.MetricSample.server_id == server_id)
        .order_by(models.MetricSample.ts.desc())
        .limit(1)
    ).first()


def _to_out(db, s: models.Server) -> schemas.ServerOut:
    open_events = db.scalar(
        select(func.count(models.Event.id)).where(
            models.Event.server_id == s.id, models.Event.resolved.is_(False),
            models.Event.severity.in_(["warning", "critical"]),
        )
    ) or 0
    latest = _latest_metric(db, s.id)
    return schemas.ServerOut(
        id=s.id, name=s.name, ip=s.ip, ssh_port=s.ssh_port, ssh_user=s.ssh_user,
        bmc_ip=s.bmc_ip, bmc_user=s.bmc_user, description=s.description,
        high_priority=s.high_priority,
        status=s.status, hostname=s.hostname, last_seen=s.last_seen, last_error=s.last_error,
        has_ssh_password=bool(s.ssh_password_enc), has_ssh_key=bool(s.ssh_key_enc),
        has_bmc_password=bool(s.bmc_password_enc), open_events=open_events,
        latest=schemas.MetricOut.model_validate(latest) if latest else None,
    )


@router.get("", response_model=list[schemas.ServerOut])
def list_servers(db: Session = Depends(get_db), _=Auth):
    servers = db.scalars(select(models.Server).order_by(models.Server.name)).all()
    return [_to_out(db, s) for s in servers]


@router.post("", response_model=schemas.ServerOut, status_code=201)
def create_server(body: schemas.ServerCreate, db: Session = Depends(get_db), _=Auth):
    s = models.Server(
        name=body.name, ip=body.ip, ssh_port=body.ssh_port, ssh_user=body.ssh_user,
        ssh_password_enc=security.encrypt(body.ssh_password),
        ssh_key_enc=security.encrypt(body.ssh_key),
        bmc_ip=body.bmc_ip, bmc_user=body.bmc_user,
        bmc_password_enc=security.encrypt(body.bmc_password),
        description=body.description, high_priority=body.high_priority,
    )
    db.add(s)
    db.commit()
    return _to_out(db, s)


@router.get("/{server_id}", response_model=schemas.ServerOut)
def get_server(server_id: int, db: Session = Depends(get_db), _=Auth):
    s = db.get(models.Server, server_id)
    if not s:
        raise HTTPException(404, "Server not found")
    return _to_out(db, s)


@router.put("/{server_id}", response_model=schemas.ServerOut)
def update_server(server_id: int, body: schemas.ServerUpdate, db: Session = Depends(get_db), _=Auth):
    s = db.get(models.Server, server_id)
    if not s:
        raise HTTPException(404, "Server not found")
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "ip", "ssh_port", "ssh_user", "bmc_ip", "bmc_user", "description", "high_priority"):
        if field in data:
            setattr(s, field, data[field])
    # secrets: absent = keep, empty string = clear, value = replace
    if "ssh_password" in data:
        s.ssh_password_enc = security.encrypt(data["ssh_password"]) if data["ssh_password"] else None
    if "ssh_key" in data:
        s.ssh_key_enc = security.encrypt(data["ssh_key"]) if data["ssh_key"] else None
    if "bmc_password" in data:
        s.bmc_password_enc = security.encrypt(data["bmc_password"]) if data["bmc_password"] else None
    db.commit()
    return _to_out(db, s)


@router.delete("/{server_id}", status_code=204)
def delete_server(server_id: int, db: Session = Depends(get_db), _=Auth):
    s = db.get(models.Server, server_id)
    if not s:
        raise HTTPException(404, "Server not found")
    db.delete(s)
    db.commit()


@router.post("/{server_id}/test")
def test_connection(server_id: int, db: Session = Depends(get_db), _=Auth):
    s = db.get(models.Server, server_id)
    if not s:
        raise HTTPException(404, "Server not found")
    try:
        rc, out, err = ssh.run(s, "echo ok; hostname; uname -sr", timeout=15)
        return {"ok": rc == 0, "output": out.strip(), "error": err.strip()}
    except ssh.SSHError as e:
        return {"ok": False, "error": str(e)}


@router.post("/{server_id}/poll", response_model=schemas.ServerOut)
def poll_now(server_id: int, db: Session = Depends(get_db), _=Auth):
    s = db.get(models.Server, server_id)
    if not s:
        raise HTTPException(404, "Server not found")
    monitor.poll_server(server_id)
    db.expire_all()
    s = db.get(models.Server, server_id)
    return _to_out(db, s)


@router.get("/{server_id}/metrics", response_model=list[schemas.MetricOut])
def server_metrics(server_id: int, hours: int = 6, db: Session = Depends(get_db), _=Auth):
    since = utcnow() - timedelta(hours=hours)
    rows = db.scalars(
        select(models.MetricSample).where(
            models.MetricSample.server_id == server_id, models.MetricSample.ts >= since
        ).order_by(models.MetricSample.ts)
    ).all()
    return rows


@router.get("/{server_id}/events", response_model=list[schemas.EventOut])
def server_events(server_id: int, limit: int = 50, db: Session = Depends(get_db), _=Auth):
    rows = db.scalars(
        select(models.Event).where(models.Event.server_id == server_id)
        .order_by(models.Event.ts.desc()).limit(limit)
    ).all()
    return rows


@router.get("/{server_id}/analysis", response_model=schemas.AnalysisOut | None)
def latest_analysis(server_id: int, db: Session = Depends(get_db), _=Auth):
    return db.scalars(
        select(models.AIAnalysis).where(models.AIAnalysis.server_id == server_id)
        .order_by(models.AIAnalysis.ts.desc()).limit(1)
    ).first()


@router.post("/{server_id}/analyze", response_model=schemas.AnalysisOut)
def analyze(server_id: int, db: Session = Depends(get_db), _=Auth):
    s = db.get(models.Server, server_id)
    if not s:
        raise HTTPException(404, "Server not found")
    recent_metrics = db.scalars(
        select(models.MetricSample).where(models.MetricSample.server_id == server_id)
        .order_by(models.MetricSample.ts.desc()).limit(20)
    ).all()
    recent_events = db.scalars(
        select(models.Event).where(models.Event.server_id == server_id)
        .order_by(models.Event.ts.desc()).limit(20)
    ).all()
    info = {
        "name": s.name, "ip": s.ip, "hostname": s.hostname, "status": s.status,
        "last_error": s.last_error,
        "metrics": [
            {"ts": m.ts, "cpu_pct": m.cpu_pct, "mem_pct": m.mem_pct, "disk_pct": m.disk_pct,
             "load1": m.load1, "cores": m.cores, "uptime_s": m.uptime_s}
            for m in recent_metrics
        ],
        "events": [
            {"ts": e.ts, "severity": e.severity, "category": e.category, "message": e.message}
            for e in recent_events
        ],
    }
    try:
        result = ai_client.analyze_server(info)
    except ai_client.AIError as e:
        raise HTTPException(502, f"AI analysis failed: {e}")
    analysis = models.AIAnalysis(
        server_id=server_id, model=ai_client.resolve_model(),
        summary=result.get("summary"), health_score=result.get("health_score"),
        issues=result.get("issues"), actions=result.get("actions"),
        solutions=result.get("solutions"),
    )
    db.add(analysis)
    db.commit()
    return analysis


@router.post("/{server_id}/chat", response_model=schemas.QuickChatResponse)
def server_chat(server_id: int, body: schemas.QuickChatRequest,
                db: Session = Depends(get_db), _=Auth):
    """Stateless per-server assistant. The client sends the running history; the
    tool-calling loop runs scoped to this server so 'this server' resolves to it."""
    s = db.get(models.Server, server_id)
    if not s:
        raise HTTPException(404, "Server not found")
    context = (
        f"CONTEXT: The user is viewing server '{s.name}' (IP {s.ip}, host "
        f"{s.hostname or 'unknown'}, status {s.status}). When they say 'this server', "
        f"'here', or don't name a server, operate on '{s.name}'. Prefer it as the default "
        f"target for every tool call unless the user explicitly names another server."
    )
    history = [{"role": m.role, "content": m.content} for m in body.messages]
    try:
        produced = clawdbot.run_turn(db, history, extra_system=context)
    except clawdbot.ClawdbotError as e:
        raise HTTPException(502, f"Assistant error: {e}")

    reply_parts = [p.get("content") for p in produced
                   if p["role"] == "assistant" and p.get("content")]
    actions = [f"{p.get('name')}" for p in produced if p["role"] == "tool"]
    return schemas.QuickChatResponse(
        reply="\n\n".join(reply_parts) or "(no response)", actions=actions
    )
