"""Database models for the safety training and incident management platform."""
import json
from datetime import date

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db
from .timeutil import now

ROLES = ("employee", "supervisor", "admin")
ROLE_LABELS = {"employee": "Employee", "supervisor": "Supervisor", "admin": "Safety Administrator"}

INCIDENT_TYPES = {
    "injury": "Personal Injury / Illness",
    "property_damage": "Property Damage",
    "vehicle": "Vehicle Incident",
}
INCIDENT_STATUSES = {
    "reported": "Reported",
    "under_investigation": "Under Investigation",
    "closed": "Closed",
}
SEVERITIES = {
    "near_miss": "Near miss (no injury or damage)",
    "minor": "Minor",
    "moderate": "Moderate",
    "serious": "Serious",
    "critical": "Critical / fatality",
}
CONTRIBUTING_FACTORS = {
    "behavioral": "Behavioral (actions, decisions, habits, training, supervision)",
    "engineering": "Engineered (equipment, design, guarding, tools, materials)",
    "environmental": "Environmental (weather, lighting, surfaces, noise, housekeeping, traffic)",
}
TREATMENTS = {
    "none": "No treatment needed",
    "first_aid": "First aid only",
    "clinic": "Clinic / occupational health",
    "emergency_room": "Emergency room",
    "hospitalized": "Hospitalized (admitted)",
}
PROPERTY_OWNERS = {
    "city": "City / department owned",
    "third_party": "Third party (resident, business, other agency)",
    "employee": "Employee owned",
}
DRUG_TEST_OPTIONS = {
    "not_required": "Not required",
    "completed": "Completed",
    "pending": "Pending",
    "refused": "Refused",
}
PREVENTABILITY = {
    "undetermined": "Undetermined",
    "preventable": "Preventable",
    "non_preventable": "Non-preventable",
}
ACTION_STATUSES = {"open": "Open", "in_progress": "In progress", "completed": "Completed"}


def _loads(text, default):
    if not text:
        return default
    try:
        return json.loads(text)
    except ValueError:
        return default


class Division(db.Model):
    __tablename__ = "divisions"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(40), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)

    users = db.relationship("User", back_populates="division")

    def __repr__(self):
        return f"<Division {self.code}>"


course_divisions = db.Table(
    "course_divisions",
    db.Column("course_id", db.Integer, db.ForeignKey("courses.id"), primary_key=True),
    db.Column("division_id", db.Integer, db.ForeignKey("divisions.id"), primary_key=True),
)


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    employee_number = db.Column(db.String(40), unique=True, nullable=True)
    first_name = db.Column(db.String(80), nullable=False)
    last_name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False, index=True)
    job_title = db.Column(db.String(120))
    role = db.Column(db.String(20), nullable=False, default="employee")
    division_id = db.Column(db.Integer, db.ForeignKey("divisions.id"))
    supervisor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    password_hash = db.Column(db.String(255), nullable=False)
    is_active_employee = db.Column(db.Boolean, nullable=False, default=True)
    must_change_password = db.Column(db.Boolean, nullable=False, default=False)
    hire_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=now, nullable=False)
    last_login_at = db.Column(db.DateTime)

    division = db.relationship("Division", back_populates="users")
    supervisor = db.relationship("User", remote_side=[id], backref="direct_reports")
    assignments = db.relationship(
        "Assignment", back_populates="user", cascade="all, delete-orphan", foreign_keys="Assignment.user_id"
    )

    # Flask-Login uses is_active to decide whether a login is allowed.
    @property
    def is_active(self):
        return self.is_active_employee

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def role_label(self):
        return ROLE_LABELS.get(self.role, self.role)

    @property
    def is_admin(self):
        return self.role == "admin"

    @property
    def is_supervisor(self):
        return self.role in ("supervisor", "admin")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def open_assignments(self):
        return [a for a in self.assignments if a.status != "completed"]

    def __repr__(self):
        return f"<User {self.email}>"


class Course(db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(80), unique=True, nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    standard = db.Column(db.String(80))
    standard_title = db.Column(db.String(200))
    category = db.Column(db.String(40), nullable=False, default="osha_top10")
    top10_rank = db.Column(db.Integer)
    duration_minutes = db.Column(db.Integer, default=30)
    renewal_months = db.Column(db.Integer, default=12)
    summary = db.Column(db.Text)
    objectives_json = db.Column(db.Text)
    sections_json = db.Column(db.Text)
    takeaways_json = db.Column(db.Text)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=now, nullable=False)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now, nullable=False)

    divisions = db.relationship("Division", secondary=course_divisions, backref="courses")
    questions = db.relationship(
        "Question", back_populates="course", cascade="all, delete-orphan", order_by="Question.position"
    )
    assignments = db.relationship("Assignment", back_populates="course")

    @property
    def objectives(self):
        return _loads(self.objectives_json, [])

    @property
    def sections(self):
        return _loads(self.sections_json, [])

    @property
    def key_takeaways(self):
        return _loads(self.takeaways_json, [])

    @property
    def category_label(self):
        return {"osha_top10": "OSHA Top 10", "rescue": "Rescue"}.get(self.category, self.category.title())

    @property
    def division_codes(self):
        return {d.code for d in self.divisions}

    def applies_to(self, user):
        return user.division is not None and user.division in self.divisions

    def __repr__(self):
        return f"<Course {self.slug}>"


class Question(db.Model):
    __tablename__ = "questions"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)
    text = db.Column(db.Text, nullable=False)
    options_json = db.Column(db.Text, nullable=False)
    answer_index = db.Column(db.Integer, nullable=False)
    explanation = db.Column(db.Text)

    course = db.relationship("Course", back_populates="questions")

    @property
    def options(self):
        return _loads(self.options_json, [])


class Assignment(db.Model):
    """One employee's obligation to complete one course for one annual cycle."""

    __tablename__ = "assignments"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)
    cycle = db.Column(db.Integer, nullable=False, default=1)
    assigned_on = db.Column(db.Date, nullable=False, default=date.today)
    due_date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="assigned")  # assigned, in_progress, completed
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    score = db.Column(db.Integer)
    total_questions = db.Column(db.Integer)
    best_score = db.Column(db.Integer)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    assigned_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    assignment_notice_sent_at = db.Column(db.DateTime)
    reminder_30_sent_at = db.Column(db.DateTime)
    reminder_7_sent_at = db.Column(db.DateTime)
    overdue_last_reminded_at = db.Column(db.DateTime)
    supervisor_notified_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=now, nullable=False)

    user = db.relationship("User", back_populates="assignments", foreign_keys=[user_id])
    course = db.relationship("Course", back_populates="assignments")
    assigned_by = db.relationship("User", foreign_keys=[assigned_by_id])
    quiz_attempts = db.relationship(
        "QuizAttempt", back_populates="assignment", cascade="all, delete-orphan", order_by="QuizAttempt.taken_at"
    )

    @property
    def is_completed(self):
        return self.status == "completed"

    @property
    def days_until_due(self):
        return (self.due_date - date.today()).days

    @property
    def is_overdue(self):
        return not self.is_completed and self.due_date < date.today()

    @property
    def is_due_soon(self):
        return not self.is_completed and 0 <= self.days_until_due <= 30

    @property
    def display_status(self):
        if self.is_completed:
            return "Completed"
        if self.is_overdue:
            return "Overdue"
        if self.status == "in_progress":
            return "In progress"
        return "Assigned"

    @property
    def status_class(self):
        if self.is_completed:
            return "ok"
        if self.is_overdue:
            return "danger"
        if self.is_due_soon:
            return "warn"
        return "neutral"

    @property
    def percent(self):
        if self.score is None or not self.total_questions:
            return None
        return round(100 * self.score / self.total_questions)

    @property
    def certificate_number(self):
        return f"CERT-{self.id:06d}"


class QuizAttempt(db.Model):
    __tablename__ = "quiz_attempts"

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey("assignments.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False)
    taken_at = db.Column(db.DateTime, default=now, nullable=False)
    score = db.Column(db.Integer, nullable=False)
    total = db.Column(db.Integer, nullable=False)
    passed = db.Column(db.Boolean, nullable=False)
    answers_json = db.Column(db.Text)

    assignment = db.relationship("Assignment", back_populates="quiz_attempts")
    user = db.relationship("User")
    course = db.relationship("Course")

    @property
    def answers(self):
        return _loads(self.answers_json, [])

    @property
    def percent(self):
        return round(100 * self.score / self.total) if self.total else 0


class Incident(db.Model):
    __tablename__ = "incidents"

    id = db.Column(db.Integer, primary_key=True)
    incident_number = db.Column(db.String(30), unique=True, nullable=False, index=True)
    incident_type = db.Column(db.String(30), nullable=False, index=True)
    status = db.Column(db.String(30), nullable=False, default="reported", index=True)
    severity = db.Column(db.String(30), default="minor")

    occurred_at = db.Column(db.DateTime, nullable=False)
    reported_at = db.Column(db.DateTime, default=now, nullable=False)
    location = db.Column(db.String(200), nullable=False)
    division_id = db.Column(db.Integer, db.ForeignKey("divisions.id"))
    reported_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    work_activity = db.Column(db.String(200))
    description = db.Column(db.Text, nullable=False)
    employees_involved = db.Column(db.Text)
    witnesses = db.Column(db.Text)
    immediate_actions = db.Column(db.Text)
    equipment_involved = db.Column(db.String(200))
    weather_conditions = db.Column(db.String(200))

    # Personal injury
    injured_person = db.Column(db.String(120))
    injured_job_title = db.Column(db.String(120))
    body_part = db.Column(db.String(120))
    injury_nature = db.Column(db.String(200))
    treatment = db.Column(db.String(30))
    treatment_provider = db.Column(db.String(200))
    days_away = db.Column(db.Integer)
    days_restricted = db.Column(db.Integer)
    osha_recordable = db.Column(db.Boolean)

    # Property damage
    property_description = db.Column(db.String(200))
    property_owner = db.Column(db.String(30))
    damage_description = db.Column(db.Text)
    estimated_cost = db.Column(db.Float)

    # Vehicle
    vehicle_unit = db.Column(db.String(80))
    driver_name = db.Column(db.String(120))
    other_party = db.Column(db.Text)
    police_report_number = db.Column(db.String(80))
    drug_alcohol_test = db.Column(db.String(30))
    vehicle_damage_estimate = db.Column(db.Float)
    preventability = db.Column(db.String(30), default="undetermined")
    seat_belt_used = db.Column(db.Boolean)

    # Investigation
    investigator_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    investigation_date = db.Column(db.Date)
    direct_cause = db.Column(db.Text)
    root_cause = db.Column(db.Text)
    contributing_factor_type = db.Column(db.String(30))
    contributing_factor_detail = db.Column(db.Text)
    lessons_learned = db.Column(db.Text)
    closed_at = db.Column(db.DateTime)
    closed_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))

    created_at = db.Column(db.DateTime, default=now, nullable=False)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now, nullable=False)

    division = db.relationship("Division")
    reported_by = db.relationship("User", foreign_keys=[reported_by_id])
    investigator = db.relationship("User", foreign_keys=[investigator_id])
    closed_by = db.relationship("User", foreign_keys=[closed_by_id])
    corrective_actions = db.relationship(
        "CorrectiveAction", back_populates="incident", cascade="all, delete-orphan", order_by="CorrectiveAction.id"
    )

    @property
    def type_label(self):
        return INCIDENT_TYPES.get(self.incident_type, self.incident_type)

    @property
    def status_label(self):
        return INCIDENT_STATUSES.get(self.status, self.status)

    @property
    def severity_label(self):
        return SEVERITIES.get(self.severity, self.severity or "")

    @property
    def contributing_factor_label(self):
        return CONTRIBUTING_FACTORS.get(self.contributing_factor_type, "")

    @property
    def treatment_label(self):
        return TREATMENTS.get(self.treatment, "")

    @property
    def property_owner_label(self):
        return PROPERTY_OWNERS.get(self.property_owner, "")

    @property
    def drug_test_label(self):
        return DRUG_TEST_OPTIONS.get(self.drug_alcohol_test, "")

    @property
    def preventability_label(self):
        return PREVENTABILITY.get(self.preventability, "")

    @property
    def has_investigation(self):
        return bool(self.direct_cause or self.root_cause or self.contributing_factor_type)

    @property
    def open_actions(self):
        return [a for a in self.corrective_actions if a.status != "completed"]


class CorrectiveAction(db.Model):
    __tablename__ = "corrective_actions"

    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey("incidents.id"), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    responsible_name = db.Column(db.String(120))
    target_date = db.Column(db.Date)
    status = db.Column(db.String(20), nullable=False, default="open")
    completed_on = db.Column(db.Date)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=now, nullable=False)

    incident = db.relationship("Incident", back_populates="corrective_actions")

    @property
    def status_label(self):
        return ACTION_STATUSES.get(self.status, self.status)

    @property
    def is_overdue(self):
        return self.status != "completed" and self.target_date is not None and self.target_date < date.today()


class NotificationLog(db.Model):
    __tablename__ = "notification_log"

    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.String(40), nullable=False, index=True)
    recipient_email = db.Column(db.String(200), nullable=False)
    recipient_user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    subject = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text)
    assignment_id = db.Column(db.Integer, db.ForeignKey("assignments.id"))
    incident_id = db.Column(db.Integer, db.ForeignKey("incidents.id"))
    sent_at = db.Column(db.DateTime, default=now, nullable=False, index=True)
    delivered = db.Column(db.Boolean, nullable=False, default=False)
    detail = db.Column(db.String(255))

    recipient = db.relationship("User")

    KIND_LABELS = {
        "training_assigned": "Training assigned",
        "training_due_30": "30-day reminder",
        "training_due_7": "7-day reminder",
        "training_overdue": "Overdue reminder",
        "training_completed": "Completion notice to supervisor",
        "incident_reported": "Incident reported",
        "incident_closed": "Incident closed",
        "account_created": "Account created",
        "test": "Test message",
    }

    @property
    def kind_label(self):
        return self.KIND_LABELS.get(self.kind, self.kind)
