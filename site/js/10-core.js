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
