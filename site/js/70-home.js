// ---------------------------------------------------------------- front door (#/)
// The landing page in front of the app. Everything on it comes from the bundled
// data and this device's own records: the module list, the pass mark, checklist
// counts, and the visitor's own progress once they have started.

var NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty", "Twenty-one", "Twenty-two", "Twenty-three", "Twenty-four", "Twenty-five"];
function numberWord(n) { return NUMBER_WORDS[n] || ({ 30: "Thirty", 36: "Thirty-six", 60: "Sixty" })[n] || String(n); }
// "Electric, Environmental and Public Services" when every division ends the same way.
function divisionList() {
  var names = DATA.divisions.map(function (d) { return d.name; });
  if (!names.length) return "";
  var same = names.length > 1 && names.every(function (n) { return / Services$/.test(n); });
  var parts = same ? names.map(function (n) { return n.replace(/ Services$/, ""); }) : names;
  var text = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0];
  return same ? text + " Services" : text;
}

var HOME_ICONS = {
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  seal: '<path d="M12 2.8 14.3 4.6 17.2 4.4 18.1 7.2 20.6 8.7 19.8 11.5 20.6 14.3 18.1 15.8 17.2 18.6 14.3 18.4 12 20.2 9.7 18.4 6.8 18.6 5.9 15.8 3.4 14.3 4.2 11.5 3.4 8.7 5.9 7.2 6.8 4.4 9.7 4.6z"/><path d="m8.8 11.6 2.2 2.2 4.3-4.4"/>',
  bell: '<path d="M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.6 2H4.6z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
  bellRing: '<path d="M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.6 2H4.6z"/><path d="M10 21a2.2 2.2 0 0 0 4 0M3 7.5A9 9 0 0 1 5.4 3.6M21 7.5a9 9 0 0 0-2.4-3.9"/>',
  alert: '<path d="M12 3.6 2.6 19.8h18.8z"/><path d="M12 10v4.6M12 17.4v.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  phone: '<rect x="6.8" y="2.6" width="10.4" height="18.8" rx="2.3"/><path d="M11 18.2h2"/>',
  server: '<rect x="3.5" y="4" width="17" height="7" rx="1.8"/><rect x="3.5" y="13" width="17" height="7" rx="1.8"/><path d="M7.2 7.5h.1M7.2 16.5h.1"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  xls: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9.2 12.2l4.6 5.6M13.8 12.2l-4.6 5.6"/>',
  book: '<path d="M12 6.5C10.3 5 7.6 4.5 4 4.7v13.8c3.6-.2 6.3.3 8 1.8 1.7-1.5 4.4-2 8-1.8V4.7c-3.6-.2-6.3.3-8 1.8zM12 6.5v13.8"/>',
  report: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h5"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.8 13.2l2.2 2.2 4.2-4.4"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c1.2-3.7 4-5.6 7.5-5.6s6.3 1.9 7.5 5.6"/>'
};
function homeIcon(name, cls) {
  return '<svg class="fd-ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (HOME_ICONS[name] || "") + "</svg>";
}

// Short names for the caution tape: "Control of Hazardous Energy (Lockout/Tagout)" becomes "Lockout/Tagout".
function tapeName(title) {
  var m = /\(([^)]+)\)/.exec(title);
  if (m && m[1].indexOf("/") >= 0) return m[1];
  return title.replace(/\s*\([^)]*\)/g, "").split(":")[0].trim();
}
function tapeTrack(items) {
  var once = items.map(function (t) { return '<span class="fd-tape-item">' + esc(t) + "</span>"; }).join("");
  return '<div class="fd-track"><div class="fd-run">' + once + '</div><div class="fd-run" aria-hidden="true">' + once + "</div></div>";
}

var HOME_ORDER = { renewal_overdue: 0, overdue: 0, renewal_due: 1, in_progress: 2, assigned: 3, completed: 4 };
function homeStatusRank(state) { return HOME_ORDER[state] === undefined ? 3 : HOME_ORDER[state]; }
function homeModuleTag(c) {
  if (c.top10_rank) return '<span class="fd-rank">' + c.top10_rank + "<small>Top 10</small></span>";
  return '<span class="fd-rank fd-rank-word">' + esc(c.category === "rescue" ? "Rescue" : c.category === "supervisor" ? "Leaders" : "Annual") + "</span>";
}
function homeModuleRows(filter) {
  var p = who(), recs = records();
  return coursesFor(filter, "all").slice(0, 5).map(function (c) {
    var s = courseStatus(c, recs[c.slug], p);
    return '<li class="fd-mod">' + homeModuleTag(c) +
      '<div class="fd-mod-main"><a href="#/course/' + c.slug + '">' + esc(c.title) + '</a><span>' + esc(c.standard || "") + " | " + c.duration_minutes + " min | 10 question quiz</span></div>" +
      badge(s.cls, s.label) + "</li>";
  }).join("");
}
function homeDivisionChips(filter) {
  return [{ code: "all", name: "All divisions" }].concat(DATA.divisions).map(function (d) {
    return '<button type="button" class="fd-chip' + (filter === d.code ? " active" : "") + '" data-action="home-division" data-division="' + d.code + '">' + esc(d.name) + "</button>";
  }).join("");
}
ACTIONS["home-division"] = function (el) {
  var code = el.getAttribute("data-division");
  store.set("division_filter", code);
  var list = document.getElementById("fd-mod-list");
  if (list) list.innerHTML = homeModuleRows(code);
  var chips = document.querySelectorAll(".fd-chip");
  for (var i = 0; i < chips.length; i++) chips[i].classList.toggle("active", chips[i].getAttribute("data-division") === code);
};

function viewHome() {
  var p = who(), recs = records();
  var filter = divisionFilter();
  var total = DATA.courses.length;
  var mine = coursesFor(filter, "all").map(function (c) { return { course: c, status: courseStatus(c, recs[c.slug], p) }; });
  var current = mine.filter(function (m) { return m.status.state === "completed"; }).length;
  var started = Object.keys(recs).some(function (k) { return recs[k] && recs[k].attempts && recs[k].attempts.length; });
  var firstName = p.name ? p.name.split(" ")[0] : "";
  var reports = incidents(), audits = inspections();
  var templates = DATA.inspections || [];
  var t0 = today();

  // ---- hero: the visitor's own training, or where to start
  var ordered = mine.slice().sort(function (a, b) {
    return homeStatusRank(a.status.state) - homeStatusRank(b.status.state) || (a.course.top10_rank || 99) - (b.course.top10_rank || 99);
  });
  var heroRows = (started ? ordered : mine).slice(0, 4).map(function (m) {
    var c = m.course;
    return '<li><span class="fd-avatar">' + (c.top10_rank ? c.top10_rank : esc(c.title.charAt(0))) + '</span><span class="fd-who"><strong>' + esc(tapeName(c.title)) + "</strong><small>" + esc(c.standard || "") + "</small></span>" + badge(m.status.cls, m.status.state === "completed" ? "Current" : m.status.label) + "</li>";
  }).join("");
  var soon = mine.filter(function (m) { return m.status.state !== "completed" && m.status.due; })
    .sort(function (a, b) { return a.status.due - b.status.due; })[0];
  var reminderCard;
  if (soon) {
    var left = daysBetween(t0, soon.status.due);
    reminderCard = left < 0
      ? '<div class="fd-float fd-remind"><span class="fd-tile danger">' + homeIcon("alert") + "</span><div><strong>Overdue</strong><span>" + esc(tapeName(soon.course.title)) + " was due " + esc(fmtDate(soon.status.due)) + ".</span></div></div>"
      : '<div class="fd-float fd-remind"><span class="fd-tile caution">' + homeIcon("bell") + "</span><div><strong>Due in " + left + " day" + (left === 1 ? "" : "s") + "</strong><span>" + esc(tapeName(soon.course.title)) + ", " + esc(fmtDate(soon.status.due)) + ".</span></div></div>";
  } else {
    reminderCard = '<div class="fd-float fd-remind"><span class="fd-tile caution">' + homeIcon("bell") + "</span><div><strong>Reminders, " + REMIND_DAYS + " days out</strong><span>Due dates go on your calendar from My record.</span></div></div>";
  }
  var lastPass = null;
  Object.keys(recs).forEach(function (slug) {
    var r = recs[slug], c = courseBySlug(slug);
    if (!c || !r || !r.passedAt) return;
    var h = r.history && r.history.length ? r.history[r.history.length - 1] : null;
    if (!lastPass || r.passedAt > lastPass.at) lastPass = { course: c, at: r.passedAt, score: h ? h.score : null, total: h ? h.total : 10 };
  });
  var quizCard = lastPass
    ? '<a class="fd-float fd-quiz" href="#/certificate/' + lastPass.course.slug + '"><span class="fd-tile mint">' + homeIcon("seal") + "</span><div><small>" + esc(tapeName(lastPass.course.title)) + "</small><strong>Quiz passed" + (lastPass.score !== null ? ", " + lastPass.score + " of " + lastPass.total : "") + "</strong><span>Certificate ready to print</span></div></a>"
    : '<div class="fd-float fd-quiz"><span class="fd-tile mint">' + homeIcon("seal") + "</span><div><small>Every module</small><strong>10 questions, " + PASS + "% to pass</strong><span>Certificate prints when you pass</span></div></div>";

  var hero =
    '<section class="fd-hero" aria-labelledby="fd-title">' +
      '<div class="fd-liquid" aria-hidden="true"><span class="b1"></span><span class="b2"></span><span class="b3"></span></div>' +
      '<div class="container fd-hero-grid">' +
        '<p class="fd-pill"><span></span>' + (firstName ? "Welcome back, " + esc(firstName) : "Built for public works crews") + "</p>" +
        '<h1 id="fd-title" class="fd-display">Every crew trained.<br>Every incident on record.<br><em>Proof when you need it.</em></h1>' +
        '<div class="fd-hero-copy">' +
          '<p class="fd-lead">Annual safety training, incident reporting and site inspections, built for the crews who keep a city running. One place. One record.</p>' +
          '<div class="fd-ctas"><a class="btn btn-lg fd-btn-mint btn-arrow" href="#/training">' + (started ? "Continue training" : "Start training") + '</a><a class="btn btn-lg fd-btn-ghost" href="#/incidents/new">Report an incident</a></div>' +
          '<ul class="fd-checks">' +
            "<li>" + homeIcon("check") + (started ? current + " of " + mine.length + " modules current" : total + " training modules") + "</li>" +
            "<li>" + homeIcon("check") + "Any phone or computer</li>" +
            "<li>" + homeIcon("check") + "Nothing to install</li>" +
          "</ul>" +
        "</div>" +
        '<div class="fd-stack">' +
          reminderCard +
          '<div class="fd-panel">' +
            '<div class="fd-panel-head"><strong>' + (started ? "Your training" : "Where to start") + "</strong><span>" + (started ? current + " of " + mine.length + " current" + (filter !== "all" ? ", " + esc(divisionName(filter)) : "") : "OSHA\u2019s most cited standards come first") + "</span></div>" +
            '<ul class="fd-people">' + heroRows + "</ul>" +
            '<div class="fd-panel-foot"><button type="button" class="fd-xls" data-action="export-xlsx">' + homeIcon("xls") + "Export to Excel</button></div>" +
          "</div>" +
          quizCard +
        "</div>" +
      "</div>" +
    "</section>";

  // ---- caution tape
  var names = [];
  DATA.courses.forEach(function (c) { var n = tapeName(c.title); if (names.indexOf(n) < 0) names.push(n); });
  var tape =
    '<div class="fd-tape" aria-hidden="true">' +
      '<div class="fd-band b">' + tapeTrack(["One record", "Every crew trained", "Every incident on record", "Proof when you need it", "Nothing to install"]) + "</div>" +
      '<div class="fd-band a">' + tapeTrack(names) + "</div>" +
    "</div>";

  // ---- the old way
  var cells = "";
  for (var ci = 0; ci < 16; ci++) cells += ci === 6 ? '<i class="red"></i>' : ci === 11 ? '<i class="yellow"></i>' : "<i></i>";
  var yard =
    '<section class="fd-section fd-yard">' +
      '<div class="container fd-split">' +
        '<div class="fd-reveal">' +
          '<p class="fd-eyebrow">06:00 at the yard</p>' +
          '<h2 class="fd-h2">The trucks roll out at six.<br>The proof stays in a binder.</h2>' +
          '<p class="fd-body">A binder says who’s trained and who isn’t. A spreadsheet tracks renewals. Incident reports live on paper. And when an inspector asks for proof, the hunt begins.</p>' +
          '<p class="fd-punch">' + homeIcon("arrow") + esc(APP) + " puts all of it in one place, with one record.</p>" +
        "</div>" +
        '<div class="fd-papers fd-reveal" aria-hidden="true">' +
          '<div class="fd-paper binder"><span class="holes"><i></i><i></i><i></i></span><b>The binder</b><p>Who’s trained and who isn’t, as of whenever someone last updated it.</p><span class="fd-tag caution">Last updated in March</span></div>' +
          '<div class="fd-paper sheet"><p class="file">' + homeIcon("xls") + "Training renewals FINAL (3).xlsx</p>" +
            '<div class="cells">' + cells + "</div>" +
            "<p>Renewal dates typed by hand. One sort away from wrong.</p></div>" +
          '<div class="fd-paper form"><b>Incident report, page 2 of 4</b><p>Signatures in pen, diagrams in pencil, filed in a drawer.</p><span class="fd-tag danger">Page 3 missing</span></div>' +
        "</div>" +
      "</div>" +
    "</section>";

  // ---- 01 training
  var shownName = p.name || "Your name";
  var certCourse = lastPass ? lastPass.course : DATA.courses[0];
  var certDate = lastPass ? parseDate(lastPass.at) : t0;
  var renewMonths = (DATA.courses[0] && DATA.courses[0].renewal_months) || 12;
  var renewAt = addMonths(t0, renewMonths);
  var training =
    '<section class="fd-section fd-white" id="fd-training">' +
      '<div class="container">' +
        '<div class="fd-head-split fd-reveal"><div><p class="fd-eyebrow">01 / Training</p><h2 class="fd-h2">' + numberWord(total) + " modules,<br>written for the field.</h2></div>" +
          '<p class="fd-lead dark">One for each of OSHA’s ten most cited standards, plus pole top and bucket truck rescue, confined spaces, electrical safety and more. Every module uses examples from the field, not a factory floor.</p></div>' +
        '<div class="fd-bento">' +
          '<div class="fd-card concrete fd-reveal">' +
            '<h3 class="fd-h3">Assigned by division</h3>' +
            '<p class="fd-body">' + esc(divisionList()) + " each see the modules that fit their work, plus a new hire track.</p>" +
            '<div class="fd-list"><div class="fd-chips">' + homeDivisionChips(filter) + '</div><ul id="fd-mod-list">' + homeModuleRows(filter) + "</ul></div>" +
            '<a class="fd-more" href="#/training">Open the full training list' + homeIcon("arrow") + "</a>" +
          "</div>" +
          '<div class="fd-side">' +
            '<div class="fd-card navy fd-reveal"><p class="fd-big">' + PASS + '%</p><h3 class="fd-h3 light">to pass the quiz</h3><p class="fd-body light">Ten questions at the end of every module. Retakes are allowed, and every attempt is recorded.</p></div>' +
            '<div class="fd-card concrete fd-reveal">' +
              '<div class="fd-cert">' + homeIcon("seal") + "<em>Certificate of Completion</em><strong" + (p.name ? "" : ' class="placeholder"') + ">" + esc(shownName) + "</strong><span>" + esc(tapeName(certCourse.title)) + (lastPass && lastPass.score !== null ? ", " + lastPass.score + " of " + lastPass.total : "") + "</span><i>" + esc(fmtDate(certDate, true)) + "</i></div>" +
              '<p class="fd-body">A certificate prints the moment a module is passed.' + (p.name ? "" : ' <a href="#/profile">Add your name</a> to put it on yours.') + "</p>" +
            "</div>" +
          "</div>" +
          '<div class="fd-card concrete fd-renewal fd-reveal">' +
            '<div><h3 class="fd-h3">Pass it once. The renewal date follows.</h3><p class="fd-body">Each module renews ' + numberWord(renewMonths).toLowerCase() + " months after it is passed, and your calendar reminds you " + numberWord(REMIND_DAYS).toLowerCase() + " days before.</p></div>" +
            '<ol class="fd-timeline"><li class="done"><strong>Passed</strong><span>' + esc(fmtDate(t0)) + '</span></li><li class="done"><strong>Calendar reminder</strong><span>' + esc(fmtDate(addDays(renewAt, -REMIND_DAYS))) + "</span></li><li><strong>Due again</strong><span>" + esc(fmtDate(renewAt)) + "</span></li></ol>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>";

  // ---- reminders band
  var reminders =
    '<section class="fd-section fd-navy">' +
      '<div class="container fd-split">' +
        '<div class="fd-reveal"><p class="fd-eyebrow light">Reminders</p><h2 class="fd-h2 light">Nobody has to<br>chase people down.</h2>' +
          '<p class="fd-body light">Add your due dates to your calendar from My record: a reminder ' + numberWord(REMIND_DAYS).toLowerCase() + " days out and another on the day. Anything past due stays at the top of the list until it is done, and your record goes to your supervisor in one email.</p></div>" +
        '<ul class="fd-log">' +
          '<li class="fd-reveal"><span class="fd-tile caution">' + homeIcon("bell") + "</span><div><strong>Calendar reminder</strong><span>" + REMIND_DAYS + ' days before a module is due</span></div><em>30 days before</em></li>' +
          '<li class="fd-reveal"><span class="fd-tile caution">' + homeIcon("bellRing") + '</span><div><strong>Second reminder</strong><span>On the due date</span></div><em>Due date</em></li>' +
          '<li class="fd-reveal"><span class="fd-tile danger">' + homeIcon("alert") + '</span><div><strong>Stays at the top of the list</strong><span>Until the quiz is passed</span></div><em>Overdue</em></li>' +
          '<li class="fd-reveal"><span class="fd-tile mint">' + homeIcon("seal") + '</span><div><strong>Record sent to your supervisor</strong><span>Pass dates and renewal dates included</span></div><em>Passed</em></li>' +
        "</ul>" +
      "</div>" +
    "</section>";

  // ---- 02 incidents
  var sections = ["Incident information", "Vehicle and equipment", "Personal injury", "Incident description", "Principal statements", "Eyewitness statements", "Facts and analysis", "Signatures"];
  var body = bodyDiagramSVG([{ x: 12.6, y: 53.6 }], false).replace('viewBox="0 0 600 460"', 'viewBox="50 0 220 460"');
  var exampleId = reportNumber("injury", t0, []);
  var incidentsSection =
    '<section class="fd-section fd-concrete" id="fd-incidents">' +
      '<div class="container fd-split wide">' +
        '<div class="fd-reveal"><p class="fd-eyebrow">02 / Incidents</p><h2 class="fd-h2">When something happens,<br>the report is ready.</h2>' +
          '<p class="fd-body">It follows your eight-section paper form. Circle the damage on the vehicle diagram, mark the injury on the body diagram and sketch the scene. Principals and witnesses sign their statements right on the screen.</p>' +
          '<ol class="fd-sections">' + sections.map(function (s, i) { return "<li><b>" + (i + 1) + "</b>" + esc(s) + "</li>"; }).join("") + "</ol>" +
          '<p class="fd-rule">' + homeIcon("lock") + "A report won’t close until the direct and root causes are on record. Then it prints, diagrams and signatures included.</p>" +
          '<div class="fd-row"><a class="btn btn-primary btn-lg btn-arrow" href="#/incidents/new">Start an incident report</a>' + (reports.length ? '<a class="btn btn-ghost btn-lg" href="#/incidents">' + reports.length + " report" + (reports.length === 1 ? "" : "s") + " on this device</a>" : "") + "</div>" +
        "</div>" +
        '<div class="fd-report fd-reveal" aria-label="Example incident report">' +
          '<div class="fd-report-head"><div><strong>Incident report</strong><span>' + esc(exampleId) + '</span></div><em>Example</em></div>' +
          '<div class="fd-report-body"><div class="fd-body-fig">' + body + "<span>Right hand marked</span></div>" +
            "<dl><dt>Type</dt><dd>Personal injury</dd><dt>Division</dt><dd>" + esc(DATA.divisions.length ? DATA.divisions[0].name : "") + "</dd><dt>Severity</dt><dd>Minor</dd><dt>Treatment</dt><dd>" + esc(LABELS.treatments.first_aid) + "</dd></dl></div>" +
          '<div class="fd-report-foot"><div><strong>Eyewitness statement</strong><em>' + homeIcon("seal") + 'Signed on this device</em></div><svg class="fd-sig" viewBox="0 0 220 44" aria-hidden="true"><path d="M4 30c10-2 14-22 24-20s-2 26 8 26 12-28 22-26 0 24 12 22 14-24 24-22 2 20 12 20 10-14 18-14 8 10 16 10 12-6 20-6"/><path d="M4 40h212"/></svg></div>' +
        "</div>" +
      "</div>" +
    "</section>";

  // ---- 03 inspections and 04 your record
  var construction = templateBySlug("construction-site-inspection") || templates[0];
  var checkHtml = "";
  if (construction) {
    var sec = construction.sections.filter(function (s) { return /fall/i.test(s.heading); })[0] || construction.sections[0];
    checkHtml = sec.items.slice(0, 4).map(function (it, i) {
      var flagged = i === 1;
      return '<li class="' + (flagged ? "flag" : "ok") + '">' + homeIcon(flagged ? "alert" : "check") + '<span class="txt">' + esc(it.text) + '</span><span class="ref">' + esc(it.ref || "") + "</span>" +
        (flagged ? '<span class="note">Needs action: corrective action, owner and target date recorded with the finding.</span>' : "") + "</li>";
    }).join("");
  }
  var countLabels = { "construction-site-inspection": "construction items", "general-industry-inspection": "general industry items", "annual-safety-program-audit": "annual audit items" };
  var counts = templates.map(function (t) { return "<li><strong>" + inspectionItems(t).length + "</strong><span>" + esc(countLabels[t.slug] || t.title) + "</span></li>"; }).join("");
  var cats = Object.keys(LABELS.categories).map(function (k) {
    var inCat = mine.filter(function (m) { return m.course.category === k; });
    if (!inCat.length) return "";
    var ok = inCat.filter(function (m) { return m.status.state === "completed"; }).length;
    var pct = Math.round(100 * ok / inCat.length);
    return '<li><div class="top"><strong>' + esc(LABELS.categories[k]) + "</strong><span>" + ok + " of " + inCat.length + "<em>" + pct + '%</em></span></div><div class="fd-bar"><i style="width:' + pct + '%"></i></div></li>';
  }).join("");
  var duo =
    '<section class="fd-section fd-white" id="fd-inspections">' +
      '<div class="container">' +
        '<div class="fd-reveal"><p class="fd-eyebrow">Inspections and records</p><h2 class="fd-h2">Walk the site. Run the audit. Show the record.</h2></div>' +
        '<div class="fd-duo">' +
          '<div class="fd-card concrete fd-reveal"><p class="fd-eyebrow">03 / Inspections</p><h3 class="fd-h3">Site inspections and the annual audit, built in.</h3>' +
            '<p class="fd-body">Every item is tied to its OSHA reference, with a result, a note, and a corrective action, owner and target date for anything that needs attention.</p>' +
            '<ul class="fd-checklist">' + checkHtml + "</ul>" +
            '<ul class="fd-counts">' + counts + "</ul>" +
            '<a class="fd-more" href="#/inspections">' + (audits.length ? "Open inspections (" + audits.length + " on this device)" : "Start an inspection") + homeIcon("arrow") + "</a>" +
          "</div>" +
          '<div class="fd-card navy fd-reveal"><p class="fd-eyebrow light">04 / Your record</p><h3 class="fd-h3 light">Every module, current or not, at a glance.</h3>' +
            '<p class="fd-body light">' + (started ? "Where you stand" + (p.name ? ", " + esc(firstName) : "") + ", by type of training." : "Your record fills in as you pass modules.") + " The whole record exports to Excel in one click.</p>" +
            '<ul class="fd-bars">' + cats + "</ul>" +
            '<div class="fd-row"><button type="button" class="btn fd-btn-mint" data-action="export-xlsx">' + homeIcon("xls") + 'Export to Excel</button><button type="button" class="btn fd-btn-ghost" data-action="export-ics">' + homeIcon("calendar") + 'Add reminders to calendar</button><a class="btn fd-btn-ghost" href="#/record">Open my record</a></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>";

  // ---- two editions
  var editions =
    '<section class="fd-section fd-concrete">' +
      '<div class="container">' +
        '<div class="fd-reveal"><p class="fd-eyebrow">Two editions</p><h2 class="fd-h2">Start on any phone today. Grow into the full platform.</h2></div>' +
        '<div class="fd-duo">' +
          '<div class="fd-ed light fd-reveal"><span class="fd-ed-icon">' + homeIcon("phone") + '</span><p class="fd-here">You are here</p><h3 class="fd-h3">Browser edition</h3><p class="fd-body">Open it on any phone or computer. Nothing to install and no sign-in. Everything stays on this device.</p>' +
            "<ul><li>" + homeIcon("check") + "All " + total + " modules, quizzes and certificates</li><li>" + homeIcon("check") + "Incident reports, inspections and audits</li><li>" + homeIcon("check") + "Excel export of the training record</li><li>" + homeIcon("check") + "Calendar reminders for what’s due</li></ul></div>" +
          '<div class="fd-ed dark fd-reveal"><span class="fd-ed-icon">' + homeIcon("server") + '</span><p class="fd-here">For the whole department</p><h3 class="fd-h3 light">Full platform</h3><p class="fd-body light">Runs on your own server, with accounts, assignments and automatic email.</p>' +
            "<ul><li>" + homeIcon("check") + "Employee accounts, roles and supervisors</li><li>" + homeIcon("check") + "Assignments by division and a new hire track</li><li>" + homeIcon("check") + "Automatic reminders with supervisor copies</li><li>" + homeIcon("check") + "Central incident records and emailed statement links</li><li>" + homeIcon("check") + "Compliance reports, overdue lists and Excel export</li></ul>" +
            '<a class="fd-more light" href="#/about">About the two editions' + homeIcon("arrow") + "</a></div>" +
        "</div>" +
      "</div>" +
    "</section>";

  // ---- last call
  var finalBand =
    '<section class="fd-final">' +
      '<div class="fd-liquid" aria-hidden="true"><span class="b1"></span><span class="b2"></span></div>' +
      '<div class="container fd-split">' +
        '<div class="fd-reveal"><p class="fd-eyebrow light">Ready when your crew is</p><h2 class="fd-h2 light">Start with one module today.</h2>' +
          '<p class="fd-body light">Nothing to sign up for. Your progress, reports and inspections stay on this device until you export or print them.</p>' +
          '<ul class="fd-stats"><li><strong>' + total + "</strong><span>training modules</span></li><li><strong>" + sections.length + "</strong><span>report sections</span></li><li><strong>" + templates.length + "</strong><span>inspection checklists</span></li></ul></div>" +
        '<div class="fd-go fd-reveal"><h3 class="fd-h3">Where do you want to start?</h3><p class="fd-body">Pick up any of the three. They share one record.</p>' +
          '<a href="#/training"><span class="fd-tile navy">' + homeIcon("book") + "</span><span><strong>" + (started ? "Continue training" : "Start training") + "</strong><small>" + (started ? current + " of " + mine.length + " modules current" : "Read a module, pass the quiz") + "</small></span>" + homeIcon("arrow", "go") + "</a>" +
          '<a href="#/incidents/new"><span class="fd-tile navy">' + homeIcon("report") + "</span><span><strong>Report an incident</strong><small>Injury, property damage, vehicle or near miss</small></span>" + homeIcon("arrow", "go") + "</a>" +
          '<a href="#/inspections"><span class="fd-tile navy">' + homeIcon("clipboard") + "</span><span><strong>Run an inspection</strong><small>Construction, general industry or the annual audit</small></span>" + homeIcon("arrow", "go") + "</a>" +
          (p.name ? "" : '<a href="#/profile"><span class="fd-tile navy">' + homeIcon("user") + "</span><span><strong>Add your name</strong><small>Optional. It goes on certificates and reports.</small></span>" + homeIcon("arrow", "go") + "</a>") +
        "</div>" +
      "</div>" +
    "</section>";

  return '<div class="fd">' + hero + tape + yard + training + reminders + incidentsSection + duo + editions + finalBand + "</div>";
}

// Sections ease in as they scroll into view. Without IntersectionObserver, or with
// reduced motion, everything simply shows.
var homeObserver = null;
function bindHome(root) {
  if (homeObserver) { homeObserver.disconnect(); homeObserver = null; }
  var items = root.querySelectorAll(".fd-reveal");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("IntersectionObserver" in window) || reduce) {
    for (var i = 0; i < items.length; i++) items[i].classList.add("in");
    return;
  }
  homeObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); homeObserver.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  for (var j = 0; j < items.length; j++) homeObserver.observe(items[j]);
}
