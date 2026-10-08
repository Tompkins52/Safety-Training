from datetime import date, datetime, timedelta

from flask import Blueprint, render_template
from flask_login import current_user, login_required

from ..models import Assignment, Course, Division, Incident, User
from ..services.assignments import compliance_rows
from ..services.content_loader import load_top10
from ..utils import role_required
from ..timeutil import now

bp = Blueprint("main", __name__)


@bp.route("/")
@login_required
def dashboard():
    user = current_user
    assignments = sorted(user.assignments, key=lambda a: (a.is_completed, a.due_date))
    open_items = [a for a in assignments if not a.is_completed]
    overdue = [a for a in open_items if a.is_overdue]
    due_soon = [a for a in open_items if a.is_due_soon]
    upcoming = [a for a in open_items if not a.is_overdue and not a.is_due_soon]
    completed = [a for a in assignments if a.is_completed]
    completed.sort(key=lambda a: a.completed_at or datetime.min, reverse=True)
    my_incidents = Incident.query.filter_by(reported_by_id=user.id).order_by(Incident.reported_at.desc()).limit(5).all()

    context = {
        "overdue": overdue,
        "due_soon": due_soon,
        "upcoming": upcoming,
        "completed": completed[:6],
        "my_incidents": my_incidents,
    }
    if user.is_supervisor:
        context["team_rows"] = compliance_rows(sorted(user.direct_reports, key=lambda u: u.last_name))
    if user.is_admin:
        context["org_stats"] = organization_stats()
        context["recent_incidents"] = Incident.query.order_by(Incident.reported_at.desc()).limit(6).all()
    return render_template("dashboard.html", **context)


def organization_stats():
    today = date.today()
    soon = today + timedelta(days=30)
    year_ago = now() - timedelta(days=365)
    active_users = User.query.filter_by(is_active_employee=True)
    open_q = Assignment.query.join(User, Assignment.user_id == User.id).filter(Assignment.status != "completed", User.is_active_employee.is_(True))
    stats = {
        "employees": active_users.count(),
        "open": open_q.count(),
        "overdue": open_q.filter(Assignment.due_date < today).count(),
        "due_soon": open_q.filter(Assignment.due_date >= today, Assignment.due_date <= soon).count(),
        "completed_12mo": Assignment.query.filter(Assignment.status == "completed", Assignment.completed_at >= year_ago).count(),
        "open_incidents": Incident.query.filter(Incident.status != "closed").count(),
        "incidents_12mo": Incident.query.filter(Incident.occurred_at >= year_ago).count(),
        "courses": Course.query.filter_by(is_active=True).count(),
        "divisions": [],
    }
    for division in Division.query.order_by(Division.name).all():
        users = [u for u in division.users if u.is_active_employee]
        ids = [u.id for u in users]
        if ids:
            div_open = Assignment.query.filter(Assignment.user_id.in_(ids), Assignment.status != "completed")
            div_overdue = div_open.filter(Assignment.due_date < today).count()
            div_open_count = div_open.count()
        else:
            div_overdue = div_open_count = 0
        on_track = div_open_count - div_overdue
        stats["divisions"].append(
            {
                "division": division,
                "employees": len(users),
                "open": div_open_count,
                "overdue": div_overdue,
                "on_track_pct": round(100 * on_track / div_open_count) if div_open_count else 100,
                "open_incidents": Incident.query.filter(Incident.division_id == division.id, Incident.status != "closed").count(),
            }
        )
    return stats


@bp.route("/team")
@login_required
@role_required("supervisor", "admin")
def team():
    if current_user.is_admin and not current_user.direct_reports:
        members = User.query.filter_by(is_active_employee=True).order_by(User.last_name, User.first_name).all()
    else:
        members = sorted(current_user.direct_reports, key=lambda u: (u.last_name, u.first_name))
    rows = compliance_rows(members)
    recent_completions = (
        Assignment.query.filter(Assignment.user_id.in_([u.id for u in members] or [0]), Assignment.status == "completed")
        .order_by(Assignment.completed_at.desc())
        .limit(10)
        .all()
    )
    return render_template("team.html", rows=rows, recent_completions=recent_completions)


@bp.route("/catalog")
@login_required
def catalog():
    courses = Course.query.filter_by(is_active=True).order_by(Course.category, Course.top10_rank, Course.title).all()
    top10 = load_top10()
    return render_template("catalog.html", courses=courses, top10=top10)


@bp.route("/about")
@login_required
def about():
    return render_template("about.html")
