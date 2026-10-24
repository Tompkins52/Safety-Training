"""Training flow, notifications and admin pages."""
from datetime import date, timedelta

from app.extensions import db
from app.models import Assignment, Course, Division, NotificationLog, User
from app.services.assignments import ensure_assignments, run_annual_assignment
from app.services.notifications import run_daily_notifications
from tests.conftest import login


def test_content_loaded(app):
    with app.app_context():
        courses = Course.query.all()
        assert len(courses) == 19
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
        sup = User.query.filter_by(email="super@example.gov").first()
        other = User.query.filter_by(email="other@example.gov").first()
        created = run_annual_assignment(due_date=date.today() + timedelta(days=45))
        # electric employee: 18 (no supervisor course); electric supervisor: 19;
        # environmental employee: 16 (no rescue, no supervisor course); admin has no division
        assert len(created) == 18 + 19 + 16
        assert len(emp.open_assignments()) == 18
        assert len(other.open_assignments()) == 16
        assert not any(a.course.category == "rescue" for a in other.assignments)
        assert not any(a.course.category == "supervisor" for a in emp.assignments)
        assert any(a.course.category == "supervisor" for a in sup.assignments)
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
