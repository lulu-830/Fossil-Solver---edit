/*
 * EF2 Fossil Excavation — in-game solver overlay.
 *
 * Reads the board the read-only hook already captured in-page
 * (window.__EF2_SOLVER_DATA__ + the "ef-solver-update" event) — no HTTP — runs the
 * solver engine (FS), and highlights the fewest-swing next move *directly on the real
 * game board* using the exact on-screen tile position (window.__EF2_SOLVER_LOCATE__,
 * provided by plugin.js's live Block tracker). Falls back to a small text readout
 * ("R# · C#") if an exact position isn't available yet (e.g. right after a board
 * reload, before the tile objects settle). Read-only: it never sends a move. Depends
 * on solver.js (FS) and, optionally, metrics.js (FXMetrics), loaded before it.
 *
 * This is intentionally a settings-only panel now (show marker on/off, marker color) -
 * it no longer draws its own mirrored mini-board, since the real board is already
 * right there on screen.
 */
(function () {
  if (window.__EF2_SOLVER_OVERLAY__ || typeof FS === "undefined") return;
  window.__EF2_SOLVER_OVERLAY__ = true;

  var PANEL_ID = "ef-solver-overlay";
  var MARKER_ID = "ef-solver-marker";
  var SETTINGS_KEY = "ef_solver_marker_settings";

  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }

  function readSettings() {
    try {
      var raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      return {
        show: raw && typeof raw.show === "boolean" ? raw.show : true,
        color: raw && typeof raw.color === "string" ? raw.color : "#e24b4a",
        widthScale: raw && typeof raw.widthScale === "number" ? raw.widthScale : 1,
        heightScale: raw && typeof raw.heightScale === "number" ? raw.heightScale : 1,
        legacyGrid: raw && typeof raw.legacyGrid === "boolean" ? raw.legacyGrid : false
      };
    } catch (e) {
      return { show: true, color: "#e24b4a", widthScale: 1, heightScale: 1, legacyGrid: false };
    }
  }
  function writeSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }
  var settings = readSettings();

  function ensureStyle() {
    if (document.getElementById(PANEL_ID + "-style")) return;
    var s = document.createElement("style"); s.id = PANEL_ID + "-style";
    s.textContent =
      "#" + PANEL_ID + "{position:fixed;bottom:8px;left:8px;z-index:2147483646;box-sizing:border-box;width:188px;" +
      "padding:8px 9px;border-radius:9px;border:1px solid rgba(156,196,90,.4);background:rgba(20,18,14,.86);" +
      "color:#f4ecd8;font:12px/1.35 -apple-system,system-ui,sans-serif;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);user-select:none}" +
      "#" + PANEL_ID + " .hd{display:flex;align-items:center;gap:6px;font-weight:700;margin-bottom:6px}" +
      "#" + PANEL_ID + " .x{cursor:pointer;opacity:.6;font-size:14px;line-height:1;padding:0 2px}#" + PANEL_ID + " .x:hover{opacity:1}" +
      "#" + PANEL_ID + " .next{font-size:14px;font-weight:800;margin:1px 0 6px}" +
      "#" + PANEL_ID + " .grid{display:grid;gap:1px;margin:6px 0}" +
      "#" + PANEL_ID + " .c{width:100%;aspect-ratio:1;border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;box-sizing:border-box}" +
      "#" + PANEL_ID + " .row input[type=range]{width:70px}" +
      "#" + PANEL_ID + " .row .val{width:30px;text-align:right;font-size:10px;color:#bdb39a}" +
      "#" + PANEL_ID + " .sub{font-size:11px;color:#bdb39a;margin-top:2px}#" + PANEL_ID + " .sub b{color:#f4ecd8}" +
      "#" + PANEL_ID + " .row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(244,236,216,.12)}" +
      "#" + PANEL_ID + " .row label{display:flex;align-items:center;gap:5px;cursor:pointer}" +
      "#" + PANEL_ID + " .row input[type=checkbox]{width:14px;height:14px;margin:0}" +
      "#" + PANEL_ID + " .row input[type=color]{width:26px;height:20px;padding:0;border:1px solid rgba(244,236,216,.3);border-radius:4px;background:none;cursor:pointer}" +
      "#" + PANEL_ID + ".min .body{display:none}" +
      "#" + MARKER_ID + "{position:fixed;z-index:2147483645;pointer-events:none;border-radius:4px;box-sizing:border-box;display:none;" +
      "border:3px solid #e24b4a;box-shadow:0 0 0 2px rgba(0,0,0,.55),0 0 10px 2px rgba(226,75,74,.75);" +
      "transition:left .12s linear,top .12s linear,width .12s linear,height .12s linear;animation:efso 1.1s ease-in-out infinite}" +
      "#" + MARKER_ID + ".show{display:block}" +
      "@keyframes efso{0%,100%{opacity:1}50%{opacity:.55}}";
    document.head.appendChild(s);
  }

  function makeDraggable(p, handle) {
    handle.style.cursor = "move";
    var on = false, sx, sy, ox, oy;
    handle.addEventListener("mousedown", function (e) {
      if (e.target.closest && e.target.closest(".row")) return; // leave controls clickable
      if (e.target.classList && e.target.classList.contains("x")) return;
      var r = p.getBoundingClientRect();
      p.style.top = r.top + "px"; p.style.left = r.left + "px"; p.style.right = "auto"; p.style.bottom = "auto";
      on = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (!on) return;
      p.style.left = Math.max(0, ox + e.clientX - sx) + "px";
      p.style.top = Math.max(0, oy + e.clientY - sy) + "px";
    });
    document.addEventListener("mouseup", function () {
      if (!on) return; on = false;
      try { localStorage.setItem("ef_solver_pos", JSON.stringify({ left: p.style.left, top: p.style.top })); } catch (e) {}
    });
  }

  var panel, body, marker, legacyGridWrap, minimized = false;
  function ensurePanel() {
    if (panel) return;
    ensureStyle();

    marker = el("div"); marker.id = MARKER_ID;
    marker.dataset.efPluginOverlay = "fossil-solver";
    (document.body || document.documentElement).appendChild(marker);

    panel = el("div"); panel.id = PANEL_ID;
    panel.dataset.efPluginOverlay = "fossil-solver"; // runtime hide/show hook (EF2-Browser-Runtime v0.5.2+)
    var hd = el("div"); hd.className = "hd";
    hd.appendChild(el("span", null, "🦴"));
    hd.appendChild(el("span", "flex:1", "Fossil Solver"));
    var tog = el("span", null, "–"); tog.className = "x"; tog.title = "collapse";
    tog.onclick = function () { minimized = !minimized; panel.classList.toggle("min", minimized); tog.textContent = minimized ? "+" : "–"; };
    hd.appendChild(tog);
    panel.appendChild(hd);

    body = el("div"); body.className = "body";
    panel.appendChild(body);

    var row = el("div"); row.className = "row";
    var showLabel = el("label");
    var showCheckbox = el("input"); showCheckbox.type = "checkbox"; showCheckbox.checked = settings.show;
    showCheckbox.addEventListener("change", function () {
      settings.show = showCheckbox.checked;
      writeSettings(settings);
      updateMarker();
    });
    showLabel.appendChild(showCheckbox);
    showLabel.appendChild(el("span", null, "Marker"));
    row.appendChild(showLabel);

    var colorInput = el("input"); colorInput.type = "color"; colorInput.value = settings.color;
    colorInput.addEventListener("input", function () {
      settings.color = colorInput.value;
      writeSettings(settings);
      applyMarkerColor();
    });
    row.appendChild(colorInput);
    panel.appendChild(row);

    var sizeRow = el("div"); sizeRow.className = "row";
    var widthLabel = el("label");
    var widthInput = el("input"); widthInput.type = "range"; widthInput.min = "0.3"; widthInput.max = "2"; widthInput.step = "0.05"; widthInput.value = settings.widthScale;
    var widthVal = el("span", null, Math.round(settings.widthScale * 100) + "%"); widthVal.className = "val";
    widthInput.addEventListener("input", function () {
      settings.widthScale = parseFloat(widthInput.value);
      widthVal.textContent = Math.round(settings.widthScale * 100) + "%";
      writeSettings(settings);
      updateMarker();
    });
    widthLabel.appendChild(el("span", null, "Breite"));
    widthLabel.appendChild(widthInput);
    sizeRow.appendChild(widthLabel);
    sizeRow.appendChild(widthVal);
    panel.appendChild(sizeRow);

    var heightRow = el("div"); heightRow.className = "row";
    var heightLabel = el("label");
    var heightInput = el("input"); heightInput.type = "range"; heightInput.min = "0.3"; heightInput.max = "2"; heightInput.step = "0.05"; heightInput.value = settings.heightScale;
    var heightVal = el("span", null, Math.round(settings.heightScale * 100) + "%"); heightVal.className = "val";
    heightInput.addEventListener("input", function () {
      settings.heightScale = parseFloat(heightInput.value);
      heightVal.textContent = Math.round(settings.heightScale * 100) + "%";
      writeSettings(settings);
      updateMarker();
    });
    heightLabel.appendChild(el("span", null, "Höhe"));
    heightLabel.appendChild(heightInput);
    heightRow.appendChild(heightLabel);
    heightRow.appendChild(heightVal);
    panel.appendChild(heightRow);

    var legacyRow = el("div"); legacyRow.className = "row";
    var legacyLabel = el("label");
    var legacyCheckbox = el("input"); legacyCheckbox.type = "checkbox"; legacyCheckbox.checked = settings.legacyGrid;
    legacyCheckbox.addEventListener("change", function () {
      settings.legacyGrid = legacyCheckbox.checked;
      writeSettings(settings);
      legacyGridWrap.style.display = settings.legacyGrid ? "" : "none";
      render();
    });
    legacyLabel.appendChild(legacyCheckbox);
    legacyLabel.appendChild(el("span", null, "Altes Overlay (Mini-Board)"));
    legacyRow.appendChild(legacyLabel);
    panel.appendChild(legacyRow);

    legacyGridWrap = el("div");
    legacyGridWrap.style.display = settings.legacyGrid ? "" : "none";
    panel.appendChild(legacyGridWrap);

    (document.body || document.documentElement).appendChild(panel);
    // restore a dragged position if the user moved it before
    try { var pos = JSON.parse(localStorage.getItem("ef_solver_pos") || "null"); if (pos && pos.left) { panel.style.left = pos.left; panel.style.top = pos.top; panel.style.right = "auto"; panel.style.bottom = "auto"; } } catch (e) {}
    makeDraggable(panel, hd);
    applyMarkerColor();
  }

  function applyMarkerColor() {
    if (!marker) return;
    marker.style.borderColor = settings.color;
    marker.style.boxShadow = "0 0 0 2px rgba(0,0,0,.55), 0 0 10px 2px " + settings.color + "bf";
  }

  var lastHit = null; // [row, col] of the current recommended tile, kept for the fast position-tracking tick
  function updateMarker() {
    if (!marker) return;
    if (!settings.show || !lastHit || typeof window.__EF2_SOLVER_LOCATE__ !== "function") {
      marker.classList.remove("show");
      return;
    }
    var rect = window.__EF2_SOLVER_LOCATE__(lastHit[0], lastHit[1]);
    if (!rect) {
      marker.classList.remove("show");
      return;
    }
    var scaledWidth = rect.width * settings.widthScale;
    var scaledHeight = rect.height * settings.heightScale;
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    marker.style.left = (centerX - scaledWidth / 2) + "px";
    marker.style.top = (centerY - scaledHeight / 2) + "px";
    marker.style.width = scaledWidth + "px";
    marker.style.height = scaledHeight + "px";
    marker.classList.add("show");
  }
  // Tile positions can shift slightly (board scroll/animation) even between board-data
  // updates, so track them on their own short tick instead of only on "ef-solver-update".
  window.setInterval(updateMarker, 150);

  function mapShapeId(shape) {
    var s = ("" + (shape || "")).toLowerCase();
    if (s.indexOf("square") >= 0) return "sq";
    if (s.indexOf("vline") >= 0) return "v4";
    if (s.indexOf("hline") >= 0) return "h4";
    return null;
  }
  function specFromGame(b, fossils) {
    var blocks = b.blocks || [];
    var rows = b.yNum || blocks.length, cols = b.xNum || (blocks[0] ? blocks[0].length : 0);
    var fset = {};
    (fossils || []).forEach(function (box) { (box.coordinates || []).forEach(function (p) { fset[p.y + "," + p.x] = 1; }); });
    var cells = [];
    for (var r = 0; r < rows; r++) { var row = []; for (var c = 0; c < cols; c++) {
      var hp = (blocks[r] && blocks[r][c]) || 0;
      if (hp > 0) row.push({ state: "covered", hp: hp });
      else if (fset[r + "," + c]) row.push({ state: "fossil" });
      else row.push({ state: "empty" });
    } cells.push(row); }
    return { rows: rows, cols: cols, cells: cells };
  }
  function tick(data) {
    var b = data.board, fossils = data.fossils || [];
    var spec = specFromGame(b, fossils);
    var target = b.chestCount || 5;
    var board = FS.makeBoard(spec.rows, spec.cols, 0);
    for (var r = 0; r < spec.rows; r++) for (var c = 0; c < spec.cols; c++) {
      var cell = spec.cells[r][c];
      if (cell.state === "covered") board.cells[r][c] = { state: "covered", hp: cell.hp || 1, dmg: 0, fossil: null };
      else if (cell.state === "fossil") board.cells[r][c] = { state: "fossil", hp: 0, dmg: 0, fossil: null };
      else board.cells[r][c] = { state: "empty", hp: 0, dmg: 0, fossil: null };
    }
    var fossilObjs = fossils.map(function (box, i) {
      var fc = (box.coordinates || []).map(function (p) { return [p.y, p.x]; });
      return { id: "g" + i, cells: fc, footprint: { shape: mapShapeId(box.shape), cells: fc }, complete: !!box.fullyExcavated };
    });
    var rec = FS.recommend(board, fossilObjs, target);
    var done = 0; fossilObjs.forEach(function (f) { if (f.complete) done++; });
    return { spec: spec, rec: rec, done: done, target: target, board: board, fossils: fossilObjs };
  }

  var COLORS = { cov: ["#f4e3c4", "#6b4f1d"], emp: "#dcd6c8", fos: "#cfe6a8", tgt: "#e24b4a" };

  function render() {
    ensurePanel();
    var data = window.__EF2_SOLVER_DATA__;
    if (!data || !data.board || !data.board.blocks) {
      body.innerHTML = '<div class="sub">Open the Fossil Excavation minigame…</div>';
      if (legacyGridWrap) legacyGridWrap.innerHTML = "";
      lastHit = null; updateMarker();
      return;
    }
    var t; try { t = tick(data); } catch (e) { body.innerHTML = '<div class="sub">read error</div>'; if (legacyGridWrap) legacyGridWrap.innerHTML = ""; lastHit = null; updateMarker(); return; }
    var rec = t.rec, hit = rec && rec.hit, html = "";
    lastHit = hit || null;

    if (rec && rec.mode === "done") {
      html += '<div class="next" style="color:#9cc45a">✓ All ' + t.target + ' uncovered!</div>';
    } else if (hit) {
      var located = typeof window.__EF2_SOLVER_LOCATE__ === "function" ? window.__EF2_SOLVER_LOCATE__(hit[0], hit[1]) : null;
      html += '<div class="next">🔨 R' + (hit[0] + 1) + ' · C' + (hit[1] + 1) + '</div>';
      if (!located) {
        html += '<div class="sub">(genaue Position folgt gleich…)</div>';
      }
    } else {
      html += '<div class="next" style="font-size:12px;color:#bdb39a">' + ((rec && rec.reason) || "…") + '</div>';
    }
    html += '<div class="sub">Fossils: <b>' + t.done + ' / ' + t.target + '</b> uncovered</div>';
    try {
      if (window.FXMetrics) {
        var m = FXMetrics.compute(t.board, t.fossils, 0, t.target);
        var bench = FXMetrics.classify(t.spec.rows, t.spec.cols, t.target);
        html += '<div class="sub">Empties: <b>' + m.empties + '</b>' + (bench ? ' (sim ' + bench.empties.toFixed(0) + ')' : '') + ' · ' + m.pctCleared + '% cleared</div>';
      }
    } catch (e) {}
    body.innerHTML = html;

    if (legacyGridWrap) {
      if (settings.legacyGrid) {
        var spec = t.spec, gridHtml = '<div class="grid" style="grid-template-columns:repeat(' + spec.cols + ',1fr)">';
        for (var r = 0; r < spec.rows; r++) for (var c = 0; c < spec.cols; c++) {
          var cell = spec.cells[r][c], bg = COLORS.emp, fg = "transparent", txt = "", extra = "";
          if (cell.state === "covered") { bg = COLORS.cov[0]; fg = COLORS.cov[1]; txt = cell.hp; }
          else if (cell.state === "fossil") { bg = COLORS.fos; }
          if (hit && hit[0] === r && hit[1] === c) { bg = COLORS.tgt; fg = "#fff"; extra = "animation:efso 1.2s ease-out infinite;"; }
          gridHtml += '<div class="c" style="background:' + bg + ';color:' + fg + ';' + extra + '">' + txt + '</div>';
        }
        gridHtml += '</div>';
        legacyGridWrap.innerHTML = gridHtml;
      } else {
        legacyGridWrap.innerHTML = "";
      }
    }
    updateMarker();
  }

  window.addEventListener("ef-solver-update", render);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
  console.log("[EF2 solver overlay] active — reads the in-page board, never sends a move");
})();
