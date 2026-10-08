"""Incident helpers: numbering and access control."""
from ..models import Incident
from ..timeutil import now


def next_incident_number(when=None):
    when = when or now()
    prefix = f"INC-{when.year}-"
    last = (
        Incident.query.filter(Incident.incident_number.like(prefix + "%"))
        .order_by(Incident.incident_number.desc())
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(last.incident_number.rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            seq = Incident.query.filter(Incident.incident_number.like(prefix + "%")).count() + 1
    return f"{prefix}{seq:04d}"


def can_view(user, incident):
    if user.is_admin:
        return True
    if incident.reported_by_id == user.id:
        return True
    if user.is_supervisor:
        if incident.division_id and incident.division_id == user.division_id:
            return True
        if incident.reported_by and incident.reported_by.supervisor_id == user.id:
            return True
    return False


def can_investigate(user, incident):
    if user.is_admin:
        return True
    return user.is_supervisor and can_view(user, incident)


def visible_incidents_query(user):
    query = Incident.query
    if user.is_admin:
        return query
    if user.is_supervisor:
        report_ids = [u.id for u in user.direct_reports]
        conditions = [Incident.reported_by_id == user.id, Incident.reported_by_id.in_(report_ids)]
        if user.division_id:
            conditions.append(Incident.division_id == user.division_id)
        from sqlalchemy import or_

        return query.filter(or_(*conditions))
    return query.filter(Incident.reported_by_id == user.id)
