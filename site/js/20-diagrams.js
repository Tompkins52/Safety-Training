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
