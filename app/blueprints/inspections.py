"""Site inspections (construction and general industry) and annual program audits."""
import json
from datetime import date

from flask import Blueprint, abort, flash, redirect, render_template, request, send_file, url_for
from flask_login import current_user, login_required

from ..extensions import db
from ..models import INSPECTION_KINDS, Division, Inspection
from ..services.inspections import (
    FINDING_STATUSES,
    STATUS_FILTERS,
    apply_checklist,
    build_items,
    can_delete,
    can_edit,
    can_view,
    export_bytes,
    field_labels,
    finding_results,
    findings_with_items,
    group_sections,
    load_templates,
    next_inspection_number,
    summarize,
    template_by_slug,
    visible_inspections_query,
)
from ..timeutil import now
from ..utils import parse_bool, parse_date, parse_int

bp = Blueprint("inspections", __name__)

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _get_inspection(inspection_id, edit=False):
    inspection = db.session.get(Inspection, inspection_id)
    if inspection is None:
        abort(404)
    if edit:
        if not can_edit(current_user, inspection):
            abort(403)
    elif not can_view(current_user, inspection):
        abort(403)
    return inspection


def _text(name):
    value = request.form.get(name)
    return value.strip() if value else None


def _filtered_query():
    query = visible_inspections_query(current_user)
    kind = request.args.get("kind")
    status = request.args.get("status")
    if kind in INSPECTION_KINDS:
        query = query.filter(Inspection.kind == kind)
    if status == "completed":
        query = query.filter(Inspection.completed.is_(True))
    elif status == "in_progress":
        query = query.filter(Inspection.completed.is_(False))
    return query, {"kind": kind, "status": status}


@bp.route("/")
@login_required
def index():
    query, filters = _filtered_query()
    inspections = query.order_by(Inspection.inspection_date.desc(), Inspection.id.desc()).all()
    rows = [(inspection, summarize(inspection)) for inspection in inspections]
    return render_template(
        "inspections/list.html",
        templates=load_templates(),
        rows=rows,
        filters=filters,
        kinds=INSPECTION_KINDS,
        status_filters=STATUS_FILTERS,
    )


@bp.route("/start/<slug>", methods=["POST"])
@login_required
def start(slug):
    template = template_by_slug(slug)
    if template is None:
        abort(404)
    inspection = Inspection(
        number=next_inspection_number(template["kind"]),
        template_slug=template["slug"],
        kind=template["kind"],
        title=template["title"],
        site="",
        inspection_date=date.today(),
        division_id=current_user.division_id,
        inspector_id=current_user.id,
        inspector_name=current_user.full_name,
        items_json=json.dumps(build_items(template)),
        findings_json="[]",
        created_by_id=current_user.id,
    )
    db.session.add(inspection)
    db.session.commit()
    flash(f"{inspection.kind_label} {inspection.number} started. Work through the checklist and save as you go.", "success")
    return redirect(url_for("inspections.checklist", inspection_id=inspection.id))


@bp.route("/<int:inspection_id>", methods=["GET", "POST"])
@login_required
def checklist(inspection_id):
    inspection = _get_inspection(inspection_id, edit=request.method == "POST")
    if request.method == "POST":
        inspection.site = _text("site")
        inspection.inspection_date = parse_date(_text("inspection_date")) or inspection.inspection_date
        division_id = parse_int(_text("division_id"))
        inspection.division_id = division_id if division_id and db.session.get(Division, division_id) else None
        inspection.inspector_name = _text("inspector_name")
        inspection.accompanied_by = _text("accompanied_by")
        inspection.weather = _text("weather")
        inspection.summary = _text("summary")
        if "signature_data" in request.form:
            signature = _text("signature_data")
            inspection.signature_data = signature if signature and signature.startswith("data:image/png;base64,") else None
        apply_checklist(inspection, request.form)
        if parse_bool(request.form.get("completed")):
            if not inspection.completed:
                inspection.completed = True
                inspection.completed_at = now()
        else:
            inspection.completed = False
            inspection.completed_at = None
        db.session.commit()
        totals = summarize(inspection)
        flash(f"Saved. {totals['answered']} of {totals['total']} items answered.", "success")
        if not can_view(current_user, inspection):
            # A supervisor moved it to another division and can no longer open it.
            flash(f"{inspection.number} is now outside your division, so it no longer appears in your list.", "info")
            return redirect(url_for("inspections.index"))
        return redirect(url_for("inspections.checklist", inspection_id=inspection.id))

    divisions = Division.query.order_by(Division.name).all()
    return render_template(
        "inspections/form.html",
        inspection=inspection,
        template=template_by_slug(inspection.template_slug),
        sections=group_sections(inspection.items),
        findings=findings_with_items(inspection),
        totals=summarize(inspection),
        labels=field_labels(inspection.kind),
        result_labels=inspection.result_labels,
        flagged_labels=[inspection.result_labels[r] for r in finding_results(inspection.kind) if r in inspection.result_labels],
        finding_statuses=FINDING_STATUSES,
        divisions=divisions,
        can_edit=can_edit(current_user, inspection),
        can_delete=can_delete(current_user, inspection),
    )


@bp.route("/<int:inspection_id>/print")
@login_required
def print_record(inspection_id):
    inspection = _get_inspection(inspection_id)
    return render_template(
        "inspections/print.html",
        inspection=inspection,
        sections=group_sections(inspection.items),
        findings=findings_with_items(inspection),
        totals=summarize(inspection),
        labels=field_labels(inspection.kind),
        result_labels=inspection.result_labels,
    )


@bp.route("/<int:inspection_id>/delete", methods=["POST"])
@login_required
def delete(inspection_id):
    inspection = db.session.get(Inspection, inspection_id)
    if inspection is None:
        abort(404)
    if not can_delete(current_user, inspection):
        abort(403)
    number = inspection.number
    db.session.delete(inspection)
    db.session.commit()
    flash(f"{number} deleted.", "info")
    return redirect(url_for("inspections.index"))


@bp.route("/export.xlsx")
@login_required
def export_xlsx():
    query, _filters = _filtered_query()
    inspections = query.order_by(Inspection.inspection_date.desc(), Inspection.id.desc()).all()
    return send_file(
        export_bytes(inspections),
        mimetype=XLSX_MIME,
        as_attachment=True,
        download_name=f"inspections-{date.today().isoformat()}.xlsx",
    )
