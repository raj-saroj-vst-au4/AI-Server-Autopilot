import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import llm, security
from ..database import get_db

router = APIRouter(prefix="/api/llm", tags=["llm"])
Auth = Depends(security.current_user)
log = logging.getLogger("autopilot.llm.api")


@router.get("/status")
def llm_status(db: Session = Depends(get_db), _=Auth):
    return llm.status(db)


@router.post("/start")
def llm_start(db: Session = Depends(get_db), _=Auth):
    try:
        llm.start(db)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e))
    return llm.status(db)


@router.post("/stop")
def llm_stop(db: Session = Depends(get_db), _=Auth):
    try:
        llm.stop(db)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e))
    return llm.status(db)
