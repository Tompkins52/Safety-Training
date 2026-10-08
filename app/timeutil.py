"""Time helpers. Timestamps are stored as naive local server time, which is what
employees and supervisors see on screen. Set the TZ environment variable (or the
container's time zone) to the department's time zone."""
from datetime import datetime


def now():
    return datetime.now().replace(microsecond=0)
