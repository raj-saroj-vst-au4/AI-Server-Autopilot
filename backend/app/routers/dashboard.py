from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config, models, security
from ..database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
Auth = Depends(security.current_user)


@router.get("/summary")
def summary(db: Session = Depends(get_db), _=Auth):
    status_counts = dict(
        db.execute(
            select(models.Server.status, func.count(models.Server.id)).group_by(
                models.Server.status
            )
        ).all()
    )
    total = sum(status_counts.values())
    open_events = db.scalar(
        select(func.count(models.Event.id)).where(
            models.Event.resolved.is_(False),
            models.Event.severity.in_(["warning", "critical"]),
        )
    ) or 0
    critical_events = db.scalar(
        select(func.count(models.Event.id)).where(
            models.Event.resolved.is_(False), models.Event.severity == "critical"
        )
    ) or 0
    automations = db.scalar(
        select(func.count(models.AutoAction.id)).where(models.AutoAction.enabled.is_(True))
    ) or 0
    actions_run = db.scalar(select(func.count(models.ActionRun.id))) or 0
    return {
        "total_servers": total,
        "online": status_counts.get("online", 0),
        "warning": status_counts.get("warning", 0),
        "critical": status_counts.get("critical", 0),
        "offline": status_counts.get("offline", 0),
        "unknown": status_counts.get("unknown", 0),
        "open_events": open_events,
        "critical_events": critical_events,
        "active_automations": automations,
        "actions_executed": actions_run,
        "ai_endpoint": config.AI_BASE_URL,
        "clawdbot_endpoint": config.CLAWDBOT_BASE_URL,
    }
