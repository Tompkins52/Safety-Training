from datetime import date, datetime

from flask import Blueprint, abort, current_app, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from ..extensions import db
from ..timeutil import now
from ..models import (
    ACTION_STATUSES,
    CONTRIBUTING_FACTORS,
    DRUG_TEST_OPTIONS,
    INCIDENT_STATUSES,
    INCIDENT_TYPES,
    PREVENTABILITY,
    PROPERTY_OWNERS,
    SEVERITIES,
    TREATMENTS,
    CorrectiveAction,
    Division,
    Incident,
    User,
)
from ..services import notifications
from ..services.incidents import can_investigate, can_view, next_incident_number, visible_incidents_query
from ..utils import parse_bool, parse_date, parse_datetime_local, parse_float, parse_int

bp = Blueprint("incidents", __name__)

FORM_CHOICES = {
    "incident_types": INCIDENT_TYPES,
    "statuses": INCIDENT_STATUSES,
    "severities": SEVERITIES,
    "treatments": TREATMENTS,
    "property_owners": PROPERTY_OWNERS,
    "drug_tests": DRUG_TEST_OPTIONS,
    "preventability": PREVENTABILITY,
    "factors": CONTRIBUTING_FACTORS,
    "action_statuses": ACTION_STATUSES,
}


def _get_incident(incident_id, investigate=False):
    incident = db.session.get(Incident, incident_id)
    if incident is None:
        abort(404)
    if investigate:
        if not can_investigate(current_user, incident):
            abort(403)
    elif not can_view(current_user, incident):
        abort(403)
    return incident


def _text(name):
    value = request.form.get(name)
    return value.strip() if value else None


def _apply_report_form(incident, form_errors):
    """Copy the report form fields onto the incident. Appends messages to form_errors."""
    incident.incident_type = _text("incident_type") or ""
    if incident.incident_type not in INCIDENT_TYPES:
        form_errors.append("Choose an incident type.")
    occurred = parse_datetime_local(_text("occurred_at"))
    if occurred is None:
        form_errors.append("Enter the date and time the incident occurred.")
    else:
        incident.occurred_at = occurred
    incident.location = _text("location") or ""
    if not incident.location:
        form_errors.append("Enter the location.")
    incident.description = _text("description") or ""
    if not incident.description:
        form_errors.append("Describe what happened.")
    division_id = parse_int(_text("division_id"))
    incident.division_id = division_id if division_id and db.session.get(Division, division_id) else None
    incident.severity = _text("severity") if _text("severity") in SEVERITIES else "minor"
    incident.work_activity = _text("work_activity")
    incident.employees_involved = _text("employees_involved")
    incident.witnesses = _text("witnesses")
    incident.immediate_actions = _text("immediate_actions")
    incident.equipment_involved = _text("equipment_involved")
    incident.weather_conditions = _text("weather_conditions")

    # Type-specific fields. Fields for the other types are cleared so a report
    # that changes type does not keep stale details.
    if incident.incident_type == "injury":
        incident.injured_person = _text("injured_person")
        incident.injured_job_title = _text("injured_job_title")
        incident.body_part = _text("body_part")
        incident.injury_nature = _text("injury_nature")
        incident.treatment = _text("treatment") if _text("treatment") in TREATMENTS else None
        incident.treatment_provider = _text("treatment_provider")
        incident.days_away = parse_int(_text("days_away"))
        incident.days_restricted = parse_int(_text("days_restricted"))
        incident.osha_recordable = parse_bool(_text("osha_recordable"))
        if not incident.injured_person:
            form_errors.append("Enter the name of the injured person.")
    else:
        incident.injured_person = incident.injured_job_title = incident.body_part = incident.injury_nature = None
        incident.treatment = incident.treatment_provider = None
        incident.days_away = incident.days_restricted = incident.osha_recordable = None

    if incident.incident_type == "property_damage":
        incident.property_description = _text("property_description")
        incident.property_owner = _text("property_owner") if _text("property_owner") in PROPERTY_OWNERS else None
        incident.damage_description = _text("damage_description")
        incident.estimated_cost = parse_float(_text("estimated_cost"))
        if not incident.property_description:
            form_errors.append("Describe the property that was damaged.")
    else:
        incident.property_description = incident.property_owner = incident.damage_description = None
        incident.estimated_cost = None

    if incident.incident_type == "vehicle":
        incident.vehicle_unit = _text("vehicle_unit")
        incident.driver_name = _text("driver_name")
        incident.other_party = _text("other_party")
        incident.police_report_number = _text("police_report_number")
        incident.drug_alcohol_test = _text("drug_alcohol_test") if _text("drug_alcohol_test") in DRUG_TEST_OPTIONS else None
        incident.vehicle_damage_estimate = parse_float(_text("vehicle_damage_estimate"))
        incident.seat_belt_used = parse_bool(_text("seat_belt_used"))
        if not incident.vehicle_unit:
            form_errors.append("Enter the vehicle or unit number.")
        if not incident.driver_name:
            form_errors.append("Enter the driver's name.")
    else:
        incident.vehicle_unit = incident.driver_name = incident.other_party = incident.police_report_number = None
        incident.drug_alcohol_test = None
        incident.vehicle_damage_estimate = None
        incident.seat_belt_used = None


@bp.route("/")
@login_required
def index():
    query = visible_incidents_query(current_user)
    itype = request.args.get("type")
    status = request.args.get("status")
    division_id = parse_int(request.args.get("division"))
    if itype in INCIDENT_TYPES:
        query = query.filter(Incident.incident_type == itype)
    if status in INCIDENT_STATUSES:
        query = query.filter(Incident.status == status)
    if division_id:
        query = query.filter(Incident.division_id == division_id)
    incidents = query.order_by(Incident.occurred_at.desc()).all()
    divisions = Division.query.order_by(Division.name).all()
    return render_template(
        "incidents/list.html",
        incidents=incidents,
        divisions=divisions,
        filters={"type": itype, "status": status, "division": division_id},
        **FORM_CHOICES,
    )


@bp.route("/new", methods=["GET", "POST"])
@login_required
def new():
    divisions = Division.query.order_by(Division.name).all()
    incident = Incident(
        reported_by_id=current_user.id,
        division_id=current_user.division_id,
        occurred_at=datetime.now().replace(second=0, microsecond=0),
        incident_type=request.args.get("type", ""),
        severity="minor",
    )
    if request.method == "POST":
        errors = []
        _apply_report_form(incident, errors)
        if errors:
            for message in errors:
                flash(message, "danger")
        else:
            incident.incident_number = next_incident_number()
            incident.reported_at = now()
            incident.status = "reported"
            db.session.add(incident)
            db.session.commit()
            if current_app.config.get("NOTIFY_ON_INCIDENT"):
                notifications.notify_incident_reported(incident)
                db.session.commit()
            flash(f"Incident {incident.incident_number} has been recorded.", "success")
            return redirect(url_for("incidents.detail", incident_id=incident.id))
    return render_template("incidents/form.html", incident=incident, divisions=divisions, editing=False, **FORM_CHOICES)


@bp.route("/<int:incident_id>")
@login_required
def detail(incident_id):
    incident = _get_incident(incident_id)
    return render_template(
        "incidents/detail.html",
        incident=incident,
        can_investigate=can_investigate(current_user, incident),
        **FORM_CHOICES,
    )


@bp.route("/<int:incident_id>/edit", methods=["GET", "POST"])
@login_required
def edit(incident_id):
    incident = _get_incident(incident_id)
    if incident.status == "closed" and not current_user.is_admin:
        flash("Closed incidents can only be edited by a safety administrator.", "danger")
        return redirect(url_for("incidents.detail", incident_id=incident.id))
    if not (current_user.is_supervisor or incident.reported_by_id == current_user.id):
        abort(403)
    divisions = Division.query.order_by(Division.name).all()
    if request.method == "POST":
        errors = []
        _apply_report_form(incident, errors)
        if errors:
            for message in errors:
                flash(message, "danger")
        else:
            db.session.commit()
            flash("Incident report updated.", "success")
            return redirect(url_for("incidents.detail", incident_id=incident.id))
    return render_template("incidents/form.html", incident=incident, divisions=divisions, editing=True, **FORM_CHOICES)


@bp.route("/<int:incident_id>/investigation", methods=["GET", "POST"])
@login_required
def investigation(incident_id):
    incident = _get_incident(incident_id, investigate=True)
    investigators = User.query.filter(User.role.in_(["supervisor", "admin"]), User.is_active_employee.is_(True)).order_by(User.last_name).all()
    if request.method == "POST":
        investigator_id = parse_int(_text("investigator_id"))
        incident.investigator_id = investigator_id if investigator_id else current_user.id
        incident.investigation_date = parse_date(_text("investigation_date")) or date.today()
        incident.direct_cause = _text("direct_cause")
        incident.root_cause = _text("root_cause")
        factor = _text("contributing_factor_type")
        incident.contributing_factor_type = factor if factor in CONTRIBUTING_FACTORS else None
        incident.contributing_factor_detail = _text("contributing_factor_detail")
        incident.lessons_learned = _text("lessons_learned")
        if incident.incident_type == "vehicle":
            prev = _text("preventability")
            incident.preventability = prev if prev in PREVENTABILITY else "undetermined"
        if incident.incident_type == "injury":
            incident.osha_recordable = parse_bool(_text("osha_recordable"))
        if incident.status == "reported":
            incident.status = "under_investigation"
        db.session.commit()
        flash("Investigation saved.", "success")
        return redirect(url_for("incidents.detail", incident_id=incident.id))
    return render_template("incidents/investigation.html", incident=incident, investigators=investigators, **FORM_CHOICES)


@bp.route("/<int:incident_id>/actions", methods=["POST"])
@login_required
def add_action(incident_id):
    incident = _get_incident(incident_id, investigate=True)
    description = _text("description")
    if not description:
        flash("Describe the corrective action.", "danger")
        return redirect(url_for("incidents.investigation", incident_id=incident.id))
    action = CorrectiveAction(
        incident=incident,
        description=description,
        responsible_name=_text("responsible_name"),
        target_date=parse_date(_text("target_date")),
        status="open",
    )
    db.session.add(action)
    if incident.status == "reported":
        incident.status = "under_investigation"
    db.session.commit()
    flash("Corrective action added.", "success")
    return redirect(url_for("incidents.investigation", incident_id=incident.id) + "#actions")


@bp.route("/<int:incident_id>/actions/<int:action_id>", methods=["POST"])
@login_required
def update_action(incident_id, action_id):
    incident = _get_incident(incident_id, investigate=True)
    action = db.session.get(CorrectiveAction, action_id)
    if action is None or action.incident_id != incident.id:
        abort(404)
    if request.form.get("delete"):
        db.session.delete(action)
        db.session.commit()
        flash("Corrective action removed.", "info")
        return redirect(url_for("incidents.investigation", incident_id=incident.id) + "#actions")
    status = _text("status")
    if status in ACTION_STATUSES:
        action.status = status
        if status == "completed":
            action.completed_on = parse_date(_text("completed_on")) or date.today()
        else:
            action.completed_on = None
    if "notes" in request.form:
        action.notes = _text("notes")
    if "responsible_name" in request.form:
        action.responsible_name = _text("responsible_name")
    if "target_date" in request.form:
        action.target_date = parse_date(_text("target_date"))
    db.session.commit()
    flash("Corrective action updated.", "success")
    return redirect(url_for("incidents.investigation", incident_id=incident.id) + "#actions")


@bp.route("/<int:incident_id>/status", methods=["POST"])
@login_required
def set_status(incident_id):
    incident = _get_incident(incident_id, investigate=True)
    status = _text("status")
    if status not in INCIDENT_STATUSES:
        abort(400)
    if status == "closed":
        missing = []
        if not incident.direct_cause:
            missing.append("direct cause")
        if not incident.root_cause:
            missing.append("root cause")
        if not incident.contributing_factor_type:
            missing.append("contributing factor type")
        if missing:
            flash("Before closing, record the " + ", ".join(missing) + " on the investigation page.", "danger")
            return redirect(url_for("incidents.investigation", incident_id=incident.id))
        incident.status = "closed"
        incident.closed_at = now()
        incident.closed_by_id = current_user.id
        db.session.commit()
        if current_app.config.get("NOTIFY_ON_INCIDENT"):
            notifications.notify_incident_closed(incident)
            db.session.commit()
        flash(f"Incident {incident.incident_number} closed.", "success")
    else:
        incident.status = status
        incident.closed_at = None
        incident.closed_by_id = None
        db.session.commit()
        flash("Incident status updated.", "success")
    return redirect(url_for("incidents.detail", incident_id=incident.id))


@bp.route("/<int:incident_id>/print")
@login_required
def print_report(incident_id):
    incident = _get_incident(incident_id)
    return render_template("incidents/print.html", incident=incident, **FORM_CHOICES)
