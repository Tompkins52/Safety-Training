"""Assignment lifecycle: annual, new hire and individual assignments, grading quizzes, renewing.

Every assignment carries a reason:
  annual      the yearly cycle for every course that applies to the division
  new_hire    the required new hire track (courses flagged new_hire), due 30 days after hire
  individual  one employee, chosen courses, granted by the safety administrator;
              bypasses the division rule but never duplicates an open assignment
"""
import calendar
import json
import random
from datetime import date, timedelta

from flask import current_app

from ..extensions import db
from ..timeutil import now
from ..models import ASSIGNMENT_REASONS, Assignment, Course, QuizAttempt, User
from . import notifications

NEW_HIRE_DUE_DAYS = 30
NEW_HIRE_WINDOW_DAYS = 90


def add_months(d, months):
    """Return date d moved forward by a number of months, clamped to month end."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def applicable_courses(user):
    """Active courses that apply to the user's division."""
    if user.division is None:
        return []
    return [c for c in Course.query.filter_by(is_active=True).order_by(Course.category, Course.top10_rank, Course.title) if user.division in c.divisions]


def open_assignment(user, course):
    return (
        Assignment.query.filter_by(user_id=user.id, course_id=course.id)
        .filter(Assignment.status != "completed")
        .order_by(Assignment.due_date)
        .first()
    )


def latest_assignment(user, course):
    return (
        Assignment.query.filter_by(user_id=user.id, course_id=course.id)
        .order_by(Assignment.cycle.desc(), Assignment.id.desc())
        .first()
    )


def _new_assignment(user, course, due_date, assigned_by=None, reason="annual"):
    """Build (and add to the session) the next-cycle assignment for one user and course."""
    previous = latest_assignment(user, course)
    assignment = Assignment(
        user=user,
        course=course,
        cycle=previous.cycle + 1 if previous else 1,
        assigned_on=date.today(),
        due_date=due_date,
        reason=reason,
        assigned_by_id=assigned_by.id if assigned_by else None,
    )
    db.session.add(assignment)
    return assignment


def ensure_assignments(user, due_date=None, courses=None, assigned_by=None, send_notice=False, reason="annual"):
    """Create an open assignment for each applicable course the user lacks one for.

    Returns the list of assignments created. Idempotent: running it twice
    creates nothing the second time. `reason` is stored on each assignment.
    """
    due_date = due_date or (date.today() + timedelta(days=current_app.config["DEFAULT_DUE_DAYS"]))
    created = []
    for course in courses or applicable_courses(user):
        if not course.is_active or not course.applies_to(user):
            continue
        if open_assignment(user, course):
            continue
        created.append(_new_assignment(user, course, due_date, assigned_by, reason))
    db.session.flush()
    if send_notice:
        for assignment in created:
            notifications.notify_training_assigned(assignment)
    return created


def run_annual_assignment(due_date=None, divisions=None, courses=None, assigned_by=None, send_notice=False, reason="annual"):
    """Assign every applicable course to every active employee. Returns created assignments."""
    users = User.query.filter_by(is_active_employee=True)
    if divisions:
        users = users.filter(User.division_id.in_([d.id for d in divisions]))
    created = []
    for user in users.all():
        created.extend(ensure_assignments(user, due_date, courses, assigned_by, send_notice, reason))
    db.session.commit()
    return created


# --------------------------------------------------------------------------- new hire track


def new_hire_courses(user=None):
    """Active courses flagged new_hire; limited to those that apply to the user when one is given."""
    courses = Course.query.filter_by(is_active=True, new_hire=True).order_by(Course.category, Course.top10_rank, Course.title).all()
    if user is None:
        return courses
    return [c for c in courses if c.applies_to(user)]


def new_hire_due_date(user, today=None):
    """Default due date for the new hire track: hire date + 30 days, else DEFAULT_DUE_DAYS from today."""
    today = today or date.today()
    if user.hire_date:
        return user.hire_date + timedelta(days=NEW_HIRE_DUE_DAYS)
    return today + timedelta(days=current_app.config["DEFAULT_DUE_DAYS"])


def assign_new_hire_training(user, due_date=None, assigned_by=None, send_notice=False):
    """Give the user every new hire course that applies to their division, reason "new_hire".

    Courses the user already has an open assignment for are left alone, so
    calling this twice creates nothing the second time.
    """
    courses = new_hire_courses(user)
    if not courses:
        return []
    return ensure_assignments(
        user,
        due_date=due_date or new_hire_due_date(user),
        courses=courses,
        assigned_by=assigned_by,
        send_notice=send_notice,
        reason="new_hire",
    )


def new_hire_progress(user):
    """Completion of the user's new hire track: {"items", "open", "completed", "total", "percent"}."""
    items = sorted((a for a in user.assignments if a.reason == "new_hire"), key=lambda a: (a.is_completed, a.due_date, a.id))
    open_items = [a for a in items if not a.is_completed]
    total = len(items)
    completed = total - len(open_items)
    return {
        "items": items,
        "open": open_items,
        "completed": completed,
        "total": total,
        "percent": round(100 * completed / total) if total else 0,
        "overdue": sum(1 for a in open_items if a.is_overdue),
        "next_due": min((a.due_date for a in open_items), default=None),
    }


def is_recent_hire(user, today=None):
    today = today or date.today()
    return bool(user.hire_date) and (today - user.hire_date).days <= NEW_HIRE_WINDOW_DAYS


def new_hire_roster(today=None):
    """Active employees hired in the last 90 days or holding any new hire assignment,
    each with their progress, for the admin New hire training page."""
    today = today or date.today()
    rows = []
    for user in User.query.filter_by(is_active_employee=True).order_by(User.last_name, User.first_name).all():
        progress = new_hire_progress(user)
        if not is_recent_hire(user, today) and not progress["total"]:
            continue
        rows.append({"user": user, "progress": progress, "recent_hire": is_recent_hire(user, today)})
    return rows


# --------------------------------------------------------------------------- individual assignments


def assign_individual(user, courses, due_date, assigned_by=None, note=None, send_notice=True):
    """Assign the chosen courses to one employee, reason "individual".

    The division rule does not apply: any active course can be assigned,
    including the supervisor course. A course the employee already has an
    open assignment for is skipped. Returns (created, skipped).
    """
    created, skipped = [], []
    for course in courses:
        if open_assignment(user, course):
            skipped.append(course)
            continue
        created.append(_new_assignment(user, course, due_date, assigned_by, "individual"))
    db.session.flush()
    if send_notice:
        for assignment in created:
            notifications.notify_training_assigned(assignment, note=note)
    return created, skipped


def assignments_by_reason(assignments):
    """Group assignments for display: [(reason, label, items)] in new hire, individual, annual order."""
    groups = []
    for reason in ("new_hire", "individual", "annual"):
        items = sorted((a for a in assignments if (a.reason or "annual") == reason), key=lambda a: (a.is_completed, a.due_date, a.id))
        if items:
            groups.append((reason, ASSIGNMENT_REASONS[reason], items))
    return groups


def quiz_questions(assignment, seed=None):
    """The questions for one quiz attempt, in a shuffled order."""
    questions = list(assignment.course.questions)
    rnd = random.Random(seed)
    rnd.shuffle(questions)
    limit = current_app.config.get("QUIZ_QUESTION_COUNT") or len(questions)
    return questions[:limit]


def start_assignment(assignment):
    if assignment.status == "assigned":
        assignment.status = "in_progress"
        assignment.started_at = now()
        db.session.commit()


def grade_quiz(assignment, submitted):
    """Grade a quiz submission.

    submitted: mapping of question id -> chosen option index (int or None).
    Creates a QuizAttempt, updates the assignment, and on a pass completes it,
    notifies the supervisor and schedules next year's assignment.
    """
    cfg = current_app.config
    questions = list(assignment.course.questions)
    answers = []
    score = 0
    for q in questions:
        chosen = submitted.get(q.id)
        correct = chosen is not None and chosen == q.answer_index
        if correct:
            score += 1
        answers.append({"question_id": q.id, "chosen": chosen, "correct": correct})
    total = len(questions)
    percent = round(100 * score / total) if total else 0
    passed = percent >= cfg["QUIZ_PASS_PERCENT"]

    attempt = QuizAttempt(
        assignment=assignment,
        user_id=assignment.user_id,
        course_id=assignment.course_id,
        score=score,
        total=total,
        passed=passed,
        answers_json=json.dumps(answers),
    )
    db.session.add(attempt)

    assignment.attempts = (assignment.attempts or 0) + 1
    assignment.best_score = max(assignment.best_score or 0, score)
    assignment.total_questions = total
    if assignment.status == "assigned":
        assignment.status = "in_progress"
        assignment.started_at = assignment.started_at or now()

    if passed and not assignment.is_completed:
        assignment.status = "completed"
        assignment.completed_at = now()
        assignment.score = score
        db.session.flush()
        if cfg.get("NOTIFY_SUPERVISOR_ON_COMPLETION"):
            notifications.notify_supervisor_completion(assignment)
        if cfg.get("AUTO_RENEW_ASSIGNMENTS"):
            renew_assignment(assignment)
    db.session.commit()
    return attempt


def renew_assignment(completed):
    """Create next year's assignment for the same course and employee.

    The renewal is an annual assignment whatever the reason of the one just
    completed. An individually assigned course that does not apply to the
    employee's division was a one-off and is not renewed.
    """
    course = completed.course
    user = completed.user
    if not course.is_active or not user.is_active_employee:
        return None
    if completed.reason == "individual" and not course.applies_to(user):
        return None
    if open_assignment(user, course):
        return None
    months = course.renewal_months or current_app.config["DEFAULT_RENEWAL_MONTHS"]
    completed_on = (completed.completed_at or now()).date()
    renewal = Assignment(
        user=user,
        course=course,
        cycle=completed.cycle + 1,
        assigned_on=date.today(),
        due_date=add_months(completed_on, months),
        reason="annual",
    )
    db.session.add(renewal)
    db.session.flush()
    return renewal


def compliance_rows(users):
    """Per-user compliance summary used by the team and admin report pages."""
    rows = []
    for user in users:
        open_items = [a for a in user.assignments if not a.is_completed]
        overdue = [a for a in open_items if a.is_overdue]
        due_soon = [a for a in open_items if a.is_due_soon]
        completed_this_year = [
            a for a in user.assignments
            if a.is_completed and a.completed_at and a.completed_at >= now() - timedelta(days=365)
        ]
        new_hire = new_hire_progress(user)
        rows.append(
            {
                "user": user,
                "open": len(open_items),
                "overdue": len(overdue),
                "due_soon": len(due_soon),
                "completed_12mo": len(completed_this_year),
                "new_hire": new_hire if new_hire["total"] else None,
                "status": "danger" if overdue else ("warn" if due_soon else "ok"),
            }
        )
    return rows


def course_matrix(users, courses):
    """Matrix of one cell per user and course for the compliance report.

    The cell shows the open assignment when it is overdue or due within 30 days;
    otherwise the most recent completion (with the next due date), or the open
    assignment if nothing has been completed yet.
    """
    latest_open, latest_done = {}, {}
    user_ids = [u.id for u in users]
    if user_ids:
        for a in Assignment.query.filter(Assignment.user_id.in_(user_ids)).order_by(Assignment.cycle, Assignment.id):
            key = (a.user_id, a.course_id)
            if a.is_completed:
                latest_done[key] = a
            else:
                latest_open[key] = a
    matrix = []
    for user in users:
        cells = []
        for course in courses:
            key = (user.id, course.id)
            open_item, done_item = latest_open.get(key), latest_done.get(key)
            if open_item and (open_item.is_overdue or open_item.is_due_soon):
                cells.append({"assignment": open_item, "applies": True, "next_due": None})
            elif done_item:
                cells.append({"assignment": done_item, "applies": True, "next_due": open_item.due_date if open_item else None})
            elif open_item:
                cells.append({"assignment": open_item, "applies": True, "next_due": None})
            else:
                cells.append({"assignment": None, "applies": course.applies_to(user), "next_due": None})
        matrix.append({"user": user, "cells": cells})
    return matrix
