import re

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, field_validator

from ...core.config import get_settings
from ...providers import SmsProvider, get_provider

router = APIRouter(prefix="/send", tags=["send"])


class OtpIn(BaseModel):
    phone: str
    code: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        if not re.fullmatch(r"\+91[6-9]\d{9}", v):
            raise ValueError("Indian mobile numbers only, as +91XXXXXXXXXX")
        return v

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("6-digit code")
        return v


def internal_only(x_internal_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_token
    if expected and x_internal_token != expected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Internal endpoint")


@router.post("/otp", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(internal_only)])
def send_otp(body: OtpIn, provider: SmsProvider = Depends(get_provider)) -> dict:
    try:
        provider.send_otp(body.phone, body.code)
    except RuntimeError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    return {"queued": True, "provider": provider.name}
