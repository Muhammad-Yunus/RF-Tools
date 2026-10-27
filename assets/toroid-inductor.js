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
  var state = { toroid: "T50-2", lval: "10", lunit: "uH", awg: 30, fill: 75 };

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

    /* --- preview --- */
    $("coreMeta").innerHTML =
      "<tr><td>Core</td><td><b>" + core.name + "</b></td></tr>"
      + "<tr><td>Material</td><td>" + core.mat + "</td></tr>"
      + "<tr><td>A<sub>L</sub></td><td>" + core.al + " µH·N² (per 1000)</td></tr>"
      + "<tr><td>Rentang optimal</td><td>" + core.freq + "</td></tr>"
      + "<tr><td>Dimensi (OD/ID/ht)</td><td>" + core.od + " / " + core.id + " / " + core.ht + " mm</td></tr>"
      + "<tr><td>Warna kode</td><td>" + core.color + "</td></tr>";

    if (!(target_uH > 0)) {
      $("resBox").innerHTML = '<div class="note">Masukkan nilai induktansi target &gt; 0.</div>';
      $("sugTable").innerHTML = "";
      $("indNote").textContent = "";
      return;
    }

    var r = calcToroid(core, target_uH, awg, state.fill);
    var pack = r.pack;
    var pct = pack.usable > 0 ? Math.min(100, r.N / pack.usable * 100) : 110;

    var html = "";
    html += '<div class="res-hero">' + r.N + '<span class="res-sub"> lilitan (N)</span></div>';
    html += '<table class="result" style="margin-top:10px">'
      + "<tr><td>Induktansi aktual (N bulat)</td><td><b>" + fmtInd(r.Lact_uH) + "</b></td></tr>"
      + "<tr><td>Deviasi dari target</td><td>" + (r.dev_pct >= 0 ? "+" : "") + r.dev_pct.toFixed(1) + " %</td></tr>"
      + "<tr><td>Kawat terpakai</td><td><b>" + r.wireLen_m.toFixed(2) + " m</b> (≈ " + trim3(r.wireLen_m * 100) + " cm)</td></tr>"
      + "<tr><td>Lilitan / lapisan</td><td>" + pack.npl + " × " + pack.layers + " lapisan</td></tr>"
      + "<tr><td>Kapasitas @fill " + Math.round(state.fill) + "%</td><td>" + pack.usable + " lilitan</td></tr>"
      + "</table>";
    html += '<div class="pack-track" title="N terpakai vs kapasitas"><div class="pack-fill' + (r.fits ? "" : " over") + '" style="width:' + (Math.min(pct, 100)) + '%"></div></div>'
      + '<div class="hint">' + (r.fits
          ? "✓ Semua " + r.N + " lilitan muat di permukaan inti (kawat AWG " + state.awg + ", fill " + Math.round(state.fill) + "%)."
          : "✗ " + r.N + " lilitan melebihi kapasitas " + pack.usable + " — ganti core lebih besar atau kawat lebih tipis (lihat saran di bawah).") + "</div>";
    $("resBox").innerHTML = html;

    /* --- suggestions --- */
    var rows = suggest(TOROIDS, target_uH, awg, state.fill);
    var shtml = "<thead><tr><th>Core</th><th>N</th><th>L aktual</th><th>Deviasi</th><th>Muat</th><th>OD</th></tr><tbody>";
    for (var k = 0; k < rows.length; k++) {
      var s = rows[k];
      var cur = s.core.code === core.code;
      var status = !s.ok ? "—" : (s.fits ? "✓ muat" : "✗ sesak");
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
      notes.push("A<sub>L</sub> core ini relatif besar: 1 lilitan saja sudah melewati target. Cari core A<sub>L</sub> lebih kecil atau terima overshoot.");
    }
    if (!r.fits) {
      var cand = null;
      for (var m = 0; m < rows.length; m++) { if (rows[m].ok && rows[m].fits && rows[m].core.code !== core.code) { cand = rows[m]; break; } }
      notes.push(cand
        ? "Saran: gunakan <b>" + cand.core.name + "</b> dengan " + cand.N + " lilitan (" + fmtInd(cand.Lact_uH) + ") — kawat AWG " + state.awg + " masih muat."
        : "Packing penuh pada semua core daftar — naikkan fill ratio atau kurangi target L.");
    } else if (pct > 85) {
      notes.push("Keritingan padat (>85% kapasitas) — Q akan turun sedikit; wajar untuk matching-network / RFI choke.");
    }
    notes.push("Nilai A<sub>L</sub> terukur bisa menyimpang ±5–20% dari katalog; ukur ulang L setelah melilit bila presisi penting.");
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
