FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir .

CMD ["sh", "-c", "alembic upgrade head && python -m app.db.init_db && uvicorn app.main:app --host ${API_HOST:-0.0.0.0} --port ${API_PORT:-8000}"]
