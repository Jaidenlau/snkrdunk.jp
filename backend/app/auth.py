import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from dotenv import load_dotenv
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from . import models
from .database import get_db


load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    # No secret configured. Rather than fall back to a hardcoded constant (which
    # would let anyone forge a valid token for any user, including the admin),
    # generate a strong random one for this process. Tokens won't survive a
    # restart, but they can never be forged. Set JWT_SECRET_KEY in the
    # environment for stable sessions across restarts.
    import secrets

    SECRET_KEY = secrets.token_urlsafe(48)
    logging.getLogger(__name__).warning(
        "JWT_SECRET_KEY is not set — using a random per-process secret. "
        "Existing sessions will be invalidated on every restart. "
        "Set JWT_SECRET_KEY in the environment for stable, secure sessions."
    )
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "10080"))
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_error
        user_pk = int(user_id)
    except (JWTError, ValueError, TypeError) as exc:
        # ValueError/TypeError guard a token whose `sub` is non-numeric, which
        # would otherwise raise an uncaught 500 instead of a clean 401.
        raise credentials_error from exc

    user = db.query(models.User).filter(models.User.id == user_pk).first()
    if user is None:
        raise credentials_error
    return user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not ADMIN_EMAIL or current_user.email.lower() != ADMIN_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
