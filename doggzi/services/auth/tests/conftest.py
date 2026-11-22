import os

# Must run before any app module reads settings.
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("AUTH_JWT_SECRET", "test-auth-secret")
os.environ["ADMIN_PHONES"] = "9000000001"
os.environ["SESSION_REDIS_URL"] = ""
