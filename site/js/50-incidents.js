// ---------------------------------------------------------------- incident reports (eight sections)
function incidents() { return store.get("incidents", []).map(normalizeIncident); }
function saveIncidents(list) { store.set("incidents", list); }
function findIncident(id) {
  var list = incidents();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
function updateIncident(inc) {
  var list = incidents(), found = false;
  for (var i = 0; i < list.length; i++) if (list[i].id === inc.id) { list[i] = inc; found = true; }
  if (!found) list.push(inc);
  saveIncidents(list);
}
function statusCls(status) { return status === "closed" ? "ok" : status === "under_investigation" ? "warn" : "danger"; }
function hasInvestigation(inc) { var a = inc.analysis || {}; return !!(a.directCauses || a.rootCause || a.contributingCauses || a.factsAnalysis); }

// Report number: MMDDYYYY + incident type code + sequence for that day, e.g. 10232026PI-01
function reportNumber(type, when, list) {
  var d = when || new Date();
  var prefix = pad(d.getMonth() + 1) + pad(d.getDate()) + d.getFullYear() + (LABELS.typeCodes[type] || "IN") + "-";
  var max = 0;
  (list || incidents()).forEach(function (i) {
    if (i.id && i.id.indexOf(prefix) === 0) { var n = parseInt(i.id.slice(prefix.length), 10); if (n > max) max = n; }
  });
  return prefix + pad(max + 1);
}

function emptyIncident(p) {
  return {
    id: null, type: "", status: "reported", severity: "minor", occurredAt: localDateTimeValue(new Date()), reportedAt: null, closedAt: null,
    location: "", division: p.division || "", reportedBy: p.name || "", workActivity: "", weatherConditions: "", employeesInvolved: "", witnesses: "", immediateActions: "",
    investigator: { name: "", title: "", date: "" },
    property: { propertyDescription: "", propertyOwner: "", estimatedCost: null, damageDescription: "" },
    vehicle: { involved: null, vehicleType: "", makeModel: "", licensePlate: "", cityVehicleNumber: "", driverName: "", seatBeltUsed: null, policeReportNumber: "", drugAlcoholTest: "", otherParty: "", damageEstimate: null, preventability: "undetermined", damageMarks: [], sceneSketch: "" },
    equipment: { involved: null, description: "", sketch: "" },
    injury: { occurred: null, injuredPerson: "", injuredJobTitle: "", injuryTypes: [], injuryOther: "", bodyParts: [], bodyPartOther: "", bodyMarks: [], treatment: "", treatmentProvider: "", daysAway: null, daysRestricted: null, oshaRecordable: null },
    description: "",
    statements: [],
    analysis: { safetyRepName: "", safetyRepTitle: "", date: "", factsAnalysis: "", contributingCauses: "", directCauses: "", rootCause: "", factorType: "", factorDetail: "", references: "", lessonsLearned: "" },
    actions: [],
    signatures: { investigator: {}, manager: {}, safetyManager: {}, assistantDirector: {} }
  };
}

// Upgrades reports saved by earlier versions and fills in any missing parts.
function normalizeIncident(inc) {
  var base = emptyIncident({});
  var out = {};
  Object.keys(base).forEach(function (k) {
    if (inc[k] === undefined || inc[k] === null) out[k] = base[k];
    else if (typeof base[k] === "object" && base[k] !== null && !Array.isArray(base[k])) out[k] = Object.assign({}, base[k], inc[k]);
    else out[k] = inc[k];
  });
  if (inc.investigation && !hasInvestigation(out)) {
    var v = inc.investigation;
    out.analysis = Object.assign({}, out.analysis, { safetyRepName: v.investigator || "", date: v.date || "", directCauses: v.directCause || "", rootCause: v.rootCause || "", factorType: v.factorType || "", factorDetail: v.factorDetail || "", lessonsLearned: v.lessonsLearned || "" });
  }
  if (inc.equipmentInvolved && !out.equipment.description) { out.equipment.description = inc.equipmentInvolved; out.equipment.involved = true; }
  if (inc.vehicle && inc.vehicle.vehicleUnit && !out.vehicle.cityVehicleNumber) out.vehicle.cityVehicleNumber = inc.vehicle.vehicleUnit;
  if (inc.vehicle && inc.vehicle.vehicleDamageEstimate !== undefined && out.vehicle.damageEstimate === null) out.vehicle.damageEstimate = inc.vehicle.vehicleDamageEstimate;
  if (out.type === "vehicle" && out.vehicle.involved === null) out.vehicle.involved = true;
  if (out.type === "injury" && out.injury.occurred === null) out.injury.occurred = true;
  out.actions = (out.actions || []).map(function (a) { return Object.assign({ verificationDate: "", notes: "" }, a); });
  return out;
}

// ---- list
function viewIncidents(filters) {
  var list = incidents().slice().sort(function (a, b) { return b.occurredAt < a.occurredAt ? -1 : 1; });
  if (filters.type) list = list.filter(function (i) { return i.type === filters.type; });
  if (filters.status) list = list.filter(function (i) { return i.status === filters.status; });
  var rows = list.map(function (i) {
    var signed = i.statements.filter(function (s) { return s.status === "signed"; }).length;
    return "<tr><td><a href=\"#/incidents/" + encodeURIComponent(i.id) + '"><strong>' + esc(i.id) + "</strong></a></td><td>" + esc(LABELS.types[i.type]) + "</td><td>" + esc(fmtDateTime(i.occurredAt)) + "</td><td>" + esc(i.location) + "</td><td>" + esc(divisionName(i.division)) + "</td><td>" + signed + " of " + i.statements.length + "</td><td>" + badge(statusCls(i.status), LABELS.statuses[i.status]) + '</td><td class="actions-cell"><a class="btn btn-sm btn-ghost" href="#/incidents/' + encodeURIComponent(i.id) + '/print">Print</a></td></tr>';
  }).join("");
  return '<div class="page-head"><div><h1>Incident reports</h1><p class="muted">Personal injury, property damage and vehicle incidents, including near misses. Each report has eight sections: incident information, vehicle and equipment, personal injury, description, principal statement, eyewitness statements, facts and analysis, and signatures. Reports are saved on this device; export them to hand to the safety administrator.</p></div>' +
    '<div class="actions btn-row"><button class="btn btn-ghost" type="button" data-action="export-incidents">Export JSON</button><label class="btn btn-ghost" for="import-incidents" style="margin:0">Import JSON</label><input type="file" id="import-incidents" data-change="import-incidents" accept="application/json" style="display:none"><a class="btn btn-primary" href="#/incidents/new">New incident report</a></div></div>' +
    '<form data-form="incident-filter" class="filter-bar card"><label>Type<select name="type">' + options(LABELS.types, filters.type, "All") + "</select></label><label>Status<select name=\"status\">" + options(LABELS.statuses, filters.status, "All") + '</select></label><button class="btn btn-secondary" type="submit">Filter</button><a class="btn btn-ghost" href="#/incidents">Clear</a></form>' +
    '<section class="card">' + (rows ? '<div class="table-scroll"><table class="table"><thead><tr><th>Report no.</th><th>Type</th><th>Occurred</th><th>Location</th><th>Division</th><th>Statements signed</th><th>Status</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="empty">No incident reports on this device yet. Start one with New incident report.</p>') + "</section>";
}
FORMS["incident-filter"] = function (form) {
  var fe = form.elements, qs = [];
  if (fe.type.value) qs.push("type=" + fe.type.value);
  if (fe.status.value) qs.push("status=" + fe.status.value);
  go("#/incidents" + (qs.length ? "?" + qs.join("&") : ""));
};
ACTIONS["export-incidents"] = function () { download("incident-reports-" + isoDate(today()) + ".json", JSON.stringify(incidents(), null, 2), "application/json"); };
CHANGES["import-incidents"] = function (input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("not a list");
      var list = incidents(), added = 0, updated = 0;
      imported.forEach(function (i) {
        if (!i || !i.id || !LABELS.types[i.type]) return;
        var idx = -1;
        for (var k = 0; k < list.length; k++) if (list[k].id === i.id) idx = k;
        if (idx >= 0) { list[idx] = normalizeIncident(i); updated++; } else { list.push(normalizeIncident(i)); added++; }
      });
      saveIncidents(list);
      pendingMessage = { kind: "success", text: "Imported " + added + " new and " + updated + " updated report" + (added + updated === 1 ? "" : "s") + "." };
    } catch (err) {
      pendingMessage = { kind: "danger", text: "That file is not an incident export from this platform." };
    }
    render();
  };
  reader.readAsText(file);
};

// ---- report form: sections 1 to 4
function sectionHead(n, title, who) {
  return '<div class="span-2 section-head"><h2><span class="section-no">Section ' + n + "</span>" + esc(title) + "</h2>" + (who ? '<p class="muted small">' + esc(who) + "</p>" : "") + "</div>";
}
function viewIncidentForm(inc, editing, errors) {
  var divs = DATA.divisions.map(function (d) { return '<option value="' + d.code + '"' + (inc.division === d.code ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("");
  var v = inc.vehicle, eq = inc.equipment, inj = inc.injury, pr = inc.property, inv = inc.investigator;
  var vehicleTypes = '<option value="">Select</option>' + LABELS.vehicleTypes.map(function (t) { return '<option value="' + esc(t) + '"' + (v.vehicleType === t ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("");
  return '<div class="page-head"><div><h1>' + (editing ? "Edit report " + esc(inc.id) : "New incident report") + '</h1><p class="muted">Sections 1 to 4 are completed by the person conducting the investigation. Statements, analysis and signatures are added from the report page afterwards. Facts only; causes belong in Section 7.</p></div></div>' +
    (errors && errors.length ? '<div class="flashes">' + errors.map(function (e) { return '<div class="flash flash-danger">' + esc(e) + "</div>"; }).join("") + "</div>" : "") +
    '<form data-form="incident" data-change="incident-form" class="card form-grid incident-form">' +
    sectionHead(1, "Incident information", "To be completed by the person conducting the investigation.") +
    '<label>Incident type <span class="req">*</span><select name="type" required>' + options(LABELS.types, inc.type, "Select a type") + '</select><div class="inline-note">Sets the report number: date, type code (PI, PD or VI) and the number of that type for the day.</div></label>' +
    '<label>Date and time of incident <span class="req">*</span><input type="datetime-local" name="occurredAt" value="' + field(inc.occurredAt) + '" required></label>' +
    '<label>Location <span class="req">*</span><input type="text" name="location" value="' + field(inc.location) + '" placeholder="Street address, intersection, facility or job site" required></label>' +
    '<label>Division<select name="division"><option value="">Not division specific</option>' + divs + "</select></label>" +
    '<label>Severity<select name="severity">' + options(LABELS.severities, inc.severity) + "</select></label>" +
    '<label>Reported by<input type="text" name="reportedBy" value="' + field(inc.reportedBy) + '"></label>' +
    '<label>Work activity at the time<input type="text" name="workActivity" value="' + field(inc.workActivity) + '" placeholder="Replacing a service drop, mowing a right of way"></label>' +
    '<label>Weather and conditions<input type="text" name="weatherConditions" value="' + field(inc.weatherConditions) + '" placeholder="Rain, dark, icy surface"></label>' +
    '<label>Employees involved<textarea name="employeesInvolved" rows="2" placeholder="Names and job titles">' + field(inc.employeesInvolved) + "</textarea></label>" +
    '<label>Witnesses<textarea name="witnesses" rows="2" placeholder="Names and contact information">' + field(inc.witnesses) + "</textarea></label>" +
    '<label class="span-2">Immediate actions taken<textarea name="immediateActions" rows="2" placeholder="First aid given, scene secured, equipment tagged out, supervisor notified, 911 called">' + field(inc.immediateActions) + "</textarea></label>" +
    '<label>Property damaged, if any<input type="text" name="propertyDescription" value="' + field(pr.propertyDescription) + '" placeholder="Mailbox, water main, transformer, fence"></label>' +
    '<label>Property owner<select name="propertyOwner">' + options(LABELS.owners, pr.propertyOwner, "Select") + "</select></label>" +
    '<label>Estimated property cost ($)<input type="number" step="0.01" min="0" name="estimatedCost" value="' + field(pr.estimatedCost) + '"></label>' +
    '<label>Description of property damage<input type="text" name="damageDescription" value="' + field(pr.damageDescription) + '"></label>' +
    '<label>Investigator name<input type="text" name="investigatorName" value="' + field(inv.name || who().name) + '"></label>' +
    '<label>Investigator title<input type="text" name="investigatorTitle" value="' + field(inv.title || who().jobTitle) + '"></label>' +
    '<label>Investigation started<input type="date" name="investigationDate" value="' + field(inv.date || isoDate(today())) + '"></label>' +

    sectionHead(2, "Vehicle and equipment information", "To be completed by the person conducting the investigation.") +
    '<label>Was there a vehicle involved in the incident?' + yesNoSelect("vehicleInvolved", v.involved, "Select") + "</label><div></div>" +
    '<div class="span-2 cond-group" data-cond="vehicle"' + (v.involved === true ? "" : " hidden") + '><div class="form-grid nested">' +
    '<label>Type of vehicle<select name="vehicleType">' + vehicleTypes + "</select></label>" +
    '<label>Vehicle make and model<input type="text" name="makeModel" value="' + field(v.makeModel) + '"></label>' +
    '<label>License plate number<input type="text" name="licensePlate" value="' + field(v.licensePlate) + '"></label>' +
    '<label>City vehicle number<input type="text" name="cityVehicleNumber" value="' + field(v.cityVehicleNumber) + '"></label>' +
    '<label>Driver<input type="text" name="driverName" value="' + field(v.driverName) + '"></label>' +
    '<label>Seat belt in use?' + yesNoSelect("seatBeltUsed", v.seatBeltUsed, "Unknown") + "</label>" +
    '<label>Police report number<input type="text" name="policeReportNumber" value="' + field(v.policeReportNumber) + '"></label>' +
    '<label>Post-incident drug and alcohol test<select name="drugAlcoholTest">' + options(LABELS.drugTests, v.drugAlcoholTest, "Select") + "</select></label>" +
    '<label>Estimated vehicle damage ($)<input type="number" step="0.01" min="0" name="damageEstimate" value="' + field(v.damageEstimate) + '"></label>' +
    '<label>Other party (name, vehicle, insurance, contact)<textarea name="otherParty" rows="2">' + field(v.otherParty) + "</textarea></label>" +
    '<div class="span-2"><label>Damage location</label><p class="inline-note">On the diagram, circle each area of damage.</p>' + vehicleDiagramSVG(v.damageMarks, true) + '<input type="hidden" name="damageMarks" value="' + esc(JSON.stringify(v.damageMarks || [])) + '"></div>' +
    '<div class="span-2"><label>Scene sketch</label><p class="inline-note">Sketch the positions of the vehicles and anything else that matters. The intersection is a starting point; draw over it.</p>' + sketchPadHTML("sceneSketch", v.sceneSketch, "intersection", "Draw vehicle positions, direction of travel, signs and points of impact.") + "</div>" +
    "</div></div>" +
    '<label>Was there a machine, equipment or trailer involved in the incident?' + yesNoSelect("equipmentInvolved", eq.involved, "Select") + "</label><div></div>" +
    '<div class="span-2 cond-group" data-cond="equipment"' + (eq.involved === true ? "" : " hidden") + '><div class="form-grid nested">' +
    '<label class="span-2">Description of the equipment, machine or trailer<textarea name="equipmentDescription" rows="3" placeholder="Make, model, unit number, attachment, what it was doing">' + field(eq.description) + "</textarea></label>" +
    '<div class="span-2"><label>Sketch (optional)</label>' + sketchPadHTML("equipmentSketch", eq.sketch, "", "Sketch the equipment or the layout if it helps explain what happened.") + "</div>" +
    "</div></div>" +

    sectionHead(3, "Personal injury details", "To be completed by the person conducting the investigation, if a personal injury occurred.") +
    '<label>Did a personal injury or illness occur?' + yesNoSelect("injuryOccurred", inj.occurred, "Select") + "</label><div></div>" +
    '<div class="span-2 cond-group" data-cond="injury"' + (inj.occurred === true ? "" : " hidden") + '><div class="form-grid nested">' +
    '<label>Injured person<input type="text" name="injuredPerson" value="' + field(inj.injuredPerson) + '"></label>' +
    '<label>Job title<input type="text" name="injuredJobTitle" value="' + field(inj.injuredJobTitle) + '"></label>' +
    '<div class="span-2"><label>Mark on diagram</label><p class="inline-note">Tap each injured area.</p>' + bodyDiagramSVG(inj.bodyMarks, true) + '<input type="hidden" name="bodyMarks" value="' + esc(JSON.stringify(inj.bodyMarks || [])) + '"></div>' +
    '<div class="span-2"><label>Type of injury</label>' + checkboxList("injuryTypes", LABELS.injuryTypes, inj.injuryTypes, inj.injuryOther) + "</div>" +
    '<div class="span-2"><label>Body part(s) affected</label>' + checkboxList("bodyParts", LABELS.bodyParts, inj.bodyParts, inj.bodyPartOther) + "</div>" +
    '<label>Treatment<select name="treatment">' + options(LABELS.treatments, inj.treatment, "Select") + "</select></label>" +
    '<label>Treatment provider<input type="text" name="treatmentProvider" value="' + field(inj.treatmentProvider) + '" placeholder="Clinic or hospital name"></label>' +
    '<label>Days away from work<input type="number" min="0" name="daysAway" value="' + field(inj.daysAway) + '"></label>' +
    '<label>Days of restricted duty<input type="number" min="0" name="daysRestricted" value="' + field(inj.daysRestricted) + '"></label>' +
    '<label>OSHA recordable?' + yesNoSelect("oshaRecordable", inj.oshaRecordable, "Not yet determined") + "</label>" +
    "</div></div>" +

    sectionHead(4, "Incident description", "To be completed by the person conducting the investigation.") +
    '<label class="span-2">What happened <span class="req">*</span><textarea name="description" rows="7" required placeholder="Describe the sequence of events in order: who, what, when, where and how. Facts only; causes are recorded in Section 7.">' + field(inc.description) + "</textarea></label>" +
    '<div class="form-actions span-2"><button class="btn btn-primary btn-lg" type="submit">' + (editing ? "Save report" : "Create report") + '</button><a class="btn btn-ghost" href="' + (editing ? "#/incidents/" + encodeURIComponent(inc.id) : "#/incidents") + '">Cancel</a></div></form>';
}
CHANGES["incident-form"] = function (form, e) {
  var t = e.target;
  if (!t || !t.name) return;
  var map = { vehicleInvolved: "vehicle", equipmentInvolved: "equipment", injuryOccurred: "injury" };
  if (map[t.name]) {
    var group = form.querySelector('.cond-group[data-cond="' + map[t.name] + '"]');
    if (group) { group.hidden = t.value !== "yes"; if (!group.hidden) bindWidgets(group); }
  }
};
function readIncidentForm(form, inc) {
  var f = function (name) { var el = form.elements[name]; if (!el || el.length === undefined && el.disabled) return ""; return el.value !== undefined ? String(el.value || "").trim() : ""; };
  var num = function (name) { var s = f(name); return s === "" ? null : Number(s); };
  var bool = function (name) { var s = f(name); return s === "yes" ? true : s === "no" ? false : null; };
  var checks = function (name) { var out = []; var nodes = form.querySelectorAll('input[type=checkbox][name="' + name + '"]:checked'); for (var i = 0; i < nodes.length; i++) out.push(nodes[i].value); return out; };
  var marks = function (name) { try { return JSON.parse(f(name) || "[]"); } catch (e) { return []; } };
  var errors = [];
  inc.type = f("type"); if (!LABELS.types[inc.type]) errors.push("Choose an incident type.");
  inc.occurredAt = f("occurredAt"); if (!parseDate(inc.occurredAt)) errors.push("Enter the date and time the incident occurred.");
  inc.location = f("location"); if (!inc.location) errors.push("Enter the location.");
  inc.description = f("description"); if (!inc.description) errors.push("Describe what happened in Section 4.");
  inc.division = f("division"); inc.severity = LABELS.severities[f("severity")] ? f("severity") : "minor";
  inc.reportedBy = f("reportedBy") || who().name || "";
  inc.workActivity = f("workActivity"); inc.weatherConditions = f("weatherConditions");
  inc.employeesInvolved = f("employeesInvolved"); inc.witnesses = f("witnesses"); inc.immediateActions = f("immediateActions");
  inc.property = { propertyDescription: f("propertyDescription"), propertyOwner: f("propertyOwner"), estimatedCost: num("estimatedCost"), damageDescription: f("damageDescription") };
  inc.investigator = { name: f("investigatorName"), title: f("investigatorTitle"), date: f("investigationDate") };
  var vInv = bool("vehicleInvolved");
  inc.vehicle = Object.assign({}, inc.vehicle, { involved: vInv });
  if (vInv) {
    Object.assign(inc.vehicle, { vehicleType: f("vehicleType"), makeModel: f("makeModel"), licensePlate: f("licensePlate"), cityVehicleNumber: f("cityVehicleNumber"), driverName: f("driverName"), seatBeltUsed: bool("seatBeltUsed"), policeReportNumber: f("policeReportNumber"), drugAlcoholTest: f("drugAlcoholTest"), otherParty: f("otherParty"), damageEstimate: num("damageEstimate"), damageMarks: marks("damageMarks"), sceneSketch: f("sceneSketch") });
  }
  var eInv = bool("equipmentInvolved");
  inc.equipment = { involved: eInv, description: eInv ? f("equipmentDescription") : "", sketch: eInv ? f("equipmentSketch") : "" };
  var iOcc = bool("injuryOccurred");
  inc.injury = Object.assign({}, inc.injury, { occurred: iOcc });
  if (iOcc) {
    Object.assign(inc.injury, { injuredPerson: f("injuredPerson"), injuredJobTitle: f("injuredJobTitle"), injuryTypes: checks("injuryTypes"), injuryOther: f("injuryTypesOther"), bodyParts: checks("bodyParts"), bodyPartOther: f("bodyPartsOther"), bodyMarks: marks("bodyMarks"), treatment: f("treatment"), treatmentProvider: f("treatmentProvider"), daysAway: num("daysAway"), daysRestricted: num("daysRestricted"), oshaRecordable: bool("oshaRecordable") });
    if (!inc.injury.injuredPerson) errors.push("Enter the name of the injured person in Section 3.");
  }
  if (inc.type === "injury" && iOcc === null) errors.push("Section 3: answer whether a personal injury occurred.");
  if (inc.type === "vehicle" && vInv === null) errors.push("Section 2: answer whether a vehicle was involved.");
  return errors;
}
FORMS.incident = function (form) {
  var parts = currentRoute().parts;
  var editing = parts[1] !== "new";
  var inc = editing ? findIncident(parts[1]) : emptyIncident(who());
  if (!inc) return;
  var errors = readIncidentForm(form, inc);
  if (errors.length) { app.innerHTML = viewIncidentForm(inc, editing, errors); bindWidgets(app); window.scrollTo(0, 0); return; }
  if (!editing) { inc.id = reportNumber(inc.type, new Date()); inc.reportedAt = nowISO(); inc.status = "reported"; }
  updateIncident(inc);
  pendingMessage = { kind: "success", text: (editing ? "Report " + inc.id + " saved." : "Report " + inc.id + " created. Next: add the principal and eyewitness statements, then the analysis and signatures.") };
  go("#/incidents/" + encodeURIComponent(inc.id));
};

// ---- report page (summary of all eight sections)
function kv(rows) {
  return '<dl class="dl">' + rows.filter(function (r) { return r[1] !== "" && r[1] !== null && r[1] !== undefined; }).map(function (r) { return "<dt>" + esc(r[0]) + '</dt><dd class="pre">' + esc(r[1]) + "</dd>"; }).join("") + "</dl>";
}
function ynText(v, blank) { return v === true ? "Yes" : v === false ? "No" : (blank || "Not answered"); }
function statementRow(inc, s, editable) {
  var signed = s.status === "signed";
  var meta = [s.printedName, s.department, s.title].filter(Boolean).map(esc).join(", ");
  var when = signed ? "Signed " + (s.signedVia === "paper" ? fmtDate(s.signedAt) + " on paper" : fmtDateTime(s.signedAt) + " on this device") : "Not yet signed";
  var actions = "";
  if (editable) {
    actions = (signed ? "" : '<a class="btn btn-sm btn-primary" href="#/statement/' + encodeURIComponent(inc.id) + "/" + s.id + '">Sign on this device</a> <a class="btn btn-sm btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + "/statements/" + s.id + '/paper">Enter from paper</a> ') +
      '<a class="btn btn-sm btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + "/statements/" + s.id + '/form">Print blank form</a> ' +
      '<button class="btn btn-sm btn-ghost" type="button" data-action="remove-statement" data-id="' + s.id + '">Remove</button>';
  }
  return '<div class="statement-row"><div><strong>' + esc(s.printedName || "(name not entered)") + "</strong>" + (meta ? '<br><small class="muted">' + meta + "</small>" : "") + "</div><div>" + badge(signed ? "ok" : "warn", when) + '</div><div class="btn-row">' + actions + "</div></div>";
}
function viewIncidentDetail(inc) {
  var a = inc.analysis, v = inc.vehicle, eq = inc.equipment, inj = inc.injury, p = who();
  var principals = inc.statements.filter(function (s) { return s.role === "principal"; });
  var witnesses = inc.statements.filter(function (s) { return s.role === "witness"; });
  var sigs = Object.keys(LABELS.signatureRoles).map(function (k) { var s = inc.signatures[k] || {}; return "<tr><td>" + esc(LABELS.signatureRoles[k]) + "</td><td>" + esc(s.name || "") + (s.title ? ", " + esc(s.title) : "") + "</td><td>" + (s.signature ? badge("ok", "Signed " + fmtDate(s.signedAt)) : badge("neutral", "Not signed")) + "</td></tr>"; }).join("");
  return '<div class="page-head"><div><p class="eyebrow">' + esc(LABELS.types[inc.type]) + "</p><h1>Report " + esc(inc.id) + '</h1><p class="muted">' + esc(fmtDateTime(inc.occurredAt)) + ", " + esc(inc.location) + (inc.division ? ", " + esc(divisionName(inc.division)) : "") + "</p></div>" +
    '<div class="actions btn-row">' + badge(statusCls(inc.status), LABELS.statuses[inc.status]) + ' <a class="btn btn-secondary" href="#/incidents/' + encodeURIComponent(inc.id) + '/print">Print report</a><a class="btn btn-ghost" href="' + esc(incidentMailto(inc, p)) + '">Email summary</a>' +
    (inc.status !== "closed" ? '<a class="btn btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '/edit">Edit sections 1 to 4</a>' : "") +
    '<a class="btn btn-primary" href="#/incidents/' + encodeURIComponent(inc.id) + '/investigation">' + (hasInvestigation(inc) ? "Sections 7 and 8" : "Start sections 7 and 8") + "</a></div></div>" +
    '<div class="grid-2"><section class="card"><h2><span class="section-no">1</span>Incident information</h2>' + kv([["Reported by", (inc.reportedBy || "(name not entered)") + (inc.reportedAt ? " on " + fmtDateTime(inc.reportedAt) : "")], ["Severity", LABELS.severities[inc.severity]], ["Work activity", inc.workActivity], ["Conditions", inc.weatherConditions], ["Employees involved", inc.employeesInvolved], ["Witnesses", inc.witnesses], ["Immediate actions", inc.immediateActions], ["Property damaged", inc.property.propertyDescription ? inc.property.propertyDescription + (inc.property.propertyOwner ? " (" + LABELS.owners[inc.property.propertyOwner] + ")" : "") + (inc.property.estimatedCost !== null ? ", " + money(inc.property.estimatedCost) : "") : ""], ["Investigator", ([inc.investigator.name, inc.investigator.title].filter(Boolean).join(", ") || "(name not entered)") + (inc.investigator.date ? ", started " + fmtDate(inc.investigator.date) : "")]]) + "</section>" +
    '<section class="card"><h2><span class="section-no">2</span>Vehicle and equipment</h2>' + kv([["Vehicle involved", ynText(v.involved)], ["Type", v.involved ? v.vehicleType : ""], ["Make and model", v.involved ? v.makeModel : ""], ["Plate and city vehicle no.", v.involved ? [v.licensePlate, v.cityVehicleNumber].filter(Boolean).join(" / ") : ""], ["Driver", v.involved ? v.driverName + (v.seatBeltUsed !== null ? ", seat belt " + (v.seatBeltUsed ? "yes" : "no") : "") : ""], ["Police report", v.involved ? v.policeReportNumber : ""], ["Drug and alcohol test", v.involved ? (LABELS.drugTests[v.drugAlcoholTest] || "") : ""], ["Damage estimate", v.involved ? money(v.damageEstimate) : ""], ["Preventability", v.involved ? LABELS.preventability[v.preventability || "undetermined"] : ""], ["Other party", v.involved ? v.otherParty : ""], ["Equipment involved", ynText(eq.involved)], ["Equipment", eq.involved ? eq.description : ""]]) +
    (v.involved && (v.damageMarks || []).length ? '<div class="diagram-small">' + vehicleDiagramSVG(v.damageMarks, false) + "</div>" : "") +
    (v.involved && v.sceneSketch ? '<img class="sketch-img" src="' + esc(v.sceneSketch) + '" alt="Scene sketch">' : "") +
    (eq.involved && eq.sketch ? '<img class="sketch-img" src="' + esc(eq.sketch) + '" alt="Equipment sketch">' : "") + "</section></div>" +
    '<div class="grid-2"><section class="card"><h2><span class="section-no">3</span>Personal injury</h2>' + kv([["Injury occurred", ynText(inj.occurred)], ["Injured person", inj.occurred ? inj.injuredPerson + (inj.injuredJobTitle ? ", " + inj.injuredJobTitle : "") : ""], ["Type of injury", inj.occurred ? inj.injuryTypes.concat(inj.injuryOther ? ["Other: " + inj.injuryOther] : []).filter(function (t) { return t !== "Other"; }).join(", ") : ""], ["Body parts", inj.occurred ? inj.bodyParts.concat(inj.bodyPartOther ? ["Other: " + inj.bodyPartOther] : []).filter(function (t) { return t !== "Other"; }).join(", ") : ""], ["Treatment", inj.occurred ? (LABELS.treatments[inj.treatment] || "") + (inj.treatmentProvider ? " (" + inj.treatmentProvider + ")" : "") : ""], ["Days away / restricted", inj.occurred ? (inj.daysAway === null ? 0 : inj.daysAway) + " / " + (inj.daysRestricted === null ? 0 : inj.daysRestricted) : ""], ["OSHA recordable", inj.occurred ? ynText(inj.oshaRecordable, "Not yet determined") : ""]]) +
    (inj.occurred && (inj.bodyMarks || []).length ? '<div class="diagram-small">' + bodyDiagramSVG(inj.bodyMarks, false) + "</div>" : "") + "</section>" +
    '<section class="card"><h2><span class="section-no">4</span>Incident description</h2><p class="pre">' + esc(inc.description) + "</p></section></div>" +
    '<section class="card statements-card"><div class="card-head"><h2>Statements</h2></div><p class="muted small">Each principal party and each eyewitness gives their own account and signs it without seeing the rest of the report. Choose the type of statement, then add as many as you need.</p>' +
    '<form class="statement-add" data-form="add-statement"><label>Type of statement<select name="role"><option value="principal">Principal statement (Section 5)</option><option value="witness">Eyewitness statement (Section 6)</option></select></label>' +
    '<label>How it will be given<select name="mode"><option value="device">Sign on this device</option><option value="paper">Received on paper</option><option value="form">Print a blank form</option></select></label>' +
    '<button class="btn btn-sm btn-secondary" type="submit">Add statement</button></form>' +
    '<h3><span class="section-no">5</span>Principal statement' + (principals.length ? ' <span class="tag">' + principals.length + "</span>" : "") + "</h3>" +
    (principals.length ? principals.map(function (s) { return statementRow(inc, s, true); }).join("") : '<p class="empty">No principal statement yet. Add one page per party.</p>') +
    '<h3 class="mt"><span class="section-no">6</span>Eyewitness statements' + (witnesses.length ? ' <span class="tag">' + witnesses.length + "</span>" : "") + "</h3>" +
    (witnesses.length ? witnesses.map(function (s) { return statementRow(inc, s, true); }).join("") : '<p class="empty">No eyewitness statements yet.</p>') + "</section>" +
    '<section class="card"><div class="card-head"><h2><span class="section-no">7</span>Incident facts and analysis</h2><a class="btn btn-sm btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '/investigation">Edit</a></div>' +
    (hasInvestigation(inc) ? kv([["Safety representative", [a.safetyRepName, a.safetyRepTitle].filter(Boolean).join(", ") + (a.date ? ", " + fmtDate(a.date) : "")], ["Analysis of the facts", a.factsAnalysis], ["Contributing causes", a.contributingCauses], ["Direct causes", a.directCauses], ["Root cause", a.rootCause], ["Contributing factor type", a.factorType ? short(LABELS.factors[a.factorType]) + (a.factorDetail ? ": " + a.factorDetail : "") : ""], ["Supporting references", a.references], ["Lessons learned", a.lessonsLearned]]) : '<p class="empty">Not recorded yet. The safety representative records the analysis, causes, corrective actions and references.</p>') +
    "<h3>Recommended corrective actions</h3>" + (inc.actions.length ? '<div class="table-scroll"><table class="table compact"><thead><tr><th>Action</th><th>Responsible party</th><th>Target date</th><th>Verification date</th><th>Status</th></tr></thead><tbody>' + inc.actions.map(function (x) { return "<tr><td>" + esc(x.description) + (x.notes ? '<br><small class="muted">' + esc(x.notes) + "</small>" : "") + "</td><td>" + esc(x.responsible) + "</td><td>" + esc(fmtDate(x.targetDate)) + "</td><td>" + esc(fmtDate(x.verificationDate)) + "</td><td>" + badge(x.status === "verified" || x.status === "completed" ? "ok" : x.status === "in_progress" ? "warn" : "neutral", LABELS.actionStatuses[x.status] || x.status) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="empty">No corrective actions recorded.</p>') + "</section>" +
    '<section class="card"><div class="card-head"><h2><span class="section-no">8</span>Signatures</h2><a class="btn btn-sm btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '/investigation#signatures">Sign</a></div><table class="table compact"><thead><tr><th>Role</th><th>Name</th><th>Status</th></tr></thead><tbody>' + sigs + "</tbody></table>" +
    (inc.closedAt ? '<p class="small muted">Closed ' + esc(fmtDateTime(inc.closedAt)) + ".</p>" : "") + "</section>";
}
function incidentMailto(inc, p) {
  var a = inc.analysis;
  var lines = ["Incident report " + inc.id + " (" + LABELS.types[inc.type] + ")", "Status: " + LABELS.statuses[inc.status], "Occurred: " + fmtDateTime(inc.occurredAt), "Location: " + inc.location, "Division: " + divisionName(inc.division), "Severity: " + LABELS.severities[inc.severity], "Reported by: " + inc.reportedBy, "", "What happened:", inc.description, ""];
  if (hasInvestigation(inc)) lines.push("Direct causes: " + (a.directCauses || ""), "Contributing causes: " + (a.contributingCauses || ""), "Root cause: " + (a.rootCause || ""), "");
  if (inc.actions.length) { lines.push("Corrective actions:"); inc.actions.forEach(function (x) { lines.push("- " + x.description + (x.responsible ? " (" + x.responsible + ")" : "") + (x.targetDate ? ", target " + fmtDate(x.targetDate) : "") + ", " + (LABELS.actionStatuses[x.status] || x.status)); }); lines.push(""); }
  lines.push("Statements signed: " + inc.statements.filter(function (s) { return s.status === "signed"; }).length + " of " + inc.statements.length, "", "Sent from " + APP + " (browser edition). Print the full eight-section report from the Incidents page.");
  return "mailto:" + encodeURIComponent(p.supervisorEmail || "") + "?subject=" + encodeURIComponent("Incident report " + inc.id + ": " + LABELS.types[inc.type]) + "&body=" + encodeURIComponent(lines.join("\n"));
}
function addStatement(inc, role) {
  var s = { id: uid(), role: role === "witness" ? "witness" : "principal", printedName: "", department: "", title: "", statement: "", signature: "", signedAt: null, signedVia: "", status: "pending", createdAt: nowISO() };
  inc.statements.push(s);
  updateIncident(inc);
  return s;
}
FORMS["add-statement"] = function (form) {
  var inc = findIncident(currentRoute().parts[1]);
  if (!inc) return;
  var s = addStatement(inc, form.elements.role.value);
  var mode = form.elements.mode.value;
  if (mode === "paper") go("#/incidents/" + encodeURIComponent(inc.id) + "/statements/" + s.id + "/paper");
  else if (mode === "form") go("#/incidents/" + encodeURIComponent(inc.id) + "/statements/" + s.id + "/form");
  else go("#/statement/" + encodeURIComponent(inc.id) + "/" + s.id);
};
ACTIONS["remove-statement"] = function (el) {
  var inc = findIncident(currentRoute().parts[1]);
  if (!inc || !confirm("Remove this statement from the report?")) return;
  var id = el.getAttribute("data-id");
  inc.statements = inc.statements.filter(function (s) { return s.id !== id; });
  updateIncident(inc);
  render();
};

// ---- statements: signing on the device (statement mode), entering from paper, printable blank form
function findStatement(inc, id) {
  for (var i = 0; i < inc.statements.length; i++) if (inc.statements[i].id === id) return inc.statements[i];
  return null;
}
function viewStatement(inc, s, paper) {
  var roleLabel = LABELS.statementRoles[s.role] || "Statement";
  var intro = s.role === "principal" ? "Describe, in your own words, what happened before, during and after the incident. Include dates, times, locations and anyone who was present." : "Describe what you saw and heard, where you were, and what happened before, during and after the incident, in your own words.";
  return '<div class="statement-page"><div class="statement-head"><div><p class="eyebrow">' + esc(roleLabel) + '</p><h1>Statement for report ' + esc(inc.id) + '</h1><p class="muted">' + esc(LABELS.types[inc.type]) + ", " + esc(fmtDateTime(inc.occurredAt)) + ", " + esc(inc.location) + "</p></div>" +
    (paper ? '<a class="btn btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '">Back to report</a>' : '<button class="btn btn-ghost" type="button" data-action="exit-statement" data-incident="' + esc(inc.id) + '">Exit without signing</button>') + "</div>" +
    (paper ? '<div class="notice">Entering a statement received on paper. Type it exactly as written, record who signed it and when, and keep the paper copy with the report file.</div>' : '<div class="notice">This page shows only your statement. The rest of the report is not visible here. When you sign and submit, your statement is attached to report ' + esc(inc.id) + ".</div>") +
    '<form data-form="statement" class="card form-grid" data-paper="' + (paper ? "1" : "") + '">' +
    '<label>Printed name <span class="req">*</span><input type="text" name="printedName" value="' + field(s.printedName) + '" required autocomplete="name"></label>' +
    '<label>Department or division<input type="text" name="department" value="' + field(s.department) + '"></label>' +
    '<label>Title<input type="text" name="title" value="' + field(s.title) + '"></label>' +
    '<label>Date of incident<input type="text" value="' + esc(fmtDateTime(inc.occurredAt)) + '" readonly></label>' +
    '<label class="span-2">Statement <span class="req">*</span><div class="inline-note">' + esc(intro) + '</div><textarea name="statement" rows="12" required>' + field(s.statement) + "</textarea></label>" +
    (paper ? '<label>Signed on paper on<input type="date" name="signedOn" value="' + field(s.signedAt ? isoDate(parseDate(s.signedAt)) : isoDate(today())) + '"></label><label>Received by<input type="text" name="receivedBy" value="' + field(who().name) + '"></label>'
      : '<div class="span-2"><div class="field-label">Signature <span class="req">*</span></div>' + signaturePadHTML("sig", { signature: s.signature }, { hideName: true }) + '</div><label class="span-2 checkbox"><input type="checkbox" name="attest" required> I confirm that this statement is true and complete to the best of my knowledge.</label>') +
    '<div class="form-actions span-2"><button class="btn btn-primary btn-lg" type="submit">' + (paper ? "Attach statement" : "Sign and submit") + "</button></div></form></div>";
}
FORMS.statement = function (form) {
  var r = currentRoute();
  var incId = r.parts[0] === "statement" ? r.parts[1] : r.parts[1];
  var stId = r.parts[0] === "statement" ? r.parts[2] : r.parts[3];
  var inc = findIncident(incId);
  var s = inc && findStatement(inc, stId);
  if (!s) return;
  var f = form.elements;
  var paper = form.getAttribute("data-paper") === "1";
  s.printedName = f.printedName.value.trim(); s.department = f.department.value.trim(); s.title = f.title.value.trim(); s.statement = f.statement.value.trim();
  if (!s.printedName || !s.statement) return;
  if (paper) {
    s.status = "signed"; s.signedVia = "paper"; s.signedAt = (parseDate(f.signedOn.value + "T12:00") || new Date()).toISOString(); s.receivedBy = f.receivedBy.value.trim(); s.signature = "";
  } else {
    if (!f.sigSignature.value) { alert("Please sign in the signature box before submitting."); return; }
    s.status = "signed"; s.signedVia = "device"; s.signedAt = nowISO(); s.signature = f.sigSignature.value;
  }
  updateIncident(inc);
  if (paper) { pendingMessage = { kind: "success", text: "Statement from " + s.printedName + " attached to " + inc.id + "." }; go("#/incidents/" + encodeURIComponent(inc.id)); return; }
  app.innerHTML = '<div class="statement-page"><div class="card statement-done"><h1>Thank you</h1><p>Your statement has been signed and attached to report ' + esc(inc.id) + " at " + esc(fmtDateTime(s.signedAt)) + '.</p><p class="muted">Please hand the device back to the investigator.</p><a class="btn btn-primary" href="#/incidents/' + encodeURIComponent(inc.id) + '">Done</a></div></div>';
  window.scrollTo(0, 0);
};
ACTIONS["exit-statement"] = function (el) {
  if (!confirm("Leave without signing? The statement text entered so far will not be saved.")) return;
  go("#/incidents/" + encodeURIComponent(el.getAttribute("data-incident")));
};
function viewStatementBlank(inc, s) {
  var roleLabel = LABELS.statementRoles[s.role] || "Statement";
  var lines = "";
  for (var i = 0; i < 18; i++) lines += '<div class="write-line"></div>';
  return '<div class="no-print page-head"><div><h1>Blank statement form</h1><p class="muted">Print this page and give it to the person. When it comes back, use Enter from paper on the report page.</p></div><div class="actions"><button class="btn btn-primary" type="button" data-action="print">Print</button> <a class="btn btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '">Back</a></div></div>' +
    '<div class="report"><header class="report-head"><div><h1>' + esc(who().organization || APP) + "</h1><h2>" + esc(roleLabel) + '</h2></div><div class="report-id"><div><span>Report no.</span><strong>' + esc(inc.id) + "</strong></div><div><span>Incident date</span><strong>" + esc(fmtDateTime(inc.occurredAt)) + "</strong></div><div><span>Location</span><strong>" + esc(inc.location) + "</strong></div></div></header>" +
    '<p class="small">Please describe, in your own words, what happened before, during and after the incident' + (s.role === "witness" ? ", including where you were and what you saw and heard" : "") + ". Use additional pages if needed. This statement will be attached to the incident report above.</p>" +
    '<table class="report-table"><tr><th>Printed name</th><td>' + esc(s.printedName) + "</td><th>Department or division</th><td>" + esc(s.department) + "</td></tr><tr><th>Title</th><td>" + esc(s.title) + "</td><th>Date</th><td></td></tr></table>" +
    '<h4>Statement</h4>' + lines +
    '<div class="sig-row" style="margin-top:36px"><div><span class="line"></span>Signature</div><div><span class="line"></span>Date</div></div>' +
    '<footer class="report-foot">' + esc(APP) + ". " + esc(LICENSE) + ".</footer></div>";
}

// ---- sections 7 and 8: analysis, corrective actions, signatures
function viewInvestigation(inc, msg) {
  var a = inc.analysis, p = who();
  var actionRows = inc.actions.map(function (x) {
    var overdue = x.status !== "completed" && x.status !== "verified" && x.targetDate && parseDate(x.targetDate) < today();
    return "<tr><td>" + esc(x.description) + (x.notes ? '<br><small class="muted">' + esc(x.notes) + "</small>" : "") + "</td><td>" + esc(x.responsible) + "</td><td>" + esc(fmtDate(x.targetDate)) + (overdue ? " " + badge("danger", "Overdue") : "") + '</td><td><input type="date" class="inline-input" data-change="action-verify" data-id="' + x.id + '" value="' + field(x.verificationDate) + '"></td><td><select class="inline-input" data-change="action-status" data-id="' + x.id + '">' + options(LABELS.actionStatuses, x.status) + '</select></td><td class="actions-cell"><button class="btn btn-sm btn-ghost" type="button" data-action="remove-action" data-id="' + x.id + '">Remove</button></td></tr>';
  }).join("");
  var sigBlocks = Object.keys(LABELS.signatureRoles).map(function (k) {
    var s = inc.signatures[k] || {};
    return '<div class="sig-card"><h3>' + esc(LABELS.signatureRoles[k]) + "</h3>" + signaturePadHTML("sig_" + k + "_", s, { title: true }) + "</div>";
  }).join("");
  return '<div class="page-head"><div><p class="eyebrow">' + esc(LABELS.types[inc.type]) + ', <a href="#/incidents/' + encodeURIComponent(inc.id) + '">' + esc(inc.id) + '</a></p><h1>Sections 7 and 8</h1><p class="muted">' + esc(fmtDateTime(inc.occurredAt)) + ", " + esc(inc.location) + (inc.reportedBy ? ", reported by " + esc(inc.reportedBy) : "") + '</p></div><div class="actions">' + badge(statusCls(inc.status), LABELS.statuses[inc.status]) + "</div></div>" +
    (msg ? flash(msg.kind, msg.text) : "") +
    '<div class="card muted-box"><p class="small" style="margin:0"><strong>What happened (Section 4):</strong> ' + esc(inc.description) + "</p></div>" +
    '<form data-form="analysis" class="card form-grid">' + sectionHead(7, "Incident facts and analysis", "To be completed by the safety representative.") +
    '<label>Safety representative<input type="text" name="safetyRepName" value="' + field(a.safetyRepName || p.name) + '"></label>' +
    '<label>Title<input type="text" name="safetyRepTitle" value="' + field(a.safetyRepTitle || p.jobTitle) + '"></label>' +
    '<label>Date<input type="date" name="date" value="' + field(a.date || isoDate(today())) + '"></label><div></div>' +
    '<label class="span-2">Analysis of the facts<small class="muted">What the evidence, statements and site conditions show. Separate what is known from what is assumed.</small><textarea name="factsAnalysis" rows="5">' + field(a.factsAnalysis) + "</textarea></label>" +
    '<label class="span-2">Contributing causes<small class="muted">Conditions and decisions that made the incident more likely or more severe.</small><textarea name="contributingCauses" rows="3">' + field(a.contributingCauses) + "</textarea></label>" +
    '<label class="span-2">Direct causes <span class="req">*</span><small class="muted">The unsafe act or condition that produced the injury or damage.</small><textarea name="directCauses" rows="3">' + field(a.directCauses) + "</textarea></label>" +
    '<label class="span-2">Root cause <span class="req">*</span><small class="muted">The underlying management, system or process failure that allowed the direct cause to exist. Keep asking why until a fixable cause appears.</small><textarea name="rootCause" rows="3">' + field(a.rootCause) + "</textarea></label>" +
    '<label>Contributing factor type <span class="req">*</span><select name="factorType">' + options(LABELS.factors, a.factorType, "Select") + "</select></label>" +
    (inc.vehicle.involved ? '<label>Preventability determination (vehicle)<select name="preventability">' + options(LABELS.preventability, inc.vehicle.preventability || "undetermined") + "</select></label>" : "<div></div>") +
    '<label class="span-2">Contributing factor details<textarea name="factorDetail" rows="2">' + field(a.factorDetail) + "</textarea></label>" +
    '<label class="span-2">Supporting references<small class="muted">Policies, procedures and regulations that apply, for example 29 CFR 1926.501(b)(1), department SOP 4.2, fleet policy on backing.</small><textarea name="references" rows="3">' + field(a.references) + "</textarea></label>" +
    '<label class="span-2">Lessons learned<textarea name="lessonsLearned" rows="2">' + field(a.lessonsLearned) + "</textarea></label>" +
    '<div class="form-actions span-2"><button class="btn btn-primary" type="submit">Save section 7</button><a class="btn btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '">Back to report</a></div></form>' +
    '<section class="card" id="actions"><h2>Recommended corrective actions</h2><p class="muted small">Each action names a responsible party, a target date for completion and the date the safety representative verified it was done. Prefer engineering controls and procedure changes over reminders to be careful.</p>' +
    (inc.actions.length ? '<div class="table-scroll"><table class="table compact"><thead><tr><th>Action</th><th>Responsible party</th><th>Target date</th><th>Verified on</th><th>Status</th><th></th></tr></thead><tbody>' + actionRows + "</tbody></table></div>" : "") +
    '<form data-form="action" class="form-grid mt"><label class="span-2">New corrective action<input type="text" name="description" placeholder="Add a 28 ft extension ladder to each service truck and update the truck inventory checklist" required></label><label>Responsible party<input type="text" name="responsible"></label><label>Target date<input type="date" name="targetDate"></label><div class="form-actions span-2"><button class="btn btn-secondary" type="submit">Add action</button></div></form></section>' +
    '<form data-form="signatures" class="card" id="signatures">' + '<div class="section-head"><h2><span class="section-no">Section 8</span>Signatures</h2><p class="muted small">Each signer prints their name and title and signs. The date is recorded when the signature is saved.</p></div><div class="sig-grid">' + sigBlocks + '</div><div class="form-actions"><button class="btn btn-primary" type="submit">Save signatures</button></div></form>' +
    '<section class="card"><h2>Status</h2>' + (inc.status !== "closed"
      ? '<p class="small muted">Closing requires direct causes, a root cause and a contributing factor type in Section 7.</p><div class="btn-row"><button class="btn btn-primary" type="button" data-action="close-incident">Close report</button>' + (inc.status === "reported" ? '<button class="btn btn-ghost" type="button" data-action="mark-investigating">Mark under investigation</button>' : "") + "</div>"
      : '<p class="small muted">Closed ' + esc(fmtDateTime(inc.closedAt)) + '.</p><button class="btn btn-ghost" type="button" data-action="reopen-incident">Reopen</button>') + "</section>";
}
FORMS.analysis = function (form) {
  var inc = findIncident(currentRoute().parts[1]);
  if (!inc) return;
  var f = form.elements;
  inc.analysis = { safetyRepName: f.safetyRepName.value.trim(), safetyRepTitle: f.safetyRepTitle.value.trim(), date: f.date.value, factsAnalysis: f.factsAnalysis.value.trim(), contributingCauses: f.contributingCauses.value.trim(), directCauses: f.directCauses.value.trim(), rootCause: f.rootCause.value.trim(), factorType: LABELS.factors[f.factorType.value] ? f.factorType.value : "", factorDetail: f.factorDetail.value.trim(), references: f.references.value.trim(), lessonsLearned: f.lessonsLearned.value.trim() };
  if (f.preventability) inc.vehicle.preventability = f.preventability.value;
  if (inc.status === "reported") inc.status = "under_investigation";
  updateIncident(inc);
  pendingMessage = { kind: "success", text: "Section 7 saved." };
  render();
};
FORMS.action = function (form) {
  var inc = findIncident(currentRoute().parts[1]);
  var f = form.elements;
  if (!inc || !f.description.value.trim()) return;
  inc.actions.push({ id: uid(), description: f.description.value.trim(), responsible: f.responsible.value.trim(), targetDate: f.targetDate.value, verificationDate: "", status: "open", completedOn: null, notes: "" });
  if (inc.status === "reported") inc.status = "under_investigation";
  updateIncident(inc);
  pendingMessage = { kind: "success", text: "Corrective action added." };
  render();
};
CHANGES["action-status"] = function (el) {
  var inc = findIncident(currentRoute().parts[1]);
  var id = el.getAttribute("data-id");
  inc.actions.forEach(function (x) { if (x.id === id || String(x.id) === id) { x.status = el.value; if (x.status === "completed" && !x.completedOn) x.completedOn = isoDate(today()); if (x.status === "verified" && !x.verificationDate) x.verificationDate = isoDate(today()); } });
  updateIncident(inc);
  render();
};
CHANGES["action-verify"] = function (el) {
  var inc = findIncident(currentRoute().parts[1]);
  var id = el.getAttribute("data-id");
  inc.actions.forEach(function (x) { if (x.id === id || String(x.id) === id) { x.verificationDate = el.value; if (x.verificationDate && x.status !== "verified") x.status = "verified"; } });
  updateIncident(inc);
  render();
};
ACTIONS["remove-action"] = function (el) {
  if (!confirm("Remove this corrective action?")) return;
  var inc = findIncident(currentRoute().parts[1]);
  var id = el.getAttribute("data-id");
  inc.actions = inc.actions.filter(function (x) { return x.id !== id && String(x.id) !== id; });
  updateIncident(inc);
  render();
};
FORMS.signatures = function (form) {
  var inc = findIncident(currentRoute().parts[1]);
  if (!inc) return;
  var f = form.elements;
  Object.keys(LABELS.signatureRoles).forEach(function (k) {
    var prev = inc.signatures[k] || {};
    var name = f["sig_" + k + "_Name"].value.trim(), title = f["sig_" + k + "_Title"].value.trim(), sig = f["sig_" + k + "_Signature"].value;
    inc.signatures[k] = { name: name, title: title, signature: sig, signedAt: sig ? (prev.signature === sig && prev.signedAt ? prev.signedAt : nowISO()) : null };
  });
  updateIncident(inc);
  pendingMessage = { kind: "success", text: "Signatures saved." };
  render();
};
ACTIONS["close-incident"] = function () {
  var inc = findIncident(currentRoute().parts[1]);
  var a = inc.analysis, missing = [];
  if (!a.directCauses) missing.push("direct causes");
  if (!a.rootCause) missing.push("root cause");
  if (!a.factorType) missing.push("contributing factor type");
  if (missing.length) { pendingMessage = { kind: "danger", text: "Before closing, record the " + missing.join(", ") + " in Section 7 and save." }; render(); return; }
  if (!confirm("Close this report?")) return;
  inc.status = "closed"; inc.closedAt = nowISO();
  updateIncident(inc);
  pendingMessage = { kind: "success", text: "Report " + inc.id + " closed." };
  go("#/incidents/" + encodeURIComponent(inc.id));
};
ACTIONS["mark-investigating"] = function () { var inc = findIncident(currentRoute().parts[1]); inc.status = "under_investigation"; updateIncident(inc); render(); };
ACTIONS["reopen-incident"] = function () { var inc = findIncident(currentRoute().parts[1]); inc.status = "under_investigation"; inc.closedAt = null; updateIncident(inc); render(); };

// ---- printable report: all eight sections
function viewIncidentPrint(inc) {
  var a = inc.analysis, v = inc.vehicle, eq = inc.equipment, inj = inc.injury, pr = inc.property, p = who();
  function tr(cells) { return "<tr>" + cells.map(function (c, i) { return (i % 2 === 0 ? "<th>" : '<td class="pre">') + esc(c) + (i % 2 === 0 ? "</th>" : "</td>"); }).join("") + "</tr>"; }
  function statementPage(s, n) {
    return '<section class="report-section page-break"><h3>' + n + ". " + esc(LABELS.statementRoles[s.role]) + '</h3><table class="report-table"><tr><th>Printed name</th><td>' + esc(s.printedName) + "</td><th>Department or division</th><td>" + esc(s.department) + "</td></tr><tr><th>Title</th><td>" + esc(s.title) + "</td><th>Report no.</th><td>" + esc(inc.id) + '</td></tr></table><h4>Statement</h4><p class="pre box" style="min-height:160px">' + esc(s.statement) + '</p><div class="sig-row"><div>' + (s.status === "signed" && s.signedVia === "device" ? signatureImage(s) : '<span class="line"></span>') + "Signature" + (s.signedVia === "paper" ? " (signed on paper" + (s.receivedBy ? ", received by " + esc(s.receivedBy) : "") + ")" : "") + '</div><div><span class="line-text">' + (s.signedAt ? esc(s.signedVia === "paper" ? fmtDate(s.signedAt) : fmtDateTime(s.signedAt)) : "") + "</span>Date</div></div></section>";
  }
  var principals = inc.statements.filter(function (s) { return s.role === "principal"; });
  var witnesses = inc.statements.filter(function (s) { return s.role === "witness"; });
  var sigCells = Object.keys(LABELS.signatureRoles).map(function (k) {
    var s = inc.signatures[k] || {};
    return '<div class="sig-cell">' + signatureImage(s) + "<div><strong>" + esc(LABELS.signatureRoles[k]) + "</strong><br>" + esc(s.name || "") + (s.title ? ", " + esc(s.title) : "") + (s.signedAt ? "<br>" + esc(fmtDate(s.signedAt)) : "") + "</div></div>";
  }).join("");
  return '<div class="no-print page-head"><div><h1>Printable incident report</h1></div><div class="actions"><button class="btn btn-primary" type="button" data-action="print">Print or save as PDF</button> <a class="btn btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '">Back</a></div></div>' +
    '<div class="report"><header class="report-head"><div><h1>' + esc(p.organization || APP) + '</h1><h2>Incident Report</h2></div><div class="report-id"><div><span>Report no.</span><strong>' + esc(inc.id) + "</strong></div><div><span>Type</span><strong>" + esc(LABELS.types[inc.type]) + "</strong></div><div><span>Status</span><strong>" + esc(LABELS.statuses[inc.status]) + "</strong></div></div></header>" +
    '<section class="report-section"><h3>1. Incident information <small>(completed by the person conducting the investigation)</small></h3><table class="report-table">' + tr(["Date and time of incident", fmtDateTime(inc.occurredAt), "Date reported", fmtDateTime(inc.reportedAt)]) + tr(["Location", inc.location, "Division", divisionName(inc.division)]) + tr(["Reported by", inc.reportedBy, "Severity", LABELS.severities[inc.severity]]) + tr(["Work activity", inc.workActivity, "Weather and conditions", inc.weatherConditions]) + tr(["Employees involved", inc.employeesInvolved, "Witnesses", inc.witnesses]) + '<tr><th>Immediate actions taken</th><td colspan="3" class="pre">' + esc(inc.immediateActions) + "</td></tr>" + tr(["Property damaged", pr.propertyDescription, "Owner", LABELS.owners[pr.propertyOwner] || ""]) + tr(["Estimated property cost", money(pr.estimatedCost), "Damage description", pr.damageDescription]) + tr(["Investigator", [inc.investigator.name, inc.investigator.title].filter(Boolean).join(", "), "Investigation started", fmtDate(inc.investigator.date)]) + "</table></section>" +
    '<section class="report-section"><h3>2. Vehicle and equipment information <small>(completed by the person conducting the investigation)</small></h3><table class="report-table"><tr><th>Was there a vehicle involved in the incident?</th><td colspan="3"><span class="check">' + (v.involved === true ? "X" : "&nbsp;") + '</span> Yes &nbsp;&nbsp; <span class="check">' + (v.involved === false ? "X" : "&nbsp;") + "</span> No</td></tr>" +
    (v.involved ? tr(["Type of vehicle", v.vehicleType, "Vehicle make and model", v.makeModel]) + tr(["License plate no.", v.licensePlate, "City vehicle no.", v.cityVehicleNumber]) + tr(["Driver", v.driverName, "Seat belt in use", ynText(v.seatBeltUsed, "Unknown")]) + tr(["Police report no.", v.policeReportNumber, "Drug and alcohol test", LABELS.drugTests[v.drugAlcoholTest] || ""]) + tr(["Damage estimate", money(v.damageEstimate), "Preventability", LABELS.preventability[v.preventability || "undetermined"]]) + '<tr><th>Other party</th><td colspan="3" class="pre">' + esc(v.otherParty) + "</td></tr>" : "") + "</table>" +
    (v.involved ? '<h4>Damage location (circled areas)</h4><div class="print-diagram">' + vehicleDiagramSVG(v.damageMarks, false) + "</div>" + (v.sceneSketch ? '<h4>Scene sketch</h4><img class="sketch-img" src="' + esc(v.sceneSketch) + '" alt="Scene sketch">' : "") : "") +
    '<table class="report-table" style="margin-top:8px"><tr><th>Was there a machine, equipment or trailer involved?</th><td colspan="3"><span class="check">' + (eq.involved === true ? "X" : "&nbsp;") + '</span> Yes &nbsp;&nbsp; <span class="check">' + (eq.involved === false ? "X" : "&nbsp;") + "</span> No</td></tr>" + (eq.involved ? '<tr><th>Description</th><td colspan="3" class="pre">' + esc(eq.description) + "</td></tr>" : "") + "</table>" + (eq.involved && eq.sketch ? '<img class="sketch-img" src="' + esc(eq.sketch) + '" alt="Equipment sketch">' : "") + "</section>" +
    '<section class="report-section page-break"><h3>3. Personal injury details <small>(completed by the person conducting the investigation)</small></h3><table class="report-table"><tr><th>Did a personal injury occur?</th><td colspan="3"><span class="check">' + (inj.occurred === true ? "X" : "&nbsp;") + '</span> Yes &nbsp;&nbsp; <span class="check">' + (inj.occurred === false ? "X" : "&nbsp;") + "</span> No</td></tr>" +
    (inj.occurred ? tr(["Injured person", inj.injuredPerson, "Job title", inj.injuredJobTitle]) + tr(["Treatment", LABELS.treatments[inj.treatment] || "", "Provider", inj.treatmentProvider]) + tr(["Days away from work", inj.daysAway === null ? "" : inj.daysAway, "Days restricted", inj.daysRestricted === null ? "" : inj.daysRestricted]) + tr(["OSHA recordable", ynText(inj.oshaRecordable, "Not yet determined"), "", ""]) : "") + "</table>" +
    (inj.occurred ? '<h4>Mark on diagram</h4><div class="print-diagram">' + bodyDiagramSVG(inj.bodyMarks, false) + "</div><h4>Type of injury</h4>" + printedChecklist(LABELS.injuryTypes, inj.injuryTypes, inj.injuryOther) + "<h4>Body part(s) affected</h4>" + printedChecklist(LABELS.bodyParts, inj.bodyParts, inj.bodyPartOther) : "") + "</section>" +
    '<section class="report-section"><h3>4. Incident description <small>(completed by the person conducting the investigation)</small></h3><p class="pre box" style="min-height:120px">' + esc(inc.description) + "</p></section>" +
    (principals.length ? principals.map(function (s) { return statementPage(s, 5); }).join("") : '<section class="report-section page-break"><h3>5. Principal statement</h3><p class="muted small">No principal statement attached.</p></section>') +
    (witnesses.length ? witnesses.map(function (s) { return statementPage(s, 6); }).join("") : '<section class="report-section"><h3>6. Eyewitness statement</h3><p class="muted small">No eyewitness statements attached.</p></section>') +
    '<section class="report-section page-break"><h3>7. Incident facts and analysis <small>(completed by the safety representative)</small></h3><table class="report-table">' + tr(["Safety representative", [a.safetyRepName, a.safetyRepTitle].filter(Boolean).join(", "), "Date", fmtDate(a.date)]) + '<tr><th>Contributing factor type</th><td colspan="3"><span class="check">' + (a.factorType === "behavioral" ? "X" : "&nbsp;") + '</span> Behavioral &nbsp;&nbsp; <span class="check">' + (a.factorType === "engineering" ? "X" : "&nbsp;") + '</span> Engineered &nbsp;&nbsp; <span class="check">' + (a.factorType === "environmental" ? "X" : "&nbsp;") + "</span> Environmental" + (a.factorDetail ? "<br>" + esc(a.factorDetail) : "") + "</td></tr></table>" +
    '<h4>Analysis of the facts</h4><p class="pre box">' + esc(a.factsAnalysis) + '</p><h4>Contributing causes</h4><p class="pre box">' + esc(a.contributingCauses) + '</p><h4>Direct causes</h4><p class="pre box">' + esc(a.directCauses) + '</p><h4>Root cause</h4><p class="pre box">' + esc(a.rootCause) + "</p>" +
    '<h4>Recommended corrective actions</h4><table class="report-table grid"><thead><tr><th>#</th><th>Corrective action</th><th>Responsible party</th><th>Target date</th><th>Verification date</th><th>Status</th></tr></thead><tbody>' + (inc.actions.length ? inc.actions.map(function (x, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(x.description) + (x.notes ? "<br><small>" + esc(x.notes) + "</small>" : "") + "</td><td>" + esc(x.responsible) + "</td><td>" + esc(fmtDate(x.targetDate)) + "</td><td>" + esc(fmtDate(x.verificationDate)) + "</td><td>" + esc(LABELS.actionStatuses[x.status] || x.status) + "</td></tr>"; }).join("") : "<tr><td>1</td><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr><tr><td>2</td><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>") + "</tbody></table>" +
    '<h4>Supporting references (policies, procedures, regulations)</h4><p class="pre box">' + esc(a.references) + "</p>" + (a.lessonsLearned ? '<h4>Lessons learned</h4><p class="pre box">' + esc(a.lessonsLearned) + "</p>" : "") + "</section>" +
    '<section class="report-section"><h3>8. Signatures</h3><div class="sig-grid-print">' + sigCells + "</div>" + (inc.closedAt ? '<p class="small">Report closed ' + esc(fmtDateTime(inc.closedAt)) + ".</p>" : "") + "</section>" +
    '<footer class="report-foot">' + esc(APP) + ". Printed " + esc(fmtDateTime(new Date())) + ". Report " + esc(inc.id) + ". " + esc(LICENSE) + ".</footer></div>";
}

function viewIncidentSummary() {
  var list = incidents().slice().sort(function (a, b) { return (b.reportedAt || "") < (a.reportedAt || "") ? -1 : 1; }).slice(0, 5);
  var rows = list.map(function (i) {
    return "<tr><td><a href=\"#/incidents/" + encodeURIComponent(i.id) + '">' + esc(i.id) + "</a></td><td>" + esc(LABELS.types[i.type]) + "</td><td>" + esc(fmtDate(i.occurredAt)) + "</td><td>" + badge(statusCls(i.status), LABELS.statuses[i.status]) + "</td></tr>";
  }).join("");
  return '<section class="card"><div class="card-head"><h2>Incident reports</h2><a class="btn btn-sm btn-secondary" href="#/incidents/new">New incident report</a></div>' +
    (rows ? '<table class="table compact"><thead><tr><th>Report no.</th><th>Type</th><th>Date</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table>"
      : '<p class="empty">No incident reports on this device. Report any injury, property damage or vehicle incident, including near misses.</p>') + "</section>";
}
