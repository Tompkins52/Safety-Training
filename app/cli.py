"""Command line tools. Run `flask --help` to see them.

    flask init-db                      create tables, divisions and load course content
    flask load-content                 reload courses and quizzes from content/courses/*.json
    flask create-admin                 create or update a safety administrator account
    flask seed-demo                    create demo divisions, employees and assignments
    flask assign-annual --due DATE     assign every applicable course to every employee
    flask run-notifications            run the daily reminder job once (for cron)
    flask send-test-email ADDRESS      send a test message using the SMTP settings
"""
import secrets
from datetime import date, timedelta

import click
from flask import current_app
from flask.cli import with_appcontext

from .extensions import db
from .models import Division, NotificationLog, User
from .services import notifications
from .services.assignments import ensure_assignments, run_annual_assignment
from .services.content_loader import ensure_divisions, load_all_courses
from .services.mailer import send_email
from .utils import parse_date


@click.command("init-db")
@with_appcontext
def init_db():
    """Create tables, default divisions and load the training content."""
    db.create_all()
    ensure_divisions()
    results = load_all_courses()
    click.echo(f"Database ready. {len(results)} courses loaded from {current_app.config['CONTENT_DIR']}.")


@click.command("load-content")
@with_appcontext
def load_content():
    """Reload course content and quizzes from the content folder."""
    results = load_all_courses()
    for course, created, filename in results:
        click.echo(f"  {'created' if created else 'updated'}  {course.slug}  ({filename}, {len(course.questions)} questions)")
    click.echo(f"{len(results)} courses loaded.")


@click.command("create-admin")
@click.option("--email", prompt=True)
@click.option("--first-name", prompt="First name")
@click.option("--last-name", prompt="Last name")
@click.option("--password", default=None, help="Leave blank to generate one.")
@with_appcontext
def create_admin(email, first_name, last_name, password):
    """Create a safety administrator account (or promote an existing user)."""
    email = email.strip().lower()
    user = User.query.filter_by(email=email).first()
    generated = False
    if password is None:
        password = secrets.token_urlsafe(10)
        generated = True
    if user is None:
        user = User(email=email, first_name=first_name, last_name=last_name, role="admin", job_title="Safety Administrator")
        db.session.add(user)
        click.echo(f"Created administrator {email}")
    else:
        user.role = "admin"
        click.echo(f"Updated {email}: role set to admin")
    user.set_password(password)
    user.must_change_password = True
    db.session.commit()
    if generated:
        click.echo(f"Temporary password: {password}")
    click.echo("The user will be asked to change the password at first login.")


@click.command("seed-demo")
@with_appcontext
def seed_demo():
    """Create demo accounts and assignments so the platform can be explored."""
    db.create_all()
    ensure_divisions()
    load_all_courses()
    divisions = {d.code: d for d in Division.query.all()}
    password = "Welcome123!"

    def upsert(email, first, last, role, division, title, supervisor=None, employee_number=None):
        user = User.query.filter_by(email=email).first()
        if user is None:
            user = User(email=email, first_name=first, last_name=last)
            user.set_password(password)
            db.session.add(user)
        user.role = role
        user.division = division
        user.job_title = title
        user.supervisor = supervisor
        user.employee_number = employee_number
        db.session.flush()
        return user

    admin = upsert("safety.admin@example.gov", "Sam", "Rivera", "admin", None, "Safety Administrator", None, "1001")
    sup_e = upsert("electric.super@example.gov", "Dana", "Whitfield", "supervisor", divisions["electric"], "Line Superintendent", admin, "2001")
    sup_n = upsert("environmental.super@example.gov", "Luis", "Ortega", "supervisor", divisions["environmental"], "Plant Superintendent", admin, "3001")
    sup_p = upsert("public.super@example.gov", "Karen", "Blake", "supervisor", divisions["public"], "Streets Superintendent", admin, "4001")
    employees = [
        upsert("j.carter@example.gov", "James", "Carter", "employee", divisions["electric"], "Journeyman Lineworker", sup_e, "2010"),
        upsert("m.nguyen@example.gov", "Mai", "Nguyen", "employee", divisions["electric"], "Apprentice Lineworker", sup_e, "2011"),
        upsert("r.patel@example.gov", "Ravi", "Patel", "employee", divisions["environmental"], "Wastewater Operator", sup_n, "3010"),
        upsert("t.brooks@example.gov", "Tina", "Brooks", "employee", divisions["environmental"], "Water Distribution Tech", sup_n, "3011"),
        upsert("d.kowalski@example.gov", "Dan", "Kowalski", "employee", divisions["public"], "Equipment Operator", sup_p, "4010"),
        upsert("a.flores@example.gov", "Ana", "Flores", "employee", divisions["public"], "Signs and Signals Tech", sup_p, "4011"),
    ]
    db.session.commit()

    # Assignments with a spread of due dates so the dashboard and reminder job have something to show.
    today = date.today()
    schedule = {
        "j.carter@example.gov": today + timedelta(days=20),
        "m.nguyen@example.gov": today + timedelta(days=45),
        "r.patel@example.gov": today - timedelta(days=5),
        "t.brooks@example.gov": today + timedelta(days=60),
        "d.kowalski@example.gov": today + timedelta(days=6),
        "a.flores@example.gov": today + timedelta(days=30),
    }
    total = 0
    for user in employees + [sup_e, sup_n, sup_p]:
        due = schedule.get(user.email, today + timedelta(days=45))
        total += len(ensure_assignments(user, due_date=due, assigned_by=admin))
    db.session.commit()

    click.echo("Demo data loaded. All demo accounts use the password: " + password)
    click.echo("  Safety administrator: safety.admin@example.gov")
    click.echo("  Supervisors:          electric.super@example.gov, environmental.super@example.gov, public.super@example.gov")
    click.echo("  Employees:            j.carter@example.gov (Electric), r.patel@example.gov (Environmental), d.kowalski@example.gov (Public) and others")
    click.echo(f"  {total} training assignments created.")


@click.command("assign-annual")
@click.option("--due", "due", default=None, help="Due date (YYYY-MM-DD). Default: DEFAULT_DUE_DAYS from today.")
@click.option("--division", "division_code", default=None, help="Limit to one division code (electric, environmental, public).")
@click.option("--notify/--no-notify", default=False, help="Email employees that training was assigned.")
@with_appcontext
def assign_annual(due, division_code, notify):
    """Assign every applicable course to every active employee who lacks an open assignment."""
    due_date = parse_date(due) if due else None
    if due and not due_date:
        raise click.BadParameter("use YYYY-MM-DD", param_hint="--due")
    divisions = None
    if division_code:
        division = Division.query.filter_by(code=division_code).first()
        if not division:
            raise click.BadParameter(f"unknown division '{division_code}'", param_hint="--division")
        divisions = [division]
    created = run_annual_assignment(due_date=due_date, divisions=divisions, send_notice=notify)
    click.echo(f"{len(created)} assignments created.")


@click.command("run-notifications")
@click.option("--as-of", "as_of", default=None, help="Run as if today were this date (YYYY-MM-DD).")
@with_appcontext
def run_notifications(as_of):
    """Run the daily reminder job once. Use from cron when the built-in scheduler is disabled."""
    today = parse_date(as_of) if as_of else None
    counts = notifications.run_daily_notifications(today=today)
    click.echo(
        f"30-day reminders: {counts['training_due_30']}, 7-day reminders: {counts['training_due_7']}, "
        f"overdue reminders: {counts['training_overdue']}, already sent: {counts['skipped']}"
    )


@click.command("send-test-email")
@click.argument("address")
@with_appcontext
def send_test_email(address):
    """Send a test message to ADDRESS using the configured SMTP settings."""
    delivered, detail = send_email(
        address,
        f"[{current_app.config['ORG_NAME']}] Safety training platform test message",
        "This is a test message from the safety training platform. Email delivery is working.",
    )
    db.session.add(
        NotificationLog(
            kind="test", recipient_email=address, subject="Test message", body="Test message", delivered=delivered, detail=detail
        )
    )
    db.session.commit()
    click.echo(f"delivered={delivered} ({detail})")


def register_cli(app):
    for command in (init_db, load_content, create_admin, seed_demo, assign_annual, run_notifications, send_test_email):
        app.cli.add_command(command)
