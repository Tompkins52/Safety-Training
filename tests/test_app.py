"""End-to-end smoke tests: training flow, notifications, incidents and admin pages."""
import os
import sys
from datetime import date, timedelta

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import Assignment, Course, Division, Incident, NotificationLog, User  # noqa: E402
from app.services.assignments import ensure_assignments, run_annual_assignment  # noqa: E402
from app.services.content_loader import load_all_courses  # noqa: E402
from app.services.notifications import run_daily_notifications  # noqa: E402
from config import TestConfig  # noqa: E402

PASSWORD = "Testing-12345"


@pytest.fixture
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.drop_all()
        db.create_all()
        load_all_courses()
        divisions = {d.code: d for d in Division.query.all()}
        admin = User(first_name="Sam", last_name="Admin", email="admin@example.gov", role="admin")
        admin.set_password(PASSWORD)
        sup = User(first_name="Dana", last_name="Super", email="super@example.gov", role="supervisor", division=divisions["electric"])
        sup.set_password(PASSWORD)
        emp = User(first_name="James", last_name="Carter", email="emp@example.gov", role="employee", division=divisions["electric"], supervisor=sup)
        emp.set_password(PASSWORD)
        other = User(first_name="Ravi", last_name="Patel", email="other@example.gov", role="employee", division=divisions["environmental"])
        other.set_password(PASSWORD)
        db.session.add_all([admin, sup, emp, other])
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, email):
    return client.post("/login", data={"email": email, "password": PASSWORD}, follow_redirects=True)


def test_content_loaded(app):
    with app.app_context():
        courses = Course.query.all()
        assert len(courses) == 12
        for c in courses:
            assert len(c.questions) == 10, c.slug
            for q in c.questions:
                assert len(q.options) == 4
                assert 0 <= q.answer_index < 4
        rescue = {c.slug: c for c in courses if c.category == "rescue"}
        assert set(rescue) == {"pole-top-rescue", "bucket-truck-rescue"}
        assert rescue["pole-top-rescue"].division_codes == {"electric", "public"}
        top10 = sorted(c.top10_rank for c in courses if c.category == "osha_top10")
        assert top10 == list(range(1, 11))


def test_assignment_applies_division_rules(app):
    with app.app_context():
        emp = User.query.filter_by(email="emp@example.gov").first()
        other = User.query.filter_by(email="other@example.gov").first()
        created = run_annual_assignment(due_date=date.today() + timedelta(days=45))
        # electric employee + electric supervisor: 12 each; environmental: 10; admin has no division
        assert len(created) == 12 + 12 + 10
        assert len(emp.open_assignments()) == 12
        assert len(other.open_assignments()) == 10
        assert not any(a.course.category == "rescue" for a in other.assignments)
        # idempotent
        assert run_annual_assignment(due_date=date.today() + timedelta(days=45)) == []


def test_login_required(client):
    resp = client.get("/", follow_redirects=False)
    assert resp.status_code == 302
    assert "/login" in resp.headers["Location"]


def test_training_flow_pass_notifies_supervisor_and_renews(app, client):
    with app.app_context():
        emp = User.query.filter_by(email="emp@example.gov").first()
        course = Course.query.filter_by(slug="lockout-tagout").first()
        ensure_assignments(emp, due_date=date.today() + timedelta(days=10), courses=[course])
        db.session.commit()
        assignment = Assignment.query.filter_by(user_id=emp.id, course_id=course.id).first()
        assignment_id = assignment.id

    login(client, "emp@example.gov")
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Lockout/Tagout" in resp.data

    resp = client.get(f"/training/{assignment_id}")
    assert resp.status_code == 200
    assert b"Learning objectives" in resp.data
    assert b"Start the quiz" in resp.data

    resp = client.get(f"/training/{assignment_id}/quiz")
    assert resp.status_code == 200
    assert resp.data.count(b'<fieldset class="question">') == 10

    with app.app_context():
        course = Course.query.filter_by(slug="lockout-tagout").first()
        questions = list(course.questions)
        # First attempt: answer everything wrong.
        wrong = {f"q{q.id}": str((q.answer_index + 1) % 4) for q in questions}
        right = {f"q{q.id}": str(q.answer_index) for q in questions}

    resp = client.post(f"/training/{assignment_id}/quiz", data=dict(wrong, seed="x"), follow_redirects=True)
    assert resp.status_code == 200
    assert b"Not yet" in resp.data
    assert b"Retake the quiz" in resp.data

    resp = client.post(f"/training/{assignment_id}/quiz", data=dict(right, seed="x"), follow_redirects=True)
    assert resp.status_code == 200
    assert b"Passed with 100%" in resp.data

    with app.app_context():
        assignment = db.session.get(Assignment, assignment_id)
        assert assignment.status == "completed"
        assert assignment.score == 10 and assignment.attempts == 2
        assert assignment.supervisor_notified_at is not None
        notice = NotificationLog.query.filter_by(kind="training_completed").first()
        assert notice is not None
        assert notice.recipient_email == "super@example.gov"
        assert b"James Carter" in notice.body.encode() or "James Carter" in notice.body
        # next year's assignment exists
        renewal = Assignment.query.filter_by(user_id=assignment.user_id, course_id=assignment.course_id, cycle=2).first()
        assert renewal is not None
        assert renewal.due_date.year == date.today().year + 1 or (renewal.due_date - date.today()).days >= 364

    resp = client.get(f"/training/{assignment_id}/certificate")
    assert resp.status_code == 200
    assert b"Certificate of Completion" in resp.data
    assert b"James Carter" in resp.data


def test_daily_reminders(app):
    with app.app_context():
        emp = User.query.filter_by(email="emp@example.gov").first()
        courses = Course.query.filter(Course.slug.in_(["ladders", "scaffolding", "hazard-communication"])).all()
        today = date.today()
        a30 = ensure_assignments(emp, due_date=today + timedelta(days=30), courses=[courses[0]])[0]
        a7 = ensure_assignments(emp, due_date=today + timedelta(days=5), courses=[courses[1]])[0]
        aover = ensure_assignments(emp, due_date=today - timedelta(days=3), courses=[courses[2]])[0]
        db.session.commit()

        counts = run_daily_notifications()
        assert counts["training_due_30"] == 1
        assert counts["training_due_7"] == 1
        assert counts["training_overdue"] == 1
        assert a30.reminder_30_sent_at is not None
        assert a7.reminder_7_sent_at is not None
        assert aover.overdue_last_reminded_at is not None

        # Second run the same day sends nothing new.
        counts = run_daily_notifications()
        assert counts["training_due_30"] == 0 and counts["training_due_7"] == 0 and counts["training_overdue"] == 0
        assert counts["skipped"] == 3

        # 31 days before due: no reminder yet; exactly 30 days: reminder.
        far = ensure_assignments(emp, due_date=today + timedelta(days=31), courses=[Course.query.filter_by(slug="ladders").first()])
        assert far == []  # already has an open ladders assignment
        bodies = [n.body for n in NotificationLog.query.filter_by(kind="training_due_30").all()]
        assert any("due in 30 days" in b for b in bodies)
        subjects = [n.subject for n in NotificationLog.query.all()]
        assert any("OVERDUE" in s for s in subjects)


def test_incident_report_investigation_and_print(app, client):
    login(client, "emp@example.gov")
    resp = client.get("/incidents/new")
    assert resp.status_code == 200
    data = {
        "incident_type": "injury",
        "occurred_at": "2026-10-01T09:30",
        "location": "Pole 4421, Main St and 3rd Ave",
        "division_id": "",
        "severity": "moderate",
        "description": "Employee slipped on wet pole step while descending and cut left hand on a tool.",
        "immediate_actions": "First aid applied, supervisor notified.",
        "injured_person": "James Carter",
        "injured_job_title": "Lineworker",
        "body_part": "Left hand",
        "injury_nature": "Laceration",
        "treatment": "clinic",
        "days_away": "0",
        "days_restricted": "2",
    }
    resp = client.post("/incidents/new", data=data, follow_redirects=True)
    assert resp.status_code == 200
    assert b"INC-" in resp.data
    with app.app_context():
        incident = Incident.query.first()
        assert incident.incident_number.startswith("INC-2026-")
        assert incident.incident_type == "injury"
        assert incident.days_restricted == 2
        incident_id = incident.id
        notices = NotificationLog.query.filter_by(kind="incident_reported").all()
        recipients = {n.recipient_email for n in notices}
        assert "admin@example.gov" in recipients and "super@example.gov" in recipients

    # The reporter can view and print but not investigate.
    assert client.get(f"/incidents/{incident_id}").status_code == 200
    assert client.get(f"/incidents/{incident_id}/print").status_code == 200
    assert client.get(f"/incidents/{incident_id}/investigation").status_code == 403

    # Another employee cannot see it.
    client.get("/logout")
    login(client, "other@example.gov")
    assert client.get(f"/incidents/{incident_id}").status_code == 403

    # Supervisor investigates: closing without causes is refused.
    client.get("/logout")
    login(client, "super@example.gov")
    resp = client.post(f"/incidents/{incident_id}/status", data={"status": "closed"}, follow_redirects=True)
    assert b"Before closing" in resp.data
    resp = client.post(
        f"/incidents/{incident_id}/investigation",
        data={
            "investigation_date": "2026-10-02",
            "direct_cause": "Wet pole step and worn glove grip.",
            "root_cause": "No procedure for pausing pole work after rain; gloves not inspected.",
            "contributing_factor_type": "environmental",
            "contributing_factor_detail": "Rain earlier that morning left steps wet.",
            "osha_recordable": "yes",
        },
        follow_redirects=True,
    )
    assert resp.status_code == 200
    resp = client.post(
        f"/incidents/{incident_id}/actions",
        data={"description": "Add wet-weather pole climbing pause to the work rules.", "responsible_name": "Dana Super", "target_date": "2026-11-01"},
        follow_redirects=True,
    )
    assert b"Add wet-weather" in resp.data
    resp = client.post(f"/incidents/{incident_id}/status", data={"status": "closed"}, follow_redirects=True)
    assert b"closed" in resp.data.lower()
    with app.app_context():
        incident = db.session.get(Incident, incident_id)
        assert incident.status == "closed"
        assert incident.contributing_factor_type == "environmental"
        assert incident.osha_recordable is True
        assert len(incident.corrective_actions) == 1
        assert NotificationLog.query.filter_by(kind="incident_closed").count() == 2  # reporter + supervisor
    resp = client.get(f"/incidents/{incident_id}/print")
    assert b"Incident Report" in resp.data
    assert b"Wet pole step" in resp.data
    assert b"Environmental" in resp.data


def test_vehicle_and_property_incident_fields(app, client):
    login(client, "other@example.gov")
    resp = client.post(
        "/incidents/new",
        data={
            "incident_type": "vehicle",
            "occurred_at": "2026-09-15T14:00",
            "location": "Yard",
            "severity": "minor",
            "description": "Backed refuse truck into gate post.",
            "vehicle_unit": "ES-204",
            "driver_name": "Ravi Patel",
            "police_report_number": "",
            "vehicle_damage_estimate": "1250.50",
            "drug_alcohol_test": "completed",
            "seat_belt_used": "yes",
        },
        follow_redirects=True,
    )
    assert resp.status_code == 200
    resp = client.post(
        "/incidents/new",
        data={
            "incident_type": "property_damage",
            "occurred_at": "2026-09-16T08:00",
            "location": "12 Elm St",
            "severity": "minor",
            "description": "Mower threw a rock through a resident's window.",
            "property_description": "Residential window",
            "property_owner": "third_party",
            "estimated_cost": "400",
        },
        follow_redirects=True,
    )
    assert resp.status_code == 200
    with app.app_context():
        vehicle = Incident.query.filter_by(incident_type="vehicle").first()
        assert vehicle.vehicle_damage_estimate == 1250.5 and vehicle.seat_belt_used is True
        prop = Incident.query.filter_by(incident_type="property_damage").first()
        assert prop.property_owner == "third_party" and prop.estimated_cost == 400
        numbers = sorted(i.incident_number for i in Incident.query.all())
        assert numbers == ["INC-2026-0001", "INC-2026-0002"]


def test_admin_pages_and_csv(app, client):
    with app.app_context():
        run_annual_assignment(due_date=date.today() + timedelta(days=20))
    login(client, "admin@example.gov")
    for path in ["/", "/admin/reports", "/admin/employees", "/admin/assign", "/admin/courses", "/admin/divisions", "/admin/notifications", "/catalog", "/about", "/team", "/incidents"]:
        resp = client.get(path)
        assert resp.status_code == 200, path
    resp = client.get("/admin/reports/export.csv")
    assert resp.status_code == 200
    assert resp.data.startswith(b"Employee,Email,Division,Supervisor,")
    # employee creation with immediate assignment
    resp = client.post(
        "/admin/employees/new",
        data={
            "first_name": "New",
            "last_name": "Hire",
            "email": "new.hire@example.gov",
            "role": "employee",
            "division_id": str(Division.query.filter_by(code="public").first().id) if False else "",
            "is_active": "on",
            "assign_now": "on",
            "due_date": (date.today() + timedelta(days=40)).strftime("%Y-%m-%d"),
        },
        follow_redirects=True,
    )
    assert resp.status_code == 200
    with app.app_context():
        user = User.query.filter_by(email="new.hire@example.gov").first()
        assert user is not None and user.must_change_password
    # run the reminder job from the admin page
    resp = client.post("/admin/notifications/run", follow_redirects=True)
    assert b"Reminder job finished" in resp.data


def test_employee_cannot_open_admin(client):
    login(client, "emp@example.gov")
    assert client.get("/admin/reports").status_code == 403
    assert client.get("/team").status_code == 403
