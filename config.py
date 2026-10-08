"""Application configuration.

All settings can be overridden with environment variables or a .env file in the
project root. See .env.example for the full list with explanations.
"""
import os
from datetime import timedelta

from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class Config:
    # Core
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-before-going-live")
    ORG_NAME = os.environ.get("ORG_NAME", "Public Works Department")
    APP_NAME = os.environ.get("APP_NAME", "Public Works Safety Training")
    APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:5000").rstrip("/")
    TIMEZONE = os.environ.get("TIMEZONE", "America/Chicago")

    # Database (SQLite by default; any SQLAlchemy URL works, e.g. PostgreSQL)
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "sqlite:///" + os.path.join(BASE_DIR, "instance", "safety.db"),
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Content
    CONTENT_DIR = os.environ.get("CONTENT_DIR", os.path.join(BASE_DIR, "content"))

    # Training rules
    QUIZ_PASS_PERCENT = env_int("QUIZ_PASS_PERCENT", 80)
    QUIZ_QUESTION_COUNT = env_int("QUIZ_QUESTION_COUNT", 10)
    AUTO_RENEW_ASSIGNMENTS = env_bool("AUTO_RENEW_ASSIGNMENTS", True)
    DEFAULT_RENEWAL_MONTHS = env_int("DEFAULT_RENEWAL_MONTHS", 12)
    DEFAULT_DUE_DAYS = env_int("DEFAULT_DUE_DAYS", 30)

    # Notification rules (days relative to the due date)
    REMINDER_DAYS_BEFORE_DUE = env_int("REMINDER_DAYS_BEFORE_DUE", 30)
    SECOND_REMINDER_DAYS_BEFORE_DUE = env_int("SECOND_REMINDER_DAYS_BEFORE_DUE", 7)
    OVERDUE_REMINDER_EVERY_DAYS = env_int("OVERDUE_REMINDER_EVERY_DAYS", 7)
    NOTIFY_SUPERVISOR_ON_COMPLETION = env_bool("NOTIFY_SUPERVISOR_ON_COMPLETION", True)
    NOTIFY_ON_INCIDENT = env_bool("NOTIFY_ON_INCIDENT", True)

    # Email (SMTP). When MAIL_ENABLED is false, messages are logged in the app
    # and recorded in the notification log instead of being sent.
    MAIL_ENABLED = env_bool("MAIL_ENABLED", False)
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "")
    MAIL_PORT = env_int("MAIL_PORT", 587)
    MAIL_USE_TLS = env_bool("MAIL_USE_TLS", True)
    MAIL_USE_SSL = env_bool("MAIL_USE_SSL", False)
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_FROM = os.environ.get("MAIL_FROM", "safety-training@example.gov")
    MAIL_TIMEOUT = env_int("MAIL_TIMEOUT", 20)
    SAFETY_OFFICER_EMAIL = os.environ.get("SAFETY_OFFICER_EMAIL", "")

    # Scheduler (daily job that sends due-date reminders)
    SCHEDULER_ENABLED = env_bool("SCHEDULER_ENABLED", True)
    SCHEDULER_HOUR = env_int("SCHEDULER_HOUR", 6)
    SCHEDULER_MINUTE = env_int("SCHEDULER_MINUTE", 0)

    # Sessions and cookies
    PERMANENT_SESSION_LIFETIME = timedelta(hours=12)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = APP_BASE_URL.startswith("https://")
    WTF_CSRF_TIME_LIMIT = None


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    WTF_CSRF_ENABLED = False
    SCHEDULER_ENABLED = False
    MAIL_ENABLED = False
    SECRET_KEY = "test-secret"
    SESSION_COOKIE_SECURE = False
