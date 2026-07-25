# MyB AI service — CPU-only container for Render / Cloud Run / HF Spaces.
FROM python:3.11-slim

# libgl/libglib: opencv-headless runtime deps for insightface.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
# $PORT is injected by most PaaS hosts; default to 8000 locally.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
