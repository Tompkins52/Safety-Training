FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=run.py

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/instance

EXPOSE 8000

# init-db is idempotent: it creates tables, default divisions and loads the
# course content. One worker so the built-in reminder scheduler runs once.
CMD ["sh", "-c", "flask init-db && gunicorn --workers 1 --threads 4 --timeout 120 --bind 0.0.0.0:8000 --access-logfile - 'app:create_app()'"]
