FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# Migrations run on start (additive only); then serve.
CMD ["sh", "-c", "python -m app.ensure_db && alembic upgrade head && python -m app.seed_demo && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
