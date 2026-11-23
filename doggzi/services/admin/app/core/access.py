"""Who may do what in the Admin panel.

ADMIN: everything. OPS: Overview, Bookings, Orders, Customers (phones masked), read-only Vendors / Providers.
Every other console role (VENDOR, PROVIDER) gets 403 on every admin route.
"""
import re
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status

from .console import ConsoleUser, console_user


@dataclass(frozen=True)
class Staff:
    user: ConsoleUser
    role: str  # ADMIN|OPS

    @property
    def is_admin(self) -> bool:
        return self.role == "ADMIN"

    def phone(self, p: str | None) -> str:
        """Full number for ADMIN, masked for OPS (server-side: OPS never receives the digits)."""
        return show_phone(p) if self.is_admin else mask_phone(p)


def _digits(p: str | None) -> str:
    return re.sub(r"\D", "", p or "")[-10:]


def show_phone(p: str | None) -> str:
    d = _digits(p)
    return f"+91 {d[:5]} {d[5:]}" if len(d) == 10 else ""


def mask_phone(p: str | None) -> str:
    d = _digits(p)
    return f"+91 {d[:2]}xxx xx{d[-3:]}" if len(d) == 10 else ""


def staff(u: ConsoleUser = Depends(console_user)) -> Staff:
    if "ADMIN" in u.roles:
        return Staff(u, "ADMIN")
    if "OPS" in u.roles:
        return Staff(u, "OPS")
    raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to the Admin panel")


def admin_only(s: Staff = Depends(staff)) -> Staff:
    if not s.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "ADMIN only")
    return s
