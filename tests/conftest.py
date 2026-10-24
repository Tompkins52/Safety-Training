"""Shared fixtures: an app with content loaded and four accounts.

admin@example.gov   safety administrator (no division)
super@example.gov   supervisor, Electric Services
emp@example.gov     employee, Electric Services, reports to the supervisor
other@example.gov   employee, Environmental Services
Password for all accounts: PASSWORD below.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import Division, User  # noqa: E402
from app.services.content_loader import load_all_courses  # noqa: E402
from config import TestConfig  # noqa: E402

PASSWORD = "Testing-12345"


@pytest.fixture
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.drop_all()
        db.create_all()
        load_all_courses()
        divisions = {d.code: d for d in Division.query.all()}
        admin = User(first_name="Sam", last_name="Admin", email="admin@example.gov", role="admin")
        admin.set_password(PASSWORD)
        sup = User(first_name="Dana", last_name="Super", email="super@example.gov", role="supervisor", division=divisions["electric"])
        sup.set_password(PASSWORD)
        emp = User(first_name="James", last_name="Carter", email="emp@example.gov", role="employee", division=divisions["electric"], supervisor=sup)
        emp.set_password(PASSWORD)
        other = User(first_name="Ravi", last_name="Patel", email="other@example.gov", role="employee", division=divisions["environmental"])
        other.set_password(PASSWORD)
        db.session.add_all([admin, sup, emp, other])
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, email):
    return client.post("/login", data={"email": email, "password": PASSWORD}, follow_redirects=True)
