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
