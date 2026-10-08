import csv
import io
import secrets
from datetime import date, timedelta

from flask import Blueprint, Response, abort, current_app, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from ..extensions import db
from ..models import ROLE_LABELS, ROLES, Assignment, Course, Division, NotificationLog, User
from ..services import notifications
from ..services.assignments import course_matrix, run_annual_assignment
from ..services.content_loader import load_all_courses
from ..utils import parse_date, parse_int, role_required

bp = Blueprint("admin", __name__)


@bp.before_request
@login_required
@role_required("admin")
def restrict_to_admins():
    return None


@bp.route("/")
def index():
    return redirect(url_for("admin.reports"))


# ------------------------------------------------------------------ employees


@bp.route("/employees")
def employees():
    show_inactive = request.args.get("inactive") == "1"
    query = User.query
    if not show_inactive:
        query = query.filter_by(is_active_employee=True)
    users = query.order_by(User.last_name, User.first_name).all()
    return render_template("admin/employees.html", users=users, show_inactive=show_inactive, role_labels=ROLE_LABELS)


def _employee_form_context(user):
    return {
        "user": user,
        "divisions": Division.query.order_by(Division.name).all(),
        "supervisors": User.query.filter(User.role.in_(["supervisor", "admin"]), User.is_active_employee.is_(True))
        .order_by(User.last_name)
        .all(),
        "roles": ROLES,
        "role_labels": ROLE_LABELS,
    }


def _apply_employee_form(user, errors):
    user.first_name = (request.form.get("first_name") or "").strip()
    user.last_name = (request.form.get("last_name") or "").strip()
    email = (request.form.get("email") or "").strip().lower()
    if not user.first_name or not user.last_name:
        errors.append("First and last name are required.")
    if not email or "@" not in email:
        errors.append("A valid email address is required.")
    else:
        existing = User.query.filter_by(email=email).first()
        if existing and existing.id != user.id:
            errors.append("Another account already uses that email address.")
        user.email = email
    employee_number = (request.form.get("employee_number") or "").strip() or None
    if employee_number:
        existing = User.query.filter_by(employee_number=employee_number).first()
        if existing and existing.id != user.id:
            errors.append("Another account already uses that employee number.")
    user.employee_number = employee_number
    user.job_title = (request.form.get("job_title") or "").strip() or None
    role = request.form.get("role")
    user.role = role if role in ROLES else "employee"
    division_id = parse_int(request.form.get("division_id"))
    user.division_id = division_id if division_id and db.session.get(Division, division_id) else None
    supervisor_id = parse_int(request.form.get("supervisor_id"))
    if supervisor_id and supervisor_id != user.id and db.session.get(User, supervisor_id):
        user.supervisor_id = supervisor_id
    else:
        user.supervisor_id = None
    user.hire_date = parse_date(request.form.get("hire_date"))
    user.is_active_employee = request.form.get("is_active") == "on"


@bp.route("/employees/new", methods=["GET", "POST"])
def employee_new():
    user = User(role="employee", is_active_employee=True)
    if request.method == "POST":
        errors = []
        _apply_employee_form(user, errors)
        password = (request.form.get("password") or "").strip()
        generated = False
        if not password:
            password = secrets.token_urlsafe(9)
            generated = True
        elif len(password) < 10:
            errors.append("Temporary password must be at least 10 characters.")
        if errors:
            for message in errors:
                flash(message, "danger")
        else:
            user.set_password(password)
            user.must_change_password = True
            db.session.add(user)
            db.session.commit()
            if request.form.get("assign_now") == "on":
                from ..services.assignments import ensure_assignments

                due = parse_date(request.form.get("due_date")) or (date.today() + timedelta(days=current_app.config["DEFAULT_DUE_DAYS"]))
                created = ensure_assignments(user, due_date=due, assigned_by=current_user, send_notice=request.form.get("notify") == "on")
                db.session.commit()
                flash(f"{len(created)} training assignments created for {user.full_name}.", "info")
            if generated:
                flash(f"Account created for {user.full_name}. Temporary password: {password}", "success")
            else:
                flash(f"Account created for {user.full_name}.", "success")
            return redirect(url_for("admin.employees"))
    default_due = date.today() + timedelta(days=current_app.config["DEFAULT_DUE_DAYS"])
    return render_template("admin/employee_form.html", creating=True, default_due=default_due, **_employee_form_context(user))


@bp.route("/employees/<int:user_id>/edit", methods=["GET", "POST"])
def employee_edit(user_id):
    user = db.session.get(User, user_id)
    if user is None:
        abort(404)
    if request.method == "POST":
        errors = []
        _apply_employee_form(user, errors)
        if user.id == current_user.id and user.role != "admin":
            errors.append("You cannot remove your own administrator role.")
        if user.id == current_user.id and not user.is_active_employee:
            errors.append("You cannot deactivate your own account.")
        if errors:
            db.session.rollback()
            for message in errors:
                flash(message, "danger")
        else:
            db.session.commit()
            flash("Employee updated.", "success")
            return redirect(url_for("admin.employees"))
    assignments = sorted(user.assignments, key=lambda a: (a.is_completed, a.due_date))
    return render_template("admin/employee_form.html", creating=False, assignments=assignments, **_employee_form_context(user))


@bp.route("/employees/<int:user_id>/reset-password", methods=["POST"])
def employee_reset_password(user_id):
    user = db.session.get(User, user_id)
    if user is None:
        abort(404)
    password = secrets.token_urlsafe(9)
    user.set_password(password)
    user.must_change_password = True
    db.session.commit()
    flash(f"Temporary password for {user.full_name}: {password}", "success")
    return redirect(url_for("admin.employee_edit", user_id=user.id))


# ------------------------------------------------------------------ divisions


@bp.route("/divisions", methods=["GET", "POST"])
def divisions():
    if request.method == "POST":
        code = (request.form.get("code") or "").strip().lower().replace(" ", "-")
        name = (request.form.get("name") or "").strip()
        if not code or not name:
            flash("Both a code and a name are required.", "danger")
        elif Division.query.filter_by(code=code).first():
            flash("That division code already exists.", "danger")
        else:
            db.session.add(Division(code=code, name=name))
            db.session.commit()
            flash(f"Division '{name}' added.", "success")
        return redirect(url_for("admin.divisions"))
    items = Division.query.order_by(Division.name).all()
    return render_template("admin/divisions.html", divisions=items)


@bp.route("/divisions/<int:division_id>/rename", methods=["POST"])
def division_rename(division_id):
    division = db.session.get(Division, division_id)
    if division is None:
        abort(404)
    name = (request.form.get("name") or "").strip()
    if name:
        division.name = name
        db.session.commit()
        flash("Division renamed.", "success")
    return redirect(url_for("admin.divisions"))


# ------------------------------------------------------------------ courses


@bp.route("/courses")
def courses():
    items = Course.query.order_by(Course.category, Course.top10_rank, Course.title).all()
    return render_template("admin/courses.html", courses=items, divisions=Division.query.order_by(Division.name).all())


@bp.route("/courses/<int:course_id>", methods=["GET", "POST"])
def course_edit(course_id):
    course = db.session.get(Course, course_id)
    if course is None:
        abort(404)
    all_divisions = Division.query.order_by(Division.name).all()
    if request.method == "POST":
        selected = set(request.form.getlist("divisions"))
        course.divisions = [d for d in all_divisions if str(d.id) in selected]
        course.is_active = request.form.get("is_active") == "on"
        renewal = parse_int(request.form.get("renewal_months"))
        if renewal and renewal > 0:
            course.renewal_months = renewal
        db.session.commit()
        flash("Course settings saved.", "success")
        return redirect(url_for("admin.courses"))
    return render_template("admin/course_edit.html", course=course, divisions=all_divisions)


@bp.route("/courses/reload", methods=["POST"])
def courses_reload():
    results = load_all_courses()
    flash(f"{len(results)} courses reloaded from the content folder.", "success")
    return redirect(url_for("admin.courses"))


# ------------------------------------------------------------------ assignments


@bp.route("/assign", methods=["GET", "POST"])
def assign():
    all_divisions = Division.query.order_by(Division.name).all()
    all_courses = Course.query.filter_by(is_active=True).order_by(Course.category, Course.top10_rank, Course.title).all()
    default_due = date.today() + timedelta(days=current_app.config["DEFAULT_DUE_DAYS"])
    if request.method == "POST":
        due = parse_date(request.form.get("due_date"))
        if not due:
            flash("Enter a valid due date.", "danger")
        else:
            division_ids = set(request.form.getlist("divisions"))
            course_ids = set(request.form.getlist("courses"))
            divisions = [d for d in all_divisions if str(d.id) in division_ids] or None
            courses = [c for c in all_courses if str(c.id) in course_ids] or None
            notify = request.form.get("notify") == "on"
            created = run_annual_assignment(due_date=due, divisions=divisions, courses=courses, assigned_by=current_user, send_notice=notify)
            flash(
                f"{len(created)} new assignments created with a due date of {due:%b %d, %Y}."
                + (" Employees have been emailed." if notify and created else ""),
                "success",
            )
            return redirect(url_for("admin.reports"))
    return render_template("admin/assign.html", divisions=all_divisions, courses=all_courses, default_due=default_due)


# ------------------------------------------------------------------ reports


def _report_data():
    division_id = parse_int(request.args.get("division"))
    users_q = User.query.filter_by(is_active_employee=True)
    if division_id:
        users_q = users_q.filter_by(division_id=division_id)
    users = users_q.order_by(User.last_name, User.first_name).all()
    courses = Course.query.filter_by(is_active=True).order_by(Course.category, Course.top10_rank, Course.title).all()
    return division_id, users, courses, course_matrix(users, courses)


@bp.route("/reports")
def reports():
    division_id, users, courses, matrix = _report_data()
    overdue = (
        Assignment.query.join(User, Assignment.user_id == User.id)
        .filter(Assignment.status != "completed", Assignment.due_date < date.today(), User.is_active_employee.is_(True))
        .order_by(Assignment.due_date)
        .all()
    )
    if division_id:
        overdue = [a for a in overdue if a.user.division_id == division_id]
    return render_template(
        "admin/reports.html",
        users=users,
        courses=courses,
        matrix=matrix,
        overdue=overdue,
        divisions=Division.query.order_by(Division.name).all(),
        division_id=division_id,
    )


@bp.route("/reports/export.csv")
def reports_export():
    _division_id, _users, courses, matrix = _report_data()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Employee", "Email", "Division", "Supervisor"] + [c.title for c in courses])
    for row in matrix:
        user = row["user"]
        cells = []
        for cell in row["cells"]:
            a = cell["assignment"]
            if a is None:
                cells.append("" if cell["applies"] else "n/a")
            elif a.is_completed:
                cells.append(f"Completed {a.completed_at:%Y-%m-%d} ({a.percent}%)")
            elif a.is_overdue:
                cells.append(f"OVERDUE (due {a.due_date:%Y-%m-%d})")
            else:
                cells.append(f"Due {a.due_date:%Y-%m-%d}")
        writer.writerow(
            [user.full_name, user.email, user.division.name if user.division else "", user.supervisor.full_name if user.supervisor else ""]
            + cells
        )
    filename = f"training-compliance-{date.today():%Y-%m-%d}.csv"
    return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}"})


# ------------------------------------------------------------------ notifications


@bp.route("/notifications")
def notification_log():
    kind = request.args.get("kind")
    query = NotificationLog.query
    if kind:
        query = query.filter_by(kind=kind)
    entries = query.order_by(NotificationLog.sent_at.desc()).limit(300).all()
    return render_template(
        "admin/notifications.html",
        entries=entries,
        kind=kind,
        kinds=NotificationLog.KIND_LABELS,
        mail_enabled=current_app.config.get("MAIL_ENABLED"),
        mail_server=current_app.config.get("MAIL_SERVER"),
        scheduler_enabled=current_app.config.get("SCHEDULER_ENABLED"),
        scheduler_time=f"{current_app.config.get('SCHEDULER_HOUR', 6):02d}:{current_app.config.get('SCHEDULER_MINUTE', 0):02d}",
    )


@bp.route("/notifications/run", methods=["POST"])
def notifications_run():
    counts = notifications.run_daily_notifications()
    flash(
        f"Reminder job finished: {counts['training_due_30']} thirty-day, {counts['training_due_7']} seven-day and "
        f"{counts['training_overdue']} overdue reminders sent ({counts['skipped']} already sent earlier).",
        "success",
    )
    return redirect(url_for("admin.notification_log"))
