"use strict";

/* =========================================================================
   Toroid Inductor Calculator
   - L(uH) = A_L * N^2 / 1000  ->  N = ceil( sqrt( L_uH * 1000 / A_L ) )
   - wire-length and winding-density (packing) estimate from core geometry
   - suggestion engine ranks every available core for the same target L
   Pure math + UI. Data comes from assets/data/toroids.js (TOROIDS, AWG_TABLE).
   ========================================================================= */

(function () {
  var G = (typeof window !== "undefined") ? window : global;
  var data = (typeof require === "function" && !G.TOROIDS) ? (function () {
    try { return require("./data/toroids.js"); } catch (e) { return {}; }
  })() : {};
  var TOROIDS = G.TOROIDS || data.TOROIDS || [];
  var AWG_TABLE = G.AWG_TABLE || data.AWG_TABLE || [];

  /* ------------------------------------------------------------ pure math */
  function turnsFor(target_uH, al) {
    if (!(target_uH > 0) || !(al > 0)) return null;
    return Math.max(1, Math.ceil(Math.sqrt(target_uH * 1000 / al)));
  }

  function packCheck(core, awg, fillPct) {
    var ins = awg.ins;
    var meanD = (core.od + core.id) / 2;      // mm
    var circ = Math.PI * meanD;               // mean winding path, mm
    var npl = Math.floor(circ / ins);         // turns per layer
    var layers = Math.floor(core.ht / ins);   // stacked layers
    var cap = Math.max(0, npl * layers);
    var usable = Math.floor(cap * (fillPct / 100));
    return { npl: npl, layers: layers, cap: cap, usable: usable, ins_mm: ins, circ_mm: circ };
  }

  function calcToroid(core, target_uH, awg, fillPct) {
    var N = turnsFor(target_uH, core.al);
    if (N === null) return null;
    var Lact_uH = core.al * N * N / 1000;
    var dev_pct = target_uH > 0 ? (Lact_uH - target_uH) / target_uH * 100 : 0;
    var pack = packCheck(core, awg, fillPct);
    var wireLen_m = N * pack.circ_mm / 1000;
    return {
      N: N,
      Lact_uH: Lact_uH,
      dev_pct: dev_pct,
      wireLen_m: wireLen_m,
      pack: pack,
      fits: N <= pack.usable
    };
  }

  function suggest(coreList, target_uH, awg, fillPct) {
    var rows = coreList.map(function (t) {
      var r = calcToroid(t, target_uH, awg, fillPct);
      if (!r) return { core: t, ok: false };
      return { core: t, ok: true, N: r.N, Lact_uH: r.Lact_uH, dev_pct: r.dev_pct, fits: r.fits };
    });
    rows.sort(function (a, b) {
      if (a.fits !== b.fits) return a.fits ? -1 : 1;      // feasible packing first
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      var d = a.ok && b.ok ? a.dev_pct - b.dev_pct : 0;   // then least overshoot
      if (d !== 0) return d;
      return a.core.od - b.core.od;                         // then smaller core
    });
    return rows.slice(0, 6);
  }

  function fmtInd(muH) {
    if (muH >= 1e6) return trim3(muH / 1e6) + " H";
    if (muH >= 1e3) return trim3(muH / 1e3) + " mH";
    return trim3(muH) + " µH";
  }
  function trim3(v) {
    var s = v >= 100 ? v.toFixed(1) : v >= 10 ? v.toFixed(2) : v.toFixed(3);
    return String(parseFloat(s));
  }

  /* ------------------------------------------------------------ exports */
  var API = {
    TOROIDS: TOROIDS,
    AWG_TABLE: AWG_TABLE,
    turnsFor: turnsFor,
    calcToroid: calcToroid,
    packCheck: packCheck,
    suggest: suggest,
    fmtInd: fmtInd
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof document === "undefined") return;

  /* ----------------------------------------------------------------- UI */
  var UNIT = { H: 1e6, mH: 1e3, uH: 1, nH: 0.001 };
  var state = { toroid: "T37-2", lval: "840", lunit: "nH", awg: 24, fill: 75 };

  function $(id) { return document.getElementById(id); }
  function findCore(id) {
    for (var i = 0; i < TOROIDS.length; i++) if (TOROIDS[i].code === id) return TOROIDS[i];
    return TOROIDS[0];
  }
  function findAwg(n) {
    for (var i = 0; i < AWG_TABLE.length; i++) if (AWG_TABLE[i].awg === n) return AWG_TABLE[i];
    return AWG_TABLE[4];
  }

  /* ---- populate selects ---- */
  var toroidSel = $("toroid");
  var groups = {};
  for (var i = 0; i < TOROIDS.length; i++) {
    var t = TOROIDS[i];
    groups[t.class] = groups[t.class] || [];
    groups[t.class].push(t);
  }
  var groupNames = { "u-metal": "µ-metal (low/mid RF)", "ferrite": "Ferrite (HF / wideband)" };
  var toroidOpts = "";
  for (var gk in groups) {
    toroidOpts += '<optgroup label="' + (groupNames[gk] || gk) + '">';
    for (var j = 0; j < groups[gk].length; j++) {
      var tt = groups[gk][j];
      toroidOpts += '<option value="' + tt.code + '"' + (tt.code === state.toroid ? " selected" : "") + "> "
        + tt.name + " · A<sub>L</sub> " + tt.al + "</option>";
    }
    toroidOpts += "</optgroup>";
  }
  toroidSel.innerHTML = toroidOpts;

  var awgSel = $("awg");
  awgSel.innerHTML = AWG_TABLE.map(function (w) {
    return '<option value="' + w.awg + '"' + (w.awg === state.awg ? " selected" : "") + "> AWG "
      + w.awg + " · bare Ø" + w.bare + " mm · insulated Ø" + w.ins + " mm</option>";
  }).join("");

  /* ---- render ---- */
  function readVal(id, fallback) {
    var el = $(id); if (!el) return fallback;
    var v = parseFloat(el.value);
    return isNaN(v) ? fallback : v;
  }

  function render() {
    state.lval = $("lval").value;
    state.fill = readVal("fill", 75);
    state.awg = parseInt($("awg").value, 10);
    var core = findCore($("toroid").value);
    var awg = findAwg(state.awg);
    state.lunit = $("lunit").value;
    var fillLbl = $("fillLabel"); if (fillLbl) fillLbl.textContent = String(Math.round(state.fill));

    var target_uH = readVal("lval", 0) * UNIT[state.lunit];

    function vizUpdate(d) {
      window.__toroidVizPending = d;                      // consumed on module init
      if (typeof ToroidViz !== "undefined") ToroidViz.update(d);
    }

    /* --- preview --- */
    $("coreMeta").innerHTML =
      "<tr><td>Core</td><td><b>" + core.name + "</b></td></tr>"
      + "<tr><td>Material</td><td>" + core.mat + "</td></tr>"
      + "<tr><td>A<sub>L</sub></td><td>" + core.al + " µH·N² (per 1000)</td></tr>"
      + "<tr><td>Optimal range</td><td>" + core.freq + "</td></tr>"
      + "<tr><td>Dimensions (OD/ID/ht)</td><td>" + core.od + " / " + core.id + " / " + core.ht + " mm</td></tr>"
      + "<tr><td>Color code</td><td>" + core.color + "</td></tr>";

    vizUpdate({ core: core, awg: null, N: null });

    if (!(target_uH > 0)) {
      $("resBox").innerHTML = '<div class="note">Enter a target inductance &gt; 0.</div>';
      $("sugTable").innerHTML = "";
      $("indNote").textContent = "";
      return;
    }

    var r = calcToroid(core, target_uH, awg, state.fill);
    var pack = r.pack;
    var pct = pack.usable > 0 ? Math.min(100, r.N / pack.usable * 100) : 110;

    vizUpdate({ core: core, awg: awg, N: r.N, over: !r.fits });

    var html = "";
    html += '<div class="res-hero">' + r.N + '<span class="res-sub"> turns (N)</span></div>';
    html += '<table class="result" style="margin-top:10px">'
      + "<tr><td>Actual inductance (N rounded)</td><td><b>" + fmtInd(r.Lact_uH) + "</b></td></tr>"
      + "<tr><td>Deviation from target</td><td>" + (r.dev_pct >= 0 ? "+" : "") + r.dev_pct.toFixed(1) + " %</td></tr>"
      + "<tr><td>Wire used</td><td><b>" + r.wireLen_m.toFixed(2) + " m</b> (≈ " + trim3(r.wireLen_m * 100) + " cm)</td></tr>"
      + "<tr><td>Turns per layer</td><td>" + pack.npl + " × " + pack.layers + " layers</td></tr>"
      + "<tr><td>Capacity @fill " + Math.round(state.fill) + "%</td><td>" + pack.usable + " turns</td></tr>"
      + "</table>";
    html += '<div class="pack-track" title="Turns used vs capacity"><div class="pack-fill' + (r.fits ? "" : " over") + '" style="width:' + (Math.min(pct, 100)) + '%"></div></div>'
      + '<div class="hint">' + (r.fits
          ? "OK: " + r.N + " turns fit on the core surface (AWG " + state.awg + " wire, fill " + Math.round(state.fill) + "%)."
                     : "Over: " + r.N + " turns exceed the " + pack.usable + "-turn capacity — use a larger core or thinner wire (see suggestions below).") + "</div>";
    $("resBox").innerHTML = html;

    /* --- suggestions --- */
    var rows = suggest(TOROIDS, target_uH, awg, state.fill);
    var shtml = "<thead><tr><th>Core</th><th>N</th><th>Actual L</th><th>Dev.</th><th>Fits</th><th>OD</th></tr><tbody>";
    for (var k = 0; k < rows.length; k++) {
      var s = rows[k];
      var cur = s.core.code === core.code;
      var status = !s.ok ? "—" : (s.fits ? "fits" : "tight");
      shtml += '<tr' + (cur ? ' class="cur"' : "") + ">"
        + "<td>" + s.core.name + (cur ? " ◂" : "") + "</td>"
        + "<td>" + (s.ok ? s.N : "—") + "</td>"
        + "<td>" + (s.ok ? fmtInd(s.Lact_uH) : "—") + "</td>"
        + "<td>" + (s.ok ? "+" + s.dev_pct.toFixed(1) + " %" : "—") + "</td>"
        + "<td>" + status + "</td>"
        + "<td>" + s.core.od + " mm</td></tr>";
    }
    shtml += "</tbody>";
    $("sugTable").innerHTML = shtml;

    /* --- notes --- */
    var notes = [];
    if (r.N === 1 && r.dev_pct > 50) {
      notes.push("This core has a relatively large A<sub>L</sub>: even a single turn already exceeds the target. Look for a smaller-A<sub>L</sub> core, or accept the overshoot.");
    }
    if (!r.fits) {
      var cand = null;
      for (var m = 0; m < rows.length; m++) { if (rows[m].ok && rows[m].fits && rows[m].core.code !== core.code) { cand = rows[m]; break; } }
      notes.push(cand
        ? "Suggestion: use a <b>" + cand.core.name + "</b> with " + cand.N + " turns (" + fmtInd(cand.Lact_uH) + ") — AWG " + state.awg + " wire still fits."
        : "Packing is full on every listed core — raise the fill ratio or lower the target L.");
    } else if (pct > 85) {
      notes.push("Tight winding (>85% of capacity) — Q will drop slightly; acceptable for matching networks / RFI chokes.");
    }
    notes.push("Measured A<sub>L</sub> can deviate ±5–20% from the catalogue; re-measure L after winding if precision matters.");
    $("indNote").innerHTML = notes.map(function (n) { return "• " + n; }).join("<br>");
  }

  /* ------------------------------------------------------------- events */
  ["toroid", "lval", "lunit", "awg", "fill"].forEach(function (id) {
    var el = $(id);
    if (el) { el.addEventListener("input", render); el.addEventListener("change", render); }
  });

  render();
  if (window.lucide) lucide.createIcons();
})();
