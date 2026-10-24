"""Incident helpers: report numbering, access control and statement requests."""
import secrets

from flask import current_app, has_request_context, render_template, url_for
from sqlalchemy import func, or_

from ..extensions import db
from ..models import INCIDENT_TYPE_CODES, Incident, NotificationLog, User
from ..timeutil import now
from .mailer import send_email


# --------------------------------------------------------------------------- numbering


def incident_number_prefix(incident_type, occurred=None):
    """MMDDYYYY of the incident date followed by the type code and a dash, e.g. 10232026PI-."""
    when = occurred or now()
    code = INCIDENT_TYPE_CODES.get(incident_type, "IN")
    return f"{when:%m%d%Y}{code}-"


def next_incident_number(incident_type, occurred=None):
    """Report number for a new incident: the incident date (MMDDYYYY), the type code
    (PI, PD or VI) and the sequence of that type for that date, two digits wide,
    e.g. 10232026PI-01 and 10232026VI-02. The sequence keeps counting past 99."""
    prefix = incident_number_prefix(incident_type, occurred)
    highest = 0
    rows = db.session.query(Incident.incident_number).filter(Incident.incident_number.like(prefix + "%")).all()
    for (number,) in rows:
        try:
            highest = max(highest, int(number[len(prefix):]))
        except ValueError:
            continue
    return f"{prefix}{highest + 1:02d}"


# --------------------------------------------------------------------------- access


def can_view(user, incident):
    if user.is_admin:
        return True
    if incident.reported_by_id == user.id:
        return True
    if user.is_supervisor:
        if incident.division_id and incident.division_id == user.division_id:
            return True
        if incident.reported_by and incident.reported_by.supervisor_id == user.id:
            return True
    return False


def can_investigate(user, incident):
    if user.is_admin:
        return True
    return user.is_supervisor and can_view(user, incident)


def can_edit_report(user, incident):
    """Sections 1 to 4: the reporter and supervisors who can see the report, while it
    is open; a safety administrator at any time."""
    if user.is_admin:
        return True
    if incident.status == "closed":
        return False
    return can_view(user, incident) and (user.is_supervisor or incident.reported_by_id == user.id)


def visible_incidents_query(user):
    query = Incident.query
    if user.is_admin:
        return query
    if user.is_supervisor:
        report_ids = [u.id for u in user.direct_reports]
        conditions = [Incident.reported_by_id == user.id, Incident.reported_by_id.in_(report_ids)]
        if user.division_id:
            conditions.append(Incident.division_id == user.division_id)
        return query.filter(or_(*conditions))
    return query.filter(Incident.reported_by_id == user.id)


# --------------------------------------------------------------------------- statements


def new_statement_token():
    return secrets.token_urlsafe(24)


def statement_link(statement):
    """Absolute address of the public statement page for an emailed request."""
    base = current_app.config.get("APP_BASE_URL", "")
    if has_request_context():
        path = url_for("incidents.statement_link", token=statement.token)
    else:
        with current_app.test_request_context():
            path = url_for("incidents.statement_link", token=statement.token)
    return f"{base}{path}"


def send_statement_request(statement, requested_by=None):
    """Email the statement link and record the message in the notification log.

    The page behind the link shows only the person's own statement form, never the
    report, so the message says so. Returns the NotificationLog entry."""
    incident = statement.incident
    org = current_app.config.get("ORG_NAME") or current_app.config.get("APP_NAME") or "IntelliSafe"
    subject = f"[{org}] Your {statement.role_label.lower()} is requested for incident report {incident.incident_number}"
    context = {
        "incident": incident,
        "statement": statement,
        "link": statement_link(statement),
        "requested_by": requested_by,
        "org_name": org,
        "app_name": current_app.config.get("APP_NAME"),
    }
    text_body = render_template("email/statement_request.txt", **context)
    html_body = render_template("email/statement_request.html", **context)
    delivered, detail = send_email(statement.email, subject, text_body, html_body)
    recipient = None
    if statement.email:
        recipient = User.query.filter(func.lower(User.email) == statement.email.lower()).first()
    entry = NotificationLog(
        kind="statement_request",
        recipient_email=statement.email,
        recipient_user_id=recipient.id if recipient else None,
        subject=subject,
        body=text_body,
        incident_id=incident.id,
        delivered=bool(delivered),
        detail=detail,
    )
    db.session.add(entry)
    statement.sent_at = now()
    return entry
