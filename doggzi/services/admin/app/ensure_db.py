"""Wait for Postgres, then create this service's database if it doesn't exist.

Runs before `alembic upgrade head` (see Dockerfile). Lets a new service start on an existing Postgres
volume without `docker compose down -v`, and absorbs the first-run race while Postgres initialises.
"""
import sys
import time

from sqlalchemy.engine import make_url

from app.core.config import get_settings


def main() -> int:
    url = make_url(get_settings().database_url)
    if not url.drivername.startswith("postgresql"):
        return 0  # SQLite (local dev / tests): nothing to create
    import psycopg

    dbname = url.database
    admin = url.set(drivername="postgresql", database="postgres")
    dsn = admin.render_as_string(hide_password=False)
    last = None
    for attempt in range(60):
        try:
            with psycopg.connect(dsn, autocommit=True, connect_timeout=3) as conn:
                exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,)).fetchone()
                if not exists:
                    # Identifier comes from our own DATABASE_URL, quoted to be safe.
                    conn.execute(f'CREATE DATABASE "{dbname.replace(chr(34), "")}"')
                    print(f"[ensure_db] created database {dbname}", flush=True)
                return 0
        except psycopg.errors.DuplicateDatabase:
            return 0  # another replica created it first
        except psycopg.OperationalError as e:
            last = e
            print(f"[ensure_db] waiting for postgres ({attempt + 1}/60): {str(e).splitlines()[0]}", flush=True)
            time.sleep(2)
    print(f"[ensure_db] gave up: {last}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
