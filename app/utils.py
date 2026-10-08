"""Shared helpers: role decorators, template filters, form parsing."""
from datetime import date, datetime
from functools import wraps

import markdown
from flask import abort, current_app
from flask_login import current_user
from markupsafe import Markup


def role_required(*roles):
    """Allow only users whose role is in roles (admin always allowed)."""

    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not current_user.is_authenticated:
                return current_app.login_manager.unauthorized()
            if current_user.role not in roles and not current_user.is_admin:
                abort(403)
            return view(*args, **kwargs)

        return wrapped

    return decorator


def render_markdown(text):
    html = markdown.markdown(text or "", extensions=["extra", "sane_lists", "nl2br"])
    return Markup(html)


def fmt_date(value, fmt="%b %d, %Y"):
    if not value:
        return ""
    return value.strftime(fmt)


def fmt_datetime(value, fmt="%b %d, %Y %I:%M %p"):
    if not value:
        return ""
    return value.strftime(fmt)


def fmt_money(value):
    if value is None:
        return ""
    return f"${value:,.2f}"


def parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_datetime_local(value):
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def parse_int(value):
    try:
        return int(value) if value not in (None, "") else None
    except ValueError:
        return None


def parse_float(value):
    try:
        return float(str(value).replace(",", "").replace("$", "")) if value not in (None, "") else None
    except ValueError:
        return None


def parse_bool(value):
    if value in (None, ""):
        return None
    return str(value).lower() in ("1", "true", "yes", "on")


def today():
    return date.today()


def register_template_helpers(app):
    app.jinja_env.filters["markdown"] = render_markdown
    app.jinja_env.filters["date"] = fmt_date
    app.jinja_env.filters["datetime"] = fmt_datetime
    app.jinja_env.filters["money"] = fmt_money
    app.jinja_env.globals["today"] = today
