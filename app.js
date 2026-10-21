/* Safety Training, browser edition.
   Runs entirely in the browser. Progress and incident reports are saved in this
   browser's local storage. Course content comes from data.js. */
(function () {
  "use strict";

  var DATA = window.SAFETY_DATA || { courses: [], divisions: [], top10: [] };
  var APP = DATA.app_name || "Safety Training";
  var COMPANY = DATA.company || "Tompkins Software Systems LLC";
  var LICENSE = DATA.license_line || ("Licensed software by " + COMPANY);
  var PASS = DATA.pass_percent || 80;
  var REMIND_DAYS = 30;
  var app = document.getElementById("app");

  // ------------------------------------------------------------ storage
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
  function incidents() { return store.get("incidents", []); }
  function saveIncidents(list) { store.set("incidents", list); }
  function divisionFilter() {
    var f = store.get("division_filter", null);
    if (f) return f;
    return who().division || "all";
  }

  // ------------------------------------------------------------ labels and helpers
  var LABELS = {
    types: { injury: "Personal injury or illness", property_damage: "Property damage", vehicle: "Vehicle incident" },
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
    actionStatuses: { open: "Open", in_progress: "In progress", completed: "Completed" }
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
  function divisionName(code) {
    for (var i = 0; i < DATA.divisions.length; i++) if (DATA.divisions[i].code === code) return DATA.divisions[i].name;
    return code || "";
  }
  function courseBySlug(slug) {
    for (var i = 0; i < DATA.courses.length; i++) if (DATA.courses[i].slug === slug) return DATA.courses[i];
    return null;
  }
  function coursesFor(filter) {
    return DATA.courses.filter(function (c) { return !filter || filter === "all" || c.divisions.indexOf(filter) >= 0; });
  }
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain" });
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
  function flash(kind, text) { return '<div class="flashes"><div class="flash flash-' + kind + '">' + esc(text) + "</div></div>"; }
  function courseKicker(c) {
    var parts = [c.top10_rank ? "OSHA Top 10, rank " + c.top10_rank : "Rescue training"];
    if (c.standard) parts.push(c.standard);
    return parts.join(". ");
  }

  // ------------------------------------------------------------ training status
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
    var n = Math.floor(parseDate(passedAt).getTime() / 1000).toString(36).toUpperCase();
    return "CERT-" + n;
  }

  // ------------------------------------------------------------ header and footer
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
    document.getElementById("footer-left").textContent = APP + ", browser edition";
    document.getElementById("footer-credits").textContent = LICENSE;
  }

  // ------------------------------------------------------------ profile (optional)
  function viewProfile(msg) {
    var p = who();
    var divs = DATA.divisions.map(function (d) {
      return '<option value="' + d.code + '"' + (p.division === d.code ? " selected" : "") + ">" + esc(d.name) + "</option>";
    }).join("");
    return '<div class="page-head"><div><h1>Your details</h1><p class="muted">Optional. Your name goes on certificates and reports, your division picks the modules shown first, and the due date drives the reminders. Everything here stays on this device.</p></div></div>' +
      '<div class="card setup-card">' +
      (msg ? flash("danger", msg) : "") +
      '<form id="profile-form" class="form-stack">' +
      '<label>Your name<input type="text" name="name" value="' + esc(p.name) + '" autocomplete="name"></label>' +
      '<label>Job title<input type="text" name="jobTitle" value="' + esc(p.jobTitle) + '" placeholder="Journeyman lineworker, plant operator, equipment operator"></label>' +
      '<label>Division<select name="division"><option value="">Choose a division</option>' + divs + "</select></label>" +
      '<label>Organization<input type="text" name="organization" value="' + esc(p.organization) + '" placeholder="Shown on certificates and printed reports"></label>' +
      '<label>Your email<input type="email" name="email" value="' + esc(p.email) + '"></label>' +
      '<label>Supervisor name<input type="text" name="supervisorName" value="' + esc(p.supervisorName) + '"></label>' +
      '<label>Supervisor email<input type="email" name="supervisorEmail" value="' + esc(p.supervisorEmail) + '"><div class="inline-note">Used by the "Email my record" and "Email this report" buttons.</div></label>' +
      '<label>Training due date<input type="date" name="dueDate" value="' + esc(p.dueDate) + '"><div class="inline-note">Modules you have not passed yet show as due on this date. Calendar reminders come from My record.</div></label>' +
      '<div class="form-actions"><button class="btn btn-primary" type="submit">Save</button> <a class="btn btn-ghost" href="#/">Cancel</a>' +
      (p.name ? ' <button class="btn btn-ghost" type="button" id="clear-profile">Clear my details</button>' : "") + "</div></form></div>";
  }

  // ------------------------------------------------------------ training page
  function viewDashboard() {
    var p = who();
    var recs = records();
    var filter = divisionFilter();
    var courses = coursesFor(filter);
    var todo = [], done = [];
    courses.forEach(function (c) {
      var s = courseStatus(c, recs[c.slug], p);
      (s.state === "completed" ? done : todo).push({ course: c, status: s });
    });
    var order = { renewal_overdue: 0, overdue: 0, renewal_due: 1, in_progress: 2, assigned: 3 };
    todo.sort(function (a, b) { return (order[a.status.state] || 3) - (order[b.status.state] || 3) || (a.course.top10_rank || 99) - (b.course.top10_rank || 99); });
    var pct = courses.length ? Math.round(100 * done.length / courses.length) : 0;

    var chips = [{ code: "all", name: "All divisions" }].concat(DATA.divisions).map(function (d) {
      return '<button type="button" class="chip' + (filter === d.code ? " active" : "") + '" data-division="' + d.code + '">' + esc(d.name) + "</button>";
    }).join("");

    function row(item) {
      var c = item.course, s = item.status;
      var action = s.state === "completed"
        ? '<a class="btn btn-sm btn-ghost" href="#/certificate/' + c.slug + '">Certificate</a>'
        : '<a class="btn btn-sm btn-primary" href="#/course/' + c.slug + '">' + (s.state === "in_progress" || s.passedAt ? "Continue" : "Start") + "</a>";
      var rank = c.top10_rank ? '<div class="rank">' + c.top10_rank + "<small>Top 10</small></div>" : '<div class="rank rescue">Rescue</div>';
      var sub = s.passedAt ? "Passed " + fmtDate(s.passedAt) + ", valid through " + fmtDate(s.validThrough) : (s.due ? "Due " + fmtDate(s.due) : (s.attempts ? s.attempts + " attempt" + (s.attempts === 1 ? "" : "s") + " so far" : ""));
      return '<li class="ledger-row">' + rank +
        '<div class="ledger-main"><h3><a href="#/course/' + c.slug + '">' + esc(c.title) + '</a></h3><div class="meta"><span>' + esc(c.standard || "") + "</span><span>" + c.duration_minutes + " min</span><span>10 question quiz</span></div></div>" +
        '<div class="ledger-status">' + badge(s.cls, s.label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>" +
        '<div class="ledger-action">' + action + "</div></li>";
    }

    var greeting = p.name ? "Welcome back, " + esc(p.name.split(" ")[0]) : "Annual safety training";
    return '<section class="hero"><div><h1>' + greeting + "</h1>" +
      "<p>Open a module, read it through, then pass the 10 question quiz. Nothing to sign up for: your progress is saved on this device" + (p.name ? "" : ', and you can <a href="#/profile" style="color:#fff">add your name</a> whenever you want it on a certificate') + ".</p>" +
      "</div>" +
      '<div class="progress-block"><div class="progress-title"><span>Modules current</span><strong>' + done.length + " of " + courses.length + '</strong></div><div class="progress"><div style="width:' + pct + '%"></div></div><p class="progress-note">Each module renews 12 months after you pass it.</p></div>' +
      '<div class="chips"><span class="chips-label">Show modules for</span>' + chips + "</div></section>" +
      '<section class="card">' +
      (todo.length ? '<div class="card-head"><h2>To do</h2><span class="muted small">' + todo.length + " module" + (todo.length === 1 ? "" : "s") + '</span></div><ul class="ledger">' + todo.map(row).join("") + "</ul>" : "<h2>To do</h2><p class=\"empty\">Everything in this view is current.</p>") +
      "</section>" +
      (done.length ? '<section class="card"><div class="card-head"><h2>Completed</h2><span class="muted small">' + done.length + " module" + (done.length === 1 ? "" : "s") + '</span></div><ul class="ledger">' + done.map(row).join("") + "</ul></section>" : "") +
      viewIncidentSummary();
  }

  function viewIncidentSummary() {
    var list = incidents().slice().sort(function (a, b) { return b.reportedAt < a.reportedAt ? -1 : 1; }).slice(0, 5);
    var rows = list.map(function (i) {
      return "<tr><td><a href=\"#/incidents/" + encodeURIComponent(i.id) + '">' + esc(i.id) + "</a></td><td>" + esc(LABELS.types[i.type]) + "</td><td>" + esc(fmtDate(i.occurredAt)) + "</td><td>" + badge(statusCls(i.status), LABELS.statuses[i.status]) + "</td></tr>";
    }).join("");
    return '<section class="card"><div class="card-head"><h2>Incidents</h2><a class="btn btn-sm btn-secondary" href="#/incidents/new">Report an incident</a></div>' +
      (rows ? '<table class="table compact"><thead><tr><th>Number</th><th>Type</th><th>Date</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table>"
        : '<p class="empty">No incidents recorded on this device. Report any injury, property damage or vehicle incident, including near misses.</p>') + "</section>";
  }

  // ------------------------------------------------------------ course, quiz, result
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
      '<form id="quiz-form" class="card quiz-form">' + items +
      '<div class="quiz-bar"><span class="count"><strong id="answered-count">' + answered + "</strong> of " + c.questions.length + ' answered</span><button class="btn btn-primary btn-lg" type="submit">Submit answers</button></div></form>';
  }

  function gradeQuiz(slug, form) {
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
    if (missing) { session.set("quiz:" + slug, state); return { missing: missing }; }
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
    return { attemptIndex: rec.attempts.length - 1 };
  }

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

  // ------------------------------------------------------------ certificate
  function sealSVG(year) {
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="46" fill="none" stroke="#173a5e" stroke-width="2"/>' +
      '<circle cx="50" cy="50" r="40" fill="none" stroke="#173a5e" stroke-width="1" stroke-dasharray="2 3"/>' +
      '<circle cx="50" cy="50" r="31" fill="#173a5e"/>' +
      '<path d="M35 51 L46 61 L66 39" fill="none" stroke="#c6e33b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<text x="50" y="86" text-anchor="middle" font-family="Barlow Semi Condensed, Arial Narrow, Arial" font-weight="700" font-size="9" fill="#173a5e">' + esc(year) + "</text></svg>";
  }

  function viewCertificate(slug) {
    var c = courseBySlug(slug);
    var rec = records()[slug];
    var p = who();
    if (!c || !rec || !rec.passedAt) return notFound("No completion is recorded for this module on this device yet.");
    if (!p.name) {
      return '<div class="page-head"><div><h1>Certificate of completion</h1><p class="muted">Whose name goes on the certificate?</p></div></div>' +
        '<div class="card cert-prompt"><form id="cert-name-form" class="form-stack">' +
        '<label>Name<input type="text" name="name" required autocomplete="name" autofocus></label>' +
        '<label>Job title<input type="text" name="jobTitle" placeholder="Optional"></label>' +
        '<label>Division<select name="division"><option value="">Optional</option>' + DATA.divisions.map(function (d) { return '<option value="' + d.code + '">' + esc(d.name) + "</option>"; }).join("") + "</select></label>" +
        '<div class="form-actions"><button class="btn btn-primary" type="submit">Show my certificate</button><a class="btn btn-ghost" href="#/record">Back</a></div></form></div>';
    }
    var passedAt = rec.passedAt;
    var last = rec.history[rec.history.length - 1] || { score: 0, total: 10 };
    var validThrough = addMonths(parseDate(passedAt), c.renewal_months || 12);
    var subline = [p.jobTitle, divisionName(p.division), p.organization].filter(Boolean).map(esc).join(", ");
    return '<div class="no-print page-head"><div><h1>Certificate of completion</h1></div><div class="actions"><button class="btn btn-primary" id="print-btn" type="button">Print or save as PDF</button> <a class="btn btn-ghost" href="#/record">Back</a></div></div>' +
      '<div class="certificate"><div class="cert-border">' +
      (p.organization ? '<p class="cert-org">' + esc(p.organization) + "</p>" : '<p class="cert-org">' + esc(APP) + "</p>") +
      '<h1 class="cert-title">Certificate of Completion</h1>' +
      '<p class="cert-lead">This certifies that</p><p class="cert-name">' + esc(p.name) + "</p>" + (subline ? '<p class="cert-lead">' + subline + "</p>" : "") +
      '<p class="cert-lead">has successfully completed the annual safety training module</p><p class="cert-course">' + esc(c.title) + "</p>" +
      (c.standard ? '<p class="cert-std">' + esc(c.standard) + (c.standard_title ? ", " + esc(c.standard_title) : "") + "</p>" : "") +
      '<div class="cert-meta"><div><span>Completed</span><strong>' + esc(fmtDate(passedAt, true)) + "</strong></div><div><span>Quiz score</span><strong>" + last.score + " of " + last.total + " (" + Math.round(100 * last.score / last.total) + "%)</strong></div><div><span>Valid through</span><strong>" + esc(fmtDate(validThrough, true)) + "</strong></div><div><span>Certificate no.</span><strong>" + certNumber(passedAt) + "</strong></div></div>" +
      '<div class="cert-sign"><div><span class="line"></span>Employee signature</div><div><span class="line"></span>Supervisor' + (p.supervisorName ? ": " + esc(p.supervisorName) : "") + "</div></div>" +
      '<p class="cert-foot">' + esc(APP) + ". " + esc(LICENSE) + ".</p>" +
      '<div class="seal">' + sealSVG(parseDate(passedAt).getFullYear()) + "</div></div></div>";
  }

  // ------------------------------------------------------------ record
  function viewRecord() {
    var p = who();
    var recs = records();
    var courses = coursesFor(divisionFilter());
    var rows = courses.map(function (c) {
      var s = courseStatus(c, recs[c.slug], p);
      var rec = recs[c.slug];
      var last = rec && rec.history.length ? rec.history[rec.history.length - 1] : null;
      return "<tr><td><strong>" + esc(c.title) + "</strong><br><small class=\"muted\">" + esc(c.standard || "") + "</small></td><td>" + badge(s.cls, s.label) + "</td><td>" + (s.passedAt ? esc(fmtDate(s.passedAt)) : "") + "</td><td class=\"num\">" + (last ? last.score + "/" + last.total : "") + "</td><td class=\"num\">" + (rec ? rec.attempts.length : 0) + "</td><td>" + (s.validThrough ? esc(fmtDate(s.validThrough)) : (s.due ? "Due " + esc(fmtDate(s.due)) : "")) + '</td><td class="actions-cell">' +
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
      '<button class="btn btn-ghost" id="ics-btn" type="button">Add reminders to calendar</button>' +
      '<button class="btn btn-ghost" id="csv-btn" type="button">Export CSV</button>' +
      '<a class="btn btn-primary" id="email-record" href="#">Email my record</a></div></div>' +
      '<div class="notice">This record lives on this device. Email it to your supervisor after each completion, or print the certificate. Calendar reminders are set ' + REMIND_DAYS + " days before each due date and on the due date.</div>" +
      '<section class="card"><h2>Modules</h2><table class="table"><thead><tr><th>Module</th><th>Status</th><th>Passed</th><th class="num">Score</th><th class="num">Attempts</th><th>Valid through or due</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></section>" +
      '<section class="card"><h2>Quiz attempts</h2>' + (hrows ? '<table class="table compact"><thead><tr><th>When</th><th>Module</th><th class="num">Score</th><th>Result</th></tr></thead><tbody>' + hrows + "</tbody></table>" : '<p class="empty">No quiz attempts yet.</p>') + "</section>";
  }

  function recordText(p) {
    var recs = records();
    var lines = ["Safety training record" + (p.name ? " for " + p.name : "") + (p.jobTitle ? ", " + p.jobTitle : "") + (p.division ? " (" + divisionName(p.division) + ")" : ""), ""];
    coursesFor(divisionFilter()).forEach(function (c) {
      var s = courseStatus(c, recs[c.slug], p);
      lines.push("- " + c.title + ": " + (s.passedAt ? "passed " + fmtDate(s.passedAt) + ", valid through " + fmtDate(s.validThrough) : s.label.toLowerCase()));
    });
    lines.push("", "Generated " + fmtDateTime(new Date()) + " from " + APP + " (browser edition).");
    return lines.join("\n");
  }

  function recordCSV(p) {
    var recs = records();
    var out = [["Employee", "Division", "Module", "Standard", "Status", "Passed", "Score", "Attempts", "Valid through"].join(",")];
    coursesFor(divisionFilter()).forEach(function (c) {
      var s = courseStatus(c, recs[c.slug], p);
      var rec = recs[c.slug];
      var last = rec && rec.history.length ? rec.history[rec.history.length - 1] : null;
      out.push([p.name || "", divisionName(p.division), c.title, c.standard || "", s.label, s.passedAt ? isoDate(parseDate(s.passedAt)) : "", last ? last.score + "/" + last.total : "", rec ? rec.attempts.length : 0, s.validThrough ? isoDate(s.validThrough) : ""].map(csvCell).join(","));
    });
    return out.join("\r\n");
  }

  function icsText(p) {
    var recs = records();
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + APP + "//Browser edition//EN", "CALSCALE:GREGORIAN"];
    function event(d, uid, summary, description) {
      var ds = isoDate(d).replace(/-/g, "");
      var de = isoDate(addDays(d, 1)).replace(/-/g, "");
      lines.push("BEGIN:VEVENT", "UID:" + uid + "@safety-training", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""), "DTSTART;VALUE=DATE:" + ds, "DTEND;VALUE=DATE:" + de, "SUMMARY:" + summary.replace(/,/g, "\\,"), "DESCRIPTION:" + description.replace(/,/g, "\\,"), "END:VEVENT");
    }
    coursesFor(divisionFilter()).forEach(function (c) {
      var s = courseStatus(c, recs[c.slug], p);
      var due = s.validThrough || s.due;
      if (!due) return;
      var remind = addDays(due, -REMIND_DAYS);
      if (remind >= today()) event(remind, c.slug + "-30-" + isoDate(due), "Safety training due in " + REMIND_DAYS + " days: " + c.title, "Complete the " + c.title + " module and quiz before " + fmtDate(due) + ".");
      if (due >= today()) event(due, c.slug + "-due-" + isoDate(due), "Safety training due today: " + c.title, "The " + c.title + " module and quiz are due today.");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  // ------------------------------------------------------------ incidents
  function statusCls(status) { return status === "closed" ? "ok" : status === "under_investigation" ? "warn" : "danger"; }
  function findIncident(id) {
    var list = incidents();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function updateIncident(inc) {
    var list = incidents();
    var found = false;
    for (var i = 0; i < list.length; i++) if (list[i].id === inc.id) { list[i] = inc; found = true; }
    if (!found) list.push(inc);
    saveIncidents(list);
  }
  function nextIncidentId() {
    var year = new Date().getFullYear();
    var prefix = "INC-" + year + "-";
    var max = 0;
    incidents().forEach(function (i) {
      if (i.id.indexOf(prefix) === 0) { var n = parseInt(i.id.slice(prefix.length), 10); if (n > max) max = n; }
    });
    return prefix + ("0000" + (max + 1)).slice(-4);
  }

  function viewIncidents(filters) {
    var list = incidents().slice().sort(function (a, b) { return b.occurredAt < a.occurredAt ? -1 : 1; });
    if (filters.type) list = list.filter(function (i) { return i.type === filters.type; });
    if (filters.status) list = list.filter(function (i) { return i.status === filters.status; });
    var rows = list.map(function (i) {
      return "<tr><td><a href=\"#/incidents/" + encodeURIComponent(i.id) + '"><strong>' + esc(i.id) + "</strong></a></td><td>" + esc(LABELS.types[i.type]) + "</td><td>" + esc(fmtDateTime(i.occurredAt)) + "</td><td>" + esc(i.location) + "</td><td>" + esc(divisionName(i.division)) + "</td><td>" + esc(short(LABELS.severities[i.severity])) + "</td><td>" + esc(i.reportedBy) + "</td><td>" + badge(statusCls(i.status), LABELS.statuses[i.status]) + '</td><td class="actions-cell"><a class="btn btn-sm btn-ghost" href="#/incidents/' + encodeURIComponent(i.id) + '/print">Print</a></td></tr>';
    }).join("");
    return '<div class="page-head"><div><h1>Incidents</h1><p class="muted">Personal injury, property damage and vehicle incidents, including near misses. Reports are saved on this device; export them to hand to the safety administrator.</p></div>' +
      '<div class="actions btn-row"><button class="btn btn-ghost" id="export-incidents" type="button">Export JSON</button><label class="btn btn-ghost" for="import-incidents" style="margin:0">Import JSON</label><input type="file" id="import-incidents" accept="application/json" style="display:none"><a class="btn btn-primary" href="#/incidents/new">Report an incident</a></div></div>' +
      '<form id="incident-filter" class="filter-bar card"><label>Type<select name="type">' + options(LABELS.types, filters.type, "All") + "</select></label><label>Status<select name=\"status\">" + options(LABELS.statuses, filters.status, "All") + '</select></label><button class="btn btn-secondary" type="submit">Filter</button><a class="btn btn-ghost" href="#/incidents">Clear</a></form>' +
      '<section class="card">' + (rows ? '<table class="table"><thead><tr><th>Number</th><th>Type</th><th>Occurred</th><th>Location</th><th>Division</th><th>Severity</th><th>Reported by</th><th>Status</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>" : '<p class="empty">No incidents match. Use Report an incident to add one.</p>') + "</section>";
  }

  function emptyIncident(p) {
    return {
      id: null, type: "", status: "reported", severity: "minor", occurredAt: localDateTimeValue(new Date()), reportedAt: null,
      location: "", division: p.division || "", reportedBy: p.name || "", workActivity: "", description: "", employeesInvolved: "", witnesses: "", immediateActions: "", equipmentInvolved: "", weatherConditions: "",
      injury: {}, property: {}, vehicle: {}, investigation: {}, actions: [], closedAt: null
    };
  }

  function viewIncidentForm(inc, editing, errors) {
    var divs = DATA.divisions.map(function (d) { return '<option value="' + d.code + '"' + (inc.division === d.code ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("");
    var inj = inc.injury || {}, prop = inc.property || {}, veh = inc.vehicle || {};
    function yn(v) { return v === true ? "yes" : v === false ? "no" : ""; }
    return '<div class="page-head"><div><h1>' + (editing ? "Edit incident " + esc(inc.id) : "Report an incident") + '</h1><p class="muted">Report every injury, property damage event and vehicle incident, including near misses, as soon as possible. Facts only; causes are recorded in the investigation.</p></div></div>' +
      (errors && errors.length ? '<div class="flashes">' + errors.map(function (e) { return '<div class="flash flash-danger">' + esc(e) + "</div>"; }).join("") + "</div>" : "") +
      '<form id="incident-form" class="card form-grid">' +
      '<h2 class="span-2">Incident</h2>' +
      '<label>Incident type <span class="req">*</span><select name="type" id="incident_type" required>' + options(LABELS.types, inc.type, "Select a type") + "</select></label>" +
      '<label>Date and time of incident <span class="req">*</span><input type="datetime-local" name="occurredAt" value="' + esc(inc.occurredAt) + '" required></label>' +
      '<label>Location <span class="req">*</span><input type="text" name="location" value="' + esc(inc.location) + '" placeholder="Street address, intersection, facility or job site" required></label>' +
      '<label>Division<select name="division"><option value="">Not division specific</option>' + divs + "</select></label>" +
      '<label>Severity<select name="severity">' + options(LABELS.severities, inc.severity) + "</select></label>" +
      '<label>Reported by<input type="text" name="reportedBy" value="' + esc(inc.reportedBy) + '"></label>' +
      '<label>Work activity at the time<input type="text" name="workActivity" value="' + esc(inc.workActivity) + '" placeholder="Replacing a service drop, mowing a right of way"></label>' +
      '<label>Equipment or vehicle involved<input type="text" name="equipmentInvolved" value="' + esc(inc.equipmentInvolved) + '"></label>' +
      '<label class="span-2">Weather and conditions<input type="text" name="weatherConditions" value="' + esc(inc.weatherConditions) + '" placeholder="Rain, dark, icy surface"></label>' +
      '<label class="span-2">What happened <span class="req">*</span><textarea name="description" rows="5" required placeholder="Describe the sequence of events in order. Who, what, when, where and how.">' + esc(inc.description) + "</textarea></label>" +
      '<label>Employees involved<textarea name="employeesInvolved" rows="2" placeholder="Names and job titles">' + esc(inc.employeesInvolved) + "</textarea></label>" +
      '<label>Witnesses<textarea name="witnesses" rows="2" placeholder="Names and contact information">' + esc(inc.witnesses) + "</textarea></label>" +
      '<label class="span-2">Immediate actions taken<textarea name="immediateActions" rows="3" placeholder="First aid given, scene secured, equipment tagged out, supervisor notified, 911 called">' + esc(inc.immediateActions) + "</textarea></label>" +
      '<div class="span-2 type-fields" data-type="injury"><h2>Personal injury details</h2><div class="form-grid nested">' +
      '<label>Injured person <span class="req">*</span><input type="text" name="injuredPerson" value="' + esc(inj.injuredPerson) + '"></label>' +
      '<label>Job title<input type="text" name="injuredJobTitle" value="' + esc(inj.injuredJobTitle) + '"></label>' +
      '<label>Body part affected<input type="text" name="bodyPart" value="' + esc(inj.bodyPart) + '" placeholder="Left hand, lower back"></label>' +
      '<label>Nature of injury<input type="text" name="injuryNature" value="' + esc(inj.injuryNature) + '" placeholder="Laceration, strain, burn, fracture"></label>' +
      '<label>Treatment<select name="treatment">' + options(LABELS.treatments, inj.treatment, "Select") + "</select></label>" +
      '<label>Treatment provider<input type="text" name="treatmentProvider" value="' + esc(inj.treatmentProvider) + '" placeholder="Clinic or hospital name"></label>' +
      '<label>Days away from work<input type="number" min="0" name="daysAway" value="' + esc(inj.daysAway) + '"></label>' +
      '<label>Days of restricted duty<input type="number" min="0" name="daysRestricted" value="' + esc(inj.daysRestricted) + '"></label>' +
      '<label>OSHA recordable?<select name="oshaRecordable"><option value="">Not yet determined</option><option value="yes"' + (yn(inj.oshaRecordable) === "yes" ? " selected" : "") + '>Yes</option><option value="no"' + (yn(inj.oshaRecordable) === "no" ? " selected" : "") + ">No</option></select></label></div></div>" +
      '<div class="span-2 type-fields" data-type="property_damage"><h2>Property damage details</h2><div class="form-grid nested">' +
      '<label>Property damaged <span class="req">*</span><input type="text" name="propertyDescription" value="' + esc(prop.propertyDescription) + '" placeholder="Mailbox, water main, transformer, fence"></label>' +
      '<label>Property owner<select name="propertyOwner">' + options(LABELS.owners, prop.propertyOwner, "Select") + "</select></label>" +
      '<label>Estimated cost ($)<input type="number" step="0.01" min="0" name="estimatedCost" value="' + esc(prop.estimatedCost) + '"></label>' +
      '<label class="span-2">Description of damage<textarea name="damageDescription" rows="3">' + esc(prop.damageDescription) + "</textarea></label></div></div>" +
      '<div class="span-2 type-fields" data-type="vehicle"><h2>Vehicle incident details</h2><div class="form-grid nested">' +
      '<label>Vehicle or unit number <span class="req">*</span><input type="text" name="vehicleUnit" value="' + esc(veh.vehicleUnit) + '"></label>' +
      '<label>Driver <span class="req">*</span><input type="text" name="driverName" value="' + esc(veh.driverName) + '"></label>' +
      '<label>Police report number<input type="text" name="policeReportNumber" value="' + esc(veh.policeReportNumber) + '"></label>' +
      '<label>Estimated vehicle damage ($)<input type="number" step="0.01" min="0" name="vehicleDamageEstimate" value="' + esc(veh.vehicleDamageEstimate) + '"></label>' +
      '<label>Post-incident drug and alcohol test<select name="drugAlcoholTest">' + options(LABELS.drugTests, veh.drugAlcoholTest, "Select") + "</select></label>" +
      '<label>Seat belt in use?<select name="seatBeltUsed"><option value="">Unknown</option><option value="yes"' + (yn(veh.seatBeltUsed) === "yes" ? " selected" : "") + '>Yes</option><option value="no"' + (yn(veh.seatBeltUsed) === "no" ? " selected" : "") + ">No</option></select></label>" +
      '<label class="span-2">Other party (name, vehicle, insurance, contact)<textarea name="otherParty" rows="3">' + esc(veh.otherParty) + "</textarea></label></div></div>" +
      '<div class="form-actions span-2"><button class="btn btn-primary btn-lg" type="submit">' + (editing ? "Save changes" : "Submit report") + '</button><a class="btn btn-ghost" href="' + (editing ? "#/incidents/" + encodeURIComponent(inc.id) : "#/incidents") + '">Cancel</a></div></form>';
  }

  function readIncidentForm(form, inc) {
    var f = function (name) { var el = form.elements[name]; return el && !el.disabled ? String(el.value || "").trim() : ""; };
    var num = function (name) { var v = f(name); return v === "" ? null : Number(v); };
    var bool = function (name) { var v = f(name); return v === "yes" ? true : v === "no" ? false : null; };
    var errors = [];
    inc.type = f("type"); if (!LABELS.types[inc.type]) errors.push("Choose an incident type.");
    inc.occurredAt = f("occurredAt"); if (!parseDate(inc.occurredAt)) errors.push("Enter the date and time the incident occurred.");
    inc.location = f("location"); if (!inc.location) errors.push("Enter the location.");
    inc.description = f("description"); if (!inc.description) errors.push("Describe what happened.");
    inc.division = f("division"); inc.severity = LABELS.severities[f("severity")] ? f("severity") : "minor";
    inc.reportedBy = f("reportedBy") || who().name || "";
    inc.workActivity = f("workActivity"); inc.equipmentInvolved = f("equipmentInvolved"); inc.weatherConditions = f("weatherConditions");
    inc.employeesInvolved = f("employeesInvolved"); inc.witnesses = f("witnesses"); inc.immediateActions = f("immediateActions");
    inc.injury = {}; inc.property = {}; inc.vehicle = inc.vehicle && inc.type === "vehicle" ? { preventability: inc.vehicle.preventability } : {};
    if (inc.type === "injury") {
      inc.injury = { injuredPerson: f("injuredPerson"), injuredJobTitle: f("injuredJobTitle"), bodyPart: f("bodyPart"), injuryNature: f("injuryNature"), treatment: f("treatment"), treatmentProvider: f("treatmentProvider"), daysAway: num("daysAway"), daysRestricted: num("daysRestricted"), oshaRecordable: bool("oshaRecordable") };
      if (!inc.injury.injuredPerson) errors.push("Enter the name of the injured person.");
    } else if (inc.type === "property_damage") {
      inc.property = { propertyDescription: f("propertyDescription"), propertyOwner: f("propertyOwner"), estimatedCost: num("estimatedCost"), damageDescription: f("damageDescription") };
      if (!inc.property.propertyDescription) errors.push("Describe the property that was damaged.");
    } else if (inc.type === "vehicle") {
      inc.vehicle.vehicleUnit = f("vehicleUnit"); inc.vehicle.driverName = f("driverName"); inc.vehicle.policeReportNumber = f("policeReportNumber");
      inc.vehicle.vehicleDamageEstimate = num("vehicleDamageEstimate"); inc.vehicle.drugAlcoholTest = f("drugAlcoholTest"); inc.vehicle.seatBeltUsed = bool("seatBeltUsed"); inc.vehicle.otherParty = f("otherParty");
      if (!inc.vehicle.vehicleUnit) errors.push("Enter the vehicle or unit number.");
      if (!inc.vehicle.driverName) errors.push("Enter the driver's name.");
    }
    return errors;
  }

  function ynText(v) { return v === true ? "Yes" : v === false ? "No" : "Not yet determined"; }
  function seatText(v) { return v === true ? "Yes" : v === false ? "No" : "Unknown"; }
  function hasInvestigation(inc) { var v = inc.investigation || {}; return !!(v.directCause || v.rootCause || v.factorType); }

  function typeDetails(inc, asTable) {
    var rows = [];
    if (inc.type === "injury") {
      var j = inc.injury || {};
      rows = [["Injured person", (j.injuredPerson || "") + (j.injuredJobTitle ? ", " + j.injuredJobTitle : "")], ["Body part", j.bodyPart], ["Nature of injury", j.injuryNature], ["Treatment", (LABELS.treatments[j.treatment] || "") + (j.treatmentProvider ? " (" + j.treatmentProvider + ")" : "")], ["Days away / restricted", (j.daysAway === null || j.daysAway === undefined ? 0 : j.daysAway) + " / " + (j.daysRestricted === null || j.daysRestricted === undefined ? 0 : j.daysRestricted)], ["OSHA recordable", ynText(j.oshaRecordable)]];
    } else if (inc.type === "property_damage") {
      var pr = inc.property || {};
      rows = [["Property", pr.propertyDescription], ["Owner", LABELS.owners[pr.propertyOwner] || ""], ["Estimated cost", money(pr.estimatedCost)], ["Damage", pr.damageDescription]];
    } else if (inc.type === "vehicle") {
      var v = inc.vehicle || {};
      rows = [["Vehicle or unit", v.vehicleUnit], ["Driver", v.driverName], ["Seat belt", seatText(v.seatBeltUsed)], ["Police report", v.policeReportNumber], ["Drug and alcohol test", LABELS.drugTests[v.drugAlcoholTest] || ""], ["Damage estimate", money(v.vehicleDamageEstimate)], ["Preventability", LABELS.preventability[v.preventability || "undetermined"]], ["Other party", v.otherParty]];
    }
    if (asTable) return rows.map(function (r) { return "<tr><th>" + esc(r[0]) + '</th><td colspan="3" class="pre">' + esc(r[1]) + "</td></tr>"; }).join("");
    return rows.map(function (r) { return "<dt>" + esc(r[0]) + '</dt><dd class="pre">' + esc(r[1]) + "</dd>"; }).join("");
  }

  function actionRows(inc, editable) {
    if (!inc.actions.length) return "";
    return inc.actions.map(function (a) {
      var overdue = a.status !== "completed" && a.targetDate && parseDate(a.targetDate) < today();
      return "<tr><td>" + esc(a.description) + (a.notes ? '<br><small class="muted">' + esc(a.notes) + "</small>" : "") + "</td><td>" + esc(a.responsible) + "</td><td>" + esc(fmtDate(a.targetDate)) + (overdue ? " " + badge("danger", "Overdue") : "") + "</td><td>" +
        (editable ? '<select class="action-status" data-id="' + a.id + '">' + options(LABELS.actionStatuses, a.status) + "</select>" + (a.completedOn ? ' <small class="muted">done ' + esc(fmtDate(a.completedOn)) + "</small>" : "") : badge(a.status === "completed" ? "ok" : a.status === "in_progress" ? "warn" : "neutral", LABELS.actionStatuses[a.status])) + "</td>" +
        (editable ? '<td class="actions-cell"><button class="btn btn-sm btn-ghost action-remove" data-id="' + a.id + '" type="button">Remove</button></td>' : "<td>" + esc(fmtDate(a.completedOn)) + "</td>") + "</tr>";
    }).join("");
  }

  function viewIncidentDetail(inc) {
    var v = inc.investigation || {};
    var p = who();
    var mail = p.supervisorEmail || "";
    return '<div class="page-head"><div><p class="eyebrow">' + esc(LABELS.types[inc.type]) + "</p><h1>Incident " + esc(inc.id) + '</h1><p class="muted">' + esc(fmtDateTime(inc.occurredAt)) + ", " + esc(inc.location) + (inc.division ? ", " + esc(divisionName(inc.division)) : "") + "</p></div>" +
      '<div class="actions btn-row">' + badge(statusCls(inc.status), LABELS.statuses[inc.status]) + ' <a class="btn btn-secondary" href="#/incidents/' + encodeURIComponent(inc.id) + '/print">Print report</a><a class="btn btn-ghost" id="email-incident" href="#" data-to="' + esc(mail) + '">Email report</a>' +
      (inc.status !== "closed" ? '<a class="btn btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '/edit">Edit report</a>' : "") +
      '<a class="btn btn-primary" href="#/incidents/' + encodeURIComponent(inc.id) + '/investigation">' + (hasInvestigation(inc) ? "Investigation" : "Start investigation") + "</a></div></div>" +
      '<div class="grid-2"><section class="card"><h2>Report</h2><dl class="dl"><dt>Reported by</dt><dd>' + esc(inc.reportedBy) + " on " + esc(fmtDateTime(inc.reportedAt)) + "</dd><dt>Severity</dt><dd>" + esc(LABELS.severities[inc.severity]) + "</dd>" +
      (inc.workActivity ? "<dt>Work activity</dt><dd>" + esc(inc.workActivity) + "</dd>" : "") + (inc.equipmentInvolved ? "<dt>Equipment</dt><dd>" + esc(inc.equipmentInvolved) + "</dd>" : "") + (inc.weatherConditions ? "<dt>Conditions</dt><dd>" + esc(inc.weatherConditions) + "</dd>" : "") +
      '<dt>What happened</dt><dd class="pre">' + esc(inc.description) + "</dd>" + (inc.employeesInvolved ? '<dt>Employees involved</dt><dd class="pre">' + esc(inc.employeesInvolved) + "</dd>" : "") + (inc.witnesses ? '<dt>Witnesses</dt><dd class="pre">' + esc(inc.witnesses) + "</dd>" : "") + (inc.immediateActions ? '<dt>Immediate actions</dt><dd class="pre">' + esc(inc.immediateActions) + "</dd>" : "") + "</dl></section>" +
      '<section class="card"><h2>' + esc(LABELS.types[inc.type]) + ' details</h2><dl class="dl">' + typeDetails(inc, false) + "</dl></section></div>" +
      '<section class="card"><div class="card-head"><h2>Investigation</h2><a class="btn btn-sm btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '/investigation">Edit</a></div>' +
      (hasInvestigation(inc) ? '<dl class="dl"><dt>Investigator</dt><dd>' + esc(v.investigator) + (v.date ? ", " + esc(fmtDate(v.date)) : "") + '</dd><dt>Direct cause</dt><dd class="pre">' + esc(v.directCause) + '</dd><dt>Root cause</dt><dd class="pre">' + esc(v.rootCause) + "</dd><dt>Contributing factor</dt><dd><strong>" + esc(short(LABELS.factors[v.factorType])) + "</strong>" + (v.factorDetail ? '<br><span class="pre">' + esc(v.factorDetail) + "</span>" : "") + "</dd>" + (v.lessonsLearned ? '<dt>Lessons learned</dt><dd class="pre">' + esc(v.lessonsLearned) + "</dd>" : "") + (inc.closedAt ? "<dt>Closed</dt><dd>" + esc(fmtDateTime(inc.closedAt)) + "</dd>" : "") + "</dl>"
        : '<p class="empty">The investigation has not been recorded yet. Use Start investigation to record the direct cause, root cause, contributing factor type and corrective actions.</p>') +
      "<h3>Corrective actions</h3>" + (inc.actions.length ? '<table class="table compact"><thead><tr><th>Action</th><th>Responsible</th><th>Target date</th><th>Status</th><th>Completed</th></tr></thead><tbody>' + actionRows(inc, false) + "</tbody></table>" : '<p class="empty">No corrective actions recorded.</p>') + "</section>";
  }

  function viewInvestigation(inc, msg) {
    var v = inc.investigation || {};
    var p = who();
    return '<div class="page-head"><div><p class="eyebrow">' + esc(LABELS.types[inc.type]) + ', <a href="#/incidents/' + encodeURIComponent(inc.id) + '">' + esc(inc.id) + '</a></p><h1>Investigation</h1><p class="muted">' + esc(fmtDateTime(inc.occurredAt)) + ", " + esc(inc.location) + ", reported by " + esc(inc.reportedBy) + '</p></div><div class="actions">' + badge(statusCls(inc.status), LABELS.statuses[inc.status]) + "</div></div>" +
      (msg ? flash(msg.kind, msg.text) : "") +
      '<div class="card muted-box"><p class="small" style="margin:0"><strong>What happened:</strong> ' + esc(inc.description) + "</p></div>" +
      '<form id="investigation-form" class="card form-grid"><h2 class="span-2">Causes</h2>' +
      '<label>Investigator<input type="text" name="investigator" value="' + esc(v.investigator || p.name || "") + '"></label>' +
      '<label>Investigation date<input type="date" name="date" value="' + esc(v.date || isoDate(today())) + '"></label>' +
      '<label class="span-2">Direct cause <span class="req">*</span><small class="muted">The immediate unsafe act or condition that produced the injury or damage.</small><textarea name="directCause" rows="3" placeholder="The operator stepped off the ladder\'s top cap and lost balance.">' + esc(v.directCause) + "</textarea></label>" +
      '<label class="span-2">Root cause <span class="req">*</span><small class="muted">The underlying management, system or process failure that allowed the direct cause to exist. Keep asking why until a fixable cause appears.</small><textarea name="rootCause" rows="3" placeholder="No ladder tall enough was on the truck and the crew had no way to request one in the field.">' + esc(v.rootCause) + "</textarea></label>" +
      '<label>Contributing factor type <span class="req">*</span><select name="factorType">' + options(LABELS.factors, v.factorType, "Select") + "</select></label>" +
      (inc.type === "vehicle" ? '<label>Preventability determination<select name="preventability">' + options(LABELS.preventability, (inc.vehicle || {}).preventability || "undetermined") + "</select></label>"
        : inc.type === "injury" ? '<label>OSHA recordable?<select name="oshaRecordable"><option value="">Not yet determined</option><option value="yes"' + ((inc.injury || {}).oshaRecordable === true ? " selected" : "") + '>Yes</option><option value="no"' + ((inc.injury || {}).oshaRecordable === false ? " selected" : "") + ">No</option></select></label>" : "<div></div>") +
      '<label class="span-2">Contributing factor details<textarea name="factorDetail" rows="3" placeholder="Describe the behavioral, engineered or environmental factor and how it contributed.">' + esc(v.factorDetail) + "</textarea></label>" +
      '<label class="span-2">Lessons learned<textarea name="lessonsLearned" rows="3">' + esc(v.lessonsLearned) + "</textarea></label>" +
      '<div class="form-actions span-2"><button class="btn btn-primary" type="submit">Save investigation</button><a class="btn btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '">Back to incident</a></div></form>' +
      '<section class="card" id="actions"><h2>Corrective actions</h2><p class="muted small">Each action should remove or control the cause. Prefer engineering controls and procedure changes over reminders to be careful.</p>' +
      (inc.actions.length ? '<table class="table compact"><thead><tr><th>Action</th><th>Responsible</th><th>Target</th><th>Status</th><th></th></tr></thead><tbody>' + actionRows(inc, true) + "</tbody></table>" : "") +
      '<form id="action-form" class="form-grid mt"><label class="span-2">New corrective action<input type="text" name="description" placeholder="Add a 28 ft extension ladder to each service truck and update the truck inventory checklist" required></label><label>Responsible person<input type="text" name="responsible"></label><label>Target date<input type="date" name="targetDate"></label><div class="form-actions span-2"><button class="btn btn-secondary" type="submit">Add action</button></div></form></section>' +
      '<section class="card"><h2>Status</h2>' + (inc.status !== "closed"
        ? '<p class="small muted">Closing requires a direct cause, a root cause and a contributing factor type.</p><div class="btn-row"><button class="btn btn-primary" id="close-incident" type="button">Close incident</button>' + (inc.status === "reported" ? '<button class="btn btn-ghost" id="mark-investigating" type="button">Mark under investigation</button>' : "") + "</div>"
        : '<p class="small muted">Closed ' + esc(fmtDateTime(inc.closedAt)) + '.</p><button class="btn btn-ghost" id="reopen-incident" type="button">Reopen</button>') + "</section>";
  }

  function viewIncidentPrint(inc) {
    var v = inc.investigation || {};
    var p = who();
    function check(k) { return '<span class="check">' + (v.factorType === k ? "X" : "&nbsp;") + "</span>"; }
    var actions = inc.actions.length ? inc.actions.map(function (a, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + esc(a.description) + (a.notes ? "<br><small>" + esc(a.notes) + "</small>" : "") + "</td><td>" + esc(a.responsible) + "</td><td>" + esc(fmtDate(a.targetDate)) + "</td><td>" + esc(LABELS.actionStatuses[a.status]) + "</td><td>" + esc(fmtDate(a.completedOn)) + "</td></tr>";
    }).join("") : "<tr><td>1</td><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr><tr><td>2</td><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>";
    return '<div class="no-print page-head"><div><h1>Printable incident report</h1></div><div class="actions"><button class="btn btn-primary" id="print-btn" type="button">Print or save as PDF</button> <a class="btn btn-ghost" href="#/incidents/' + encodeURIComponent(inc.id) + '">Back</a></div></div>' +
      '<div class="report"><header class="report-head"><div><h1>' + esc(p.organization || APP) + '</h1><h2>Incident Report</h2></div><div class="report-id"><div><span>Incident no.</span><strong>' + esc(inc.id) + "</strong></div><div><span>Type</span><strong>" + esc(LABELS.types[inc.type]) + "</strong></div><div><span>Status</span><strong>" + esc(LABELS.statuses[inc.status]) + "</strong></div></div></header>" +
      '<section class="report-section"><h3>1. Incident information</h3><table class="report-table"><tr><th>Date and time of incident</th><td>' + esc(fmtDateTime(inc.occurredAt)) + "</td><th>Date reported</th><td>" + esc(fmtDateTime(inc.reportedAt)) + "</td></tr><tr><th>Location</th><td>" + esc(inc.location) + "</td><th>Division</th><td>" + esc(divisionName(inc.division)) + "</td></tr><tr><th>Reported by</th><td>" + esc(inc.reportedBy) + "</td><th>Severity</th><td>" + esc(LABELS.severities[inc.severity]) + "</td></tr><tr><th>Work activity</th><td>" + esc(inc.workActivity) + "</td><th>Equipment or vehicle</th><td>" + esc(inc.equipmentInvolved) + '</td></tr><tr><th>Weather and conditions</th><td colspan="3">' + esc(inc.weatherConditions) + "</td></tr></table>" +
      '<h4>Description of what happened</h4><p class="pre box">' + esc(inc.description) + '</p><table class="report-table"><tr><th>Employees involved</th><td class="pre">' + esc(inc.employeesInvolved) + '</td></tr><tr><th>Witnesses</th><td class="pre">' + esc(inc.witnesses) + '</td></tr><tr><th>Immediate actions taken</th><td class="pre">' + esc(inc.immediateActions) + "</td></tr></table></section>" +
      '<section class="report-section"><h3>2. ' + esc(LABELS.types[inc.type]) + ' details</h3><table class="report-table">' + typeDetails(inc, true) + "</table></section>" +
      '<section class="report-section"><h3>3. Investigation</h3><table class="report-table"><tr><th>Investigator</th><td>' + esc(v.investigator) + "</td><th>Investigation date</th><td>" + esc(fmtDate(v.date)) + '</td></tr><tr><th>Contributing factor type</th><td colspan="3">' + check("behavioral") + " Behavioral &nbsp;&nbsp; " + check("engineering") + " Engineered &nbsp;&nbsp; " + check("environmental") + " Environmental</td></tr></table>" +
      '<h4>Direct cause</h4><p class="pre box">' + esc(v.directCause) + '</p><h4>Root cause</h4><p class="pre box">' + esc(v.rootCause) + '</p><h4>Contributing factor details</h4><p class="pre box">' + esc(v.factorDetail) + '</p><h4>Lessons learned</h4><p class="pre box">' + esc(v.lessonsLearned) + "</p></section>" +
      '<section class="report-section"><h3>4. Corrective actions</h3><table class="report-table grid"><thead><tr><th>#</th><th>Action</th><th>Responsible</th><th>Target date</th><th>Status</th><th>Completed</th></tr></thead><tbody>' + actions + "</tbody></table></section>" +
      '<section class="report-section signatures"><h3>5. Review and signatures</h3><div class="sig-row"><div><span class="line"></span>Employee or reporter &nbsp; <small>Date</small></div><div><span class="line"></span>Supervisor &nbsp; <small>Date</small></div><div><span class="line"></span>Safety administrator &nbsp; <small>Date</small></div></div>' + (inc.closedAt ? '<p class="small">Closed ' + esc(fmtDateTime(inc.closedAt)) + ".</p>" : "") + "</section>" +
      '<footer class="report-foot">' + esc(APP) + ". Printed " + esc(fmtDateTime(new Date())) + ". " + esc(inc.id) + ". " + esc(LICENSE) + ".</footer></div>";
  }

  function incidentText(inc) {
    var v = inc.investigation || {};
    var lines = ["Incident " + inc.id + " (" + LABELS.types[inc.type] + ")", "Status: " + LABELS.statuses[inc.status], "Occurred: " + fmtDateTime(inc.occurredAt), "Location: " + inc.location, "Division: " + divisionName(inc.division), "Severity: " + LABELS.severities[inc.severity], "Reported by: " + inc.reportedBy + " on " + fmtDateTime(inc.reportedAt), "", "What happened:", inc.description, ""];
    if (inc.immediateActions) lines.push("Immediate actions: " + inc.immediateActions, "");
    if (hasInvestigation(inc)) lines.push("Direct cause: " + (v.directCause || ""), "Root cause: " + (v.rootCause || ""), "Contributing factor: " + short(LABELS.factors[v.factorType] || ""), "");
    if (inc.actions.length) { lines.push("Corrective actions:"); inc.actions.forEach(function (a) { lines.push("- " + a.description + (a.responsible ? " (" + a.responsible + ")" : "") + (a.targetDate ? ", target " + fmtDate(a.targetDate) : "") + ", " + LABELS.actionStatuses[a.status]); }); lines.push(""); }
    lines.push("Sent from " + APP + " (browser edition). Print the full report from the Incidents page.");
    return lines.join("\n");
  }

  // ------------------------------------------------------------ catalog and about
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
      return "<tr><td><strong><a href=\"#/course/" + c.slug + '">' + esc(c.title) + '</a></strong><br><small class="muted">' + esc(c.summary) + "</small></td><td>" + esc(c.standard || "") + "</td><td>" + (c.top10_rank ? "Top 10, rank " + c.top10_rank : "Rescue") + "</td><td>" + c.divisions.map(divisionName).map(esc).join(", ") + '</td><td class="num">' + c.duration_minutes + ' min</td><td class="num">' + c.renewal_months + " months</td></tr>";
    }).join("");
    return '<div class="page-head"><div><h1>Course catalog</h1><p class="muted">Annual training modules. Each module ends with a 10 question quiz; a score of ' + PASS + '% or better records completion.</p></div></div>' +
      '<section class="card"><h2>OSHA Top 10 most cited standards</h2>' + (topHtml || '<p class="empty">No Top 10 data loaded.</p>') + "</section>" +
      '<section class="card"><h2>Modules</h2><table class="table"><thead><tr><th>Module</th><th>Standard</th><th>Category</th><th>Applies to</th><th class="num">Time</th><th class="num">Renews every</th></tr></thead><tbody>' + rows + "</tbody></table></section>";
  }

  function viewAbout() {
    return '<div class="page-head"><div><h1>About ' + esc(APP) + '</h1></div></div><section class="card narrow">' +
      "<p>An annual safety training and incident management platform for electric, environmental and public services crews.</p>" +
      "<ul><li>Training modules for OSHA's Top 10 most frequently cited standards, plus pole top rescue and bucket truck rescue for electric and public services crews.</li><li>A 10 question quiz at the end of every module, with completion certificates.</li><li>Incident reporting for personal injury, property damage and vehicle incidents, with investigation of direct cause, root cause, contributing factor type (behavioral, engineered or environmental) and corrective actions, and a printable incident report.</li></ul>" +
      "<h3>Browser edition and full platform</h3><p>This site is the <strong>browser edition</strong>: everything runs in your browser, nothing is sent to a server, and your progress, certificates and incident reports stay on this device. Use it to read the modules, take the quizzes and print certificates and incident reports.</p>" +
      '<p>The <strong>full platform</strong> adds employee accounts, assignment by division, automatic email reminders 30 days before training is due, completion notices to direct supervisors, incident notices, and department-wide compliance reports. It runs on a small server; see the <a href="' + esc(DATA.repo) + '" target="_blank" rel="noopener">project repository</a>.</p>' +
      "<h3>License</h3><p><strong>" + esc(LICENSE) + ".</strong> Copyright " + esc(DATA.year || new Date().getFullYear()) + " " + esc(COMPANY) + ". All rights reserved.</p>" +
      '<p class="muted small">Content generated ' + esc(fmtDate(DATA.generated)) + ". Training content summarizes OSHA standards for awareness-level annual refresher training. It does not replace the text of the standards, your organization's written programs and procedures, or the hands-on training and drills those programs require.</p></section>";
  }

  function notFound(msg) {
    return '<div class="auth-card"><h1>Not found</h1><p class="muted">' + esc(msg || "That page does not exist.") + '</p><a class="btn btn-primary" href="#/">Back to training</a></div>';
  }

  // ------------------------------------------------------------ router
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

  var pendingMessage = null;

  function render() {
    var r = parseRoute();
    var parts = r.parts;
    var name = parts[0] || "dashboard";
    var html = "";
    var printPage = false;
    if (name === "dashboard") { html = viewDashboard(); }
    else if (name === "profile") { html = viewProfile(); }
    else if (name === "course" && parts[1]) { html = viewCourse(parts[1]); }
    else if (name === "quiz" && parts[1]) { html = viewQuiz(parts[1]); }
    else if (name === "result" && parts[1]) { html = viewResult(parts[1], parseInt(parts[2], 10)); }
    else if (name === "certificate" && parts[1]) { html = viewCertificate(parts[1]); printPage = !!who().name; }
    else if (name === "record") { html = viewRecord(); }
    else if (name === "catalog") { html = viewCatalog(); }
    else if (name === "about") { html = viewAbout(); }
    else if (name === "incidents") {
      if (!parts[1]) html = viewIncidents(r.query);
      else if (parts[1] === "new") html = viewIncidentForm(emptyIncident(who()), false, null);
      else {
        var inc = findIncident(parts[1]);
        if (!inc) html = notFound("That incident is not stored on this device.");
        else if (parts[2] === "edit") html = viewIncidentForm(inc, true, null);
        else if (parts[2] === "investigation") { html = viewInvestigation(inc, pendingMessage); pendingMessage = null; }
        else if (parts[2] === "print") { html = viewIncidentPrint(inc); printPage = true; }
        else html = viewIncidentDetail(inc);
      }
    } else { html = notFound(); }
    document.body.classList.toggle("print-page", printPage);
    if (pendingMessage) { html = flash(pendingMessage.kind, pendingMessage.text) + html; pendingMessage = null; }
    app.innerHTML = html;
    renderHeader(name === "certificate" ? "record" : (name === "course" || name === "quiz" || name === "result" || name === "profile") ? "dashboard" : name);
    bind(name, parts);
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------ event bindings
  function on(id, eventName, handler) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(eventName, handler);
    return el;
  }

  function bind(name, parts) {
    // In-page links (table of contents, "Go to the quiz") scroll instead of changing the route.
    var anchors = app.querySelectorAll('a[href^="#"]:not([href^="#/"])');
    for (var ax = 0; ax < anchors.length; ax++) {
      anchors[ax].addEventListener("click", function (e) {
        var target = document.getElementById(this.getAttribute("href").slice(1));
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth", block: "start" }); }
      });
    }

    var chips = app.querySelectorAll(".chip[data-division]");
    for (var ci = 0; ci < chips.length; ci++) {
      chips[ci].addEventListener("click", function () { store.set("division_filter", this.getAttribute("data-division")); render(); });
    }

    on("profile-form", "submit", function (e) {
      e.preventDefault();
      var f = e.currentTarget.elements;
      var data = { name: f.name.value.trim(), jobTitle: f.jobTitle.value.trim(), division: f.division.value, organization: f.organization.value.trim(), email: f.email.value.trim(), supervisorName: f.supervisorName.value.trim(), supervisorEmail: f.supervisorEmail.value.trim(), dueDate: f.dueDate.value };
      if (!store.set("profile", data)) { app.innerHTML = viewProfile("This browser is blocking local storage, so nothing can be saved. Try another browser or turn off private browsing."); bind("profile", parts); return; }
      if (data.division) store.set("division_filter", data.division);
      pendingMessage = { kind: "success", text: "Saved." };
      if (location.hash === "#/" || location.hash === "") render(); else location.hash = "#/";
    });
    on("clear-profile", "click", function () {
      if (!confirm("Clear your name and details from this device? Your training progress stays.")) return;
      try { localStorage.removeItem("pwst:profile"); localStorage.removeItem("pwst:division_filter"); } catch (err) { /* ignore */ }
      location.hash = "#/";
      render();
    });

    on("cert-name-form", "submit", function (e) {
      e.preventDefault();
      var f = e.currentTarget.elements;
      var data = who();
      data.name = f.name.value.trim(); data.jobTitle = f.jobTitle.value.trim(); data.division = f.division.value || data.division || "";
      if (!data.name) return;
      store.set("profile", data);
      render();
    });

    var quiz = on("quiz-form", "submit", function (e) {
      e.preventDefault();
      var result = gradeQuiz(parts[1], e.currentTarget);
      if (result.missing) { app.innerHTML = viewQuiz(parts[1], "Please answer every question (" + result.missing + " left blank)."); bind("quiz", parts); window.scrollTo(0, 0); return; }
      location.hash = "#/result/" + parts[1] + "/" + result.attemptIndex;
    });
    if (quiz) {
      quiz.addEventListener("change", function (e) {
        var count = quiz.querySelectorAll("input[type=radio]:checked").length;
        var counter = document.getElementById("answered-count");
        if (counter) counter.textContent = count;
        var state = session.get("quiz:" + parts[1], null);
        if (state && e.target && e.target.name) { state.answers[parseInt(e.target.name.slice(1), 10)] = parseInt(e.target.value, 10); session.set("quiz:" + parts[1], state); }
      });
    }

    on("print-btn", "click", function () { window.print(); });
    on("csv-btn", "click", function () { download("training-record.csv", recordCSV(who()), "text/csv"); });
    on("ics-btn", "click", function () { download("safety-training-reminders.ics", icsText(who()), "text/calendar"); });
    var emailRecord = document.getElementById("email-record");
    if (emailRecord) {
      var p = who();
      emailRecord.href = "mailto:" + encodeURIComponent(p.supervisorEmail || "") + "?subject=" + encodeURIComponent("Safety training record" + (p.name ? ": " + p.name : "")) + "&body=" + encodeURIComponent(recordText(p));
    }

    var typeSelect = document.getElementById("incident_type");
    if (typeSelect) {
      var groups = document.querySelectorAll(".type-fields");
      var sync = function () {
        for (var i = 0; i < groups.length; i++) {
          var visible = groups[i].getAttribute("data-type") === typeSelect.value;
          groups[i].classList.toggle("visible", visible);
          var fields = groups[i].querySelectorAll("input, select, textarea");
          for (var k = 0; k < fields.length; k++) fields[k].disabled = !visible;
        }
      };
      typeSelect.addEventListener("change", sync);
      sync();
    }
    on("incident-form", "submit", function (e) {
      e.preventDefault();
      var editing = parts[1] !== "new";
      var inc = editing ? findIncident(parts[1]) : emptyIncident(who());
      var errors = readIncidentForm(e.currentTarget, inc);
      if (errors.length) { app.innerHTML = viewIncidentForm(inc, editing, errors); bind("incidents", parts); window.scrollTo(0, 0); return; }
      if (!editing) { inc.id = nextIncidentId(); inc.reportedAt = nowISO(); inc.status = "reported"; }
      updateIncident(inc);
      pendingMessage = { kind: "success", text: (editing ? "Incident report updated." : "Incident " + inc.id + " has been recorded on this device.") };
      location.hash = "#/incidents/" + encodeURIComponent(inc.id);
    });
    on("incident-filter", "submit", function (e) {
      e.preventDefault();
      var fe = e.currentTarget.elements;
      var qs = [];
      if (fe.type.value) qs.push("type=" + fe.type.value);
      if (fe.status.value) qs.push("status=" + fe.status.value);
      location.hash = "#/incidents" + (qs.length ? "?" + qs.join("&") : "");
    });
    on("export-incidents", "click", function () { download("incidents-" + isoDate(today()) + ".json", JSON.stringify(incidents(), null, 2), "application/json"); });
    on("import-incidents", "change", function (e) {
      var file = e.currentTarget.files && e.currentTarget.files[0];
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
            if (idx >= 0) { list[idx] = i; updated++; } else { list.push(i); added++; }
          });
          saveIncidents(list);
          pendingMessage = { kind: "success", text: "Imported " + added + " new and " + updated + " updated incident" + (added + updated === 1 ? "" : "s") + "." };
        } catch (err) {
          pendingMessage = { kind: "danger", text: "That file is not an incident export from this platform." };
        }
        render();
      };
      reader.readAsText(file);
    });
    var emailIncident = document.getElementById("email-incident");
    if (emailIncident) {
      var inc0 = findIncident(parts[1]);
      if (inc0) emailIncident.href = "mailto:" + encodeURIComponent(emailIncident.getAttribute("data-to") || "") + "?subject=" + encodeURIComponent("Incident report " + inc0.id + ": " + LABELS.types[inc0.type]) + "&body=" + encodeURIComponent(incidentText(inc0));
    }
    on("investigation-form", "submit", function (e) {
      e.preventDefault();
      var inc = findIncident(parts[1]);
      if (!inc) return;
      var f = e.currentTarget.elements;
      inc.investigation = { investigator: f.investigator.value.trim(), date: f.date.value, directCause: f.directCause.value.trim(), rootCause: f.rootCause.value.trim(), factorType: LABELS.factors[f.factorType.value] ? f.factorType.value : "", factorDetail: f.factorDetail.value.trim(), lessonsLearned: f.lessonsLearned.value.trim() };
      if (f.preventability) { inc.vehicle = inc.vehicle || {}; inc.vehicle.preventability = f.preventability.value; }
      if (f.oshaRecordable) { inc.injury = inc.injury || {}; inc.injury.oshaRecordable = f.oshaRecordable.value === "yes" ? true : f.oshaRecordable.value === "no" ? false : null; }
      if (inc.status === "reported") inc.status = "under_investigation";
      updateIncident(inc);
      pendingMessage = { kind: "success", text: "Investigation saved." };
      location.hash = "#/incidents/" + encodeURIComponent(inc.id);
    });
    if (on("action-form", "submit", function (e) {
      e.preventDefault();
      var inc = findIncident(parts[1]);
      var f = e.currentTarget.elements;
      if (!inc || !f.description.value.trim()) return;
      inc.actions.push({ id: Date.now(), description: f.description.value.trim(), responsible: f.responsible.value.trim(), targetDate: f.targetDate.value, status: "open", completedOn: null, notes: "" });
      if (inc.status === "reported") inc.status = "under_investigation";
      updateIncident(inc);
      pendingMessage = { kind: "success", text: "Corrective action added." };
      render();
    })) {
      var selects = document.querySelectorAll(".action-status");
      for (var s = 0; s < selects.length; s++) {
        selects[s].addEventListener("change", function (ev) {
          var inc = findIncident(parts[1]);
          var id = Number(ev.target.getAttribute("data-id"));
          inc.actions.forEach(function (a) { if (a.id === id) { a.status = ev.target.value; a.completedOn = a.status === "completed" ? isoDate(today()) : null; } });
          updateIncident(inc);
          render();
        });
      }
      var removes = document.querySelectorAll(".action-remove");
      for (var rIdx = 0; rIdx < removes.length; rIdx++) {
        removes[rIdx].addEventListener("click", function (ev) {
          if (!confirm("Remove this corrective action?")) return;
          var inc = findIncident(parts[1]);
          var id = Number(ev.target.getAttribute("data-id"));
          inc.actions = inc.actions.filter(function (a) { return a.id !== id; });
          updateIncident(inc);
          render();
        });
      }
    }
    on("close-incident", "click", function () {
      var inc = findIncident(parts[1]);
      var v = inc.investigation || {};
      var missing = [];
      if (!v.directCause) missing.push("direct cause");
      if (!v.rootCause) missing.push("root cause");
      if (!v.factorType) missing.push("contributing factor type");
      if (missing.length) { pendingMessage = { kind: "danger", text: "Before closing, record the " + missing.join(", ") + " and save the investigation." }; render(); return; }
      if (!confirm("Close this incident?")) return;
      inc.status = "closed"; inc.closedAt = nowISO();
      updateIncident(inc);
      pendingMessage = { kind: "success", text: "Incident " + inc.id + " closed." };
      location.hash = "#/incidents/" + encodeURIComponent(inc.id);
    });
    on("mark-investigating", "click", function () { var inc = findIncident(parts[1]); inc.status = "under_investigation"; updateIncident(inc); render(); });
    on("reopen-incident", "click", function () { var inc = findIncident(parts[1]); inc.status = "under_investigation"; inc.closedAt = null; updateIncident(inc); render(); });
  }

  window.addEventListener("hashchange", render);
  render();
})();
