from datetime import datetime

from flask import Blueprint, abort, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from ..extensions import db
from ..timeutil import now
from ..models import Assignment, QuizAttempt
from ..services.assignments import add_months, grade_quiz, quiz_questions, start_assignment

bp = Blueprint("training", __name__)


def _owned_assignment(assignment_id):
    assignment = db.session.get(Assignment, assignment_id)
    if assignment is None:
        abort(404)
    if assignment.user_id != current_user.id and not current_user.is_supervisor:
        abort(403)
    return assignment


@bp.route("/")
@login_required
def my_training():
    assignments = sorted(current_user.assignments, key=lambda a: (a.is_completed, a.due_date))
    open_items = [a for a in assignments if not a.is_completed]
    history = sorted([a for a in assignments if a.is_completed], key=lambda a: a.completed_at or datetime.min, reverse=True)
    return render_template("training/list.html", open_items=open_items, history=history)


@bp.route("/<int:assignment_id>")
@login_required
def course(assignment_id):
    assignment = _owned_assignment(assignment_id)
    if assignment.user_id == current_user.id and not assignment.is_completed:
        start_assignment(assignment)
    return render_template("training/course.html", assignment=assignment, course=assignment.course)


@bp.route("/<int:assignment_id>/quiz", methods=["GET", "POST"])
@login_required
def quiz(assignment_id):
    assignment = _owned_assignment(assignment_id)
    if assignment.user_id != current_user.id:
        abort(403)
    if assignment.is_completed:
        flash("You have already passed this training.", "info")
        return redirect(url_for("training.course", assignment_id=assignment.id))

    if request.method == "POST":
        submitted = {}
        for q in assignment.course.questions:
            raw = request.form.get(f"q{q.id}")
            submitted[q.id] = int(raw) if raw not in (None, "") else None
        unanswered = sum(1 for v in submitted.values() if v is None)
        if unanswered:
            flash(f"Please answer every question ({unanswered} left blank).", "danger")
            seed = request.form.get("seed") or ""
            questions = quiz_questions(assignment, seed=seed)
            return render_template(
                "training/quiz.html", assignment=assignment, course=assignment.course, questions=questions, seed=seed, previous=submitted
            )
        attempt = grade_quiz(assignment, submitted)
        return redirect(url_for("training.result", assignment_id=assignment.id, attempt_id=attempt.id))

    seed = f"{assignment.id}-{assignment.attempts}-{now().timestamp()}"
    questions = quiz_questions(assignment, seed=seed)
    return render_template("training/quiz.html", assignment=assignment, course=assignment.course, questions=questions, seed=seed, previous={})


@bp.route("/<int:assignment_id>/result/<int:attempt_id>")
@login_required
def result(assignment_id, attempt_id):
    assignment = _owned_assignment(assignment_id)
    attempt = db.session.get(QuizAttempt, attempt_id)
    if attempt is None or attempt.assignment_id != assignment.id:
        abort(404)
    questions = {q.id: q for q in assignment.course.questions}
    review = []
    for row in attempt.answers:
        q = questions.get(row["question_id"])
        if q:
            review.append({"question": q, "chosen": row["chosen"], "correct": row["correct"]})
    return render_template("training/result.html", assignment=assignment, attempt=attempt, review=review, course=assignment.course)


@bp.route("/<int:assignment_id>/certificate")
@login_required
def certificate(assignment_id):
    assignment = _owned_assignment(assignment_id)
    if not assignment.is_completed:
        abort(404)
    completed_on = (assignment.completed_at or now()).date()
    valid_through = add_months(completed_on, assignment.course.renewal_months or 12)
    return render_template("training/certificate.html", assignment=assignment, course=assignment.course, valid_through=valid_through)
