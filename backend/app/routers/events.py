from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db
from ..models import utcnow

router = APIRouter(prefix="/api/events", tags=["events"])
Auth = Depends(security.current_user)


@router.get("", response_model=list[schemas.EventOut])
def list_events(
    resolved: bool | None = None,
    severity: str | None = None,
    server_id: int | None = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    _=Auth,
):
    q = select(models.Event, models.Server.name).join(
        models.Server, models.Event.server_id == models.Server.id
    )
    if resolved is not None:
        q = q.where(models.Event.resolved.is_(resolved))
    if severity:
        q = q.where(models.Event.severity == severity)
    if server_id:
        q = q.where(models.Event.server_id == server_id)
    q = q.order_by(models.Event.ts.desc()).limit(limit)
    out = []
    for ev, sname in db.execute(q).all():
        item = schemas.EventOut.model_validate(ev)
        item.server_name = sname
        out.append(item)
    return out


@router.post("/{event_id}/resolve", response_model=schemas.EventOut)
def resolve_event(event_id: int, db: Session = Depends(get_db), _=Auth):
    ev = db.get(models.Event, event_id)
    if not ev:
        raise HTTPException(404, "Event not found")
    ev.resolved = True
    ev.resolved_at = utcnow()
    db.commit()
    return schemas.EventOut.model_validate(ev)
