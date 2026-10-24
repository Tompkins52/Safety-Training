"""Builds, sends and logs the platform's email notifications.

Notification kinds:
  training_assigned             employee, when an assignment is created (optional)
  training_due_30               employee, 30 days before the due date
  training_due_7                employee, 7 days before the due date
  training_overdue              employee, every 7 days while overdue
  training_due_30_supervisor    direct supervisor, copy of the 30-day reminder
  training_due_7_supervisor     direct supervisor, copy of the 7-day reminder
  training_overdue_supervisor   direct supervisor, copy of the overdue reminder
  training_completed            direct supervisor, when the employee passes the quiz
  incident_reported             safety administrators, supervisor and safety officer mailbox
  incident_closed               reporter and supervisor, when an investigation is closed

The supervisor copies are digests: one message per employee per reminder
kind per run, listing every course that triggered a reminder that day.
"""
from datetime import date

from flask import current_app, render_template, url_for

from ..extensions import db
from ..timeutil import now
from ..models import Assignment, Course, NotificationLog, User
from .mailer import send_email


def _org():
    """Name used in email subjects: the organization if configured, else the app name."""
    return current_app.config.get("ORG_NAME") or current_app.config.get("APP_NAME") or "IntelliSafe"


def _link(endpoint, **values):
    base = current_app.config.get("APP_BASE_URL", "")
    with current_app.test_request_context():
        path = url_for(endpoint, **values)
    return f"{base}{path}"


def _record(kind, recipient_email, subject, body, delivered, detail, *, user=None, assignment=None, incident=None):
    entry = NotificationLog(
        kind=kind,
        recipient_email=recipient_email,
        recipient_user_id=user.id if user else None,
        subject=subject,
        body=body,
        assignment_id=assignment.id if assignment else None,
        incident_id=incident.id if incident else None,
        delivered=bool(delivered),
        detail=detail,
    )
    db.session.add(entry)
    return entry


def _deliver(kind, recipient_email, subject, template, context, *, user=None, assignment=None, incident=None):
    context = dict(context, org_name=_org(), app_name=current_app.config.get("APP_NAME"))
    text_body = render_template(f"email/{template}.txt", **context)
    html_body = render_template(f"email/{template}.html", **context)
    delivered, detail = send_email(recipient_email, subject, text_body, html_body)
    entry = _record(
        kind, recipient_email, subject, text_body, delivered, detail, user=user, assignment=assignment, incident=incident
    )
    return entry


# --------------------------------------------------------------------------- training


def notify_training_assigned(assignment, note=None):
    user = assignment.user
    subject = f"[{_org()}] New safety training assigned: {assignment.course.title}"
    entry = _deliver(
        "training_assigned",
        user.email,
        subject,
        "training_assigned",
        {
            "assignment": assignment,
            "user": user,
            "course": assignment.course,
            "note": (note or "").strip() or None,
            "link": _link("training.my_training"),
        },
        user=user,
        assignment=assignment,
    )
    assignment.assignment_notice_sent_at = now()
    return entry


def notify_training_due(assignment, days_left):
    user = assignment.user
    kind = "training_due_30" if days_left > current_app.config["SECOND_REMINDER_DAYS_BEFORE_DUE"] else "training_due_7"
    subject = f"[{_org()}] Reminder: {assignment.course.title} training due in {days_left} day{'s' if days_left != 1 else ''}"
    if days_left == 0:
        subject = f"[{_org()}] Reminder: {assignment.course.title} training is due today"
    entry = _deliver(
        kind,
        user.email,
        subject,
        "training_due",
        {
            "assignment": assignment,
            "user": user,
            "course": assignment.course,
            "days_left": days_left,
            "link": _link("training.course", assignment_id=assignment.id),
        },
        user=user,
        assignment=assignment,
    )
    stamp = now()
    if kind == "training_due_30":
        assignment.reminder_30_sent_at = stamp
    else:
        assignment.reminder_7_sent_at = stamp
        if not assignment.reminder_30_sent_at:
            assignment.reminder_30_sent_at = stamp
    return entry


def notify_training_overdue(assignment):
    user = assignment.user
    days_overdue = -assignment.days_until_due
    subject = f"[{_org()}] OVERDUE: {assignment.course.title} training was due {assignment.due_date:%b %d, %Y}"
    entry = _deliver(
        "training_overdue",
        user.email,
        subject,
        "training_overdue",
        {
            "assignment": assignment,
            "user": user,
            "course": assignment.course,
            "days_overdue": days_overdue,
            "link": _link("training.course", assignment_id=assignment.id),
        },
        user=user,
        assignment=assignment,
    )
    assignment.overdue_last_reminded_at = now()
    return entry


def notify_supervisor_completion(assignment):
    user = assignment.user
    supervisor = user.supervisor
    subject = f"[{_org()}] {user.full_name} completed {assignment.course.title}"
    recipient = supervisor.email if supervisor and supervisor.email else None
    if not recipient:
        entry = _record(
            "training_completed",
            "(no supervisor on file)",
            subject,
            f"{user.full_name} completed {assignment.course.title} on {assignment.completed_at:%b %d, %Y}.",
            False,
            "employee has no supervisor with an email address",
            user=user,
            assignment=assignment,
        )
    else:
        entry = _deliver(
            "training_completed",
            recipient,
            subject,
            "training_completed",
            {
                "assignment": assignment,
                "user": user,
                "supervisor": supervisor,
                "course": assignment.course,
                "link": _link("main.team"),
            },
            user=supervisor,
            assignment=assignment,
        )
    assignment.supervisor_notified_at = now()
    return entry


def notify_supervisor_reminder(assignments, kind, today=None):
    """Send the employee's direct supervisor a copy of the reminders sent today.

    `assignments` are one employee's assignments that received a `kind`
    reminder (training_due_30, training_due_7 or training_overdue) in this
    run. One digest message is sent and logged under `kind` + "_supervisor".
    Returns the log entry, or None when there is no supervisor to copy.
    """
    if not assignments:
        return None
    today = today or date.today()
    user = assignments[0].user
    supervisor = user.supervisor
    if supervisor is None or not supervisor.email or not supervisor.is_active_employee or supervisor.id == user.id:
        return None
    items = sorted(assignments, key=lambda a: (a.due_date, a.course.title))
    rows = [{"assignment": a, "course": a.course, "days": (a.due_date - today).days} for a in items]
    count = len(items)
    first = items[0]
    if kind == "training_overdue":
        template = "training_overdue_supervisor"
        if count == 1:
            subject = f"[{_org()}] OVERDUE: {user.full_name}, {first.course.title} was due {first.due_date:%b %d, %Y}"
        else:
            subject = f"[{_org()}] OVERDUE: {user.full_name} has {count} training modules past due"
    else:
        template = "training_due_supervisor"
        if count == 1:
            subject = f"[{_org()}] {user.full_name}: {first.course.title} training due {first.due_date:%b %d, %Y}"
        else:
            subject = f"[{_org()}] {user.full_name}: {count} training modules coming due"
    return _deliver(
        f"{kind}_supervisor",
        supervisor.email,
        subject,
        template,
        {
            "supervisor": supervisor,
            "user": user,
            "rows": rows,
            "count": count,
            "kind": kind,
            "link": _link("main.team"),
        },
        user=supervisor,
        assignment=first,
    )


# --------------------------------------------------------------------------- incidents


def incident_notification_recipients(incident):
    """Admins, the reporter's supervisor and the safety officer mailbox, de-duplicated."""
    recipients = {}
    for admin in User.query.filter_by(role="admin", is_active_employee=True).all():
        if admin.email:
            recipients[admin.email.lower()] = admin
    reporter = incident.reported_by
    if reporter and reporter.supervisor and reporter.supervisor.email:
        recipients[reporter.supervisor.email.lower()] = reporter.supervisor
    officer = current_app.config.get("SAFETY_OFFICER_EMAIL")
    if officer:
        recipients.setdefault(officer.lower(), None)
    return recipients


def notify_incident_reported(incident):
    entries = []
    subject = f"[{_org()}] {incident.type_label} reported: {incident.incident_number}"
    for email, user in incident_notification_recipients(incident).items():
        entries.append(
            _deliver(
                "incident_reported",
                email,
                subject,
                "incident_reported",
                {"incident": incident, "link": _link("incidents.detail", incident_id=incident.id)},
                user=user,
                incident=incident,
            )
        )
    return entries


def notify_incident_closed(incident):
    entries = []
    subject = f"[{_org()}] Incident {incident.incident_number} closed"
    recipients = {}
    if incident.reported_by and incident.reported_by.email:
        recipients[incident.reported_by.email.lower()] = incident.reported_by
    sup = incident.reported_by.supervisor if incident.reported_by else None
    if sup and sup.email:
        recipients[sup.email.lower()] = sup
    for email, user in recipients.items():
        entries.append(
            _deliver(
                "incident_closed",
                email,
                subject,
                "incident_closed",
                {"incident": incident, "link": _link("incidents.detail", incident_id=incident.id)},
                user=user,
                incident=incident,
            )
        )
    return entries


# --------------------------------------------------------------------------- daily job


def run_daily_notifications(today=None):
    """Send due-date reminders for every open assignment. Returns counts by kind.

    Safe to run more than once a day: each reminder is sent once per
    assignment, and overdue reminders repeat only every
    OVERDUE_REMINDER_EVERY_DAYS days. Each employee reminder sent in a run is
    also copied to the employee's direct supervisor as one digest per
    employee and reminder kind; because the copies ride on the employee
    reminders, a second run the same day sends no duplicates.
    """
    cfg = current_app.config
    today = today or date.today()
    first = cfg["REMINDER_DAYS_BEFORE_DUE"]
    second = cfg["SECOND_REMINDER_DAYS_BEFORE_DUE"]
    overdue_every = cfg["OVERDUE_REMINDER_EVERY_DAYS"]
    counts = {
        "training_due_30": 0,
        "training_due_7": 0,
        "training_overdue": 0,
        "skipped": 0,
        "training_due_30_supervisor": 0,
        "training_due_7_supervisor": 0,
        "training_overdue_supervisor": 0,
    }
    reminded = {}  # (user_id, kind) -> assignments reminded in this run

    query = (
        Assignment.query.join(User, Assignment.user_id == User.id)
        .join(Course, Assignment.course_id == Course.id)
        .filter(Assignment.status != "completed", User.is_active_employee.is_(True), Course.is_active.is_(True))
    )
    for assignment in query.all():
        days_left = (assignment.due_date - today).days
        kind = None
        if days_left < 0:
            last = assignment.overdue_last_reminded_at
            if last is None or (today - last.date()).days >= overdue_every:
                notify_training_overdue(assignment)
                kind = "training_overdue"
        elif days_left <= second:
            if assignment.reminder_7_sent_at is None:
                notify_training_due(assignment, days_left)
                kind = "training_due_7"
        elif days_left <= first:
            if assignment.reminder_30_sent_at is None:
                notify_training_due(assignment, days_left)
                kind = "training_due_30"
        else:
            continue
        if kind is None:
            counts["skipped"] += 1
            continue
        counts[kind] += 1
        reminded.setdefault((assignment.user_id, kind), []).append(assignment)

    for (_user_id, kind), assignments in reminded.items():
        if notify_supervisor_reminder(assignments, kind, today) is not None:
            counts[f"{kind}_supervisor"] += 1
    db.session.commit()
    current_app.logger.info("Daily notification job: %s", counts)
    return counts
