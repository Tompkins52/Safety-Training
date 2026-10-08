// Small enhancements; the platform works without JavaScript.
(function () {
  // Incident form: show only the fieldset for the selected incident type.
  var typeSelect = document.getElementById("incident_type");
  if (typeSelect) {
    var groups = document.querySelectorAll(".type-fields");
    var sync = function () {
      groups.forEach(function (group) {
        var visible = group.getAttribute("data-type") === typeSelect.value;
        group.classList.toggle("visible", visible);
        group.querySelectorAll("input, select, textarea").forEach(function (field) {
          field.disabled = !visible;
        });
      });
    };
    typeSelect.addEventListener("change", sync);
    sync();
  }

  // Quiz: warn before leaving with unsaved answers.
  var quiz = document.getElementById("quiz-form");
  if (quiz) {
    var dirty = false;
    var submitting = false;
    quiz.addEventListener("change", function () { dirty = true; });
    quiz.addEventListener("submit", function () { submitting = true; });
    window.addEventListener("beforeunload", function (event) {
      if (dirty && !submitting) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  // Auto-dismiss success flashes after a few seconds.
  document.querySelectorAll(".flash-success, .flash-info").forEach(function (el) {
    setTimeout(function () { el.style.transition = "opacity 0.6s"; el.style.opacity = "0"; }, 6000);
  });
})();
