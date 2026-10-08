"""Built-in daily scheduler for due-date reminders.

Runs inside the web process using APScheduler. For multi-worker deployments
disable it (SCHEDULER_ENABLED=false) and run `flask run-notifications` from
cron instead, so reminders are not sent once per worker.
"""
import atexit
import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .services.notifications import run_daily_notifications

log = logging.getLogger(__name__)
_scheduler = None


def _job(app):
    with app.app_context():
        try:
            run_daily_notifications()
        except Exception:  # noqa: BLE001
            app.logger.exception("Daily notification job failed")


def start_scheduler(app):
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    # With the Flask reloader the module is imported twice; only start in the child.
    if app.debug and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return None
    scheduler = BackgroundScheduler(timezone=app.config.get("TIMEZONE", "UTC"))
    scheduler.add_job(
        _job,
        CronTrigger(hour=app.config["SCHEDULER_HOUR"], minute=app.config["SCHEDULER_MINUTE"]),
        args=[app],
        id="daily_notifications",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    atexit.register(lambda: scheduler.shutdown(wait=False))
    _scheduler = scheduler
    app.logger.info(
        "Scheduler started: daily notification job at %02d:%02d %s",
        app.config["SCHEDULER_HOUR"],
        app.config["SCHEDULER_MINUTE"],
        app.config.get("TIMEZONE", "UTC"),
    )
    return scheduler
