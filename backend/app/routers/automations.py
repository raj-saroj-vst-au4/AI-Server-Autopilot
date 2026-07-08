from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/api/automations", tags=["automations"])
Auth = Depends(security.current_user)


def _to_out(db, a: models.AutoAction) -> schemas.AutoActionOut:
    out = schemas.AutoActionOut.model_validate(a)
    if a.server_id:
        srv = db.get(models.Server, a.server_id)
        out.server_name = srv.name if srv else None
    return out


@router.get("", response_model=list[schemas.AutoActionOut])
def list_actions(db: Session = Depends(get_db), _=Auth):
    rows = db.scalars(select(models.AutoAction).order_by(models.AutoAction.created_at.desc())).all()
    return [_to_out(db, a) for a in rows]


@router.post("", response_model=schemas.AutoActionOut, status_code=201)
def create_action(body: schemas.AutoActionCreate, db: Session = Depends(get_db), _=Auth):
    a = models.AutoAction(**body.model_dump())
    db.add(a)
    db.commit()
    return _to_out(db, a)


@router.put("/{action_id}", response_model=schemas.AutoActionOut)
def update_action(action_id: int, body: schemas.AutoActionUpdate, db: Session = Depends(get_db), _=Auth):
    a = db.get(models.AutoAction, action_id)
    if not a:
        raise HTTPException(404, "Automation not found")
    data = body.model_dump(exclude_unset=True)
    clear = data.pop("clear_server", False)
    for k, v in data.items():
        setattr(a, k, v)
    if clear:
        a.server_id = None
    db.commit()
    return _to_out(db, a)


@router.delete("/{action_id}", status_code=204)
def delete_action(action_id: int, db: Session = Depends(get_db), _=Auth):
    a = db.get(models.AutoAction, action_id)
    if not a:
        raise HTTPException(404, "Automation not found")
    db.delete(a)
    db.commit()


@router.get("/runs", response_model=list[schemas.ActionRunOut])
def list_runs(limit: int = Query(100, le=500), db: Session = Depends(get_db), _=Auth):
    q = (
        select(models.ActionRun, models.AutoAction.name)
        .join(models.AutoAction, models.ActionRun.auto_action_id == models.AutoAction.id)
        .order_by(models.ActionRun.ts.desc())
        .limit(limit)
    )
    out = []
    for run, name in db.execute(q).all():
        item = schemas.ActionRunOut.model_validate(run)
        item.action_name = name
        out.append(item)
    return out
