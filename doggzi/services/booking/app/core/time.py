from datetime import datetime, timezone


def utcnow() -> datetime:
    """Times are stored in UTC and shown in IST by the frontend."""
    return datetime.now(timezone.utc)
