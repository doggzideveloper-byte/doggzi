"""Every admin write is recorded here, after it succeeded upstream (same request)."""
from sqlalchemy.orm import Session

from ..models import AuditEntry
from .access import Staff


def _s(v, n: int) -> str | None:
    if v is None or v == "":
        return None
    v = str(v)
    return v if len(v) <= n else v[: n - 1] + "…"


def record(db: Session, who: Staff, module: str, action: str, *, target: str | None = None, before=None, after=None) -> AuditEntry:
    e = AuditEntry(actor_user_id=who.user.id, actor_name=who.user.name or who.user.phone or "Staff", actor_role=who.role, module=module,
                   action=_s(action, 300), target=_s(target, 80), before=_s(before, 500), after=_s(after, 500))
    db.add(e)
    db.commit()
    return e
