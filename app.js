(function () {
  "use strict";
// ==== 10-core.js
// ---------------------------------------------------------------- core: data, storage, helpers
var DATA = window.SAFETY_DATA || { courses: [], divisions: [], top10: [], inspections: [] };
var APP = DATA.app_name || "IntelliSafe";
var BRAND_COMPANY = DATA.brand_company || "IntelliSafe Systems LLC";
var COMPANY = DATA.company || "Tompkins Software Systems LLC";
var LICENSE = DATA.license_line || ("Licensed software by " + COMPANY);
var PASS = DATA.pass_percent || 80;
var REMIND_DAYS = 30;
var app = document.getElementById("app");

var store = {
  get: function (key, fallback) {
    try {
      var raw = localStorage.getItem("pwst:" + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set: function (key, value) {
    try {
      localStorage.setItem("pwst:" + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
  remove: function (key) {
    try { localStorage.removeItem("pwst:" + key); } catch (e) { /* ignore */ }
  }
};
var session = {
  get: function (key, fallback) {
    try {
      var raw = sessionStorage.getItem("pwst:" + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set: function (key, value) {
    try {
      if (value === null) sessionStorage.removeItem("pwst:" + key);
      else sessionStorage.setItem("pwst:" + key, JSON.stringify(value));
    } catch (e) { /* ignore */ }
  }
};

function profile() { return store.get("profile", null); }
function who() { return profile() || {}; }
function records() { return store.get("records", {}); }
function saveRecords(r) { store.set("records", r); }

var LABELS = {
  types: { injury: "Personal injury or illness", property_damage: "Property damage", vehicle: "Vehicle incident" },
  typeCodes: { injury: "PI", property_damage: "PD", vehicle: "VI" },
  statuses: { reported: "Reported", under_investigation: "Under investigation", closed: "Closed" },
  severities: { near_miss: "Near miss (no injury or damage)", minor: "Minor", moderate: "Moderate", serious: "Serious", critical: "Critical or fatality" },
  factors: {
    behavioral: "Behavioral (actions, decisions, habits, training, supervision)",
    engineering: "Engineered (equipment, design, guarding, tools, materials)",
    environmental: "Environmental (weather, lighting, surfaces, noise, housekeeping, traffic)"
  },
  treatments: { none: "No treatment needed", first_aid: "First aid only", clinic: "Clinic or occupational health", emergency_room: "Emergency room", hospitalized: "Hospitalized (admitted)" },
  owners: { city: "City or department owned", third_party: "Third party (resident, business, other agency)", employee: "Employee owned" },
  drugTests: { not_required: "Not required", completed: "Completed", pending: "Pending", refused: "Refused" },
  preventability: { undetermined: "Undetermined", preventable: "Preventable", non_preventable: "Non-preventable" },
  actionStatuses: { open: "Open", in_progress: "In progress", completed: "Completed", verified: "Verified" },
  statementRoles: { principal: "Principal statement", witness: "Eyewitness statement" },
  signatureRoles: { investigator: "Investigator", manager: "Manager", safetyManager: "Safety Manager", assistantDirector: "Department Assistant Director" },
  injuryTypes: ["Burn", "Strain/Sprain", "Laceration", "Amputation", "Contusion", "Fracture"],
  bodyParts: ["Head", "Eye", "Ear", "Face", "Neck", "Chest", "Shoulder", "Back", "Abdomen", "Groin", "Buttocks", "Upper Arm", "Forearm", "Wrist", "Hand/Finger", "Thigh/Leg", "Knee", "Calf", "Ankle", "Foot/Toe"],
  vehicleTypes: ["Pickup or service truck", "Bucket or aerial lift truck", "Dump truck", "Refuse or recycling truck", "Vactor, jetter or tanker truck", "Plow truck", "Sedan or SUV", "Van", "Loader, backhoe or other equipment", "Trailer", "Other"],
  categories: { osha_top10: "OSHA Top 10", general: "Annual", rescue: "Rescue", supervisor: "Supervisors" },
  tracks: { all: "All modules", new_hire: "New hire required", supervisor: "Supervisors and managers" },
  inspectionResults: { ok: "OK", action: "Needs action", na: "N/A" },
  auditResults: { ok: "In place", partial: "Partial", missing: "Missing", na: "N/A" }
};
var LETTERS = ["A", "B", "C", "D", "E", "F"];

function esc(value) {
  return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function short(label) { return (label || "").split(" (")[0]; }
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function pad(n) { return (n < 10 ? "0" : "") + n; }
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    var p = value.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(value, long) {
  var d = parseDate(value);
  if (!d) return "";
  return (long ? MONTHS_LONG : MONTHS)[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}
function fmtDateTime(value) {
  var d = parseDate(value);
  if (!d) return "";
  var h = d.getHours(), ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return fmtDate(d) + ", " + h + ":" + pad(d.getMinutes()) + " " + ampm;
}
function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function addMonths(d, months) {
  var y = d.getFullYear(), m = d.getMonth() + months;
  var last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
}
function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }
function money(v) { return v === null || v === undefined || v === "" || isNaN(v) ? "" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nowISO() { return new Date().toISOString(); }
function localDateTimeValue(d) { return isoDate(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function divisionName(code) {
  for (var i = 0; i < DATA.divisions.length; i++) if (DATA.divisions[i].code === code) return DATA.divisions[i].name;
  return code || "";
}
function courseBySlug(slug) {
  for (var i = 0; i < DATA.courses.length; i++) if (DATA.courses[i].slug === slug) return DATA.courses[i];
  return null;
}
function download(filename, data, type) {
  var blob = data instanceof Blob ? data : new Blob([data], { type: type || "text/plain" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csvCell(v) { v = String(v === null || v === undefined ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function badge(cls, text) { return '<span class="badge badge-' + cls + '">' + esc(text) + "</span>"; }
function options(map, selected, blank) {
  var html = blank ? '<option value="">' + esc(blank) + "</option>" : "";
  Object.keys(map).forEach(function (k) {
    html += '<option value="' + k + '"' + (selected === k ? " selected" : "") + ">" + esc(map[k]) + "</option>";
  });
  return html;
}
function yesNoSelect(name, value, blankLabel) {
  return '<select name="' + name + '"><option value="">' + esc(blankLabel || "Select") + '</option><option value="yes"' + (value === true ? " selected" : "") + '>Yes</option><option value="no"' + (value === false ? " selected" : "") + ">No</option></select>";
}
function flash(kind, text) { return '<div class="flashes"><div class="flash flash-' + kind + '">' + esc(text) + "</div></div>"; }
function field(value) { return esc(value === null || value === undefined ? "" : value); }
function checkboxList(name, choices, selected, otherValue) {
  var html = '<div class="check-grid">';
  choices.forEach(function (c) {
    html += '<label class="checkbox"><input type="checkbox" name="' + name + '" value="' + esc(c) + '"' + ((selected || []).indexOf(c) >= 0 ? " checked" : "") + "> " + esc(c) + "</label>";
  });
  html += '<label class="checkbox other"><input type="checkbox" name="' + name + '" value="Other"' + ((selected || []).indexOf("Other") >= 0 ? " checked" : "") + '> Other: <input type="text" name="' + name + 'Other" value="' + esc(otherValue || "") + '"></label></div>';
  return html;
}
function printedChecklist(choices, selected, otherValue) {
  var html = '<div class="print-checks">';
  choices.concat(["Other"]).forEach(function (c) {
    var on = (selected || []).indexOf(c) >= 0;
    html += '<span class="print-check"><span class="check">' + (on ? "X" : "&nbsp;") + "</span>" + esc(c) + (c === "Other" && otherValue ? ": " + esc(otherValue) : "") + "</span>";
  });
  return html + "</div>";
}

// ==== 20-diagrams.js
// ---------------------------------------------------------------- diagrams, sketch pads and signature pads
// Vehicle damage diagram: five views of a service truck. Marks are stored as percentages of the viewBox.
function vehicleDiagramSVG(marks, interactive) {
  var line = 'fill="#fff" stroke="#0b3954" stroke-width="3" stroke-linejoin="round"';
  var thin = 'fill="none" stroke="#0b3954" stroke-width="2"';
  function sideView(x, y, flip) {
    var t = flip ? "translate(" + (x + 600) + "," + y + ") scale(-1,1)" : "translate(" + x + "," + y + ")";
    return '<g transform="' + t + '">' +
      '<path d="M4 78 L4 48 Q6 42 14 42 L190 36 L236 8 Q240 4 248 4 L336 4 Q344 4 346 12 L350 36 L586 36 Q596 36 596 46 L596 78 Z" ' + line + "/>" +
      '<path d="M200 36 L240 12 L330 12 L336 36 Z" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/>' +
      '<path d="M346 36 L346 66" ' + thin + "/>" + '<path d="M20 70 L580 70" ' + thin + "/>" +
      '<circle cx="118" cy="78" r="24" fill="#fff" stroke="#0b3954" stroke-width="3"/><circle cx="118" cy="78" r="10" ' + thin + "/>" +
      '<circle cx="478" cy="78" r="24" fill="#fff" stroke="#0b3954" stroke-width="3"/><circle cx="478" cy="78" r="10" ' + thin + "/>" +
      '<rect x="258" y="40" width="22" height="6" rx="2" ' + thin + "/></g>";
  }
  function endView(x, y, rear) {
    return '<g transform="translate(' + x + "," + y + ')">' +
      '<rect x="6" y="14" width="128" height="118" rx="12" ' + line + "/>" +
      (rear ? '<rect x="22" y="26" width="96" height="44" rx="4" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/><rect x="22" y="84" width="96" height="36" rx="3" ' + thin + "/>"
        : '<rect x="22" y="26" width="96" height="44" rx="6" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/><rect x="34" y="88" width="72" height="26" rx="3" ' + thin + '/><rect x="14" y="90" width="14" height="12" rx="2" ' + thin + '/><rect x="112" y="90" width="14" height="12" rx="2" ' + thin + "/>") +
      '<rect x="2" y="112" width="26" height="34" rx="6" fill="#fff" stroke="#0b3954" stroke-width="3"/><rect x="112" y="112" width="26" height="34" rx="6" fill="#fff" stroke="#0b3954" stroke-width="3"/>' +
      '<rect x="0" y="130" width="140" height="10" rx="3" ' + line + "/></g>";
  }
  var top = '<g transform="translate(330,120)">' +
    '<rect x="20" y="0" width="300" height="380" rx="26" ' + line + "/>" +
    '<path d="M20 110 L320 110" ' + thin + "/>" + '<path d="M40 112 L62 160 L278 160 L300 112 Z" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/>' +
    '<rect x="62" y="160" width="216" height="70" rx="6" ' + thin + "/>" + '<path d="M62 230 L50 254 L290 254 L278 230 Z" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/>' +
    '<rect x="44" y="266" width="252" height="100" rx="6" ' + thin + "/>" + '<path d="M44 266 L296 366 M296 266 L44 366" stroke="#cfd5db" stroke-width="2"/>' +
    '<rect x="0" y="40" width="26" height="60" rx="8" ' + line + '/><rect x="314" y="40" width="26" height="60" rx="8" ' + line + "/>" +
    '<rect x="0" y="290" width="26" height="60" rx="8" ' + line + '/><rect x="314" y="290" width="26" height="60" rx="8" ' + line + "/>" +
    '<rect x="2" y="128" width="24" height="18" rx="3" ' + line + '/><rect x="314" y="128" width="24" height="18" rx="3" ' + line + "/>" +
    '<text x="170" y="60" text-anchor="middle" font-size="18" fill="#5b6878">Front</text><text x="170" y="320" text-anchor="middle" font-size="18" fill="#5b6878">Rear</text></g>';
  var labels = '<text x="500" y="112" text-anchor="middle" font-size="18" fill="#5b6878">Left side</text><text x="500" y="610" text-anchor="middle" font-size="18" fill="#5b6878">Right side</text><text x="100" y="420" text-anchor="middle" font-size="18" fill="#5b6878">Front</text><text x="900" y="420" text-anchor="middle" font-size="18" fill="#5b6878">Rear</text>';
  return diagramWrap("vehicle", 1000, 620, sideView(200, 6, false) + sideView(200, 516, true) + endView(30, 230, false) + endView(830, 230, true) + top + labels, marks, interactive, "circle");
}

// Body diagram: front and back figures. Marks stored as percentages.
function bodyDiagramSVG(marks, interactive) {
  function figure(x, label) {
    var s = 'fill="#fff" stroke="#0b3954" stroke-width="3" stroke-linejoin="round"';
    return '<g transform="translate(' + x + ',0)">' +
      '<ellipse cx="0" cy="46" rx="24" ry="30" ' + s + "/>" + '<rect x="-10" y="74" width="20" height="18" ' + s + "/>" +
      '<path d="M-58 100 Q-70 104 -74 120 L-98 236 Q-100 246 -90 250 L-78 252 Q-70 252 -68 244 L-46 150 L-46 240 L-40 250 L-44 400 L-16 404 L-6 262 L6 262 L16 404 L44 400 L40 250 L46 240 L46 150 L68 244 Q70 252 78 252 L90 250 Q100 246 98 236 L74 120 Q70 104 58 100 Z" ' + s + "/>" +
      '<path d="M-46 150 Q0 160 46 150" fill="none" stroke="#0b3954" stroke-width="2"/><path d="M-40 250 Q0 240 40 250" fill="none" stroke="#0b3954" stroke-width="2"/>' +
      '<path d="M-44 400 L-50 412 L-14 416 L-16 404 M44 400 L50 412 L14 416 L16 404" fill="#fff" stroke="#0b3954" stroke-width="3" stroke-linejoin="round"/>' +
      '<text x="0" y="446" text-anchor="middle" font-size="18" fill="#5b6878">' + label + "</text></g>";
  }
  return diagramWrap("body", 600, 460, figure(160, "Front") + figure(440, "Back"), marks, interactive, "x");
}

function diagramWrap(kind, w, h, inner, marks, interactive, markStyle) {
  var markHtml = (marks || []).map(function (m, i) {
    var cx = (m.x / 100) * w, cy = (m.y / 100) * h;
    if (markStyle === "x") {
      return '<g class="mark" data-index="' + i + '"><circle cx="' + cx + '" cy="' + cy + '" r="14" fill="rgba(228,87,46,0.16)" stroke="#e4572e" stroke-width="3"/><path d="M' + (cx - 7) + " " + (cy - 7) + " L" + (cx + 7) + " " + (cy + 7) + " M" + (cx + 7) + " " + (cy - 7) + " L" + (cx - 7) + " " + (cy + 7) + '" stroke="#e4572e" stroke-width="3"/></g>';
    }
    return '<g class="mark" data-index="' + i + '"><circle cx="' + cx + '" cy="' + cy + '" r="22" fill="rgba(228,87,46,0.16)" stroke="#e4572e" stroke-width="4"/></g>';
  }).join("");
  return '<div class="diagram' + (interactive ? " interactive" : "") + '" data-diagram="' + kind + '"><svg viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + (kind === "body" ? "Body diagram" : "Vehicle diagram") + '">' + inner + '<g class="marks">' + markHtml + "</g></svg>" +
    (interactive ? '<div class="diagram-tools"><span class="small muted">' + (kind === "body" ? "Tap the diagram to mark each injured area. Tap a mark to remove it." : "Tap the diagram to circle each damaged area. Tap a circle to remove it.") + '</span> <button type="button" class="btn btn-sm btn-ghost" data-action="diagram-clear" data-diagram="' + kind + '">Clear marks</button></div>' : "") + "</div>";
}

// Reads the marks currently drawn in a diagram back into percentages.
function diagramMarks(container) {
  var svg = container.querySelector("svg");
  var vb = svg.viewBox.baseVal;
  var out = [];
  var nodes = container.querySelectorAll(".marks .mark");
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i].tagName.toLowerCase() === "g" ? nodes[i].querySelector("circle") : nodes[i];
    out.push({ x: Math.round(1000 * el.getAttribute("cx") / vb.width) / 10, y: Math.round(1000 * el.getAttribute("cy") / vb.height) / 10 });
  }
  return out;
}

function markElement(kind, m, w, h, index) {
  var ns = "http://www.w3.org/2000/svg";
  var cx = (m.x / 100) * w, cy = (m.y / 100) * h;
  var g = document.createElementNS(ns, "g");
  g.setAttribute("class", "mark");
  g.setAttribute("data-index", index);
  var c = document.createElementNS(ns, "circle");
  c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", kind === "body" ? 14 : 22);
  c.setAttribute("fill", "rgba(228,87,46,0.16)"); c.setAttribute("stroke", "#e4572e"); c.setAttribute("stroke-width", kind === "body" ? 3 : 4);
  g.appendChild(c);
  if (kind === "body") {
    var x = document.createElementNS(ns, "path");
    x.setAttribute("d", "M" + (cx - 7) + " " + (cy - 7) + " L" + (cx + 7) + " " + (cy + 7) + " M" + (cx + 7) + " " + (cy - 7) + " L" + (cx - 7) + " " + (cy + 7));
    x.setAttribute("stroke", "#e4572e"); x.setAttribute("stroke-width", 3); x.setAttribute("fill", "none");
    g.appendChild(x);
  }
  return g;
}

function bindDiagrams(root) {
  var diagrams = root.querySelectorAll(".diagram.interactive");
  for (var i = 0; i < diagrams.length; i++) {
    (function (container) {
      if (container.getAttribute("data-bound")) return;
      container.setAttribute("data-bound", "1");
      var svg = container.querySelector("svg");
      var kind = container.getAttribute("data-diagram");
      var layer = container.querySelector(".marks");
      var vb = svg.viewBox.baseVal;
      var inputName = kind === "body" ? "bodyMarks" : "damageMarks";
      svg.addEventListener("click", function (e) {
        var markEl = e.target.closest ? e.target.closest(".mark") : null;
        if (markEl) {
          layer.removeChild(markEl);
        } else {
          var rect = svg.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          var m = { x: Math.round(1000 * (e.clientX - rect.left) / rect.width) / 10, y: Math.round(1000 * (e.clientY - rect.top) / rect.height) / 10 };
          layer.appendChild(markElement(kind, m, vb.width, vb.height, layer.children.length));
        }
        var nodes = layer.querySelectorAll(".mark");
        for (var k = 0; k < nodes.length; k++) nodes[k].setAttribute("data-index", k);
        syncHidden(root, inputName, JSON.stringify(diagramMarks(container)));
      });
      var clear = container.querySelector('[data-action="diagram-clear"]');
      if (clear) clear.addEventListener("click", function () { while (layer.firstChild) layer.removeChild(layer.firstChild); syncHidden(root, inputName, "[]"); });
    })(diagrams[i]);
  }
}

function syncHidden(root, name, value) {
  var input = root.querySelector('input[name="' + name + '"]');
  if (input) input.value = value;
}

// Sketch pad: a canvas with an optional intersection background, free-hand drawing, saved as a PNG data URL.
function sketchPadHTML(name, dataUrl, background, hint) {
  return '<div class="sketch-pad" data-sketch="' + name + '" data-background="' + (background || "") + '">' +
    '<canvas width="800" height="500" aria-label="Sketch area"></canvas>' +
    '<input type="hidden" name="' + name + '" value="' + esc(dataUrl || "") + '">' +
    '<div class="diagram-tools"><span class="small muted">' + esc(hint || "Draw with a finger, stylus or mouse.") + '</span> <button type="button" class="btn btn-sm btn-ghost" data-action="sketch-clear">Clear</button></div></div>';
}

function drawIntersection(ctx, w, h) {
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#0b3954"; ctx.lineWidth = 3;
  var cx = w / 2, cy = h / 2, half = 110;
  ctx.beginPath();
  ctx.moveTo(0, cy - half); ctx.lineTo(cx - half, cy - half); ctx.lineTo(cx - half, 0);
  ctx.moveTo(cx + half, 0); ctx.lineTo(cx + half, cy - half); ctx.lineTo(w, cy - half);
  ctx.moveTo(w, cy + half); ctx.lineTo(cx + half, cy + half); ctx.lineTo(cx + half, h);
  ctx.moveTo(cx - half, h); ctx.lineTo(cx - half, cy + half); ctx.lineTo(0, cy + half);
  ctx.stroke();
  ctx.strokeStyle = "#9aa5b1"; ctx.lineWidth = 3; ctx.setLineDash([24, 18]);
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(cx - half, cy); ctx.moveTo(cx + half, cy); ctx.lineTo(w, cy);
  ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - half); ctx.moveTo(cx, cy + half); ctx.lineTo(cx, h); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#9aa5b1"; ctx.font = "16px Barlow, Arial, sans-serif";
  ctx.fillText("N", cx + 8, 20);
}

function bindSketchPads(root) {
  var pads = root.querySelectorAll(".sketch-pad");
  for (var i = 0; i < pads.length; i++) {
    (function (pad) {
      if (pad.getAttribute("data-bound")) return;
      pad.setAttribute("data-bound", "1");
      var canvas = pad.querySelector("canvas"), ctx = canvas.getContext("2d"), input = pad.querySelector("input[type=hidden]");
      var background = pad.getAttribute("data-background");
      function reset() {
        if (background === "intersection") drawIntersection(ctx, canvas.width, canvas.height);
        else { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      }
      function restore() {
        reset();
        if (input.value) { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }; img.src = input.value; }
      }
      restore();
      var drawing = false;
      function pos(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
      canvas.addEventListener("pointerdown", function (e) { drawing = true; canvas.setPointerCapture(e.pointerId); var p = pos(e); ctx.strokeStyle = "#e4572e"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); });
      canvas.addEventListener("pointermove", function (e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); });
      function end(e) { if (!drawing) return; drawing = false; input.value = canvas.toDataURL("image/png"); }
      canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end); canvas.addEventListener("pointerleave", end);
      pad.querySelector('[data-action="sketch-clear"]').addEventListener("click", function () { input.value = ""; reset(); });
    })(pads[i]);
  }
}

// Signature pad: typed name plus a drawn signature, saved as a PNG data URL.
function signaturePadHTML(prefix, sig, opts) {
  sig = sig || {};
  opts = opts || {};
  return '<div class="signature-block">' +
    (opts.hideName ? "" : '<label>' + esc(opts.nameLabel || "Printed name") + '<input type="text" name="' + prefix + 'Name" value="' + field(sig.name) + '"></label>') +
    (opts.title ? '<label>Title<input type="text" name="' + prefix + 'Title" value="' + field(sig.title) + '"></label>' : "") +
    '<div class="signature-pad" data-signature="' + prefix + '"><canvas width="600" height="180" aria-label="Signature"></canvas>' +
    '<input type="hidden" name="' + prefix + 'Signature" value="' + esc(sig.signature || "") + '">' +
    '<div class="diagram-tools"><span class="small muted">Sign above with a finger, stylus or mouse.</span> <button type="button" class="btn btn-sm btn-ghost" data-action="signature-clear">Clear</button></div></div>' +
    (sig.signedAt ? '<p class="small muted">Signed ' + esc(fmtDateTime(sig.signedAt)) + "</p>" : "") + "</div>";
}

function bindSignaturePads(root) {
  var pads = root.querySelectorAll(".signature-pad");
  for (var i = 0; i < pads.length; i++) {
    (function (pad) {
      if (pad.getAttribute("data-bound")) return;
      pad.setAttribute("data-bound", "1");
      var canvas = pad.querySelector("canvas"), ctx = canvas.getContext("2d"), input = pad.querySelector("input[type=hidden]");
      function reset() { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = "#cfd5db"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, 140); ctx.lineTo(570, 140); ctx.stroke(); }
      reset();
      if (input.value) { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }; img.src = input.value; }
      var drawing = false;
      function pos(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
      canvas.addEventListener("pointerdown", function (e) { drawing = true; canvas.setPointerCapture(e.pointerId); var p = pos(e); ctx.strokeStyle = "#0b3954"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); });
      canvas.addEventListener("pointermove", function (e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); });
      function end() { if (!drawing) return; drawing = false; input.value = canvas.toDataURL("image/png"); }
      canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end); canvas.addEventListener("pointerleave", end);
      pad.querySelector('[data-action="signature-clear"]').addEventListener("click", function () { input.value = ""; reset(); });
    })(pads[i]);
  }
}

function signatureImage(sig, height) {
  if (!sig || !sig.signature) return '<span class="line"></span>';
  return '<img class="signature-img" src="' + esc(sig.signature) + '" alt="Signature" style="height:' + (height || 56) + 'px">';
}

function bindWidgets(root) {
  bindDiagrams(root);
  bindSketchPads(root);
  bindSignaturePads(root);
}

// ==== 30-xlsx.js
// ---------------------------------------------------------------- minimal .xlsx writer (no dependencies)
// Builds a real Excel workbook: a zip archive (stored, no compression) holding the OOXML parts.
var CRC_TABLE = (function () {
  var t = [], c;
  for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function utf8(str) { return new TextEncoder().encode(str); }
function le16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
function le32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }
function dosDateTime(d) {
  var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time, date: date };
}
function zipStore(files) {
  var parts = [], central = [], offset = 0, now = dosDateTime(new Date());
  files.forEach(function (f) {
    var name = utf8(f.name), data = utf8(f.content), crc = crc32(data);
    var local = [].concat(le32(0x04034b50), le16(20), le16(0x0800), le16(0), le16(now.time), le16(now.date), le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0));
    parts.push(new Uint8Array(local), name, data);
    var cd = [].concat(le32(0x02014b50), le16(20), le16(20), le16(0x0800), le16(0), le16(now.time), le16(now.date), le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset));
    central.push(new Uint8Array(cd), name);
    offset += local.length + name.length + data.length;
  });
  var cdSize = 0;
  central.forEach(function (c) { cdSize += c.length; });
  var end = [].concat(le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length), le32(cdSize), le32(offset), le16(0));
  return new Blob(parts.concat(central, [new Uint8Array(end)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function xmlEsc(s) { return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function colName(n) { var s = ""; n += 1; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function sheetXML(rows) {
  var widths = [];
  rows.forEach(function (r) { r.forEach(function (v, i) { var l = String(v === null || v === undefined ? "" : v).length; if (!widths[i] || l > widths[i]) widths[i] = l; }); });
  var cols = widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(60, Math.max(10, w + 2)) + '" customWidth="1"/>'; }).join("");
  var body = rows.map(function (r, ri) {
    return "<row r=\"" + (ri + 1) + '">' + r.map(function (v, ci) {
      var ref = colName(ci) + (ri + 1);
      if (typeof v === "number") return '<c r="' + ref + '"><v>' + v + "</v></c>";
      var style = ri === 0 ? ' s="1"' : "";
      return '<c r="' + ref + '" t="inlineStr"' + style + "><is><t>" + xmlEsc(v) + "</t></is></c>";
    }).join("") + "</row>";
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + cols + "</cols><sheetData>" + body + "</sheetData></worksheet>";
}
// sheets: [{name, rows: [[cell, ...], ...]}]
function xlsxBlob(sheets) {
  var files = [];
  files.push({ name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") + "</Types>" });
  files.push({ name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  files.push({ name: "xl/workbook.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + xmlEsc(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets></workbook>" });
  files.push({ name: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
  files.push({ name: "xl/styles.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs></styleSheet>' });
  sheets.forEach(function (s, i) { files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", content: sheetXML(s.rows) }); });
  return zipStore(files);
}

// ==== 40-training.js
// ---------------------------------------------------------------- training: dashboard, modules, quizzes, certificates, record
var ACTIONS = {}, FORMS = {}, CHANGES = {};
var pendingMessage = null;

function divisionFilter() {
  var f = store.get("division_filter", null);
  if (f) return f;
  return who().division || "all";
}
function trackFilter() { return store.get("track_filter", "all"); }
function coursesFor(filter, track) {
  return DATA.courses.filter(function (c) {
    if (filter && filter !== "all" && c.divisions.indexOf(filter) < 0) return false;
    if (track === "new_hire" && !c.new_hire) return false;
    if (track === "supervisor" && c.category !== "supervisor") return false;
    return true;
  });
}
function courseKicker(c) {
  var parts = [c.top10_rank ? "OSHA Top 10, rank " + c.top10_rank : (LABELS.categories[c.category] || "Annual") + " training"];
  if (c.standard) parts.push(c.standard);
  return parts.join(". ");
}
function rankCell(c) {
  if (c.top10_rank) return '<div class="rank">' + c.top10_rank + "<small>Top 10</small></div>";
  var label = c.category === "rescue" ? "Rescue" : c.category === "supervisor" ? "Leaders" : "Annual";
  return '<div class="rank rescue">' + label + "</div>";
}

function courseStatus(course, rec, p) {
  var t = today();
  var due = p && p.dueDate ? parseDate(p.dueDate) : null;
  var info = { state: "assigned", label: "Not started", cls: "neutral", passedAt: null, validThrough: null, due: due, attempts: 0, best: null };
  if (rec) {
    var since = rec.passedAt ? rec.attempts.filter(function (a) { return a.at > rec.passedAt; }) : rec.attempts;
    info.attempts = since.length;
    rec.attempts.forEach(function (a) { if (info.best === null || a.score > info.best) info.best = a.score; });
    if (rec.passedAt) {
      info.passedAt = rec.passedAt;
      info.validThrough = addMonths(parseDate(rec.passedAt), course.renewal_months || 12);
      info.due = info.validThrough;
      var left = daysBetween(t, info.validThrough);
      if (left < 0) { info.state = "renewal_overdue"; info.label = "Renewal overdue"; info.cls = "danger"; }
      else if (left <= REMIND_DAYS) { info.state = "renewal_due"; info.label = "Renewal due in " + left + " day" + (left === 1 ? "" : "s"); info.cls = "warn"; }
      else { info.state = "completed"; info.label = "Completed"; info.cls = "ok"; }
      return info;
    }
    if (since.length) { info.state = "in_progress"; info.label = "In progress"; info.cls = "warn"; }
  }
  if (due && info.state !== "completed") {
    var d = daysBetween(t, due);
    if (d < 0) { info.state = "overdue"; info.label = "Overdue"; info.cls = "danger"; }
    else if (d <= REMIND_DAYS && info.state === "assigned") { info.label = "Due in " + d + " day" + (d === 1 ? "" : "s"); info.cls = "warn"; }
  }
  return info;
}
function certNumber(passedAt) {
  return "CERT-" + Math.floor(parseDate(passedAt).getTime() / 1000).toString(36).toUpperCase();
}

// ---- header
function renderHeader(routeName) {
  var p = profile();
  var menu = document.getElementById("user-menu");
  if (p && p.name) {
    menu.innerHTML = '<a class="user-name" href="#/profile" title="Edit your details">' + esc(p.name) + "<small>" + esc(p.jobTitle || divisionName(p.division) || "") + "</small></a>" +
      '<a class="btn btn-ghost btn-sm" href="#/profile">Edit</a>';
  } else {
    menu.innerHTML = '<a class="btn btn-ghost btn-sm" href="#/profile">Add your name</a>';
  }
  var links = document.querySelectorAll("#main-nav a");
  for (var i = 0; i < links.length; i++) links[i].classList.toggle("active", links[i].getAttribute("data-route") === routeName);
  document.getElementById("footer-left").textContent = APP + " by " + BRAND_COMPANY + ", browser edition";
  document.getElementById("footer-credits").textContent = LICENSE;
}

// ---- profile (optional)
function viewProfile(msg) {
  var p = who();
  var divs = DATA.divisions.map(function (d) {
    return '<option value="' + d.code + '"' + (p.division === d.code ? " selected" : "") + ">" + esc(d.name) + "</option>";
  }).join("");
  return '<div class="page-head"><div><h1>Your details</h1><p class="muted">Optional. Your name goes on certificates and reports, your division picks the modules shown first, and the due date drives the reminders. Everything here stays on this device.</p></div></div>' +
    '<div class="card setup-card">' + (msg ? flash("danger", msg) : "") +
    '<form data-form="profile" class="form-stack">' +
    '<label>Your name<input type="text" name="name" value="' + field(p.name) + '" autocomplete="name"></label>' +
    '<label>Job title<input type="text" name="jobTitle" value="' + field(p.jobTitle) + '" placeholder="Journeyman lineworker, plant operator, equipment operator"></label>' +
    '<label>Division<select name="division"><option value="">Choose a division</option>' + divs + "</select></label>" +
    '<label>Organization<input type="text" name="organization" value="' + field(p.organization) + '" placeholder="Shown on certificates and printed reports"></label>' +
    '<label class="checkbox"><input type="checkbox" name="newHire"' + (p.newHire ? " checked" : "") + "> I am a new hire (shows the new hire required track first)</label>" +
    '<label class="checkbox"><input type="checkbox" name="supervisor"' + (p.supervisor ? " checked" : "") + "> I supervise or manage others (adds the supervisor training)</label>" +
    '<label>Your email<input type="email" name="email" value="' + field(p.email) + '"></label>' +
    '<label>Supervisor name<input type="text" name="supervisorName" value="' + field(p.supervisorName) + '"></label>' +
    '<label>Supervisor email<input type="email" name="supervisorEmail" value="' + field(p.supervisorEmail) + '"><div class="inline-note">Used by the "Email my record" and "Email this report" buttons.</div></label>' +
    '<label>Training due date<input type="date" name="dueDate" value="' + field(p.dueDate) + '"><div class="inline-note">Modules you have not passed yet show as due on this date. Calendar reminders come from My record.</div></label>' +
    '<div class="form-actions"><button class="btn btn-primary" type="submit">Save</button> <a class="btn btn-ghost" href="#/">Cancel</a>' +
    (p.name ? ' <button class="btn btn-ghost" type="button" data-action="clear-profile">Clear my details</button>' : "") + "</div></form></div>";
}
FORMS.profile = function (form) {
  var f = form.elements;
  var data = { name: f.name.value.trim(), jobTitle: f.jobTitle.value.trim(), division: f.division.value, organization: f.organization.value.trim(), newHire: f.newHire.checked, supervisor: f.supervisor.checked, email: f.email.value.trim(), supervisorName: f.supervisorName.value.trim(), supervisorEmail: f.supervisorEmail.value.trim(), dueDate: f.dueDate.value };
  if (!store.set("profile", data)) { app.innerHTML = viewProfile("This browser is blocking local storage, so nothing can be saved. Try another browser or turn off private browsing."); return; }
  if (data.division) store.set("division_filter", data.division);
  if (data.newHire) store.set("track_filter", "new_hire");
  pendingMessage = { kind: "success", text: "Saved." };
  go("#/");
};
ACTIONS["clear-profile"] = function () {
  if (!confirm("Clear your name and details from this device? Your training progress stays.")) return;
  store.remove("profile"); store.remove("division_filter"); store.remove("track_filter");
  go("#/");
};

// ---- training page
function viewDashboard() {
  var p = who();
  var recs = records();
  var filter = divisionFilter(), track = trackFilter();
  var courses = coursesFor(filter, track);
  var todo = [], done = [];
  courses.forEach(function (c) {
    var s = courseStatus(c, recs[c.slug], p);
    (s.state === "completed" ? done : todo).push({ course: c, status: s });
  });
  var order = { renewal_overdue: 0, overdue: 0, renewal_due: 1, in_progress: 2, assigned: 3 };
  var catOrder = { osha_top10: 0, general: 1, rescue: 2, supervisor: 3 };
  todo.sort(function (a, b) { return (order[a.status.state] || 3) - (order[b.status.state] || 3) || (catOrder[a.course.category] || 0) - (catOrder[b.course.category] || 0) || (a.course.top10_rank || 99) - (b.course.top10_rank || 99); });
  var pct = courses.length ? Math.round(100 * done.length / courses.length) : 0;

  var chips = [{ code: "all", name: "All divisions" }].concat(DATA.divisions).map(function (d) {
    return '<button type="button" class="chip' + (filter === d.code ? " active" : "") + '" data-action="set-division" data-division="' + d.code + '">' + esc(d.name) + "</button>";
  }).join("");
  var trackChips = Object.keys(LABELS.tracks).map(function (t) {
    return '<button type="button" class="chip' + (track === t ? " active" : "") + '" data-action="set-track" data-track="' + t + '">' + esc(LABELS.tracks[t]) + "</button>";
  }).join("");

  function row(item) {
    var c = item.course, s = item.status;
    var action = s.state === "completed"
      ? '<a class="btn btn-sm btn-ghost" href="#/certificate/' + c.slug + '">Certificate</a>'
      : '<a class="btn btn-sm btn-primary" href="#/course/' + c.slug + '">' + (s.state === "in_progress" || s.passedAt ? "Continue" : "Start") + "</a>";
    var sub = s.passedAt ? "Passed " + fmtDate(s.passedAt) + ", valid through " + fmtDate(s.validThrough) : (s.due ? "Due " + fmtDate(s.due) : (s.attempts ? s.attempts + " attempt" + (s.attempts === 1 ? "" : "s") + " so far" : ""));
    var tags = (c.new_hire ? '<span class="tag">New hire</span>' : "") + (c.category === "supervisor" ? '<span class="tag">Supervisors</span>' : "");
    return '<li class="ledger-row">' + rankCell(c) +
      '<div class="ledger-main"><h3><a href="#/course/' + c.slug + '">' + esc(c.title) + "</a>" + tags + '</h3><div class="meta"><span>' + esc(c.standard || "") + "</span><span>" + c.duration_minutes + " min</span><span>10 question quiz</span></div></div>" +
      '<div class="ledger-status">' + badge(s.cls, s.label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>" +
      '<div class="ledger-action">' + action + "</div></li>";
  }

  var greeting = p.name ? "Welcome back, " + esc(p.name.split(" ")[0]) : "Annual safety training";
  var trackNote = track === "new_hire" ? "New hire required modules. Complete these in your first weeks on the job, before any work that needs them." : track === "supervisor" ? "Training for supervisors and managers." : "Open a module, read it through, then pass the 10 question quiz. Nothing to sign up for: your progress is saved on this device" + (p.name ? "." : ', and you can <a href="#/profile" style="color:#fff">add your name</a> whenever you want it on a certificate.');
  return '<section class="hero"><div><h1>' + greeting + "</h1><p>" + trackNote + "</p></div>" +
    '<div class="progress-block"><div class="progress-title"><span>Modules current</span><strong>' + done.length + " of " + courses.length + '</strong></div><div class="progress"><div style="width:' + pct + '%"></div></div><p class="progress-note">Each module renews 12 months after you pass it.</p></div>' +
    '<div class="chips"><span class="chips-label">Division</span>' + chips + "</div>" +
    '<div class="chips"><span class="chips-label">Track</span>' + trackChips + "</div></section>" +
    '<section class="card">' +
    (todo.length ? '<div class="card-head"><h2>To do</h2><span class="muted small">' + todo.length + " module" + (todo.length === 1 ? "" : "s") + '</span></div><ul class="ledger">' + todo.map(row).join("") + "</ul>" : "<h2>To do</h2><p class=\"empty\">Everything in this view is current.</p>") +
    "</section>" +
    (done.length ? '<section class="card"><div class="card-head"><h2>Completed</h2><span class="muted small">' + done.length + " module" + (done.length === 1 ? "" : "s") + '</span></div><ul class="ledger">' + done.map(row).join("") + "</ul></section>" : "") +
    viewIncidentSummary();
}
ACTIONS["set-division"] = function (el) { store.set("division_filter", el.getAttribute("data-division")); render(); };
ACTIONS["set-track"] = function (el) { store.set("track_filter", el.getAttribute("data-track")); render(); };

// ---- course, quiz, result
function viewCourse(slug) {
  var c = courseBySlug(slug);
  if (!c) return notFound();
  var s = courseStatus(c, records()[slug], who());
  var toc = '<li><a href="#objectives">Learning objectives</a></li>' + c.sections.map(function (sec, i) {
    return '<li><a href="#section-' + (i + 1) + '">' + esc(sec.heading) + "</a></li>";
  }).join("") + '<li><a href="#takeaways">Key takeaways</a></li><li><a href="#quiz">Quiz</a></li>';
  var sections = c.sections.map(function (sec, i) {
    return '<section id="section-' + (i + 1) + '" class="course-section"><h2>' + (i + 1) + ". " + esc(sec.heading) + '</h2><div class="prose">' + sec.html + "</div></section>";
  }).join("");
  var quiz = s.state === "completed"
    ? "<p>You passed this module on " + esc(fmtDate(s.passedAt)) + ". It is valid through " + esc(fmtDate(s.validThrough)) + '.</p><div class="btn-row"><a class="btn btn-primary" href="#/certificate/' + c.slug + '">View certificate</a><a class="btn btn-ghost" href="#/quiz/' + c.slug + '">Take the quiz again</a></div>'
    : "<p>10 questions, " + PASS + "% to pass. You can retake it as many times as you need." + (s.attempts ? " Attempts so far: " + s.attempts + "." : "") + '</p><a class="btn btn-primary btn-lg" href="#/quiz/' + c.slug + '">Start the quiz</a>';
  return '<div class="page-head"><div><p class="eyebrow">' + esc(courseKicker(c)) + "</p><h1>" + esc(c.title) + '</h1><p class="muted">' + esc(c.summary) + "</p></div>" +
    '<div class="actions">' + badge(s.cls, s.state === "completed" ? "Completed " + fmtDate(s.passedAt) : (s.due ? "Due " + fmtDate(s.due) : s.label)) + ' <a class="btn btn-primary" href="#quiz">Go to the quiz</a></div></div>' +
    '<div class="course-layout"><aside class="course-toc no-print"><div class="card sticky"><h3>In this module</h3><ol>' + toc + '</ol><p class="small muted">About ' + c.duration_minutes + " minutes to read.</p></div></aside>" +
    '<article class="course-body card"><section id="objectives"><h2>Learning objectives</h2><ul>' + c.objectives.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul></section>" +
    sections +
    '<section id="takeaways" class="takeaways"><h2>Key takeaways</h2><ul>' + c.key_takeaways.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></section>" +
    '<section id="quiz" class="quiz-callout"><h2>Quiz</h2>' + quiz + "</section></article></div>";
}

function shuffledOrder(n) {
  var a = [];
  for (var i = 0; i < n; i++) a.push(i);
  for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
  return a;
}

function viewQuiz(slug, errorMsg) {
  var c = courseBySlug(slug);
  if (!c) return notFound();
  var state = session.get("quiz:" + slug, null);
  if (!state) { state = { order: shuffledOrder(c.questions.length), answers: {} }; session.set("quiz:" + slug, state); }
  var answered = Object.keys(state.answers).length;
  var items = state.order.map(function (qi, n) {
    var q = c.questions[qi];
    return '<fieldset class="question"><legend><span class="qnum">' + (n + 1) + "</span><span>" + esc(q.text) + "</span></legend>" + q.options.map(function (opt, oi) {
      var checked = state.answers[qi] === oi ? " checked" : "";
      return '<label class="option"><input type="radio" name="q' + qi + '" value="' + oi + '"' + checked + '><span class="opt-letter">' + LETTERS[oi] + "</span><span>" + esc(opt) + "</span></label>";
    }).join("") + "</fieldset>";
  }).join("");
  return '<div class="page-head"><div><p class="eyebrow">Quiz</p><h1>' + esc(c.title) + '</h1><p class="muted">Answer all 10 questions. ' + PASS + '% is required to pass. <a href="#/course/' + c.slug + '">Back to the module</a></p></div></div>' +
    (errorMsg ? flash("danger", errorMsg) : "") +
    '<form data-form="quiz" data-slug="' + c.slug + '" data-change="quiz" class="card quiz-form">' + items +
    '<div class="quiz-bar"><span class="count"><strong id="answered-count">' + answered + "</strong> of " + c.questions.length + ' answered</span><button class="btn btn-primary btn-lg" type="submit">Submit answers</button></div></form>';
}
CHANGES.quiz = function (form, e) {
  var slug = form.getAttribute("data-slug");
  var counter = document.getElementById("answered-count");
  if (counter) counter.textContent = form.querySelectorAll("input[type=radio]:checked").length;
  var state = session.get("quiz:" + slug, null);
  if (state && e.target && e.target.name) { state.answers[parseInt(e.target.name.slice(1), 10)] = parseInt(e.target.value, 10); session.set("quiz:" + slug, state); }
};
FORMS.quiz = function (form) {
  var slug = form.getAttribute("data-slug");
  var c = courseBySlug(slug);
  var state = session.get("quiz:" + slug, { order: shuffledOrder(c.questions.length), answers: {} });
  var answers = [], score = 0, missing = 0;
  state.order.forEach(function (qi) {
    var picked = form.querySelector('input[name="q' + qi + '"]:checked');
    var chosen = picked ? parseInt(picked.value, 10) : null;
    if (chosen === null) missing++; else state.answers[qi] = chosen;
    var correct = chosen !== null && chosen === c.questions[qi].answer;
    if (correct) score++;
    answers.push({ q: qi, chosen: chosen, correct: correct });
  });
  if (missing) { session.set("quiz:" + slug, state); app.innerHTML = viewQuiz(slug, "Please answer every question (" + missing + " left blank)."); window.scrollTo(0, 0); return; }
  var total = c.questions.length;
  var passed = Math.round(100 * score / total) >= PASS;
  var recs = records();
  var rec = recs[slug] || { attempts: [], passedAt: null, history: [] };
  var at = nowISO();
  rec.attempts.push({ at: at, score: score, total: total, passed: passed, answers: answers });
  if (passed) {
    var since = rec.passedAt ? rec.attempts.filter(function (a) { return a.at > rec.passedAt; }).length : rec.attempts.length;
    rec.passedAt = at;
    rec.history.push({ passedAt: at, score: score, total: total, attemptsUsed: since });
  }
  recs[slug] = rec;
  saveRecords(recs);
  session.set("quiz:" + slug, null);
  go("#/result/" + slug + "/" + (rec.attempts.length - 1));
};

function viewResult(slug, index) {
  var c = courseBySlug(slug);
  var rec = records()[slug];
  if (!c || !rec || !rec.attempts[index]) return notFound();
  var a = rec.attempts[index];
  var pct = Math.round(100 * a.score / a.total);
  var p = who();
  var review = a.answers.map(function (row, n) {
    var q = c.questions[row.q];
    return '<div class="review-item ' + (row.correct ? "correct" : "incorrect") + '"><p class="review-q"><span class="qnum">' + (n + 1) + "</span><span>" + esc(q.text) + "</span></p>" +
      '<p class="small">Your answer: <strong>' + (row.chosen === null ? "(blank)" : esc(q.options[row.chosen])) + "</strong> " + (row.correct ? badge("ok", "Correct") : badge("danger", "Incorrect")) + "</p>" +
      (row.correct ? "" : '<p class="small">Correct answer: <strong>' + esc(q.options[q.answer]) + "</strong></p>") +
      (q.explanation ? '<p class="small muted">' + esc(q.explanation) + "</p>" : "") + "</div>";
  }).join("");
  var banner = a.passed
    ? "<h2>Passed with " + pct + "%</h2><p>Your completion is saved on this device" + (p.supervisorName ? ". Email your record to " + esc(p.supervisorName) + " from My record" : "") + ". This module renews in " + (c.renewal_months || 12) + ' months.</p><div class="btn-row"><a class="btn btn-primary" href="#/certificate/' + c.slug + '">View certificate</a><a class="btn btn-ghost" href="#/">Back to training</a></div>'
    : "<h2>Not yet: " + pct + "% (" + PASS + '% needed)</h2><p>Look over the questions you missed, re-read those sections, then try again.</p><div class="btn-row"><a class="btn btn-primary" href="#/quiz/' + c.slug + '">Retake the quiz</a><a class="btn btn-ghost" href="#/course/' + c.slug + '">Back to the module</a></div>';
  return '<div class="page-head"><div><p class="eyebrow">Quiz results</p><h1>' + esc(c.title) + "</h1></div></div>" +
    '<section class="card result-banner ' + (a.passed ? "pass" : "fail") + '"><div class="result-score">' + a.score + "<span>/" + a.total + "</span></div><div>" + banner + "</div></section>" +
    '<section class="card"><h2>Answer review</h2>' + review + "</section>";
}

// ---- certificate
function sealSVG(year) {
  return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="#0b3954" stroke-width="2"/><circle cx="50" cy="50" r="40" fill="none" stroke="#0b3954" stroke-width="1" stroke-dasharray="2 3"/><circle cx="50" cy="50" r="31" fill="#0b3954"/><path d="M35 51 L46 61 L66 39" fill="none" stroke="#8ff0c8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><text x="50" y="86" text-anchor="middle" font-family="Barlow Semi Condensed, Arial Narrow, Arial" font-weight="700" font-size="9" fill="#0b3954">' + esc(year) + "</text></svg>";
}
function viewCertificate(slug) {
  var c = courseBySlug(slug);
  var rec = records()[slug];
  var p = who();
  if (!c || !rec || !rec.passedAt) return notFound("No completion is recorded for this module on this device yet.");
  if (!p.name) {
    return '<div class="page-head"><div><h1>Certificate of completion</h1><p class="muted">Whose name goes on the certificate?</p></div></div>' +
      '<div class="card cert-prompt"><form data-form="cert-name" class="form-stack">' +
      '<label>Name<input type="text" name="name" required autocomplete="name" autofocus></label>' +
      '<label>Job title<input type="text" name="jobTitle" placeholder="Optional"></label>' +
      '<label>Division<select name="division"><option value="">Optional</option>' + DATA.divisions.map(function (d) { return '<option value="' + d.code + '">' + esc(d.name) + "</option>"; }).join("") + "</select></label>" +
      '<div class="form-actions"><button class="btn btn-primary" type="submit">Show my certificate</button><a class="btn btn-ghost" href="#/record">Back</a></div></form></div>';
  }
  var passedAt = rec.passedAt;
  var last = rec.history[rec.history.length - 1] || { score: 0, total: 10 };
  var validThrough = addMonths(parseDate(passedAt), c.renewal_months || 12);
  var subline = [p.jobTitle, divisionName(p.division), p.organization].filter(Boolean).map(esc).join(", ");
  return '<div class="no-print page-head"><div><h1>Certificate of completion</h1></div><div class="actions"><button class="btn btn-primary" type="button" data-action="print">Print or save as PDF</button> <a class="btn btn-ghost" href="#/record">Back</a></div></div>' +
    '<div class="certificate"><div class="cert-border">' +
    '<p class="cert-org">' + esc(p.organization || APP) + "</p>" +
    '<h1 class="cert-title">Certificate of Completion</h1>' +
    '<p class="cert-lead">This certifies that</p><p class="cert-name">' + esc(p.name) + "</p>" + (subline ? '<p class="cert-lead">' + subline + "</p>" : "") +
    '<p class="cert-lead">has successfully completed the annual safety training module</p><p class="cert-course">' + esc(c.title) + "</p>" +
    (c.standard ? '<p class="cert-std">' + esc(c.standard) + (c.standard_title ? ", " + esc(c.standard_title) : "") + "</p>" : "") +
    '<div class="cert-meta"><div><span>Completed</span><strong>' + esc(fmtDate(passedAt, true)) + "</strong></div><div><span>Quiz score</span><strong>" + last.score + " of " + last.total + " (" + Math.round(100 * last.score / last.total) + "%)</strong></div><div><span>Valid through</span><strong>" + esc(fmtDate(validThrough, true)) + "</strong></div><div><span>Certificate no.</span><strong>" + certNumber(passedAt) + "</strong></div></div>" +
    '<div class="cert-sign"><div><span class="line"></span>Employee signature</div><div><span class="line"></span>Supervisor' + (p.supervisorName ? ": " + esc(p.supervisorName) : "") + "</div></div>" +
    '<p class="cert-foot">' + esc(APP) + ". " + esc(LICENSE) + ".</p>" +
    '<div class="seal">' + sealSVG(parseDate(passedAt).getFullYear()) + "</div></div></div>";
}
FORMS["cert-name"] = function (form) {
  var f = form.elements;
  var data = who();
  data.name = f.name.value.trim(); data.jobTitle = f.jobTitle.value.trim(); data.division = f.division.value || data.division || "";
  if (!data.name) return;
  store.set("profile", data);
  render();
};
ACTIONS.print = function () { window.print(); };

// ---- record and exports
function recordRows(p) {
  var recs = records();
  return coursesFor(divisionFilter(), trackFilter()).map(function (c) {
    var s = courseStatus(c, recs[c.slug], p);
    var rec = recs[c.slug];
    var last = rec && rec.history.length ? rec.history[rec.history.length - 1] : null;
    return { course: c, status: s, rec: rec, last: last };
  });
}
function viewRecord() {
  var p = who();
  var recs = records();
  var rows = recordRows(p).map(function (r) {
    var c = r.course, s = r.status;
    return "<tr><td><strong>" + esc(c.title) + "</strong><br><small class=\"muted\">" + esc(c.standard || "") + "</small></td><td>" + badge(s.cls, s.label) + "</td><td>" + (s.passedAt ? esc(fmtDate(s.passedAt)) : "") + "</td><td class=\"num\">" + (r.last ? r.last.score + "/" + r.last.total : "") + "</td><td class=\"num\">" + (r.rec ? r.rec.attempts.length : 0) + "</td><td>" + (s.validThrough ? esc(fmtDate(s.validThrough)) : (s.due ? "Due " + esc(fmtDate(s.due)) : "")) + '</td><td class="actions-cell">' +
      (s.passedAt ? '<a class="btn btn-sm btn-ghost" href="#/certificate/' + c.slug + '">Certificate</a>' : '<a class="btn btn-sm btn-primary" href="#/course/' + c.slug + '">Open</a>') + "</td></tr>";
  }).join("");
  var history = [];
  Object.keys(recs).forEach(function (slug) {
    var c = courseBySlug(slug);
    if (!c) return;
    recs[slug].attempts.forEach(function (a) { history.push({ course: c, a: a }); });
  });
  history.sort(function (x, y) { return y.a.at < x.a.at ? -1 : 1; });
  var hrows = history.map(function (h) {
    return "<tr><td>" + esc(fmtDateTime(h.a.at)) + "</td><td>" + esc(h.course.title) + '</td><td class="num">' + h.a.score + "/" + h.a.total + "</td><td>" + (h.a.passed ? badge("ok", "Passed") : badge("danger", "Not passed")) + "</td></tr>";
  }).join("");
  var subtitle = [p.name, divisionName(p.division)].filter(Boolean).map(esc).join(", ") || "Showing " + esc(divisionFilter() === "all" ? "all divisions" : divisionName(divisionFilter()));
  return '<div class="page-head"><div><h1>My training record</h1><p class="muted">' + subtitle + '</p></div><div class="actions btn-row">' +
    '<button class="btn btn-ghost" type="button" data-action="export-ics">Add reminders to calendar</button>' +
    '<button class="btn btn-ghost" type="button" data-action="export-csv">Export CSV</button>' +
    '<button class="btn btn-secondary" type="button" data-action="export-xlsx">Export to Excel</button>' +
    '<a class="btn btn-primary" id="email-record" href="' + esc(recordMailto(p)) + '">Email my record</a></div></div>' +
    '<div class="notice">This record lives on this device. Export it to Excel for record keeping, email it to your supervisor after each completion, or print the certificate. Calendar reminders are set ' + REMIND_DAYS + " days before each due date and on the due date.</div>" +
    '<section class="card"><h2>Modules</h2><table class="table"><thead><tr><th>Module</th><th>Status</th><th>Passed</th><th class="num">Score</th><th class="num">Attempts</th><th>Valid through or due</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></section>" +
    '<section class="card"><h2>Quiz attempts</h2>' + (hrows ? '<table class="table compact"><thead><tr><th>When</th><th>Module</th><th class="num">Score</th><th>Result</th></tr></thead><tbody>' + hrows + "</tbody></table>" : '<p class="empty">No quiz attempts yet.</p>') + "</section>";
}
function recordText(p) {
  var lines = ["Safety training record" + (p.name ? " for " + p.name : "") + (p.jobTitle ? ", " + p.jobTitle : "") + (p.division ? " (" + divisionName(p.division) + ")" : ""), ""];
  recordRows(p).forEach(function (r) {
    lines.push("- " + r.course.title + ": " + (r.status.passedAt ? "passed " + fmtDate(r.status.passedAt) + ", valid through " + fmtDate(r.status.validThrough) : r.status.label.toLowerCase()));
  });
  lines.push("", "Generated " + fmtDateTime(new Date()) + " from " + APP + " (browser edition).");
  return lines.join("\n");
}
function recordMailto(p) {
  return "mailto:" + encodeURIComponent(p.supervisorEmail || "") + "?subject=" + encodeURIComponent("Safety training record" + (p.name ? ": " + p.name : "")) + "&body=" + encodeURIComponent(recordText(p));
}
function recordTable(p) {
  var head = ["Employee", "Division", "Module", "Standard", "Category", "New hire required", "Status", "Passed", "Score", "Attempts", "Valid through", "Certificate no."];
  var rows = recordRows(p).map(function (r) {
    var c = r.course, s = r.status;
    return [p.name || "", divisionName(p.division), c.title, c.standard || "", LABELS.categories[c.category] || c.category, c.new_hire ? "Yes" : "No", s.label, s.passedAt ? isoDate(parseDate(s.passedAt)) : "", r.last ? r.last.score + "/" + r.last.total : "", r.rec ? r.rec.attempts.length : 0, s.validThrough ? isoDate(s.validThrough) : "", s.passedAt ? certNumber(s.passedAt) : ""];
  });
  return [head].concat(rows);
}
function attemptsTable(p) {
  var recs = records();
  var rows = [["Employee", "When", "Module", "Score", "Total", "Result"]];
  Object.keys(recs).forEach(function (slug) {
    var c = courseBySlug(slug);
    if (!c) return;
    recs[slug].attempts.forEach(function (a) { rows.push([p.name || "", fmtDateTime(a.at), c.title, a.score, a.total, a.passed ? "Passed" : "Not passed"]); });
  });
  return rows;
}
ACTIONS["export-csv"] = function () { download("training-record.csv", recordTable(who()).map(function (r) { return r.map(csvCell).join(","); }).join("\r\n"), "text/csv"); };
ACTIONS["export-xlsx"] = function () {
  var p = who();
  var name = "training-record" + (p.name ? "-" + p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "") + "-" + isoDate(today()) + ".xlsx";
  download(name, xlsxBlob([{ name: "Training record", rows: recordTable(p) }, { name: "Quiz attempts", rows: attemptsTable(p) }]));
};
ACTIONS["export-ics"] = function () { download("safety-training-reminders.ics", icsText(who()), "text/calendar"); };
function icsText(p) {
  var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + APP + "//Browser edition//EN", "CALSCALE:GREGORIAN"];
  function event(d, id, summary, description) {
    var ds = isoDate(d).replace(/-/g, ""), de = isoDate(addDays(d, 1)).replace(/-/g, "");
    lines.push("BEGIN:VEVENT", "UID:" + id + "@safety-training", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""), "DTSTART;VALUE=DATE:" + ds, "DTEND;VALUE=DATE:" + de, "SUMMARY:" + summary.replace(/,/g, "\\,"), "DESCRIPTION:" + description.replace(/,/g, "\\,"), "END:VEVENT");
  }
  recordRows(p).forEach(function (r) {
    var due = r.status.validThrough || r.status.due;
    if (!due) return;
    var remind = addDays(due, -REMIND_DAYS);
    if (remind >= today()) event(remind, r.course.slug + "-30-" + isoDate(due), "Safety training due in " + REMIND_DAYS + " days: " + r.course.title, "Complete the " + r.course.title + " module and quiz before " + fmtDate(due) + ".");
    if (due >= today()) event(due, r.course.slug + "-due-" + isoDate(due), "Safety training due today: " + r.course.title, "The " + r.course.title + " module and quiz are due today.");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ---- catalog and about
function viewCatalog() {
  var top = DATA.top10 && DATA.top10.length ? DATA.top10[0] : null;
  var topHtml = "";
  if (top) {
    topHtml = '<p class="muted">Fiscal year ' + esc(top.fiscal_year) + " (" + esc(top.status) + "), " + esc(top.period) + '. Source: <a href="' + esc(top.source) + '" target="_blank" rel="noopener">OSHA</a>.</p><table class="table compact"><thead><tr><th class="num">Rank</th><th>Standard</th><th>Title</th><th class="num">Citations</th><th>Training module</th></tr></thead><tbody>' +
      top.standards.map(function (s) {
        var c = courseBySlug(s.course_slug);
        return '<tr><td class="num">' + s.rank + "</td><td>" + esc(s.standard) + "</td><td>" + esc(s.title) + '</td><td class="num">' + (s.citations ? Number(s.citations).toLocaleString("en-US") : "") + "</td><td>" + (c ? '<a href="#/course/' + c.slug + '">' + esc(c.title) + "</a>" : '<span class="muted">not yet in catalog</span>') + "</td></tr>";
      }).join("") + "</tbody></table>";
    if (DATA.top10.length > 1) {
      topHtml += '<details class="mt"><summary>Earlier years</summary>' + DATA.top10.slice(1).map(function (y) {
        return '<p class="small"><strong>FY ' + esc(y.fiscal_year) + "</strong> (" + esc(y.status) + "): " + y.standards.map(function (s) { return s.rank + ". " + esc(s.title); }).join("; ") + "</p>";
      }).join("") + "</details>";
    }
  }
  var rows = DATA.courses.map(function (c) {
    return "<tr><td><strong><a href=\"#/course/" + c.slug + '">' + esc(c.title) + '</a></strong><br><small class="muted">' + esc(c.summary) + "</small></td><td>" + esc(c.standard || "") + "</td><td>" + (c.top10_rank ? "Top 10, rank " + c.top10_rank : esc(LABELS.categories[c.category] || c.category)) + "</td><td>" + (c.new_hire ? "Yes" : "") + "</td><td>" + c.divisions.map(divisionName).map(esc).join(", ") + '</td><td class="num">' + c.duration_minutes + ' min</td><td class="num">' + c.renewal_months + " months</td></tr>";
  }).join("");
  return '<div class="page-head"><div><h1>Course catalog</h1><p class="muted">Annual training modules. Each module ends with a 10 question quiz; a score of ' + PASS + '% or better records completion.</p></div></div>' +
    '<section class="card"><h2>OSHA Top 10 most cited standards</h2>' + (topHtml || '<p class="empty">No Top 10 data loaded.</p>') + "</section>" +
    '<section class="card"><h2>Modules</h2><table class="table"><thead><tr><th>Module</th><th>Standard</th><th>Category</th><th>New hire</th><th>Applies to</th><th class="num">Time</th><th class="num">Renews every</th></tr></thead><tbody>' + rows + "</tbody></table></section>";
}

function viewAbout() {
  return '<div class="page-head"><div><h1>About ' + esc(APP) + '</h1></div></div><section class="card narrow">' +
    "<p>An annual safety training and incident management platform for electric, environmental and public services crews.</p>" +
    "<ul><li>Training modules for OSHA's Top 10 most frequently cited standards, bloodborne pathogens, fire safety, electrical safety, confined spaces, ergonomics and workplace violence, pole top and bucket truck rescue for electric and public services crews, and incident reporting and investigation for supervisors and managers. A new hire track marks the modules to complete first.</li><li>A 10 question quiz at the end of every module, with completion certificates and a training record that exports to Excel.</li><li>An eight-section incident report: incident information, vehicle and equipment, personal injury with a body diagram, description, principal and eyewitness statements signed on the device, facts and analysis with direct and contributing causes and the root cause, corrective actions with verification dates, supporting references, and a management signature block.</li><li>Site inspection checklists for construction and general industry, and an annual safety program audit.</li></ul>" +
    "<h3>Browser edition and full platform</h3><p>This site is the <strong>browser edition</strong>: everything runs in your browser, nothing is sent to a server, and your progress, reports and inspections stay on this device. Use it to read the modules, take the quizzes, print certificates and complete reports and inspections.</p>" +
    '<p>The <strong>full platform</strong> adds employee accounts, assignments by division or by individual from the safety manager, new hire assignments, automatic email reminders to employees and their supervisors 30 days before training is due, completion notices, statement links emailed to principals and witnesses, incident notices, and department-wide records and Excel exports. It runs on a small server; see the <a href="' + esc(DATA.repo) + '" target="_blank" rel="noopener">project repository</a>.</p>' +
    "<h3>About " + esc(BRAND_COMPANY) + "</h3><p>" + esc(APP) + " is the safety platform of " + esc(BRAND_COMPANY) + ".</p>" +
    "<h3>License</h3><p><strong>" + esc(LICENSE) + ".</strong> Copyright " + esc(DATA.year || new Date().getFullYear()) + " " + esc(COMPANY) + ". All rights reserved.</p>" +
    '<p class="muted small">Content generated ' + esc(fmtDate(DATA.generated)) + ". Training content summarizes OSHA standards for awareness-level annual refresher training. It does not replace the text of the standards, your organization's written programs and procedures, or the hands-on training and drills those programs require.</p></section>";
}

function notFound(msg) {
  return '<div class="auth-card"><h1>Not found</h1><p class="muted">' + esc(msg || "That page does not exist.") + '</p><a class="btn btn-primary" href="#/">Back to training</a></div>';
}

// ==== 50-incidents.js
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
    '<div class="grid-2"><section class="card"><h2><span class="section-no">1</span>Incident information</h2>' + kv([["Reported by", inc.reportedBy + (inc.reportedAt ? " on " + fmtDateTime(inc.reportedAt) : "")], ["Severity", LABELS.severities[inc.severity]], ["Work activity", inc.workActivity], ["Conditions", inc.weatherConditions], ["Employees involved", inc.employeesInvolved], ["Witnesses", inc.witnesses], ["Immediate actions", inc.immediateActions], ["Property damaged", inc.property.propertyDescription ? inc.property.propertyDescription + (inc.property.propertyOwner ? " (" + LABELS.owners[inc.property.propertyOwner] + ")" : "") + (inc.property.estimatedCost !== null ? ", " + money(inc.property.estimatedCost) : "") : ""], ["Investigator", [inc.investigator.name, inc.investigator.title].filter(Boolean).join(", ") + (inc.investigator.date ? ", started " + fmtDate(inc.investigator.date) : "")]]) + "</section>" +
    '<section class="card"><h2><span class="section-no">2</span>Vehicle and equipment</h2>' + kv([["Vehicle involved", ynText(v.involved)], ["Type", v.involved ? v.vehicleType : ""], ["Make and model", v.involved ? v.makeModel : ""], ["Plate and city vehicle no.", v.involved ? [v.licensePlate, v.cityVehicleNumber].filter(Boolean).join(" / ") : ""], ["Driver", v.involved ? v.driverName + (v.seatBeltUsed !== null ? ", seat belt " + (v.seatBeltUsed ? "yes" : "no") : "") : ""], ["Police report", v.involved ? v.policeReportNumber : ""], ["Drug and alcohol test", v.involved ? (LABELS.drugTests[v.drugAlcoholTest] || "") : ""], ["Damage estimate", v.involved ? money(v.damageEstimate) : ""], ["Preventability", v.involved ? LABELS.preventability[v.preventability || "undetermined"] : ""], ["Other party", v.involved ? v.otherParty : ""], ["Equipment involved", ynText(eq.involved)], ["Equipment", eq.involved ? eq.description : ""]]) +
    (v.involved && (v.damageMarks || []).length ? '<div class="diagram-small">' + vehicleDiagramSVG(v.damageMarks, false) + "</div>" : "") +
    (v.involved && v.sceneSketch ? '<img class="sketch-img" src="' + esc(v.sceneSketch) + '" alt="Scene sketch">' : "") +
    (eq.involved && eq.sketch ? '<img class="sketch-img" src="' + esc(eq.sketch) + '" alt="Equipment sketch">' : "") + "</section></div>" +
    '<div class="grid-2"><section class="card"><h2><span class="section-no">3</span>Personal injury</h2>' + kv([["Injury occurred", ynText(inj.occurred)], ["Injured person", inj.occurred ? inj.injuredPerson + (inj.injuredJobTitle ? ", " + inj.injuredJobTitle : "") : ""], ["Type of injury", inj.occurred ? inj.injuryTypes.concat(inj.injuryOther ? ["Other: " + inj.injuryOther] : []).filter(function (t) { return t !== "Other"; }).join(", ") : ""], ["Body parts", inj.occurred ? inj.bodyParts.concat(inj.bodyPartOther ? ["Other: " + inj.bodyPartOther] : []).filter(function (t) { return t !== "Other"; }).join(", ") : ""], ["Treatment", inj.occurred ? (LABELS.treatments[inj.treatment] || "") + (inj.treatmentProvider ? " (" + inj.treatmentProvider + ")" : "") : ""], ["Days away / restricted", inj.occurred ? (inj.daysAway === null ? 0 : inj.daysAway) + " / " + (inj.daysRestricted === null ? 0 : inj.daysRestricted) : ""], ["OSHA recordable", inj.occurred ? ynText(inj.oshaRecordable, "Not yet determined") : ""]]) +
    (inj.occurred && (inj.bodyMarks || []).length ? '<div class="diagram-small">' + bodyDiagramSVG(inj.bodyMarks, false) + "</div>" : "") + "</section>" +
    '<section class="card"><h2><span class="section-no">4</span>Incident description</h2><p class="pre">' + esc(inc.description) + "</p></section></div>" +
    '<section class="card"><div class="card-head"><h2><span class="section-no">5</span>Principal statement</h2><button class="btn btn-sm btn-secondary" type="button" data-action="add-statement" data-role="principal">Add principal statement</button></div><p class="muted small">The principal party gives their own account and signs it on this device without seeing the rest of the report, or on a printed form. Add one page per party.</p>' +
    (principals.length ? principals.map(function (s) { return statementRow(inc, s, true); }).join("") : '<p class="empty">No principal statement yet.</p>') + "</section>" +
    '<section class="card"><div class="card-head"><h2><span class="section-no">6</span>Eyewitness statements</h2><button class="btn btn-sm btn-secondary" type="button" data-action="add-statement" data-role="witness">Add eyewitness statement</button></div>' +
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
ACTIONS["add-statement"] = function (el) {
  var inc = findIncident(currentRoute().parts[1]);
  if (!inc) return;
  var s = { id: uid(), role: el.getAttribute("data-role"), printedName: "", department: "", title: "", statement: "", signature: "", signedAt: null, signedVia: "", status: "pending", createdAt: nowISO() };
  inc.statements.push(s);
  updateIncident(inc);
  go("#/statement/" + encodeURIComponent(inc.id) + "/" + s.id);
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

// ==== 60-inspections.js
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

// ==== 90-router.js
// ---------------------------------------------------------------- router and event delegation
function parseRoute() {
  var hash = location.hash || "#/";
  var q = {};
  var qi = hash.indexOf("?");
  if (qi >= 0) {
    hash.slice(qi + 1).split("&").forEach(function (pair) { var kv = pair.split("="); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); });
    hash = hash.slice(0, qi);
  }
  var parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { parts: parts, query: q };
}
var lastRoute = null;
function currentRoute() { return lastRoute || parseRoute(); }
function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

function render() {
  var r = parseRoute();
  lastRoute = r;
  var parts = r.parts;
  var name = parts[0] || "dashboard";
  var html = "", printPage = false, statementMode = false, nav = name;
  if (name === "dashboard") html = viewDashboard();
  else if (name === "profile") { html = viewProfile(); nav = "dashboard"; }
  else if (name === "course" && parts[1]) { html = viewCourse(parts[1]); nav = "dashboard"; }
  else if (name === "quiz" && parts[1]) { html = viewQuiz(parts[1]); nav = "dashboard"; }
  else if (name === "result" && parts[1]) { html = viewResult(parts[1], parseInt(parts[2], 10)); nav = "dashboard"; }
  else if (name === "certificate" && parts[1]) { html = viewCertificate(parts[1]); printPage = !!who().name; nav = "record"; }
  else if (name === "record") html = viewRecord();
  else if (name === "catalog") html = viewCatalog();
  else if (name === "about") html = viewAbout();
  else if (name === "statement" && parts[1] && parts[2]) {
    var sInc = findIncident(parts[1]);
    var st = sInc && findStatement(sInc, parts[2]);
    if (!st) html = notFound("That statement is not on this device.");
    else { html = viewStatement(sInc, st, false); statementMode = true; }
    nav = "incidents";
  }
  else if (name === "incidents") {
    if (!parts[1]) html = viewIncidents(r.query);
    else if (parts[1] === "new") html = viewIncidentForm(emptyIncident(who()), false, null);
    else {
      var inc = findIncident(parts[1]);
      if (!inc) html = notFound("That report is not stored on this device.");
      else if (parts[2] === "edit") html = viewIncidentForm(inc, true, null);
      else if (parts[2] === "investigation") { html = viewInvestigation(inc, pendingMessage); pendingMessage = null; }
      else if (parts[2] === "print") { html = viewIncidentPrint(inc); printPage = true; }
      else if (parts[2] === "statements" && parts[3]) {
        var s2 = findStatement(inc, parts[3]);
        if (!s2) html = notFound("That statement is not on this device.");
        else if (parts[4] === "form") { html = viewStatementBlank(inc, s2); printPage = true; }
        else if (parts[4] === "paper") html = viewStatement(inc, s2, true);
        else html = viewIncidentDetail(inc);
      }
      else html = viewIncidentDetail(inc);
    }
  }
  else if (name === "inspections") {
    if (!parts[1]) html = viewInspections();
    else {
      var ins = findInspection(parts[1]);
      if (!ins) html = notFound("That inspection is not stored on this device.");
      else if (parts[2] === "print") { html = viewInspectionPrint(ins); printPage = true; }
      else html = viewInspection(ins);
    }
  }
  else html = notFound();
  document.body.classList.toggle("print-page", printPage);
  document.body.classList.toggle("statement-mode", statementMode);
  if (pendingMessage) { html = flash(pendingMessage.kind, pendingMessage.text) + html; pendingMessage = null; }
  app.innerHTML = html;
  renderHeader(nav);
  bindWidgets(app);
  bindAnchors();
  if (location.hash.indexOf("#signatures") < 0) window.scrollTo(0, 0);
}

// In-page links (table of contents, "Go to the quiz") scroll instead of changing the route.
function bindAnchors() {
  var anchors = app.querySelectorAll('a[href^="#"]:not([href^="#/"])');
  for (var i = 0; i < anchors.length; i++) {
    anchors[i].addEventListener("click", function (e) {
      var target = document.getElementById(this.getAttribute("href").slice(1));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
  }
}

// One set of listeners for every page: buttons carry data-action, forms data-form, inputs data-change.
app.addEventListener("click", function (e) {
  var el = e.target.closest ? e.target.closest("[data-action]") : null;
  if (!el || !app.contains(el)) return;
  var handler = ACTIONS[el.getAttribute("data-action")];
  if (handler) { e.preventDefault(); handler(el, e); }
});
app.addEventListener("submit", function (e) {
  var form = e.target;
  var handler = form.getAttribute && FORMS[form.getAttribute("data-form")];
  if (handler) { e.preventDefault(); handler(form, e); }
});
app.addEventListener("change", function (e) {
  var el = e.target.closest ? e.target.closest("[data-change]") : null;
  if (!el) return;
  var handler = CHANGES[el.getAttribute("data-change")];
  if (handler) handler(el, e);
});

window.addEventListener("hashchange", render);
render();

})();
