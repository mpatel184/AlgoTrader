"""Authentication seam (C1).

Builds the foundation for per-user data without disrupting the current
zero-login UI:

  - password hashing (stdlib pbkdf2_hmac — no native deps)
  - JWT access tokens (PyJWT)
  - a ``get_current_user`` FastAPI dependency

Rollout switch — ``AUTH_REQUIRED`` env (default "false"):
  * false → requests without a valid token resolve to the seeded DEFAULT user,
    so the existing frontend keeps working untouched while the seam exists.
  * true  → missing/invalid tokens are rejected with 401.

Flip AUTH_REQUIRED=true (and add a login UI) in a later phase to enforce auth
with no backend restructuring.
"""
import hashlib
import hmac
import logging
import os
import secrets as _secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import security
from database import get_db

logger = logging.getLogger(__name__)

DEFAULT_USER_EMAIL = os.getenv("DEFAULT_USER_EMAIL", "demo@algotrader.local")
DEFAULT_USER_PASSWORD = os.getenv("DEFAULT_USER_PASSWORD", "demo1234")

_JWT_ALG = "HS256"
_TOKEN_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "72"))
_PBKDF2_ITERATIONS = 240_000


def _auth_required() -> bool:
    return os.getenv("AUTH_REQUIRED", "false").strip().lower() in ("1", "true", "yes")


def _jwt_secret() -> str:
    # Dedicated env var in prod; reuse the persisted dev key otherwise.
    return os.getenv("JWT_SECRET") or security.dev_secret_material()


# ─── Password hashing (pbkdf2_sha256$iterations$salt_hex$hash_hex) ────────────

def hash_password(password: str) -> str:
    salt = _secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(),
                                 bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


# ─── JWT ──────────────────────────────────────────────────────────────────────

def create_access_token(user_id: int, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + timedelta(hours=_TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=_JWT_ALG)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[_JWT_ALG])
    except jwt.PyJWTError:
        return None


# ─── User lookups ─────────────────────────────────────────────────────────────

def _user_by_id(user_id: int) -> Optional[dict]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, email, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _user_with_hash_by_email(email: str) -> Optional[dict]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def authenticate(email: str, password: str) -> Optional[dict]:
    user = _user_with_hash_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        return None
    return {"id": user["id"], "email": user["email"]}


def get_default_user() -> Optional[dict]:
    return _user_with_hash_by_email(DEFAULT_USER_EMAIL)


# ─── Ownership helpers (used by routers for per-user data scoping) ─────────────

def owns_portfolio(conn, portfolio_id: int, user_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM portfolios WHERE id = ? AND user_id = ?",
        (portfolio_id, user_id),
    ).fetchone()
    return row is not None


# ─── FastAPI dependency ───────────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """Resolve the acting user.

    With a valid bearer token → that user. Without one → the default user when
    AUTH_REQUIRED is off (preserves the current no-login UX), else 401.
    """
    if creds and creds.credentials:
        payload = decode_token(creds.credentials)
        if payload:
            user = _user_by_id(int(payload["sub"]))
            if user:
                return user
        if _auth_required():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="Invalid or expired token")

    if _auth_required():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Authentication required")

    default = get_default_user()
    if not default:
        # Should never happen — create_tables seeds the default user.
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Default user not provisioned")
    return {"id": default["id"], "email": default["email"]}
