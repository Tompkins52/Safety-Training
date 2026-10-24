from app.extensions import db
from app.models import Incident, Statement
from tests.conftest import login

def test_statement_dropdown(app, client):
    login(client, "super@example.gov")
    resp = client.post("/incidents/new", data={"incident_type": "injury", "occurred_at": "2026-10-23T09:30", "location": "Yard", "description": "Test", "injury_occurred": "yes", "injured_person": "J. Carter"}, follow_redirects=True)
    assert resp.status_code == 200
    with app.app_context():
        iid = Incident.query.first().id
    html = client.get(f"/incidents/{iid}").data.decode()
    assert 'id="statement-role"' in html and 'Eyewitness statement (Section 6)' in html and 'name="mode"' in html
    resp = client.post(f"/incidents/{iid}/statements/add", data={"role": "witness", "mode": "paper"}, follow_redirects=False)
    assert resp.status_code == 302 and "paper" in resp.headers["Location"]
    resp = client.post(f"/incidents/{iid}/statements/add", data={"role": "witness", "mode": "device"}, follow_redirects=False)
    assert resp.status_code == 302 and "/sign" in resp.headers["Location"] or "statement" in resp.headers["Location"]
    with app.app_context():
        assert Statement.query.filter_by(role="witness").count() == 1
