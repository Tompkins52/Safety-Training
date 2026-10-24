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
