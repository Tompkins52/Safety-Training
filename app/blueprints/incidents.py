"""Incident reports: the eight-section report form, statements, analysis,
corrective actions, signatures and printing.

Sections 1 to 4 (incident, vehicle and equipment, personal injury, description)
live on the report form. Sections 5 and 6 are principal and eyewitness
statements signed on the investigator's device, through an emailed link or on
paper. Sections 7 and 8 (facts and analysis, signatures) live on the
investigation page for supervisors and safety administrators."""
import json
from datetime import date, datetime, time

from flask import Blueprint, abort, current_app, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..timeutil import now
from ..models import (
    ACTION_STATUSES,
    BODY_PARTS,
    CONTRIBUTING_FACTORS,
    DRUG_TEST_OPTIONS,
    INCIDENT_STATUSES,
    INCIDENT_TYPE_CODES,
    INCIDENT_TYPES,
    INJURY_TYPES,
    PREVENTABILITY,
    PROPERTY_OWNERS,
    SEVERITIES,
    SIGNATURE_ROLES,
    STATEMENT_ROLES,
    TREATMENTS,
    VEHICLE_TYPES,
    CorrectiveAction,
    Division,
    Incident,
    IncidentSignature,
    Statement,
)
from ..services import notifications
from ..services.incidents import (
    can_edit_report,
    can_investigate,
    can_view,
    new_statement_token,
    next_incident_number,
    send_statement_request,
    visible_incidents_query,
)
from ..utils import parse_bool, parse_date, parse_datetime_local, parse_float, parse_int

bp = Blueprint("incidents", __name__)

FORM_CHOICES = {
    "incident_types": INCIDENT_TYPES,
    "type_codes": INCIDENT_TYPE_CODES,
    "statuses": INCIDENT_STATUSES,
    "severities": SEVERITIES,
    "treatments": TREATMENTS,
    "property_owners": PROPERTY_OWNERS,
    "drug_tests": DRUG_TEST_OPTIONS,
    "preventability": PREVENTABILITY,
    "factors": CONTRIBUTING_FACTORS,
    "action_statuses": ACTION_STATUSES,
    "vehicle_types": VEHICLE_TYPES,
    "injury_type_choices": INJURY_TYPES,
    "body_part_choices": BODY_PARTS,
    "statement_roles": STATEMENT_ROLES,
    "signature_roles": SIGNATURE_ROLES,
}

MAX_IMAGE_LENGTH = 2_000_000  # characters of a PNG data URL (sketches and signatures)


# --------------------------------------------------------------------------- helpers


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


def _get_statement(incident, statement_id):
    statement = db.session.get(Statement, statement_id)
    if statement is None or statement.incident_id != incident.id:
        abort(404)
    return statement


def _text(name):
    value = request.form.get(name)
    return value.strip() if value else None


def _choice(name, choices):
    value = _text(name)
    return value if value in choices else None


def _marks_json(name):
    """Diagram marks posted as JSON: keep only {x, y} pairs of numbers, as percentages."""
    raw = _text(name)
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    marks = []
    for item in data if isinstance(data, list) else []:
        try:
            marks.append({"x": round(float(item["x"]), 1), "y": round(float(item["y"]), 1)})
        except (KeyError, TypeError, ValueError):
            continue
    return json.dumps(marks) if marks else None


def _image(name):
    """A PNG data URL drawn on a sketch or signature pad, or None."""
    raw = _text(name)
    if raw and raw.startswith("data:image/") and len(raw) <= MAX_IMAGE_LENGTH:
        return raw
    return None


def _checked(name, choices, other_text):
    """Checkbox list limited to the known choices. An "Other" text marks Other as checked."""
    values = [v for v in request.form.getlist(name) if v in choices]
    if other_text and "Other" in choices and "Other" not in values:
        values.append("Other")
    return json.dumps(values) if values else None


def _redirect_to_detail(incident, anchor=None):
    target = url_for("incidents.detail", incident_id=incident.id)
    return redirect(target + (f"#{anchor}" if anchor else ""))


def _render_detail_context(incident):
    return {
        "incident": incident,
        "can_investigate": can_investigate(current_user, incident),
        "can_edit": can_edit_report(current_user, incident),
        **FORM_CHOICES,
    }


# --------------------------------------------------------------------------- sections 1 to 4


def _apply_report_form(incident, form_errors):
    """Copy sections 1 to 4 of the report form onto the incident. Appends messages to form_errors."""
    # Section 1: incident information
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
    division_id = parse_int(_text("division_id"))
    incident.division_id = division_id if division_id and db.session.get(Division, division_id) else None
    incident.severity = _choice("severity", SEVERITIES) or "minor"
    incident.work_activity = _text("work_activity")
    incident.weather_conditions = _text("weather_conditions")
    incident.employees_involved = _text("employees_involved")
    incident.witnesses = _text("witnesses")
    incident.immediate_actions = _text("immediate_actions")
    incident.property_description = _text("property_description")
    incident.property_owner = _choice("property_owner", PROPERTY_OWNERS)
    incident.damage_description = _text("damage_description")
    incident.estimated_cost = parse_float(_text("estimated_cost"))
    incident.investigator_name = _text("investigator_name") or current_user.full_name
    incident.investigator_title = _text("investigator_title") or current_user.job_title
    incident.investigation_date = parse_date(_text("investigation_date")) or incident.investigation_date or date.today()

    # Section 2: vehicle, machine, equipment or trailer
    incident.vehicle_involved = parse_bool(_text("vehicle_involved"))
    if incident.vehicle_involved:
        incident.vehicle_type = _text("vehicle_type") if _text("vehicle_type") in VEHICLE_TYPES else None
        incident.vehicle_make_model = _text("vehicle_make_model")
        incident.license_plate = _text("license_plate")
        incident.vehicle_unit = _text("vehicle_unit")
        incident.driver_name = _text("driver_name")
        incident.seat_belt_used = parse_bool(_text("seat_belt_used"))
        incident.police_report_number = _text("police_report_number")
        incident.drug_alcohol_test = _choice("drug_alcohol_test", DRUG_TEST_OPTIONS)
        incident.vehicle_damage_estimate = parse_float(_text("vehicle_damage_estimate"))
        incident.other_party = _text("other_party")
        incident.damage_marks_json = _marks_json("damage_marks")
        incident.scene_sketch = _image("scene_sketch")
    else:
        incident.vehicle_type = incident.vehicle_make_model = incident.license_plate = None
        incident.vehicle_unit = incident.driver_name = incident.police_report_number = None
        incident.seat_belt_used = incident.drug_alcohol_test = incident.vehicle_damage_estimate = None
        incident.other_party = incident.damage_marks_json = incident.scene_sketch = None
    if incident.incident_type == "vehicle" and incident.vehicle_involved is None:
        form_errors.append("Section 2: answer whether a vehicle was involved.")

    incident.equipment_involved_flag = parse_bool(_text("equipment_involved_flag"))
    if incident.equipment_involved_flag:
        incident.equipment_involved = _text("equipment_involved")
        incident.equipment_sketch = _image("equipment_sketch")
    else:
        incident.equipment_involved = incident.equipment_sketch = None

    # Section 3: personal injury
    incident.injury_occurred = parse_bool(_text("injury_occurred"))
    if incident.injury_occurred:
        incident.injured_person = _text("injured_person")
        incident.injured_job_title = _text("injured_job_title")
        incident.body_marks_json = _marks_json("body_marks")
        incident.injury_other = _text("injury_other")
        incident.injury_types_json = _checked("injury_types", INJURY_TYPES, incident.injury_other)
        incident.body_part_other = _text("body_part_other")
        incident.body_parts_json = _checked("body_parts", BODY_PARTS, incident.body_part_other)
        incident.treatment = _choice("treatment", TREATMENTS)
        incident.treatment_provider = _text("treatment_provider")
        incident.days_away = parse_int(_text("days_away"))
        incident.days_restricted = parse_int(_text("days_restricted"))
        incident.osha_recordable = parse_bool(_text("osha_recordable"))
        if not incident.injured_person:
            form_errors.append("Section 3: enter the name of the injured person.")
    else:
        incident.injured_person = incident.injured_job_title = incident.body_marks_json = None
        incident.injury_types_json = incident.injury_other = incident.body_parts_json = incident.body_part_other = None
        incident.treatment = incident.treatment_provider = None
        incident.days_away = incident.days_restricted = incident.osha_recordable = None
    if incident.incident_type == "injury" and not incident.injury_occurred:
        form_errors.append("Section 3: a personal injury report must record that an injury occurred, with the injured person named.")

    # Section 4: description
    incident.description = _text("description") or ""
    if not incident.description:
        form_errors.append("Section 4: describe what happened.")


def _save_new_incident(incident):
    """Assign the report number and commit, retrying if two reports of the same type
    and date are filed at the same moment."""
    for _attempt in range(3):
        incident.incident_number = next_incident_number(incident.incident_type, incident.occurred_at)
        db.session.add(incident)
        try:
            db.session.commit()
            return
        except IntegrityError:
            db.session.rollback()
    raise RuntimeError("could not assign a unique report number")


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
        investigator_name=current_user.full_name,
        investigator_title=current_user.job_title,
        investigation_date=date.today(),
    )
    if request.method == "POST":
        errors = []
        _apply_report_form(incident, errors)
        if errors:
            for message in errors:
                flash(message, "danger")
        else:
            incident.reported_at = now()
            incident.status = "reported"
            _save_new_incident(incident)
            if current_app.config.get("NOTIFY_ON_INCIDENT"):
                notifications.notify_incident_reported(incident)
                db.session.commit()
            flash(
                f"Report {incident.incident_number} created. Next: add the principal and eyewitness statements, "
                "then the analysis and signatures.",
                "success",
            )
            return redirect(url_for("incidents.detail", incident_id=incident.id))
    return render_template("incidents/form.html", incident=incident, divisions=divisions, editing=False, **FORM_CHOICES)


@bp.route("/<int:incident_id>")
@login_required
def detail(incident_id):
    incident = _get_incident(incident_id)
    return render_template("incidents/detail.html", **_render_detail_context(incident))


@bp.route("/<int:incident_id>/edit", methods=["GET", "POST"])
@login_required
def edit(incident_id):
    incident = _get_incident(incident_id)
    if incident.status == "closed" and not current_user.is_admin:
        flash("Closed reports can only be edited by a safety administrator.", "danger")
        return redirect(url_for("incidents.detail", incident_id=incident.id))
    if not can_edit_report(current_user, incident):
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
            flash(f"Report {incident.incident_number} saved.", "success")
            return redirect(url_for("incidents.detail", incident_id=incident.id))
    return render_template("incidents/form.html", incident=incident, divisions=divisions, editing=True, **FORM_CHOICES)


# --------------------------------------------------------------------------- sections 5 and 6: statements


def _statement_role():
    role = request.values.get("role")
    return role if role in STATEMENT_ROLES else "principal"


def _apply_signed_statement(statement, via):
    """Read the signing form (device or link). Returns a list of error messages;
    the statement is marked signed only when the list is empty."""
    errors = []
    statement.printed_name = _text("printed_name")
    statement.department = _text("department")
    statement.title = _text("title")
    statement.statement_text = _text("statement_text")
    signature = _image("signature_data")
    if not statement.printed_name:
        errors.append("Enter your printed name.")
    if not statement.statement_text:
        errors.append("Enter your statement.")
    if not signature:
        errors.append("Sign in the signature box before submitting.")
    if not parse_bool(_text("attest")):
        errors.append("Tick the box to confirm that the statement is true and complete.")
    if errors:
        return errors
    statement.signature_data = signature
    statement.status = "signed"
    statement.signed_via = via
    statement.signed_at = now()
    return errors


@bp.route("/<int:incident_id>/statements/add", methods=["POST"])
@login_required
def add_statement(incident_id):
    """Start a statement: on this device (opens the signing page) or by emailed link."""
    incident = _get_incident(incident_id, investigate=True)
    role = _text("role")
    mode = _text("mode")
    if role not in STATEMENT_ROLES or mode not in ("device", "link"):
        abort(400)
    if mode == "device":
        statement = Statement(incident_id=incident.id, role=role, status="pending")
        db.session.add(statement)
        db.session.commit()
        return redirect(url_for("incidents.sign_statement", incident_id=incident.id, statement_id=statement.id))
    email = (_text("email") or "").lower()
    if "@" not in email:
        flash("Enter the email address to send the statement link to.", "danger")
        return _redirect_to_detail(incident, f"section-{'5' if role == 'principal' else '6'}")
    statement = Statement(incident_id=incident.id, role=role, status="pending", email=email, token=new_statement_token())
    db.session.add(statement)
    db.session.flush()
    send_statement_request(statement, requested_by=current_user)
    db.session.commit()
    flash(f"Statement link sent to {email}. The link opens only the statement page, not the report.", "success")
    return _redirect_to_detail(incident, f"section-{'5' if role == 'principal' else '6'}")


@bp.route("/<int:incident_id>/statements/<int:statement_id>/send", methods=["POST"])
@login_required
def resend_statement_link(incident_id, statement_id):
    """Send (or send again) the emailed link for a statement that is still pending."""
    incident = _get_incident(incident_id, investigate=True)
    statement = _get_statement(incident, statement_id)
    if statement.is_signed:
        flash("That statement has already been signed.", "info")
        return _redirect_to_detail(incident)
    email = (_text("email") or statement.email or "").lower()
    if "@" not in email:
        flash("Enter the email address to send the statement link to.", "danger")
        return _redirect_to_detail(incident)
    statement.email = email
    if not statement.token:
        statement.token = new_statement_token()
    send_statement_request(statement, requested_by=current_user)
    db.session.commit()
    flash(f"Statement link sent to {email}.", "success")
    return _redirect_to_detail(incident)


@bp.route("/<int:incident_id>/statements/<int:statement_id>/sign", methods=["GET", "POST"])
@login_required
def sign_statement(incident_id, statement_id):
    """Signing on the investigator's device. The page shows nothing from the report
    beyond its number, date and location."""
    incident = _get_incident(incident_id, investigate=True)
    statement = _get_statement(incident, statement_id)
    if statement.is_signed:
        flash("That statement has already been signed.", "info")
        return _redirect_to_detail(incident)
    if request.method == "POST":
        errors = _apply_signed_statement(statement, "device")
        if errors:
            for message in errors:
                flash(message, "danger")
        else:
            db.session.commit()
            return render_template("incidents/statement_done.html", incident=incident, statement=statement, mode="device")
    return render_template("incidents/statement_form.html", incident=incident, statement=statement, mode="device")


@bp.route("/statement/<token>", methods=["GET", "POST"])
def statement_link(token):
    """Public signing page reached from the emailed link. No login. The token
    accepts one signed statement; afterwards it only confirms that it was signed."""
    statement = Statement.query.filter_by(token=token).first_or_404()
    incident = statement.incident
    if statement.is_signed:
        page = render_template("incidents/statement_done.html", incident=incident, statement=statement, mode="link", already=True)
        return page, (409 if request.method == "POST" else 200)
    if request.method == "POST":
        errors = _apply_signed_statement(statement, "link")
        if errors:
            for message in errors:
                flash(message, "danger")
        else:
            db.session.commit()
            return render_template("incidents/statement_done.html", incident=incident, statement=statement, mode="link")
    return render_template("incidents/statement_form.html", incident=incident, statement=statement, mode="link")


@bp.route("/<int:incident_id>/statements/paper", methods=["GET", "POST"])
@login_required
def paper_statement(incident_id):
    """Record a statement received on paper: the investigator transcribes it and
    notes who signed it and when."""
    incident = _get_incident(incident_id, investigate=True)
    statement_id = parse_int(request.values.get("statement"))
    if statement_id:
        statement = _get_statement(incident, statement_id)
        if statement.is_signed:
            flash("That statement has already been signed.", "info")
            return _redirect_to_detail(incident)
    else:
        statement = Statement(incident_id=incident.id, role=_statement_role(), status="pending")
    if request.method == "POST":
        errors = []
        statement.printed_name = _text("printed_name")
        statement.department = _text("department")
        statement.title = _text("title")
        statement.statement_text = _text("statement_text")
        statement.received_by = _text("received_by") or current_user.full_name
        signed_on = parse_date(_text("signed_on")) or date.today()
        if not statement.printed_name:
            errors.append("Enter the printed name as it appears on the paper statement.")
        if not statement.statement_text:
            errors.append("Type the statement as written.")
        if errors:
            for message in errors:
                flash(message, "danger")
        else:
            statement.status = "signed"
            statement.signed_via = "paper"
            statement.signed_at = datetime.combine(signed_on, time())
            statement.signature_data = None
            db.session.add(statement)
            db.session.commit()
            flash(f"Statement from {statement.printed_name} attached to {incident.incident_number}.", "success")
            return _redirect_to_detail(incident, f"section-{'5' if statement.role == 'principal' else '6'}")
    return render_template("incidents/statement_paper.html", incident=incident, statement=statement, **FORM_CHOICES)


@bp.route("/<int:incident_id>/statements/blank")
@login_required
def blank_statement(incident_id):
    """Printable blank statement form to hand to the principal or a witness."""
    incident = _get_incident(incident_id)
    statement_id = parse_int(request.args.get("statement"))
    statement = _get_statement(incident, statement_id) if statement_id else Statement(role=_statement_role())
    return render_template("incidents/statement_blank.html", incident=incident, statement=statement)


@bp.route("/<int:incident_id>/statements/<int:statement_id>/delete", methods=["POST"])
@login_required
def delete_statement(incident_id, statement_id):
    incident = _get_incident(incident_id, investigate=True)
    statement = _get_statement(incident, statement_id)
    if statement.is_signed:
        flash("Signed statements are part of the record and cannot be removed.", "danger")
        return _redirect_to_detail(incident)
    db.session.delete(statement)
    db.session.commit()
    flash("Statement removed.", "info")
    return _redirect_to_detail(incident)


# --------------------------------------------------------------------------- section 7: facts and analysis


@bp.route("/<int:incident_id>/investigation", methods=["GET", "POST"])
@login_required
def investigation(incident_id):
    incident = _get_incident(incident_id, investigate=True)
    if request.method == "POST":
        incident.safety_rep_name = _text("safety_rep_name") or current_user.full_name
        incident.safety_rep_title = _text("safety_rep_title") or current_user.job_title
        incident.analysis_date = parse_date(_text("analysis_date")) or date.today()
        incident.facts_analysis = _text("facts_analysis")
        incident.contributing_causes = _text("contributing_causes")
        incident.direct_cause = _text("direct_cause")
        incident.root_cause = _text("root_cause")
        incident.contributing_factor_type = _choice("contributing_factor_type", CONTRIBUTING_FACTORS)
        incident.contributing_factor_detail = _text("contributing_factor_detail")
        incident.supporting_references = _text("supporting_references")
        incident.lessons_learned = _text("lessons_learned")
        if "preventability" in request.form:
            incident.preventability = _choice("preventability", PREVENTABILITY) or "undetermined"
        if "osha_recordable" in request.form:
            incident.osha_recordable = parse_bool(_text("osha_recordable"))
        if incident.investigator_id is None:
            incident.investigator_id = current_user.id
        if incident.status == "reported":
            incident.status = "under_investigation"
        db.session.commit()
        flash("Section 7 saved.", "success")
        return redirect(url_for("incidents.detail", incident_id=incident.id) + "#section-7")
    return render_template("incidents/investigation.html", **_render_detail_context(incident))


def _apply_verification(action, verification_date, verified_by=None):
    """A verification date marks the action verified; clearing it steps the action back."""
    action.verification_date = verification_date
    if verification_date:
        action.status = "verified"
        action.verified_by = verified_by or action.verified_by or current_user.full_name
        if not action.completed_on:
            action.completed_on = verification_date
    else:
        action.verified_by = None
        if action.status == "verified":
            action.status = "completed" if action.completed_on else "open"


@bp.route("/<int:incident_id>/actions", methods=["POST"])
@login_required
def add_action(incident_id):
    incident = _get_incident(incident_id, investigate=True)
    description = _text("description")
    if not description:
        flash("Describe the corrective action.", "danger")
        return redirect(url_for("incidents.investigation", incident_id=incident.id) + "#actions")
    action = CorrectiveAction(
        incident=incident,
        description=description,
        responsible_name=_text("responsible_name"),
        target_date=parse_date(_text("target_date")),
        notes=_text("notes"),
        status="open",
    )
    verification_date = parse_date(_text("verification_date"))
    if verification_date:
        _apply_verification(action, verification_date, _text("verified_by"))
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
            action.completed_on = parse_date(_text("completed_on")) or action.completed_on or date.today()
            action.verification_date = None
            action.verified_by = None
        elif status == "verified":
            action.verification_date = action.verification_date or date.today()
            action.verified_by = action.verified_by or current_user.full_name
            action.completed_on = action.completed_on or action.verification_date
        else:
            action.completed_on = None
            action.verification_date = None
            action.verified_by = None
    if "verification_date" in request.form:
        _apply_verification(action, parse_date(_text("verification_date")), _text("verified_by"))
    if "notes" in request.form:
        action.notes = _text("notes")
    if "responsible_name" in request.form:
        action.responsible_name = _text("responsible_name")
    if "target_date" in request.form:
        action.target_date = parse_date(_text("target_date"))
    if "description" in request.form and _text("description"):
        action.description = _text("description")
    db.session.commit()
    flash("Corrective action updated.", "success")
    return redirect(url_for("incidents.investigation", incident_id=incident.id) + "#actions")


# --------------------------------------------------------------------------- section 8: signatures


@bp.route("/<int:incident_id>/signatures", methods=["POST"])
@login_required
def save_signatures(incident_id):
    incident = _get_incident(incident_id, investigate=True)
    stamp = now()
    for role in SIGNATURE_ROLES:
        name = _text(f"sig_{role}_name")
        title = _text(f"sig_{role}_title")
        image = _image(f"sig_{role}_signature")
        signature = incident.signature_for(role)
        if signature is None:
            if not (name or title or image):
                continue
            signature = IncidentSignature(incident=incident, role=role)
            db.session.add(signature)
        signature.name = name
        signature.title = title
        if image:
            if image != signature.signature_data:
                signature.signature_data = image
                signature.signed_at = stamp
                signature.user_id = current_user.id
        else:
            signature.signature_data = None
            signature.signed_at = None
            signature.user_id = None
    db.session.commit()
    flash("Signatures saved.", "success")
    return redirect(url_for("incidents.detail", incident_id=incident.id) + "#section-8")


# --------------------------------------------------------------------------- status and printing


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
            flash("Before closing, record the " + ", ".join(missing) + " in Section 7 on the investigation page.", "danger")
            return redirect(url_for("incidents.investigation", incident_id=incident.id))
        incident.status = "closed"
        incident.closed_at = now()
        incident.closed_by_id = current_user.id
        db.session.commit()
        if current_app.config.get("NOTIFY_ON_INCIDENT"):
            notifications.notify_incident_closed(incident)
            db.session.commit()
        flash(f"Report {incident.incident_number} closed.", "success")
    else:
        incident.status = status
        incident.closed_at = None
        incident.closed_by_id = None
        db.session.commit()
        flash("Report status updated.", "success")
    return redirect(url_for("incidents.detail", incident_id=incident.id))


@bp.route("/<int:incident_id>/print")
@login_required
def print_report(incident_id):
    incident = _get_incident(incident_id)
    return render_template("incidents/print.html", incident=incident, **FORM_CHOICES)
