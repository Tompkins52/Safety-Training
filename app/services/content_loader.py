"""Loads divisions, courses and quiz questions from the content/ folder."""
import glob
import json
import os

from flask import current_app

from ..extensions import db
from ..models import Course, Division, Question

DEFAULT_DIVISIONS = [
    ("electric", "Electric Services"),
    ("environmental", "Environmental Services"),
    ("public", "Public Services"),
]

REQUIRED_KEYS = ("slug", "title", "sections", "questions")


def ensure_divisions():
    created = []
    for code, name in DEFAULT_DIVISIONS:
        if not Division.query.filter_by(code=code).first():
            d = Division(code=code, name=name)
            db.session.add(d)
            created.append(d)
    db.session.commit()
    return created


def course_files(content_dir=None):
    content_dir = content_dir or current_app.config["CONTENT_DIR"]
    return sorted(glob.glob(os.path.join(content_dir, "courses", "*.json")))


def validate_course(data):
    for key in REQUIRED_KEYS:
        if key not in data:
            raise ValueError(f"missing key '{key}'")
    if not isinstance(data["questions"], list) or not data["questions"]:
        raise ValueError("questions must be a non-empty list")
    for i, q in enumerate(data["questions"], 1):
        if len(q.get("options", [])) < 2:
            raise ValueError(f"question {i}: needs at least two options")
        if not 0 <= int(q.get("answer", -1)) < len(q["options"]):
            raise ValueError(f"question {i}: answer index out of range")


def load_course(data, division_lookup=None):
    """Create or update one course from its JSON data. Returns (course, created)."""
    validate_course(data)
    division_lookup = division_lookup or {d.code: d for d in Division.query.all()}
    course = Course.query.filter_by(slug=data["slug"]).first()
    created = course is None
    if created:
        course = Course(slug=data["slug"])
        db.session.add(course)
    course.title = data["title"]
    course.standard = data.get("standard")
    course.standard_title = data.get("standard_title")
    course.category = data.get("category", "osha_top10")
    course.top10_rank = data.get("top10_rank")
    course.duration_minutes = data.get("duration_minutes", 30)
    course.renewal_months = data.get("renewal_months", 12)
    course.summary = data.get("summary", "")
    course.objectives_json = json.dumps(data.get("objectives", []))
    course.sections_json = json.dumps(data.get("sections", []))
    course.takeaways_json = json.dumps(data.get("key_takeaways", []))
    if "is_active" in data:
        course.is_active = bool(data["is_active"])

    # Division mapping is taken from the file on first load only, so changes an
    # administrator makes in the app are not overwritten by a content reload.
    if created:
        course.divisions = [division_lookup[c] for c in data.get("divisions", []) if c in division_lookup]

    # Update questions in place by position so question ids stay stable and
    # past quiz attempts keep pointing at the right question.
    existing = {q.position: q for q in course.questions}
    wanted = data["questions"]
    for i, q in enumerate(wanted, 1):
        row = existing.get(i)
        if row is None:
            row = Question(position=i)
            course.questions.append(row)
        row.text = q["text"]
        row.options_json = json.dumps(q["options"])
        row.answer_index = int(q["answer"])
        row.explanation = q.get("explanation", "")
    for position, row in existing.items():
        if position > len(wanted):
            course.questions.remove(row)
    return course, created


def load_all_courses(content_dir=None):
    ensure_divisions()
    division_lookup = {d.code: d for d in Division.query.all()}
    results = []
    for path in course_files(content_dir):
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        course, created = load_course(data, division_lookup)
        results.append((course, created, os.path.basename(path)))
    db.session.commit()
    return results


def load_top10(content_dir=None):
    content_dir = content_dir or current_app.config["CONTENT_DIR"]
    path = os.path.join(content_dir, "osha_top10.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    years = data.get("years", [])
    return sorted(years, key=lambda y: y.get("fiscal_year", 0), reverse=True)
