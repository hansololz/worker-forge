# Backend unit + integration tests (pytest). Fully self-contained: the
# integration suite uses FastAPI's in-process TestClient and runs real bash
# subprocess steps, so no separate services are needed.
FROM python:3.12-slim

WORKDIR /app/backend

# Install deps first for layer caching.
COPY backend/requirements.txt backend/requirements-test.txt ./
RUN pip install --no-cache-dir -r requirements-test.txt

COPY backend/ ./

# Sandbox the data dir away from any mounted volumes.
ENV WORKER_FORGE_HOME=/tmp/wf-data

CMD ["pytest", "--cov=app", "--cov-report=term-missing"]
