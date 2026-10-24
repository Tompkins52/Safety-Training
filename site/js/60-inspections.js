// ---------------------------------------------------------------- site inspections and annual audits
function inspections() { return store.get("inspections", []); }
function saveInspections(list) { store.set("inspections", list); }
function findInspection(id) {
  var list = inspections();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
function updateInspection(ins) {
  var list = inspections(), found = false;
  for (var i = 0; i < list.length; i++) if (list[i].id === ins.id) { list[i] = ins; found = true; }
  if (!found) list.push(ins);
  saveInspections(list);
}
function templateBySlug(slug) {
  var t = DATA.inspections || [];
  for (var i = 0; i < t.length; i++) if (t[i].slug === slug) return t[i];
  return null;
}
function inspectionNumber(kind) {
  var year = new Date().getFullYear();
  var prefix = (kind === "audit" ? "AUD-" : "INS-") + year + "-";
  var max = 0;
  inspections().forEach(function (i) { if (i.id.indexOf(prefix) === 0) { var n = parseInt(i.id.slice(prefix.length), 10); if (n > max) max = n; } });
  return prefix + ("000" + (max + 1)).slice(-3);
}
function inspectionItems(t) {
  var out = [];
  t.sections.forEach(function (s, si) { s.items.forEach(function (it, ii) { out.push({ key: si + "." + ii, section: s.heading, text: it.text, ref: it.ref }); }); });
  return out;
}
function inspectionStats(ins, t) {
  var items = inspectionItems(t), counts = { ok: 0, action: 0, na: 0, partial: 0, missing: 0, blank: 0 };
  items.forEach(function (it) { var r = (ins.answers[it.key] || {}).result; if (r && counts[r] !== undefined) counts[r]++; else counts.blank++; });
  var answered = items.length - counts.blank;
  var applicable = answered - counts.na;
  var good = counts.ok;
  return { total: items.length, answered: answered, applicable: applicable, score: applicable ? Math.round(100 * good / applicable) : 0, counts: counts };
}

// ---- list and start
function viewInspections() {
  var templates = DATA.inspections || [];
  var list = inspections().slice().sort(function (a, b) { return (b.date || "") < (a.date || "") ? -1 : 1; });
  var starters = templates.map(function (t) {
    return '<div class="template-card"><div><h3>' + esc(t.title) + '</h3><p class="muted small">' + esc(t.intro) + '</p><p class="small"><strong>Frequency:</strong> ' + esc(t.frequency) + ". " + inspectionItems(t).length + ' items.</p></div><button class="btn btn-primary" type="button" data-action="start-inspection" data-slug="' + esc(t.slug) + '">Start ' + (t.kind === "audit" ? "audit" : "inspection") + "</button></div>";
  }).join("");
  var rows = list.map(function (i) {
    var t = templateBySlug(i.templateSlug);
    var st = t ? inspectionStats(i, t) : { answered: 0, total: 0, score: 0, counts: { action: 0, missing: 0 } };
    var findings = st.counts.action + st.counts.missing + st.counts.partial;
    return "<tr><td><a href=\"#/inspections/" + encodeURIComponent(i.id) + '"><strong>' + esc(i.id) + "</strong></a></td><td>" + esc(i.title) + "</td><td>" + esc(i.site) + "</td><td>" + esc(fmtDate(i.date)) + "</td><td>" + esc(i.inspector) + '</td><td class="num">' + st.answered + " of " + st.total + '</td><td class="num">' + (findings ? badge("warn", findings + " finding" + (findings === 1 ? "" : "s")) : (st.answered ? badge("ok", "No findings") : "")) + "</td><td>" + badge(i.status === "complete" ? "ok" : "warn", i.status === "complete" ? "Complete" : "In progress") + '</td><td class="actions-cell"><a class="btn btn-sm btn-ghost" href="#/inspections/' + encodeURIComponent(i.id) + '/print">Print</a></td></tr>';
  }).join("");
  return '<div class="page-head"><div><h1>Inspections and audits</h1><p class="muted">Site inspection checklists for construction and general industry work, and the annual safety program audit. Mark each item, note findings, and assign corrective actions. Saved on this device; export to hand to the safety administrator.</p></div>' +
    '<div class="actions btn-row"><button class="btn btn-ghost" type="button" data-action="export-inspections">Export JSON</button><label class="btn btn-ghost" for="import-inspections" style="margin:0">Import JSON</label><input type="file" id="import-inspections" data-change="import-inspections" accept="application/json" style="display:none"><button class="btn btn-secondary" type="button" data-action="export-inspections-xlsx">Export to Excel</button></div></div>' +
    '<section class="card"><h2>Start a new one</h2><div class="template-grid">' + starters + "</div></section>" +
    '<section class="card"><h2>Completed and in progress</h2>' + (rows ? '<div class="table-scroll"><table class="table"><thead><tr><th>Number</th><th>Checklist</th><th>Site or facility</th><th>Date</th><th>Inspector</th><th class="num">Answered</th><th class="num">Findings</th><th>Status</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="empty">No inspections or audits on this device yet.</p>') + "</section>";
}
ACTIONS["start-inspection"] = function (el) {
  var t = templateBySlug(el.getAttribute("data-slug"));
  if (!t) return;
  var p = who();
  var ins = { id: inspectionNumber(t.kind), templateSlug: t.slug, title: t.title, kind: t.kind, site: "", division: p.division || "", date: isoDate(today()), inspector: p.name || "", accompaniedBy: "", weather: "", answers: {}, findings: {}, summary: "", status: "in_progress", createdAt: nowISO(), completedAt: null, signature: {} };
  updateInspection(ins);
  go("#/inspections/" + encodeURIComponent(ins.id));
};
ACTIONS["export-inspections"] = function () { download("inspections-" + isoDate(today()) + ".json", JSON.stringify(inspections(), null, 2), "application/json"); };
CHANGES["import-inspections"] = function (input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("not a list");
      var list = inspections(), added = 0, updated = 0;
      imported.forEach(function (i) {
        if (!i || !i.id || !i.templateSlug) return;
        var idx = -1;
        for (var k = 0; k < list.length; k++) if (list[k].id === i.id) idx = k;
        if (idx >= 0) { list[idx] = i; updated++; } else { list.push(i); added++; }
      });
      saveInspections(list);
      pendingMessage = { kind: "success", text: "Imported " + added + " new and " + updated + " updated inspection" + (added + updated === 1 ? "" : "s") + "." };
    } catch (err) {
      pendingMessage = { kind: "danger", text: "That file is not an inspection export from this platform." };
    }
    render();
  };
  reader.readAsText(file);
};
ACTIONS["export-inspections-xlsx"] = function () {
  var rows = [["Number", "Checklist", "Kind", "Site or facility", "Division", "Date", "Inspector", "Section", "Item", "Reference", "Result", "Note", "Corrective action", "Responsible", "Target date"]];
  inspections().forEach(function (i) {
    var t = templateBySlug(i.templateSlug);
    if (!t) return;
    var labels = t.kind === "audit" ? LABELS.auditResults : LABELS.inspectionResults;
    inspectionItems(t).forEach(function (it) {
      var a = i.answers[it.key] || {}, f = i.findings[it.key] || {};
      rows.push([i.id, i.title, t.kind, i.site, divisionName(i.division), i.date, i.inspector, it.section, it.text, it.ref || "", labels[a.result] || "", a.note || "", f.action || "", f.responsible || "", f.targetDate || ""]);
    });
  });
  download("inspections-" + isoDate(today()) + ".xlsx", xlsxBlob([{ name: "Inspection items", rows: rows }]));
};

// ---- checklist page
function viewInspection(ins) {
  var t = templateBySlug(ins.templateSlug);
  if (!t) return notFound("The checklist template for this inspection is no longer available.");
  var isAudit = t.kind === "audit";
  var results = isAudit ? LABELS.auditResults : LABELS.inspectionResults;
  var st = inspectionStats(ins, t);
  var divs = DATA.divisions.map(function (d) { return '<option value="' + d.code + '"' + (ins.division === d.code ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("");
  var sections = t.sections.map(function (s, si) {
    var items = s.items.map(function (it, ii) {
      var key = si + "." + ii, a = ins.answers[key] || {};
      var buttons = Object.keys(results).map(function (r) {
        return '<label class="result-opt result-' + r + '"><input type="radio" name="r_' + key + '" value="' + r + '"' + (a.result === r ? " checked" : "") + "><span>" + esc(results[r]) + "</span></label>";
      }).join("");
      return '<div class="check-item"><div class="check-text">' + esc(it.text) + (it.ref ? ' <span class="ref">' + esc(it.ref) + "</span>" : "") + '</div><div class="check-results">' + buttons + '</div><input type="text" class="check-note" name="n_' + key + '" value="' + field(a.note) + '" placeholder="Note or location"></div>';
    }).join("");
    return '<section class="card checklist-section"><h2>' + esc(s.heading) + "</h2>" + items + "</section>";
  }).join("");
  var findingKeys = inspectionItems(t).filter(function (it) { var r = (ins.answers[it.key] || {}).result; return r === "action" || r === "missing" || r === "partial"; });
  var findings = findingKeys.length ? findingKeys.map(function (it) {
    var f = ins.findings[it.key] || {}, a = ins.answers[it.key] || {};
    return '<div class="finding"><div class="finding-text"><strong>' + esc(it.section) + ":</strong> " + esc(it.text) + (a.note ? '<br><small class="muted">' + esc(a.note) + "</small>" : "") + '</div><div class="form-grid nested"><label>Corrective action<input type="text" name="fa_' + it.key + '" value="' + field(f.action) + '"></label><label>Responsible party<input type="text" name="fr_' + it.key + '" value="' + field(f.responsible) + '"></label><label>Target date<input type="date" name="ft_' + it.key + '" value="' + field(f.targetDate) + '"></label><label>Status<select name="fs_' + it.key + '">' + options(LABELS.actionStatuses, f.status || "open") + "</select></label></div></div>";
  }).join("") : '<p class="empty">No findings so far. Items marked "' + esc(isAudit ? "Partial" : "Needs action") + '" or "' + esc(isAudit ? "Missing" : "Needs action") + '" appear here with a place for the corrective action.</p>';
  return '<div class="page-head"><div><p class="eyebrow">' + esc(isAudit ? "Annual audit" : "Site inspection") + "</p><h1>" + esc(ins.id) + ": " + esc(t.title) + '</h1><p class="muted">' + esc(t.frequency) + '</p></div><div class="actions btn-row">' + badge(ins.status === "complete" ? "ok" : "warn", ins.status === "complete" ? "Complete" : "In progress") + ' <a class="btn btn-secondary" href="#/inspections/' + encodeURIComponent(ins.id) + '/print">Print</a><button class="btn btn-ghost" type="button" data-action="delete-inspection">Delete</button></div></div>' +
    '<div class="notice"><strong>' + st.answered + " of " + st.total + " items answered.</strong> " + (st.applicable ? "Score so far: " + st.score + "% " + (isAudit ? "in place" : "OK") + " of applicable items." : "") + " Save as you go; the page keeps your answers on this device.</div>" +
    '<form data-form="inspection" class="inspection-form">' +
    '<section class="card form-grid"><h2 class="span-2">' + esc(isAudit ? "Audit details" : "Inspection details") + "</h2>" +
    '<label>' + esc(isAudit ? "Department or program audited" : "Site or facility") + ' <span class="req">*</span><input type="text" name="site" value="' + field(ins.site) + '" required></label>' +
    '<label>Division<select name="division"><option value="">Department wide</option>' + divs + "</select></label>" +
    '<label>Date<input type="date" name="date" value="' + field(ins.date) + '"></label>' +
    '<label>' + esc(isAudit ? "Auditor" : "Inspector") + '<input type="text" name="inspector" value="' + field(ins.inspector) + '"></label>' +
    '<label>Accompanied by<input type="text" name="accompaniedBy" value="' + field(ins.accompaniedBy) + '"></label>' +
    (isAudit ? '<label>Period covered<input type="text" name="weather" value="' + field(ins.weather) + '" placeholder="Calendar year 2026"></label>' : '<label>Weather and conditions<input type="text" name="weather" value="' + field(ins.weather) + '"></label>') +
    "</section>" + sections +
    '<section class="card" id="findings"><h2>Findings and corrective actions</h2>' + findings + "</section>" +
    '<section class="card form-grid"><h2 class="span-2">Summary and sign-off</h2><label class="span-2">Summary notes<textarea name="summary" rows="4">' + field(ins.summary) + "</textarea></label>" +
    '<div class="span-2">' + signaturePadHTML("sig", ins.signature, { nameLabel: isAudit ? "Auditor printed name" : "Inspector printed name", title: true }) + "</div>" +
    '<label class="checkbox span-2"><input type="checkbox" name="complete"' + (ins.status === "complete" ? " checked" : "") + "> Mark this " + (isAudit ? "audit" : "inspection") + " complete</label>" +
    '<div class="quiz-bar span-2"><span class="count"><strong id="answered-count">' + st.answered + "</strong> of " + st.total + ' answered</span><button class="btn btn-primary btn-lg" type="submit">Save</button></div></section></form>';
}
FORMS.inspection = function (form) {
  var ins = findInspection(currentRoute().parts[1]);
  if (!ins) return;
  var t = templateBySlug(ins.templateSlug);
  var f = form.elements;
  ins.site = f.site.value.trim(); ins.division = f.division.value; ins.date = f.date.value; ins.inspector = f.inspector.value.trim(); ins.accompaniedBy = f.accompaniedBy.value.trim(); ins.weather = f.weather.value.trim(); ins.summary = f.summary.value.trim();
  ins.answers = {}; ins.findings = ins.findings || {};
  inspectionItems(t).forEach(function (it) {
    var picked = form.querySelector('input[name="r_' + it.key + '"]:checked');
    var note = f["n_" + it.key] ? f["n_" + it.key].value.trim() : "";
    if (picked || note) ins.answers[it.key] = { result: picked ? picked.value : "", note: note };
    if (f["fa_" + it.key]) ins.findings[it.key] = { action: f["fa_" + it.key].value.trim(), responsible: f["fr_" + it.key].value.trim(), targetDate: f["ft_" + it.key].value, status: f["fs_" + it.key].value };
  });
  var prevSig = ins.signature || {};
  var sig = f.sigSignature.value;
  ins.signature = { name: f.sigName.value.trim(), title: f.sigTitle.value.trim(), signature: sig, signedAt: sig ? (prevSig.signature === sig && prevSig.signedAt ? prevSig.signedAt : nowISO()) : null };
  var complete = f.complete.checked;
  ins.status = complete ? "complete" : "in_progress";
  ins.completedAt = complete ? (ins.completedAt || nowISO()) : null;
  updateInspection(ins);
  var st = inspectionStats(ins, t);
  pendingMessage = { kind: "success", text: (complete ? (t.kind === "audit" ? "Audit" : "Inspection") + " " + ins.id + " marked complete. " : "Saved. ") + st.answered + " of " + st.total + " items answered." };
  render();
};
ACTIONS["delete-inspection"] = function () {
  var id = currentRoute().parts[1];
  if (!confirm("Delete " + id + " from this device?")) return;
  saveInspections(inspections().filter(function (i) { return i.id !== id; }));
  go("#/inspections");
};

// ---- printable inspection
function viewInspectionPrint(ins) {
  var t = templateBySlug(ins.templateSlug);
  if (!t) return notFound();
  var isAudit = t.kind === "audit";
  var results = isAudit ? LABELS.auditResults : LABELS.inspectionResults;
  var st = inspectionStats(ins, t);
  var p = who();
  var sections = t.sections.map(function (s, si) {
    return '<h4>' + esc(s.heading) + '</h4><table class="report-table grid"><thead><tr><th style="width:55%">Item</th><th>Ref.</th><th>' + Object.keys(results).map(function (r) { return esc(results[r]); }).join("</th><th>") + "</th><th>Note</th></tr></thead><tbody>" + s.items.map(function (it, ii) {
      var a = ins.answers[si + "." + ii] || {};
      return "<tr><td>" + esc(it.text) + "</td><td>" + esc(it.ref || "") + "</td>" + Object.keys(results).map(function (r) { return '<td style="text-align:center"><span class="check">' + (a.result === r ? "X" : "&nbsp;") + "</span></td>"; }).join("") + "<td>" + esc(a.note || "") + "</td></tr>";
    }).join("") + "</tbody></table>";
  }).join("");
  var findingKeys = inspectionItems(t).filter(function (it) { var r = (ins.answers[it.key] || {}).result; return r === "action" || r === "missing" || r === "partial"; });
  var findings = findingKeys.length ? '<table class="report-table grid"><thead><tr><th>#</th><th>Finding</th><th>Corrective action</th><th>Responsible</th><th>Target date</th><th>Status</th></tr></thead><tbody>' + findingKeys.map(function (it, i) { var f = ins.findings[it.key] || {}, a = ins.answers[it.key] || {}; return "<tr><td>" + (i + 1) + "</td><td>" + esc(it.section) + ": " + esc(it.text) + (a.note ? "<br><small>" + esc(a.note) + "</small>" : "") + "</td><td>" + esc(f.action || "") + "</td><td>" + esc(f.responsible || "") + "</td><td>" + esc(fmtDate(f.targetDate)) + "</td><td>" + esc(LABELS.actionStatuses[f.status] || "Open") + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="small">No findings.</p>';
  return '<div class="no-print page-head"><div><h1>Printable ' + (isAudit ? "audit" : "inspection") + '</h1></div><div class="actions"><button class="btn btn-primary" type="button" data-action="print">Print or save as PDF</button> <a class="btn btn-ghost" href="#/inspections/' + encodeURIComponent(ins.id) + '">Back</a></div></div>' +
    '<div class="report"><header class="report-head"><div><h1>' + esc(p.organization || APP) + "</h1><h2>" + esc(t.title) + '</h2></div><div class="report-id"><div><span>Number</span><strong>' + esc(ins.id) + "</strong></div><div><span>Date</span><strong>" + esc(fmtDate(ins.date)) + "</strong></div><div><span>Status</span><strong>" + (ins.status === "complete" ? "Complete" : "In progress") + "</strong></div></div></header>" +
    '<table class="report-table"><tr><th>' + (isAudit ? "Department or program" : "Site or facility") + "</th><td>" + esc(ins.site) + "</td><th>Division</th><td>" + esc(divisionName(ins.division) || "Department wide") + "</td></tr><tr><th>" + (isAudit ? "Auditor" : "Inspector") + "</th><td>" + esc(ins.inspector) + "</td><th>Accompanied by</th><td>" + esc(ins.accompaniedBy) + "</td></tr><tr><th>" + (isAudit ? "Period covered" : "Weather and conditions") + "</th><td>" + esc(ins.weather) + "</td><th>Result</th><td>" + st.answered + " of " + st.total + " items answered, " + st.score + "% " + (isAudit ? "in place" : "OK") + " of applicable items, " + findingKeys.length + " finding" + (findingKeys.length === 1 ? "" : "s") + "</td></tr></table>" +
    '<section class="report-section"><h3>Findings and corrective actions</h3>' + findings + "</section>" +
    '<section class="report-section"><h3>Checklist</h3>' + sections + "</section>" +
    '<section class="report-section"><h3>Summary and sign-off</h3><p class="pre box">' + esc(ins.summary) + '</p><div class="sig-row"><div>' + signatureImage(ins.signature) + esc(ins.signature && ins.signature.name ? ins.signature.name + (ins.signature.title ? ", " + ins.signature.title : "") : (isAudit ? "Auditor" : "Inspector")) + '</div><div><span class="line-text">' + (ins.signature && ins.signature.signedAt ? esc(fmtDate(ins.signature.signedAt)) : "") + '</span>Date</div><div><span class="line"></span>Safety manager review</div></div></section>' +
    '<footer class="report-foot">' + esc(APP) + ". Printed " + esc(fmtDateTime(new Date())) + ". " + esc(ins.id) + ". " + esc(LICENSE) + ".</footer></div>";
}
