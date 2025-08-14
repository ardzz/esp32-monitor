\
# Backend: FastAPI + pyserial
FROM python:3.11-slim

WORKDIR /app

# Faster, reproducible builds
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend/app /app/app

EXPOSE 8000

# NOTE: access to serial devices requires mapping devices when running docker-compose.
# Run as root to simplify serial permissions inside container.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
