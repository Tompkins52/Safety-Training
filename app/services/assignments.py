"""Assignment lifecycle: creating annual assignments, grading quizzes, renewing."""
import calendar
import json
import random
from datetime import date, timedelta

from flask import current_app

from ..extensions import db
from ..timeutil import now
from ..models import Assignment, Course, QuizAttempt, User
from . import notifications


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


def ensure_assignments(user, due_date=None, courses=None, assigned_by=None, send_notice=False):
    """Create an open assignment for each applicable course the user lacks one for.

    Returns the list of assignments created. Idempotent: running it twice
    creates nothing the second time.
    """
    due_date = due_date or (date.today() + timedelta(days=current_app.config["DEFAULT_DUE_DAYS"]))
    created = []
    for course in courses or applicable_courses(user):
        if not course.is_active or not course.applies_to(user):
            continue
        if open_assignment(user, course):
            continue
        previous = latest_assignment(user, course)
        cycle = previous.cycle + 1 if previous else 1
        assignment = Assignment(
            user=user,
            course=course,
            cycle=cycle,
            assigned_on=date.today(),
            due_date=due_date,
            assigned_by_id=assigned_by.id if assigned_by else None,
        )
        db.session.add(assignment)
        created.append(assignment)
    db.session.flush()
    if send_notice:
        for assignment in created:
            notifications.notify_training_assigned(assignment)
    return created


def run_annual_assignment(due_date=None, divisions=None, courses=None, assigned_by=None, send_notice=False):
    """Assign every applicable course to every active employee. Returns created assignments."""
    users = User.query.filter_by(is_active_employee=True)
    if divisions:
        users = users.filter(User.division_id.in_([d.id for d in divisions]))
    created = []
    for user in users.all():
        created.extend(ensure_assignments(user, due_date, courses, assigned_by, send_notice))
    db.session.commit()
    return created


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
    """Create next year's assignment for the same course and employee."""
    course = completed.course
    user = completed.user
    if not course.is_active or not user.is_active_employee:
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
        rows.append(
            {
                "user": user,
                "open": len(open_items),
                "overdue": len(overdue),
                "due_soon": len(due_soon),
                "completed_12mo": len(completed_this_year),
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
