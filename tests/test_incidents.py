"""Eight-section incident reports: numbering, the report form (sections 1 to 4),
statements signed on a device, by link and on paper (5 and 6), facts and
analysis with corrective actions (7), signatures (8), closing, printing and
access rules."""
from datetime import date, datetime

from flask import render_template

from app.extensions import db
from app.models import CorrectiveAction, Incident, IncidentSignature, NotificationLog, Statement, User
from app.services.incidents import next_incident_number
from tests.conftest import login

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
PNG_2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="


def report_data(**overrides):
    """A complete injury report with a vehicle, equipment and injury group."""
    data = {
        "incident_type": "injury",
        "occurred_at": "2026-10-23T09:30",
        "location": "Pole 4421, Main St and 3rd Ave",
        "division_id": "",
        "severity": "moderate",
        "work_activity": "Replacing a service drop",
        "weather_conditions": "Rain earlier, wet surfaces",
        "employees_involved": "James Carter, Lineworker",
        "witnesses": "Pat Lee, Groundworker",
        "immediate_actions": "First aid applied, supervisor notified.",
        "property_description": "Pole step",
        "property_owner": "city",
        "estimated_cost": "120",
        "damage_description": "Bent step",
        "investigator_name": "Dana Super",
        "investigator_title": "Crew Supervisor",
        "investigation_date": "2026-10-23",
        "vehicle_involved": "yes",
        "vehicle_type": "Bucket or aerial lift truck",
        "vehicle_make_model": "Ford F-550 Altec",
        "license_plate": "M 12345",
        "vehicle_unit": "ES-204",
        "driver_name": "Ravi Patel",
        "seat_belt_used": "yes",
        "police_report_number": "",
        "drug_alcohol_test": "completed",
        "vehicle_damage_estimate": "1250.50",
        "other_party": "",
        "damage_marks": '[{"x": 50, "y": 25.5}, {"x": 10, "y": 80}]',
        "scene_sketch": PNG,
        "equipment_involved_flag": "yes",
        "equipment_involved": "Utility trailer T-12 with the pole stand",
        "equipment_sketch": PNG_2,
        "injury_occurred": "yes",
        "injured_person": "James Carter",
        "injured_job_title": "Lineworker",
        "body_marks": '[{"x": 33.3, "y": 44.4}]',
        "injury_types": ["Laceration", "Other"],
        "injury_other": "Splinter",
        "body_parts": ["Hand/Finger", "Forearm"],
        "body_part_other": "",
        "treatment": "clinic",
        "treatment_provider": "Occupational health clinic",
        "days_away": "0",
        "days_restricted": "2",
        "osha_recordable": "",
        "description": "Employee slipped on a wet pole step while descending and cut his left hand on a tool.",
    }
    data.update(overrides)
    return data


def create_report(client, **overrides):
    """Post a report and return its id."""
    resp = client.post("/incidents/new", data=report_data(**overrides), follow_redirects=True)
    assert resp.status_code == 200, resp.data[:500]
    assert b"created" in resp.data, resp.data[:2000]
    return Incident.query.order_by(Incident.id.desc()).first().id


def minimal_data(**overrides):
    data = {
        "incident_type": "property_damage",
        "occurred_at": "2026-10-23T14:00",
        "location": "12 Elm St",
        "severity": "minor",
        "description": "Mower threw a rock through a window.",
        "property_description": "Residential window",
        "property_owner": "third_party",
        "estimated_cost": "400",
    }
    data.update(overrides)
    return data


# --------------------------------------------------------------------------- numbering


def test_report_numbers_use_date_type_code_and_daily_sequence(app, client):
    login(client, "super@example.gov")
    first = create_report(client)
    second = create_report(client, occurred_at="2026-10-23T16:45")
    vehicle = create_report(
        client,
        incident_type="vehicle",
        injury_occurred="no",
        occurred_at="2026-10-23T11:00",
        description="Backed the refuse truck into the yard gate post.",
    )
    other_day = create_report(client, occurred_at="2026-10-24T08:00")
    prop = client.post("/incidents/new", data=minimal_data(), follow_redirects=True)
    assert prop.status_code == 200
    with app.app_context():
        numbers = {i.id: i.incident_number for i in Incident.query.all()}
        assert numbers[first] == "10232026PI-01"
        assert numbers[second] == "10232026PI-02"
        assert numbers[vehicle] == "10232026VI-01"
        assert numbers[other_day] == "10242026PI-01"
        assert "10232026PD-01" in numbers.values()
        assert next_incident_number("injury", datetime(2026, 10, 23, 8, 0)) == "10232026PI-03"
        assert next_incident_number("vehicle", date(2026, 1, 5)) == "01052026VI-01"
        # Past 99 the sequence keeps counting instead of wrapping.
        for n in range(3, 100):
            db.session.add(
                Incident(
                    incident_number=f"10232026PI-{n:02d}",
                    incident_type="injury",
                    occurred_at=datetime(2026, 10, 23, 8, 0),
                    location="x",
                    description="x",
                    reported_by_id=User.query.filter_by(email="super@example.gov").first().id,
                )
            )
        db.session.commit()
        assert next_incident_number("injury", datetime(2026, 10, 23, 8, 0)) == "10232026PI-100"
        db.session.rollback()


# --------------------------------------------------------------------------- sections 1 to 4


def test_report_form_saves_vehicle_equipment_and_injury_groups(app, client):
    login(client, "emp@example.gov")
    assert client.get("/incidents/new").status_code == 200
    incident_id = create_report(client)
    with app.app_context():
        incident = db.session.get(Incident, incident_id)
        assert incident.incident_number == "10232026PI-01"
        assert incident.type_code == "PI"
        assert incident.reported_by.email == "emp@example.gov"
        assert incident.investigator_name == "Dana Super" and incident.investigator_title == "Crew Supervisor"
        assert incident.investigation_date == date(2026, 10, 23)
        assert incident.property_description == "Pole step" and incident.estimated_cost == 120
        # Section 2
        assert incident.vehicle_involved is True
        assert incident.vehicle_type == "Bucket or aerial lift truck"
        assert incident.vehicle_make_model == "Ford F-550 Altec"
        assert incident.license_plate == "M 12345" and incident.vehicle_unit == "ES-204"
        assert incident.seat_belt_used is True and incident.drug_alcohol_test == "completed"
        assert incident.vehicle_damage_estimate == 1250.5
        assert incident.damage_marks == [{"x": 50.0, "y": 25.5}, {"x": 10.0, "y": 80.0}]
        assert incident.scene_sketch == PNG
        assert incident.equipment_involved_flag is True
        assert incident.equipment_involved.startswith("Utility trailer")
        assert incident.equipment_sketch == PNG_2
        # Section 3
        assert incident.injury_occurred is True
        assert incident.injured_person == "James Carter"
        assert incident.body_marks == [{"x": 33.3, "y": 44.4}]
        assert incident.injury_types == ["Laceration", "Other"]
        assert incident.injury_other == "Splinter"
        assert incident.body_parts == ["Hand/Finger", "Forearm"]
        assert incident.treatment == "clinic" and incident.days_restricted == 2
        assert incident.osha_recordable is None
        # Reporting notifications still go out.
        recipients = {n.recipient_email for n in NotificationLog.query.filter_by(kind="incident_reported").all()}
        assert {"admin@example.gov", "super@example.gov"} <= recipients

    resp = client.get(f"/incidents/{incident_id}")
    assert resp.status_code == 200
    assert b"Laceration, Other: Splinter" in resp.data
    assert b"Hand/Finger, Forearm" in resp.data
    assert b'data-widget="vehicle"' in resp.data and b'data-widget="body"' in resp.data

    # Editing keeps the number and the saved groups; answering no clears a group.
    resp = client.get(f"/incidents/{incident_id}/edit")
    assert resp.status_code == 200
    assert b'value="Laceration" checked' in resp.data
    assert b'value="Bucket or aerial lift truck" selected' in resp.data
    resp = client.post(
        f"/incidents/{incident_id}/edit",
        data=report_data(equipment_involved_flag="no", description="Updated description of the slip."),
        follow_redirects=True,
    )
    assert resp.status_code == 200
    with app.app_context():
        incident = db.session.get(Incident, incident_id)
        assert incident.incident_number == "10232026PI-01"
        assert incident.description == "Updated description of the slip."
        assert incident.equipment_involved_flag is False
        assert incident.equipment_involved is None and incident.equipment_sketch is None
        assert incident.damage_marks[0]["x"] == 50.0


def test_report_form_validation(app, client):
    login(client, "emp@example.gov")
    # Injury reports must record that an injury occurred, with the person named.
    resp = client.post("/incidents/new", data=report_data(injury_occurred="no"), follow_redirects=True)
    assert b"Section 3" in resp.data
    resp = client.post("/incidents/new", data=report_data(injured_person=""), follow_redirects=True)
    assert b"name of the injured person" in resp.data
    # Required basics.
    resp = client.post("/incidents/new", data=report_data(description="", location=""), follow_redirects=True)
    assert b"Enter the location." in resp.data and b"describe what happened" in resp.data
    resp = client.post("/incidents/new", data=report_data(occurred_at="not a date"), follow_redirects=True)
    assert b"date and time" in resp.data
    # Vehicle reports must answer whether a vehicle was involved.
    resp = client.post(
        "/incidents/new",
        data=minimal_data(incident_type="vehicle", vehicle_involved=""),
        follow_redirects=True,
    )
    assert b"Section 2" in resp.data
    # Bad marks and non-image sketch data are dropped rather than stored.
    resp = client.post(
        "/incidents/new",
        data=report_data(damage_marks="not json", scene_sketch="javascript:alert(1)"),
        follow_redirects=True,
    )
    assert b"created" in resp.data
    with app.app_context():
        assert Incident.query.count() == 1
        incident = Incident.query.first()
        assert incident.damage_marks == [] and incident.scene_sketch is None


def test_vehicle_group_available_on_a_property_damage_report(app, client):
    login(client, "other@example.gov")
    resp = client.post(
        "/incidents/new",
        data=minimal_data(vehicle_involved="yes", vehicle_unit="PW-77", driver_name="Ravi Patel"),
        follow_redirects=True,
    )
    assert resp.status_code == 200
    with app.app_context():
        prop = Incident.query.filter_by(incident_type="property_damage").one()
        assert prop.incident_number == "10232026PD-01"
        assert prop.property_owner == "third_party" and prop.estimated_cost == 400
        assert prop.vehicle_involved is True and prop.vehicle_unit == "PW-77" and prop.driver_name == "Ravi Patel"
        assert prop.injury_occurred is None
    resp = client.get(f"/incidents/{prop.id}")
    assert resp.status_code == 200 and b"PW-77" in resp.data


# --------------------------------------------------------------------------- statements


def test_device_signed_statement_flow(app, client):
    login(client, "super@example.gov")
    incident_id = create_report(client)
    resp = client.post(f"/incidents/{incident_id}/statements/add", data={"role": "principal", "mode": "device"})
    assert resp.status_code == 302
    sign_url = resp.headers["Location"]
    assert sign_url.endswith("/sign")
    resp = client.get(sign_url)
    assert resp.status_code == 200
    assert b"statement-mode" in resp.data
    assert b"10232026PI-01" in resp.data
    assert b"Pole 4421" in resp.data
    assert b"shows only your statement" in resp.data
    # Nothing from the report body is shown to the person signing.
    assert b"slipped on a wet pole step" not in resp.data
    assert b"Replacing a service drop" not in resp.data
    assert b'data-widget="signature"' in resp.data

    # Missing signature or attestation is refused.
    resp = client.post(sign_url, data={"printed_name": "James Carter", "statement_text": "I was descending.", "attest": "yes"})
    assert resp.status_code == 200 and b"Sign in the signature box" in resp.data
    with app.app_context():
        assert Statement.query.first().status == "pending"

    resp = client.post(
        sign_url,
        data={
            "printed_name": "James Carter",
            "department": "Electric Services",
            "title": "Lineworker",
            "statement_text": "I was descending the pole when my boot slipped on the wet step.",
            "signature_data": PNG,
            "attest": "yes",
        },
    )
    assert resp.status_code == 200
    assert b"Thank you" in resp.data and b"hand the device back" in resp.data
    with app.app_context():
        statement = Statement.query.first()
        assert statement.role == "principal" and statement.status == "signed" and statement.signed_via == "device"
        assert statement.signature_data == PNG and statement.signed_at is not None
        assert statement.token is None
        statement_id = statement.id

    # Signed statements show on the report and cannot be removed or re-signed.
    resp = client.get(f"/incidents/{incident_id}")
    assert b"James Carter" in resp.data and b"on this device" in resp.data
    assert b"my boot slipped" in resp.data
    resp = client.post(f"/incidents/{incident_id}/statements/{statement_id}/delete", follow_redirects=True)
    assert b"cannot be removed" in resp.data
    resp = client.get(f"/incidents/{incident_id}/statements/{statement_id}/sign", follow_redirects=True)
    assert b"already been signed" in resp.data
    with app.app_context():
        assert Statement.query.count() == 1

    # A pending statement can be removed.
    client.post(f"/incidents/{incident_id}/statements/add", data={"role": "witness", "mode": "device"})
    with app.app_context():
        pending = Statement.query.filter_by(role="witness").first()
        assert pending.status == "pending"
        pending_id = pending.id
    resp = client.get(f"/incidents/{incident_id}")
    assert b"Not yet signed" in resp.data
    resp = client.post(f"/incidents/{incident_id}/statements/{pending_id}/delete", follow_redirects=True)
    assert b"Statement removed" in resp.data
    with app.app_context():
        assert Statement.query.count() == 1


def test_link_statement_flow(app, client):
    login(client, "super@example.gov")
    incident_id = create_report(client)
    resp = client.post(
        f"/incidents/{incident_id}/statements/add",
        data={"role": "witness", "mode": "link", "email": "Pat.Lee@example.gov"},
        follow_redirects=True,
    )
    assert resp.status_code == 200
    assert b"Statement link sent to pat.lee@example.gov" in resp.data
    with app.app_context():
        statement = Statement.query.first()
        assert statement.role == "witness" and statement.status == "pending"
        assert statement.email == "pat.lee@example.gov"
        assert statement.token and len(statement.token) >= 24
        assert statement.sent_at is not None
        token = statement.token
        log = NotificationLog.query.filter_by(kind="statement_request").one()
        assert log.recipient_email == "pat.lee@example.gov"
        assert log.incident_id == incident_id
        assert f"/incidents/statement/{token}" in log.body
        assert "only your own statement" in log.body
        assert "10232026PI-01" in log.body
    resp = client.get(f"/incidents/{incident_id}")
    assert b"Link sent" in resp.data

    # The link works without a login and shows only the statement page.
    client.get("/logout")
    assert client.get(f"/incidents/{incident_id}").status_code == 302
    resp = client.get(f"/incidents/statement/{token}")
    assert resp.status_code == 200
    assert b"statement-mode" in resp.data and b"10232026PI-01" in resp.data
    assert b"slipped on a wet pole step" not in resp.data
    assert b"Exit without signing" not in resp.data
    assert client.get("/incidents/statement/not-a-real-token").status_code == 404

    resp = client.post(
        f"/incidents/statement/{token}",
        data={
            "printed_name": "Pat Lee",
            "department": "Electric Services",
            "title": "Groundworker",
            "statement_text": "I was holding the tag line and saw his boot slip.",
            "signature_data": PNG,
            "attest": "yes",
        },
    )
    assert resp.status_code == 200
    assert b"Thank you" in resp.data and b"close this window" in resp.data
    with app.app_context():
        statement = Statement.query.first()
        assert statement.status == "signed" and statement.signed_via == "link"
        assert statement.printed_name == "Pat Lee" and statement.signature_data == PNG

    # The token no longer accepts edits.
    resp = client.post(
        f"/incidents/statement/{token}",
        data={"printed_name": "Someone Else", "statement_text": "Changed.", "signature_data": PNG_2, "attest": "yes"},
    )
    assert resp.status_code == 409
    assert b"Already signed" in resp.data
    resp = client.get(f"/incidents/statement/{token}")
    assert resp.status_code == 200 and b"can no longer be changed" in resp.data
    with app.app_context():
        statement = Statement.query.first()
        assert statement.printed_name == "Pat Lee"
        assert statement.statement_text.startswith("I was holding")
        assert statement.signature_data == PNG

    # A missing email address is refused; a signed statement cannot be re-sent.
    login(client, "super@example.gov")
    resp = client.post(f"/incidents/{incident_id}/statements/add", data={"role": "witness", "mode": "link", "email": "nope"}, follow_redirects=True)
    assert b"Enter the email address" in resp.data
    with app.app_context():
        statement_id = Statement.query.first().id
        assert Statement.query.count() == 1
    resp = client.post(f"/incidents/{incident_id}/statements/{statement_id}/send", follow_redirects=True)
    assert b"already been signed" in resp.data
    with app.app_context():
        assert NotificationLog.query.filter_by(kind="statement_request").count() == 1


def test_resend_link_for_pending_statement(app, client):
    login(client, "admin@example.gov")
    incident_id = create_report(client)
    client.post(f"/incidents/{incident_id}/statements/add", data={"role": "principal", "mode": "device"})
    with app.app_context():
        statement = Statement.query.first()
        assert statement.token is None
        statement_id = statement.id
    resp = client.post(f"/incidents/{incident_id}/statements/{statement_id}/send", data={"email": "james@example.gov"}, follow_redirects=True)
    assert b"Statement link sent to james@example.gov" in resp.data
    with app.app_context():
        statement = Statement.query.first()
        assert statement.token and statement.email == "james@example.gov"
        assert NotificationLog.query.filter_by(kind="statement_request").count() == 1


def test_paper_statement_and_blank_form(app, client):
    login(client, "super@example.gov")
    incident_id = create_report(client)
    resp = client.get(f"/incidents/{incident_id}/statements/blank?role=witness")
    assert resp.status_code == 200
    assert b"Eyewitness statement" in resp.data and b"10232026PI-01" in resp.data and b"write-line" in resp.data
    resp = client.get(f"/incidents/{incident_id}/statements/paper?role=witness")
    assert resp.status_code == 200
    assert b"Statement received on paper" in resp.data
    resp = client.post(
        f"/incidents/{incident_id}/statements/paper",
        data={
            "role": "witness",
            "printed_name": "Pat Lee",
            "department": "Electric Services",
            "title": "Groundworker",
            "statement_text": "Transcribed from the paper form: I saw the slip from the ground.",
            "signed_on": "2026-10-24",
            "received_by": "Dana Super",
        },
        follow_redirects=True,
    )
    assert resp.status_code == 200
    assert b"Statement from Pat Lee attached" in resp.data
    assert b"on paper" in resp.data
    with app.app_context():
        statement = Statement.query.one()
        assert statement.role == "witness" and statement.status == "signed" and statement.signed_via == "paper"
        assert statement.signed_at.date() == date(2026, 10, 24)
        assert statement.received_by == "Dana Super"
        assert statement.signature_data is None
    # The printed name is required.
    resp = client.post(f"/incidents/{incident_id}/statements/paper", data={"role": "principal", "statement_text": "x"}, follow_redirects=True)
    assert b"Enter the printed name" in resp.data
    with app.app_context():
        assert Statement.query.count() == 1


# --------------------------------------------------------------------------- sections 7 and 8


SECTION_7 = {
    "safety_rep_name": "Sam Admin",
    "safety_rep_title": "Safety Manager",
    "analysis_date": "2026-10-25",
    "facts_analysis": "Statements and the wet step agree on the sequence of events.",
    "contributing_causes": "Rain earlier that morning; worn glove grip.",
    "direct_cause": "Wet pole step and worn glove grip.",
    "root_cause": "No procedure for pausing pole work after rain; gloves not inspected.",
    "contributing_factor_type": "environmental",
    "contributing_factor_detail": "Rain left the steps wet.",
    "supporting_references": "29 CFR 1910.269(g)(2); department SOP 4.2.",
    "lessons_learned": "Add a wet-weather pause to the pole work rules.",
    "preventability": "preventable",
    "osha_recordable": "yes",
}


def test_section_7_save_and_corrective_action_verification(app, client):
    login(client, "super@example.gov")
    incident_id = create_report(client)
    resp = client.get(f"/incidents/{incident_id}/investigation")
    assert resp.status_code == 200
    assert b"Section 7" in resp.data and b"Section 8" in resp.data
    resp = client.post(f"/incidents/{incident_id}/investigation", data=SECTION_7, follow_redirects=True)
    assert resp.status_code == 200 and b"Section 7 saved" in resp.data
    with app.app_context():
        incident = db.session.get(Incident, incident_id)
        assert incident.status == "under_investigation"
        assert incident.safety_rep_name == "Sam Admin" and incident.safety_rep_title == "Safety Manager"
        assert incident.analysis_date == date(2026, 10, 25)
        assert incident.facts_analysis.startswith("Statements")
        assert incident.contributing_causes.startswith("Rain")
        assert incident.direct_cause == "Wet pole step and worn glove grip."
        assert incident.root_cause.startswith("No procedure")
        assert incident.contributing_factor_type == "environmental"
        assert incident.supporting_references.startswith("29 CFR")
        assert incident.lessons_learned.startswith("Add a wet-weather")
        assert incident.preventability == "preventable"
        assert incident.osha_recordable is True
        assert incident.investigator.email == "super@example.gov"

    # Corrective action: add, then verify by date.
    resp = client.post(
        f"/incidents/{incident_id}/actions",
        data={"description": "Add wet-weather pole climbing pause to the work rules.", "responsible_name": "Dana Super", "target_date": "2026-11-01", "notes": "Draft by the crew leads."},
        follow_redirects=True,
    )
    assert b"Add wet-weather" in resp.data
    with app.app_context():
        action = CorrectiveAction.query.one()
        assert action.status == "open" and action.verification_date is None and action.notes == "Draft by the crew leads."
        action_id = action.id
    resp = client.post(f"/incidents/{incident_id}/actions/{action_id}", data={"verification_date": "2026-11-03"}, follow_redirects=True)
    assert resp.status_code == 200
    with app.app_context():
        action = db.session.get(CorrectiveAction, action_id)
        assert action.status == "verified"
        assert action.verification_date == date(2026, 11, 3)
        assert action.verified_by == "Dana Super"
        assert action.completed_on == date(2026, 11, 3)
    # Clearing the date steps the action back; choosing verified without a date stamps today.
    client.post(f"/incidents/{incident_id}/actions/{action_id}", data={"verification_date": ""})
    with app.app_context():
        action = db.session.get(CorrectiveAction, action_id)
        assert action.status == "completed" and action.verification_date is None and action.verified_by is None
    client.post(f"/incidents/{incident_id}/actions/{action_id}", data={"status": "verified"})
    with app.app_context():
        action = db.session.get(CorrectiveAction, action_id)
        assert action.status == "verified" and action.verification_date == date.today()
    client.post(f"/incidents/{incident_id}/actions/{action_id}", data={"status": "in_progress"})
    with app.app_context():
        action = db.session.get(CorrectiveAction, action_id)
        assert action.status == "in_progress" and action.verification_date is None
    resp = client.get(f"/incidents/{incident_id}")
    assert b"Verification date" in resp.data and b"In progress" in resp.data
    resp = client.post(f"/incidents/{incident_id}/actions/{action_id}", data={"delete": "1"}, follow_redirects=True)
    assert b"removed" in resp.data
    with app.app_context():
        assert CorrectiveAction.query.count() == 0


def test_section_8_signatures_saved(app, client):
    login(client, "super@example.gov")
    incident_id = create_report(client)
    resp = client.post(
        f"/incidents/{incident_id}/signatures",
        data={
            "sig_investigator_name": "Dana Super",
            "sig_investigator_title": "Crew Supervisor",
            "sig_investigator_signature": PNG,
            "sig_manager_name": "Chris Manager",
            "sig_manager_title": "Operations Manager",
            "sig_manager_signature": "",
            "sig_safety_manager_name": "",
            "sig_safety_manager_title": "",
            "sig_safety_manager_signature": "",
            "sig_assistant_director_name": "",
            "sig_assistant_director_title": "",
            "sig_assistant_director_signature": "",
        },
        follow_redirects=True,
    )
    assert resp.status_code == 200 and b"Signatures saved" in resp.data
    with app.app_context():
        incident = db.session.get(Incident, incident_id)
        assert {s.role for s in incident.signatures} == {"investigator", "manager"}
        inv = incident.signature_for("investigator")
        assert inv.name == "Dana Super" and inv.title == "Crew Supervisor"
        assert inv.signature_data == PNG and inv.signed_at is not None
        assert inv.user.email == "super@example.gov"
        first_signed_at = inv.signed_at
        mgr = incident.signature_for("manager")
        assert mgr.name == "Chris Manager" and mgr.signature_data is None and mgr.signed_at is None
        assert incident.signature_for("safety_manager") is None
    resp = client.get(f"/incidents/{incident_id}")
    assert b"Chris Manager" in resp.data and b"Not signed" in resp.data

    # Saving again with the same image keeps the original time; a new image re-stamps it.
    client.post(
        f"/incidents/{incident_id}/signatures",
        data={"sig_investigator_name": "Dana Super", "sig_investigator_title": "Crew Supervisor", "sig_investigator_signature": PNG},
    )
    with app.app_context():
        inv = db.session.get(Incident, incident_id).signature_for("investigator")
        assert inv.signed_at == first_signed_at
    client.get("/logout")
    login(client, "admin@example.gov")
    client.post(
        f"/incidents/{incident_id}/signatures",
        data={
            "sig_investigator_name": "Dana Super",
            "sig_investigator_title": "Crew Supervisor",
            "sig_investigator_signature": PNG,
            "sig_safety_manager_name": "Sam Admin",
            "sig_safety_manager_title": "Safety Administrator",
            "sig_safety_manager_signature": PNG_2,
            "sig_manager_name": "Chris Manager",
            "sig_manager_signature": "",
        },
    )
    with app.app_context():
        incident = db.session.get(Incident, incident_id)
        assert incident.signature_for("investigator").user.email == "super@example.gov"
        safety = incident.signature_for("safety_manager")
        assert safety.signature_data == PNG_2 and safety.user.email == "admin@example.gov"
        assert IncidentSignature.query.count() == 3
    resp = client.get(f"/incidents/{incident_id}/print")
    assert resp.data.count(b'<img src="data:image/png') >= 2


def test_close_refused_without_causes_then_succeeds(app, client):
    login(client, "emp@example.gov")
    incident_id = create_report(client)
    client.get("/logout")
    login(client, "super@example.gov")
    resp = client.post(f"/incidents/{incident_id}/status", data={"status": "closed"}, follow_redirects=True)
    assert b"Before closing" in resp.data
    assert b"direct cause, root cause, contributing factor type" in resp.data
    with app.app_context():
        assert db.session.get(Incident, incident_id).status == "reported"
    partial = dict(SECTION_7, root_cause="", contributing_factor_type="")
    client.post(f"/incidents/{incident_id}/investigation", data=partial)
    resp = client.post(f"/incidents/{incident_id}/status", data={"status": "closed"}, follow_redirects=True)
    assert b"Before closing, record the root cause, contributing factor type" in resp.data
    client.post(f"/incidents/{incident_id}/investigation", data=SECTION_7)
    resp = client.post(f"/incidents/{incident_id}/status", data={"status": "closed"}, follow_redirects=True)
    assert b"10232026PI-01 closed" in resp.data
    with app.app_context():
        incident = db.session.get(Incident, incident_id)
        assert incident.status == "closed" and incident.closed_at is not None
        assert incident.closed_by.email == "super@example.gov"
        assert NotificationLog.query.filter_by(kind="incident_closed").count() == 2  # reporter + supervisor
    # Closed reports are read-only for the reporter and the supervisor, editable by an admin.
    assert client.get(f"/incidents/{incident_id}/edit").status_code == 302
    client.get("/logout")
    login(client, "emp@example.gov")
    resp = client.get(f"/incidents/{incident_id}")
    assert resp.status_code == 200 and b"Edit sections 1 to 4" not in resp.data
    client.get("/logout")
    login(client, "admin@example.gov")
    assert client.get(f"/incidents/{incident_id}/edit").status_code == 200
    resp = client.post(f"/incidents/{incident_id}/status", data={"status": "under_investigation"}, follow_redirects=True)
    with app.app_context():
        assert db.session.get(Incident, incident_id).status == "under_investigation"


# --------------------------------------------------------------------------- printing


SECTION_HEADINGS = [
    b"Incident information",
    b"Vehicle and equipment information",
    b"Personal injury details",
    b"Incident description",
    b"Principal statement",
    b"Eyewitness statement",
    b"Incident facts and analysis",
    b"Signatures",
]


def test_print_page_has_all_eight_sections(app, client):
    login(client, "super@example.gov")
    incident_id = create_report(client)
    client.post(
        f"/incidents/{incident_id}/statements/paper",
        data={"role": "principal", "printed_name": "James Carter", "department": "Electric", "title": "Lineworker", "statement_text": "My boot slipped on the wet step.", "signed_on": "2026-10-24", "received_by": "Dana Super"},
    )
    resp = client.post(f"/incidents/{incident_id}/statements/add", data={"role": "witness", "mode": "device"})
    client.post(resp.headers["Location"], data={"printed_name": "Pat Lee", "department": "Electric", "title": "Groundworker", "statement_text": "I saw the slip from the ground.", "signature_data": PNG, "attest": "yes"})
    client.post(f"/incidents/{incident_id}/investigation", data=SECTION_7)
    client.post(f"/incidents/{incident_id}/actions", data={"description": "Add a wet-weather pause to the pole work rules.", "responsible_name": "Dana Super", "target_date": "2026-11-01", "verification_date": "2026-11-05"})
    client.post(f"/incidents/{incident_id}/signatures", data={"sig_investigator_name": "Dana Super", "sig_investigator_title": "Crew Supervisor", "sig_investigator_signature": PNG})

    resp = client.get(f"/incidents/{incident_id}/print")
    assert resp.status_code == 200
    page = resp.data
    assert b"Incident Report" in page and b"10232026PI-01" in page
    for heading in SECTION_HEADINGS:
        assert heading in page, heading
    for n in range(1, 9):
        assert f'<span class="section-no">{n}</span>'.encode() in page, n
    # Statements, each with its own page break and signature or paper note.
    assert b"My boot slipped on the wet step." in page
    assert b"I saw the slip from the ground." in page
    assert b"(signed on paper, received by Dana Super)" in page
    assert page.count(b"report-section page-break") >= 4
    # Check lists, diagrams, sketches and signatures.
    assert b'<span class="check" aria-label="checked">X</span>Laceration' in page
    assert b'<span class="check" aria-label="not checked">&nbsp;</span>Burn' in page
    assert b"Other: Splinter" in page
    assert b'data-widget="vehicle"' in page and b'data-widget="body"' in page and b"data-interactive" not in page
    assert page.count(b'<img class="sketch-img" src="data:image/png') == 2
    assert b"Department Assistant Director" in page and b"Safety Manager" in page
    # Corrective actions with verification.
    assert b"Add a wet-weather pause" in page and b"Nov 05, 2026" in page and b"Verified" in page
    assert b"29 CFR 1910.269(g)(2)" in page


def test_print_and_detail_render_when_sections_are_empty(app, client):
    login(client, "other@example.gov")
    resp = client.post("/incidents/new", data=minimal_data(), follow_redirects=True)
    assert resp.status_code == 200
    with app.app_context():
        incident_id = Incident.query.one().id
    resp = client.get(f"/incidents/{incident_id}/print")
    assert resp.status_code == 200
    for heading in SECTION_HEADINGS:
        assert heading in resp.data, heading
    assert b"No principal statement attached." in resp.data
    assert b"No eyewitness statements attached." in resp.data
    resp = client.get(f"/incidents/{incident_id}")
    assert resp.status_code == 200 and b"Not answered" in resp.data
    resp = client.get("/incidents/")
    assert resp.status_code == 200 and b"10232026PD-01" in resp.data and b'class="tag" style="margin-left:0">PD</span>' in resp.data


def test_templates_render_with_jinja(app, client):
    """Render the new-report form and the print page directly to catch template errors."""
    login(client, "super@example.gov")
    incident_id = create_report(client)
    with app.app_context():
        incident = db.session.get(Incident, incident_id)
        from app.blueprints.incidents import FORM_CHOICES

        with app.test_request_context("/incidents/new"):
            from flask_login import login_user

            login_user(User.query.filter_by(email="super@example.gov").first())
            blank = Incident(incident_type="", severity="minor", occurred_at=datetime(2026, 10, 23, 9, 0))
            html = render_template("incidents/form.html", incident=blank, divisions=[], editing=False, **FORM_CHOICES)
            assert "Section 1" in html and "Section 4" in html
            assert 'data-toggles="vehicle"' in html and 'data-cond="vehicle"' in html
            assert 'data-toggles="equipment"' in html and 'data-toggles="injury"' in html
            assert 'data-widget="sketch" data-name="scene_sketch" data-background="intersection"' in html
            assert 'data-widget="sketch" data-name="equipment_sketch"' in html
            assert html.count('name="injury_types"') == 7 and html.count('name="body_parts"') == 21
            html = render_template("incidents/print.html", incident=incident, **FORM_CHOICES)
            for heading in SECTION_HEADINGS:
                assert heading.decode() in html
            html = render_template("incidents/investigation.html", incident=incident, can_investigate=True, can_edit=True, **FORM_CHOICES)
            assert 'data-name="sig_assistant_director_signature"' in html
            assert "Preventability determination" in html and "OSHA recordable" in html


# --------------------------------------------------------------------------- access


def test_access_rules(app, client):
    login(client, "emp@example.gov")
    incident_id = create_report(client)
    # The reporter can view, print and edit sections 1 to 4, but not investigate or handle statements.
    assert client.get(f"/incidents/{incident_id}").status_code == 200
    assert client.get(f"/incidents/{incident_id}/print").status_code == 200
    assert client.get(f"/incidents/{incident_id}/edit").status_code == 200
    assert client.get(f"/incidents/{incident_id}/investigation").status_code == 403
    assert client.post(f"/incidents/{incident_id}/investigation", data=SECTION_7).status_code == 403
    assert client.post(f"/incidents/{incident_id}/statements/add", data={"role": "principal", "mode": "device"}).status_code == 403
    assert client.get(f"/incidents/{incident_id}/statements/paper").status_code == 403
    assert client.post(f"/incidents/{incident_id}/signatures", data={"sig_investigator_name": "x"}).status_code == 403
    assert client.post(f"/incidents/{incident_id}/status", data={"status": "closed"}).status_code == 403
    assert client.post(f"/incidents/{incident_id}/actions", data={"description": "x"}).status_code == 403
    resp = client.get(f"/incidents/{incident_id}")
    assert b"Sign on this device" not in resp.data and b"Start sections 7 and 8" not in resp.data

    # Another employee in a different division sees nothing.
    client.get("/logout")
    login(client, "other@example.gov")
    for path in [f"/incidents/{incident_id}", f"/incidents/{incident_id}/print", f"/incidents/{incident_id}/edit", f"/incidents/{incident_id}/investigation", f"/incidents/{incident_id}/statements/blank"]:
        assert client.get(path).status_code == 403, path
    assert client.post(f"/incidents/{incident_id}/statements/add", data={"role": "principal", "mode": "device"}).status_code == 403
    resp = client.get("/incidents/")
    assert b"10232026PI-01" not in resp.data

    # The supervisor of the division investigates; an unknown statement id is a 404.
    client.get("/logout")
    login(client, "super@example.gov")
    assert client.get(f"/incidents/{incident_id}/investigation").status_code == 200
    assert client.get(f"/incidents/{incident_id}/statements/999/sign").status_code == 404
    resp = client.get("/incidents/")
    assert b"10232026PI-01" in resp.data

    # Anonymous users are sent to the sign-in page except for the public statement link.
    client.get("/logout")
    assert client.get(f"/incidents/{incident_id}").status_code == 302
    assert client.get(f"/incidents/{incident_id}/print").status_code == 302
    assert client.get("/incidents/statement/unknown").status_code == 404


def test_no_em_dash_in_incident_files():
    import os

    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    paths = [
        "app/blueprints/incidents.py",
        "app/services/incidents.py",
        "app/static/css/incidents.css",
        "app/templates/email/statement_request.html",
        "app/templates/email/statement_request.txt",
        "tests/test_incidents.py",
    ]
    folder = os.path.join(root, "app", "templates", "incidents")
    paths += [os.path.join("app", "templates", "incidents", name) for name in os.listdir(folder)]
    for rel in paths:
        with open(os.path.join(root, rel), encoding="utf-8") as handle:
            assert chr(0x2014) not in handle.read(), rel
