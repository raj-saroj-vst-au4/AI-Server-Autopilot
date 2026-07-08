from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import clawdbot, models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])
Auth = Depends(security.current_user)


@router.get("/sessions", response_model=list[schemas.ChatSessionOut])
def list_sessions(db: Session = Depends(get_db), _=Auth):
    return db.scalars(
        select(models.ChatSession).order_by(models.ChatSession.created_at.desc())
    ).all()


@router.post("/sessions", response_model=schemas.ChatSessionOut, status_code=201)
def create_session(db: Session = Depends(get_db), _=Auth):
    s = models.ChatSession()
    db.add(s)
    db.commit()
    return s


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db), _=Auth):
    s = db.get(models.ChatSession, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    db.delete(s)
    db.commit()


@router.get("/sessions/{session_id}/messages", response_model=list[schemas.ChatMessageOut])
def get_messages(session_id: int, db: Session = Depends(get_db), _=Auth):
    s = db.get(models.ChatSession, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return [m for m in s.messages if m.role in ("user", "assistant") and m.content]


def _history_for_model(session: models.ChatSession) -> list[dict]:
    history = []
    for m in session.messages:
        if m.role == "user":
            history.append({"role": "user", "content": m.content})
        elif m.role == "assistant":
            msg = {"role": "assistant", "content": m.content or ""}
            if m.tool_calls:
                msg["tool_calls"] = m.tool_calls
            history.append(msg)
        elif m.role == "tool":
            history.append({
                "role": "tool", "tool_call_id": m.tool_call_id,
                "name": m.tool_name, "content": m.content,
            })
    return history


@router.post("/sessions/{session_id}/send", response_model=list[schemas.ChatMessageOut])
def send(session_id: int, body: schemas.ChatSendRequest, db: Session = Depends(get_db), _=Auth):
    session = db.get(models.ChatSession, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    user_msg = models.ChatMessage(session_id=session_id, role="user", content=body.content)
    db.add(user_msg)
    if session.title == "New chat":
        session.title = body.content[:60]
    db.commit()
    db.refresh(session)

    history = _history_for_model(session)
    try:
        produced = clawdbot.run_turn(db, history)
    except clawdbot.ClawdbotError as e:
        raise HTTPException(502, f"Clawdbot error: {e}")

    visible: list[models.ChatMessage] = []
    for pm in produced:
        role = pm["role"]
        if role == "assistant":
            m = models.ChatMessage(
                session_id=session_id, role="assistant", content=pm.get("content") or "",
                tool_calls=pm.get("tool_calls"),
            )
            db.add(m)
            if m.content:
                visible.append(m)
        elif role == "tool":
            db.add(models.ChatMessage(
                session_id=session_id, role="tool", content=pm.get("content") or "",
                tool_call_id=pm.get("tool_call_id"), tool_name=pm.get("name"),
            ))
    db.commit()
    for m in visible:
        db.refresh(m)
    return visible
