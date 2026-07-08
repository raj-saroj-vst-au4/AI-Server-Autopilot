from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.TokenResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.scalars(select(models.User).where(models.User.username == body.username)).first()
    if user is None or not security.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return schemas.TokenResponse(token=security.create_token(user), username=user.username)


@router.get("/me")
def me(user: models.User = Depends(security.current_user)):
    return {"id": user.id, "username": user.username}


@router.post("/change-password")
def change_password(
    body: schemas.ChangePasswordRequest,
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    if not security.verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = security.hash_password(body.new_password)
    db.commit()
    return {"ok": True}
