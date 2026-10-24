// Form widgets for incident reports, statements and inspections: the vehicle damage
// diagram, the body diagram, free-hand sketch pads and signature pads. Each widget is
// declared as a placeholder element and filled in here. The placeholder keeps a hidden
// input (data-name) in sync so a plain form post carries the drawing.
//
//   <div data-widget="vehicle" data-name="damage_marks" data-marks='[{"x":50,"y":25}]' data-interactive="1"></div>
//   <div data-widget="body" data-name="body_marks" data-marks="[]" data-interactive="1"></div>
//   <div data-widget="sketch" data-name="scene_sketch" data-background="intersection" data-value="" data-interactive="1"></div>
//   <div data-widget="signature" data-name="signature_data" data-value=""></div>
//
// Without data-interactive the diagram is drawn read-only (print pages). Marks are stored
// as percentages of the drawing so they print at any size.
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var LINE = 'fill="#fff" stroke="#0b3954" stroke-width="3" stroke-linejoin="round"';
  var THIN = 'fill="none" stroke="#0b3954" stroke-width="2"';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function vehicleInner() {
    function sideView(x, y, flip) {
      var t = flip ? "translate(" + (x + 600) + "," + y + ") scale(-1,1)" : "translate(" + x + "," + y + ")";
      return '<g transform="' + t + '">' +
        '<path d="M4 78 L4 48 Q6 42 14 42 L190 36 L236 8 Q240 4 248 4 L336 4 Q344 4 346 12 L350 36 L586 36 Q596 36 596 46 L596 78 Z" ' + LINE + "/>" +
        '<path d="M200 36 L240 12 L330 12 L336 36 Z" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/>' +
        '<path d="M346 36 L346 66" ' + THIN + "/>" + '<path d="M20 70 L580 70" ' + THIN + "/>" +
        '<circle cx="118" cy="78" r="24" fill="#fff" stroke="#0b3954" stroke-width="3"/><circle cx="118" cy="78" r="10" ' + THIN + "/>" +
        '<circle cx="478" cy="78" r="24" fill="#fff" stroke="#0b3954" stroke-width="3"/><circle cx="478" cy="78" r="10" ' + THIN + "/>" +
        '<rect x="258" y="40" width="22" height="6" rx="2" ' + THIN + "/></g>";
    }
    function endView(x, y, rear) {
      return '<g transform="translate(' + x + "," + y + ')">' +
        '<rect x="6" y="14" width="128" height="118" rx="12" ' + LINE + "/>" +
        (rear ? '<rect x="22" y="26" width="96" height="44" rx="4" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/><rect x="22" y="84" width="96" height="36" rx="3" ' + THIN + "/>"
          : '<rect x="22" y="26" width="96" height="44" rx="6" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/><rect x="34" y="88" width="72" height="26" rx="3" ' + THIN + '/><rect x="14" y="90" width="14" height="12" rx="2" ' + THIN + '/><rect x="112" y="90" width="14" height="12" rx="2" ' + THIN + "/>") +
        '<rect x="2" y="112" width="26" height="34" rx="6" fill="#fff" stroke="#0b3954" stroke-width="3"/><rect x="112" y="112" width="26" height="34" rx="6" fill="#fff" stroke="#0b3954" stroke-width="3"/>' +
        '<rect x="0" y="130" width="140" height="10" rx="3" ' + LINE + "/></g>";
    }
    var top = '<g transform="translate(330,120)">' +
      '<rect x="20" y="0" width="300" height="380" rx="26" ' + LINE + "/>" +
      '<path d="M20 110 L320 110" ' + THIN + "/>" + '<path d="M40 112 L62 160 L278 160 L300 112 Z" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/>' +
      '<rect x="62" y="160" width="216" height="70" rx="6" ' + THIN + "/>" + '<path d="M62 230 L50 254 L290 254 L278 230 Z" fill="#e3eef4" stroke="#0b3954" stroke-width="2"/>' +
      '<rect x="44" y="266" width="252" height="100" rx="6" ' + THIN + "/>" + '<path d="M44 266 L296 366 M296 266 L44 366" stroke="#cfd5db" stroke-width="2"/>' +
      '<rect x="0" y="40" width="26" height="60" rx="8" ' + LINE + '/><rect x="314" y="40" width="26" height="60" rx="8" ' + LINE + "/>" +
      '<rect x="0" y="290" width="26" height="60" rx="8" ' + LINE + '/><rect x="314" y="290" width="26" height="60" rx="8" ' + LINE + "/>" +
      '<rect x="2" y="128" width="24" height="18" rx="3" ' + LINE + '/><rect x="314" y="128" width="24" height="18" rx="3" ' + LINE + "/>" +
      '<text x="170" y="60" text-anchor="middle" font-size="18" fill="#5b6878">Front</text><text x="170" y="320" text-anchor="middle" font-size="18" fill="#5b6878">Rear</text></g>';
    var labels = '<text x="500" y="112" text-anchor="middle" font-size="18" fill="#5b6878">Left side</text><text x="500" y="610" text-anchor="middle" font-size="18" fill="#5b6878">Right side</text><text x="100" y="420" text-anchor="middle" font-size="18" fill="#5b6878">Front</text><text x="900" y="420" text-anchor="middle" font-size="18" fill="#5b6878">Rear</text>';
    return sideView(200, 6, false) + sideView(200, 516, true) + endView(30, 230, false) + endView(830, 230, true) + top + labels;
  }

  function bodyInner() {
    function figure(x, label) {
      return '<g transform="translate(' + x + ',0)">' +
        '<ellipse cx="0" cy="46" rx="24" ry="30" ' + LINE + "/>" + '<rect x="-10" y="74" width="20" height="18" ' + LINE + "/>" +
        '<path d="M-58 100 Q-70 104 -74 120 L-98 236 Q-100 246 -90 250 L-78 252 Q-70 252 -68 244 L-46 150 L-46 240 L-40 250 L-44 400 L-16 404 L-6 262 L6 262 L16 404 L44 400 L40 250 L46 240 L46 150 L68 244 Q70 252 78 252 L90 250 Q100 246 98 236 L74 120 Q70 104 58 100 Z" ' + LINE + "/>" +
        '<path d="M-46 150 Q0 160 46 150" ' + THIN + '/><path d="M-40 250 Q0 240 40 250" ' + THIN + "/>" +
        '<path d="M-44 400 L-50 412 L-14 416 L-16 404 M44 400 L50 412 L14 416 L16 404" ' + LINE + "/>" +
        '<text x="0" y="446" text-anchor="middle" font-size="18" fill="#5b6878">' + label + "</text></g>";
    }
    return figure(160, "Front") + figure(440, "Back");
  }

  var KINDS = {
    vehicle: { w: 1000, h: 620, inner: vehicleInner, label: "Vehicle diagram", hint: "Tap the diagram to circle each damaged area. Tap a circle to remove it." },
    body: { w: 600, h: 460, inner: bodyInner, label: "Body diagram", hint: "Tap the diagram to mark each injured area. Tap a mark to remove it." }
  };

  function markElement(kind, m, w, h, index) {
    var cx = (m.x / 100) * w, cy = (m.y / 100) * h;
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "mark");
    g.setAttribute("data-index", index);
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", kind === "body" ? 14 : 22);
    c.setAttribute("fill", "rgba(228,87,46,0.16)"); c.setAttribute("stroke", "#e4572e"); c.setAttribute("stroke-width", kind === "body" ? 3 : 4);
    g.appendChild(c);
    if (kind === "body") {
      var x = document.createElementNS(NS, "path");
      x.setAttribute("d", "M" + (cx - 7) + " " + (cy - 7) + " L" + (cx + 7) + " " + (cy + 7) + " M" + (cx + 7) + " " + (cy - 7) + " L" + (cx - 7) + " " + (cy + 7));
      x.setAttribute("stroke", "#e4572e"); x.setAttribute("stroke-width", 3); x.setAttribute("fill", "none");
      g.appendChild(x);
    }
    return g;
  }

  function parseJSON(text, fallback) {
    try { var v = JSON.parse(text); return v == null ? fallback : v; } catch (e) { return fallback; }
  }

  function buildDiagram(slot) {
    var kind = slot.getAttribute("data-widget");
    var spec = KINDS[kind];
    var interactive = !!slot.getAttribute("data-interactive");
    var name = slot.getAttribute("data-name") || (kind + "_marks");
    var marks = parseJSON(slot.getAttribute("data-marks") || "[]", []);
    slot.className = "diagram" + (interactive ? " interactive" : "") + (slot.className ? " " + slot.className : "");
    slot.innerHTML = '<svg viewBox="0 0 ' + spec.w + " " + spec.h + '" xmlns="' + NS + '" role="img" aria-label="' + spec.label + '">' + spec.inner() + '<g class="marks"></g></svg>' +
      (interactive ? '<input type="hidden" name="' + esc(name) + '" value="' + esc(JSON.stringify(marks)) + '">' +
        '<div class="diagram-tools"><span class="small muted">' + spec.hint + '</span> <button type="button" class="btn btn-sm btn-ghost" data-role="clear">Clear marks</button></div>' : "");
    var svg = slot.querySelector("svg"), layer = svg.querySelector(".marks");
    marks.forEach(function (m, i) { layer.appendChild(markElement(kind, m, spec.w, spec.h, i)); });
    if (!interactive) return;
    var input = slot.querySelector("input[type=hidden]");
    function sync() {
      var out = [], nodes = layer.querySelectorAll(".mark");
      for (var i = 0; i < nodes.length; i++) {
        var c = nodes[i].querySelector("circle");
        nodes[i].setAttribute("data-index", i);
        out.push({ x: Math.round(1000 * c.getAttribute("cx") / spec.w) / 10, y: Math.round(1000 * c.getAttribute("cy") / spec.h) / 10 });
      }
      input.value = JSON.stringify(out);
    }
    svg.addEventListener("click", function (e) {
      var markEl = e.target.closest ? e.target.closest(".mark") : null;
      if (markEl) {
        layer.removeChild(markEl);
      } else {
        var rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var m = { x: Math.round(1000 * (e.clientX - rect.left) / rect.width) / 10, y: Math.round(1000 * (e.clientY - rect.top) / rect.height) / 10 };
        layer.appendChild(markElement(kind, m, spec.w, spec.h, layer.children.length));
      }
      sync();
    });
    slot.querySelector('[data-role="clear"]').addEventListener("click", function () { while (layer.firstChild) layer.removeChild(layer.firstChild); sync(); });
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

  // Shared drawing surface for sketch pads and signature pads.
  function buildPad(slot, opts) {
    var name = slot.getAttribute("data-name");
    var value = slot.getAttribute("data-value") || "";
    var interactive = opts.alwaysInteractive || !!slot.getAttribute("data-interactive");
    slot.className = opts.className + (slot.className ? " " + slot.className : "");
    slot.innerHTML = '<canvas width="' + opts.width + '" height="' + opts.height + '" aria-label="' + opts.label + '"></canvas>' +
      (interactive ? '<input type="hidden" name="' + esc(name) + '" value="' + esc(value) + '">' +
        '<div class="diagram-tools"><span class="small muted">' + esc(slot.getAttribute("data-hint") || opts.hint) + '</span> <button type="button" class="btn btn-sm btn-ghost" data-role="clear">Clear</button></div>' : "");
    var canvas = slot.querySelector("canvas"), ctx = canvas.getContext("2d"), input = slot.querySelector("input[type=hidden]");
    function reset() { opts.background(ctx, canvas.width, canvas.height); }
    reset();
    if (value) { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }; img.src = value; }
    if (!interactive) return;
    var drawing = false;
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
    canvas.addEventListener("pointerdown", function (e) {
      drawing = true; canvas.setPointerCapture(e.pointerId); var p = pos(e);
      ctx.strokeStyle = opts.ink; ctx.lineWidth = opts.lineWidth; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); });
    function end() { if (!drawing) return; drawing = false; input.value = canvas.toDataURL("image/png"); }
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end); canvas.addEventListener("pointerleave", end);
    slot.querySelector('[data-role="clear"]').addEventListener("click", function () { input.value = ""; reset(); });
  }

  function buildSketch(slot) {
    var background = slot.getAttribute("data-background");
    buildPad(slot, {
      className: "sketch-pad", width: 800, height: 500, label: "Sketch area", ink: "#e4572e", lineWidth: 4,
      hint: "Draw with a finger, stylus or mouse.",
      background: function (ctx, w, h) { if (background === "intersection") drawIntersection(ctx, w, h); else { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); } }
    });
  }

  function buildSignature(slot) {
    buildPad(slot, {
      className: "signature-pad", width: 600, height: 180, label: "Signature", ink: "#0b3954", lineWidth: 3, alwaysInteractive: true,
      hint: "Sign above with a finger, stylus or mouse.",
      background: function (ctx, w, h) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = "#cfd5db"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, h - 40); ctx.lineTo(w - 30, h - 40); ctx.stroke(); }
    });
  }

  function init(root) {
    var slots = (root || document).querySelectorAll("[data-widget]");
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (slot.getAttribute("data-built")) continue;
      slot.setAttribute("data-built", "1");
      var kind = slot.getAttribute("data-widget");
      if (kind === "vehicle" || kind === "body") buildDiagram(slot);
      else if (kind === "sketch") buildSketch(slot);
      else if (kind === "signature") buildSignature(slot);
    }
  }

  // Conditional groups: a select or checkbox with data-toggles="name" shows every
  // element with data-cond="name" when its value is "yes" (or the box is checked).
  function initConditionals(root) {
    var toggles = (root || document).querySelectorAll("[data-toggles]");
    for (var i = 0; i < toggles.length; i++) {
      (function (control) {
        var name = control.getAttribute("data-toggles");
        var targets = (root || document).querySelectorAll('[data-cond="' + name + '"]');
        function sync() {
          var on = control.type === "checkbox" ? control.checked : control.value === "yes";
          for (var k = 0; k < targets.length; k++) targets[k].hidden = !on;
        }
        control.addEventListener("change", sync);
        sync();
      })(toggles[i]);
    }
  }

  window.SafetyWidgets = { init: init, initConditionals: initConditionals };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(); initConditionals(); });
  else { init(); initConditionals(); }
})();
