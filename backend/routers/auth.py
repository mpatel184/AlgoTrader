"""Auth endpoints (C1): login + current-user.

Registration is intentionally omitted for now — a single seeded default user
covers the current single-user product. These endpoints make the seam usable
and testable; a real signup/login UI lands in a later phase.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth import authenticate, create_access_token, get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest):
    user = authenticate(req.email, req.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"])
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user
