"use strict";

/* =========================================================================
   RF LC Filter Designer & Calculator
   - Butterworth / Chebyshev lowpass prototypes (classical g-values)
   - Lowpass / Bandpass / Bandstop transforms
   - Conventional series-first / shunt-first topologies
   - ABCD / S-parameter analysis, schematic + response charts
   Elliptic (Cauer) synthesis is planned for a later release.
   ========================================================================= */

/* ---------------------------------------------------------------- g-values */
// Butterworth lowpass prototype (passband edge = 1 rad/s, Z0 = 1).
function butterworthG(n) {
  const g = [1];
  for (let k = 1; k <= n; k++) g.push(2 * Math.sin((2 * k - 1) * Math.PI / (2 * n)));
  g.push(1);
  return g;
}

// Chebyshev lowpass prototype (ripple in dB). g[n+1] is the load ratio.
function chebyshevG(n, rippleDb) {
  const beta = Math.log(1 / Math.tanh(rippleDb / 17.37));
  const gamma = Math.sinh(beta / (2 * n));
  const a = [], b = [];
  for (let k = 1; k <= n; k++) {
    a[k] = Math.sin((2 * k - 1) * Math.PI / (2 * n));
    b[k] = gamma * gamma + Math.pow(Math.sin(k * Math.PI / n), 2);
  }
  const g = [1];
  g[1] = 2 * a[1] / gamma;
  for (let k = 2; k <= n; k++) g[k] = (4 * a[k - 1] * a[k]) / (b[k - 1] * g[k - 1]);
  g[n + 1] = (n % 2) ? 1 : 1 / Math.pow(Math.tanh(beta / 4), 2);
  return g;
}

/* ------------------------------------------------------------- prototypes */
function prototypeBranches(n, firstElem) {
  const seriesFirst = firstElem === "series";
  const branches = [];
  for (let k = 1; k <= n; k++) {
    const isSeries = (k % 2 === 1) === seriesFirst;
    branches.push({ arm: isSeries ? "series" : "shunt", g: k });
  }
  return branches;
}

/* ----------------------------------------------------- full ladder build */
// Returns { g, branches, zs, zl, note }.
// branches: [{ arm, L, C, series }]  (series = L/C in series within the arm)
function buildBranches(opts) {
  const g = opts.type === "butterworth"
    ? butterworthG(opts.order)
    : chebyshevG(opts.order, opts.ripple);
  const proto = prototypeBranches(opts.order, opts.topology);
  const Z0 = opts.zin;
  const out = [];

  if (opts.response === "lowpass") {
    const wc = 2 * Math.PI * opts.fc;
    for (let i = 0; i < opts.order; i++) {
      const gk = g[i + 1];
      if (proto[i].arm === "series") out.push({ arm: "series", L: gk * Z0 / wc, C: null });
      else out.push({ arm: "shunt", L: null, C: gk / (Z0 * wc) });
    }
  } else {
    const w1 = 2 * Math.PI * opts.f1;
    const w2 = 2 * Math.PI * opts.f2;
    const w0 = Math.sqrt(w1 * w2);
    const D = (w2 - w1) / w0;
    const bp = opts.response === "bandpass";
    for (let i = 0; i < opts.order; i++) {
      const gk = g[i + 1];
      if (bp) {
        if (proto[i].arm === "series")
          out.push({ arm: "series", series: true, L: gk * Z0 / (D * w0), C: D / (gk * Z0 * w0) });
        else
          out.push({ arm: "shunt", series: false, L: Z0 * D / (gk * w0), C: gk / (Z0 * D * w0) });
      } else {
        if (proto[i].arm === "series")
          out.push({ arm: "series", series: false, L: Z0 * gk * D / w0, C: 1 / (Z0 * gk * D * w0) });
        else
          out.push({ arm: "shunt", series: true, L: Z0 / (gk * D * w0), C: gk * D / (Z0 * w0) });
      }
    }
  }

  // Terminations. Even-order Chebyshev is classically unequal.
  let zs = opts.zin, zl = opts.zout != null ? opts.zout : opts.zin, note = "";
  if (opts.type === "chebyshev" && opts.order % 2 === 0) {
    const gk = g[opts.order + 1];
    zl = (opts.topology === "series") ? opts.zin * gk : opts.zin / gk;
    note = "Chebyshev orde genap memiliki terminasi tak-sama (klasik): ";
    note += "R&#8321; = " + opts.zin.toFixed(1) + " &Omega;, R&#8322; = " + zl.toFixed(1) + " &Omega;.";
  }
  return { g, branches: out, Z0, zs, zl, note };
}

/* ----------------------------------------------------------- S-parameters */
const cadd = (x, y) => ({ re: x.re + y.re, im: x.im + y.im });
const csub = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });
const cmul = (x, y) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
const cdiv = (x, y) => {
  const d = y.re * y.re + y.im * y.im;
  return { re: (x.re * y.re + x.im * y.im) / d, im: (x.im * y.re - x.re * y.im) / d };
};

function branchABCD(br, w) {
  if (br.arm === "series") {
    let Z;
    if (br.C == null) Z = { re: 0, im: w * br.L };
    else if (br.L == null) Z = { re: 0, im: -1 / (w * br.C) };
    else if (br.series) Z = { re: 0, im: w * br.L - 1 / (w * br.C) };
    else {
      const YL = { re: 0, im: -1 / (w * br.L) };
      const YC = { re: 0, im: w * br.C };
      Z = cdiv({ re: 1, im: 0 }, cadd(YL, YC));
    }
    return { A: { re: 1, im: 0 }, B: Z, C: { re: 0, im: 0 }, D: { re: 1, im: 0 } };
  } else {
    let Y;
    if (br.L == null) Y = { re: 0, im: w * br.C };
    else if (br.C == null) Y = { re: 0, im: -1 / (w * br.L) };
    else if (!br.series) Y = { re: 0, im: w * br.C - 1 / (w * br.L) };
    else {
      const ZL = { re: 0, im: w * br.L };
      const ZC = { re: 0, im: -1 / (w * br.C) };
      Y = cdiv({ re: 1, im: 0 }, cadd(ZL, ZC));
    }
    return { A: { re: 1, im: 0 }, B: { re: 0, im: 0 }, C: Y, D: { re: 1, im: 0 } };
  }
}

function ladderSPars(branches, w, zs, zl) {
  let A = { re: 1, im: 0 }, B = { re: 0, im: 0 }, C = { re: 0, im: 0 }, D = { re: 1, im: 0 };
  for (const br of branches) {
    const m = branchABCD(br, w);
    const nA = cadd(cmul(A, m.A), cmul(B, m.C));
    const nB = cadd(cmul(A, m.B), cmul(B, m.D));
    const nC = cadd(cmul(C, m.A), cmul(D, m.C));
    const nD = cadd(cmul(C, m.B), cmul(D, m.D));
    A = nA; B = nB; C = nC; D = nD;
  }
  const zsC = { re: zs, im: 0 }, zlC = { re: zl, im: 0 };
  const den = cadd(cadd(cmul(A, zlC), B), cadd(cmul(cmul(C, zsC), zlC), cmul(D, zsC)));
  const s21 = cdiv({ re: 2 * Math.sqrt(zs * zl), im: 0 }, den);
  const s11num = csub(cadd(cmul(A, zlC), B), cadd(cmul(cmul(C, zsC), zlC), cmul(D, zsC)));
  const s11 = cdiv(s11num, den);
  return {
    s21db: 20 * Math.log10(Math.max(1e-12, Math.hypot(s21.re, s21.im))),
    s11db: 20 * Math.log10(Math.max(1e-12, Math.hypot(s11.re, s11.im))),
  };
}

/* ------------------------------------------- ideal prototype response */
// Ideal |S21| in dB for the selected response/type (normalized prototype).
function idealS21db(opts, f) {
  let Om;
  if (opts.response === "lowpass") Om = f / opts.fc;
  else {
    const w1 = 2 * Math.PI * opts.f1, w2 = 2 * Math.PI * opts.f2;
    const w0 = Math.sqrt(w1 * w2), D = (w2 - w1) / w0, w = 2 * Math.PI * f;
    Om = opts.response === "bandpass"
      ? Math.abs((w * w - w0 * w0) / (D * w0 * w))
      : Math.abs(D * w0 * w / (w0 * w0 - w * w));
  }
  if (opts.type === "butterworth") return -10 * Math.log10(1 + Math.pow(Om, 2 * opts.order));
  const eps = Math.sqrt(Math.pow(10, opts.ripple / 10) - 1);
  let T;
  if (Om >= 1) T = Math.cosh(opts.order * Math.acosh(Om));
  else T = Math.cos(opts.order * Math.acos(Om));
  return -10 * Math.log10(1 + eps * eps * T * T);
}

/* ------------------------------------------------------- E-series values */
const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
  3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

function nearestE24(v) {
  if (!(v > 0) || !isFinite(v)) return v;
  const exp = Math.floor(Math.log10(v));
  const mant = v / Math.pow(10, exp);
  let best = E24[0], bd = Infinity;
  for (const e of E24) if (Math.abs(e - mant) < bd) { bd = Math.abs(e - mant); best = e; }
  return best * Math.pow(10, exp);
}

// Snapshot of the ladder branches with every L/C snapped to the E24 series.
function standardBranches(branches) {
  return branches.map(br => {
    const o = Object.assign({}, br);
    if (o.L != null) o.L = nearestE24(o.L);
    if (o.C != null) o.C = nearestE24(o.C);
    return o;
  });
}

/* ------------------------------------------------------------- exports */
const API = { butterworthG, chebyshevG, prototypeBranches, buildBranches, ladderSPars, branchABCD, nearestE24, standardBranches, idealS21db };
if (typeof module !== "undefined" && module.exports) module.exports = API;

/* =========================================================================
   UI (browser only)
   ========================================================================= */
if (typeof document === "undefined") { /* node: stop here */ }
else (function () {

  const $ = (id) => document.getElementById(id);
  const state = { response: "lowpass", type: "chebyshev", topology: "shunt", vmode: "exact" };

  /* ---------------------------------------------------- input plumbing */
  const FREQ_UNIT = 1e6; // all frequency inputs are in MHz
  function readNumber(id, def) {
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : def;
  }

  // Show/hide inputs depending on response + type.
  function syncVisibility() {
    const resp = state.response;
    $("lpFreq").classList.toggle("hidden", resp !== "lowpass");
    $("bpFreq").classList.toggle("hidden", resp === "lowpass");
    $("rippleField").classList.toggle("hidden", state.type !== "chebyshev");
  }

  /* -------------------------------------------------------- formatting */
  function fmtL(v) {
    if (!isFinite(v)) return "\u221E";
    if (v >= 1) return v.toFixed(4) + " H";
    if (v >= 1e-3) return (v * 1e3).toFixed(4) + " mH";
    if (v >= 1e-6) return (v * 1e6).toFixed(4) + " \u00B5H";
    if (v >= 1e-9) return (v * 1e9).toFixed(3) + " nH";
    return (v * 1e12).toFixed(3) + " pH";
  }
  function fmtC(v) {
    if (!isFinite(v)) return "\u221E";
    if (v >= 1e-3) return (v * 1e3).toFixed(4) + " mF";
    if (v >= 1e-6) return (v * 1e6).toFixed(4) + " \u00B5F";
    if (v >= 1e-9) return (v * 1e9).toFixed(4) + " nF";
    return (v * 1e12).toFixed(3) + " pF";
  }
  function fmtOhm(v) {
    if (v >= 1000) return (v / 1e3).toFixed(3) + " k\u03A9";
    return v.toFixed(2) + " \u03A9";
  }
  function fmtHz(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(4) + " GHz";
    if (v >= 1e6) return (v / 1e6).toFixed(4) + " MHz";
    if (v >= 1e3) return (v / 1e3).toFixed(4) + " kHz";
    return v.toFixed(2) + " Hz";
  }

  /* ------------------------------------------------------- comp model */
  // Flatten branches into a numbered component list for display.
  function componentList(branches) {
    const comps = [];
    let idx = 0;
    for (const br of branches) {
      if (br.L == null && br.C == null) continue;
      if (br.C == null) { comps.push({ kind: "L", arm: br.arm, value: br.L, n: ++idx }); continue; }
      if (br.L == null) { comps.push({ kind: "C", arm: br.arm, value: br.C, n: ++idx }); continue; }
      if (br.series) { comps.push({ kind: "L", arm: br.arm, value: br.L, n: ++idx }); comps.push({ kind: "C", arm: br.arm, value: br.C, n: ++idx }); }
      else { comps.push({ kind: "L", arm: br.arm, value: br.L, n: ++idx }); comps.push({ kind: "C", arm: br.arm, value: br.C, n: ++idx }); }
    }
    return comps;
  }

  /* -------------------------------------------------------- schematic */
  /* Clean ladder renderer: fixed node grid, standard IEC L/C symbols,
     one earth per shunt tap, labels aligned on a consistent grid. */
  function drawSchematic(branches, zs, zl) {
    const M = 26, IN_GAP = 62, OUT_GAP = 62;
    const NODE_W = 160, BODY = 48;
    const RAIL = 78, GROUND = 246, LOFF = 36, XS = 26;
    const PLATE = 8, PH = 15, H = 306;
    const f = (v) => Number(v.toFixed(2));

    // labels — identical order to the component table (L then C per branch)
    const labels = [];
    let li = 0;
    for (const br of branches) {
      const o = {};
      if (br.L != null) o.L = "L" + (++li);
      if (br.C != null) o.C = "C" + (++li);
      labels.push(o);
    }

    // walk the ladder: nodes, series segments, shunt taps
    const series = [], shunts = [], nodes = [];
    let x = M + IN_GAP;
    nodes.push(x);
    for (let i = 0; i < branches.length; i++) {
      const br = branches[i];
      if (br.arm === "series") { series.push({ x1: x, x2: x + NODE_W, br, i }); x += NODE_W; nodes.push(x); }
      else shunts.push({ x, br, i });
    }
    const xIn = M, xOut = x + OUT_GAP;
    let maxLabelX = xOut;

    const P = [];
    const S = (s) => P.push(s);
    const txt = (cls, X, Y, a, s) => S(`<text class="${cls}" x="${f(X)}" y="${f(Y)}"${a ? ` text-anchor="${a}"` : ""}>${s}</text>`);
    const comp = (d) => S(`<path class="comp" d="${d}"/>`);
    const wire = (d) => S(`<path class="wire" d="${d}"/>`);
    const dot = (X, Y) => S(`<circle class="node" cx="${f(X)}" cy="${f(Y)}" r="3.4"/>`);
    const earth = (X, Y) => S(`<path class="gnd" d="M ${f(X - 14)} ${f(Y)} L ${f(X + 14)} ${f(Y)} M ${f(X - 8)} ${f(Y + 6)} L ${f(X + 8)} ${f(Y + 6)} M ${f(X - 3)} ${f(Y + 12)} L ${f(X + 3)} ${f(Y + 12)}"/>`);

    const hlead = (a, b, y) => `M ${f(a)} ${f(y)} L ${f(b)} ${f(y)}`;
    const vlead = (xc, a, b) => `M ${f(xc)} ${f(a)} L ${f(xc)} ${f(b)}`;
    const hcoil = (cx, y, b) => { const n = 4, st = b / n, r = st / 2; let d = `M ${f(cx - b / 2)} ${f(y)}`; for (let k = 0; k < n; k++) d += ` A ${f(r)} ${f(r)} 0 0 1 ${f(cx - b / 2 + (k + 1) * st)} ${f(y)}`; return d; };
    const vcoil = (xc, cy, b) => { const n = 4, st = b / n, r = st / 2; let d = `M ${f(xc)} ${f(cy - b / 2)}`; for (let k = 0; k < n; k++) d += ` A ${f(r)} ${f(r)} 0 0 1 ${f(xc)} ${f(cy - b / 2 + (k + 1) * st)}`; return d; };
    const hind = (x1, x2, y) => { const cx = (x1 + x2) / 2, b = Math.min(BODY, (x2 - x1) * 0.9); return hlead(x1, cx - b / 2, y) + " " + hcoil(cx, y, b) + " " + hlead(cx + b / 2, x2, y); };
    const vind = (xc, y1, y2) => { const cy = (y1 + y2) / 2, b = Math.min(BODY, (y2 - y1) * 0.9); return vlead(xc, y1, cy - b / 2) + " " + vcoil(xc, cy, b) + " " + vlead(xc, cy + b / 2, y2); };
    const hcap = (x1, x2, y) => { const cx = (x1 + x2) / 2; return hlead(x1, cx - PLATE, y) + ` M ${f(cx - PLATE)} ${f(y - PH)} L ${f(cx - PLATE)} ${f(y + PH)}` + ` M ${f(cx + PLATE)} ${f(y - PH)} L ${f(cx + PLATE)} ${f(y + PH)} ` + hlead(cx + PLATE, x2, y); };
    const vcap = (xc, y1, y2) => { const cy = (y1 + y2) / 2; return vlead(xc, y1, cy - PLATE) + ` M ${f(xc - PH)} ${f(cy - PLATE)} L ${f(xc + PH)} ${f(cy - PLATE)}` + ` M ${f(xc - PH)} ${f(cy + PLATE)} L ${f(xc + PH)} ${f(cy + PLATE)} ` + vlead(xc, cy + PLATE, y2); };

    // ---- input port ----------------------------------------------------
    wire(hlead(xIn, nodes[0], RAIL));
    txt("port", xIn + 6, RAIL - 14, "start", "IN");
    txt("port", xIn + 6, RAIL + 22, "start", fmtOhm(zs));

    // ---- series arms ---------------------------------------------------
    const SLEAD = 44; // inset first/last component from the ladder nodes
    for (const seg of series) {
      const { x1, x2, br, i } = seg, lab = labels[i];
      const a = x1 + SLEAD, b = x2 - SLEAD, cx = (a + b) / 2;
      wire(hlead(x1, a, RAIL) + " " + hlead(b, x2, RAIL));
      if (br.L != null && br.C == null) {
        comp(hind(a, b, RAIL));
        txt("rlabel", cx, RAIL - 32, "middle", lab.L); txt("rval", cx, RAIL - 18, "middle", fmtL(br.L));
      } else if (br.C != null && br.L == null) {
        comp(hcap(a, b, RAIL));
        txt("rlabel", cx, RAIL - 32, "middle", lab.C); txt("rval", cx, RAIL - 18, "middle", fmtC(br.C));
      } else if (br.series) {
        const mid = (a + b) / 2;
        comp(hind(a, mid, RAIL)); comp(hcap(mid, b, RAIL));
        txt("rlabel", (a + mid) / 2, RAIL - 32, "middle", lab.L); txt("rval", (a + mid) / 2, RAIL - 18, "middle", fmtL(br.L));
        txt("rlabel", (mid + b) / 2, RAIL - 32, "middle", lab.C); txt("rval", (mid + b) / 2, RAIL - 18, "middle", fmtC(br.C));
      } else {
        comp(hind(a, b, RAIL)); comp(hcap(a, b, RAIL + LOFF));
        wire(vlead(a, RAIL, RAIL + LOFF) + " " + vlead(b, RAIL, RAIL + LOFF));
        txt("rlabel", cx, RAIL - 32, "middle", lab.L); txt("rval", cx, RAIL - 18, "middle", fmtL(br.L));
        txt("rlabel", cx, RAIL + LOFF + 20, "middle", lab.C); txt("rval", cx, RAIL + LOFF + 34, "middle", fmtC(br.C));
      }
    }

    // ---- output port ---------------------------------------------------
    wire(hlead(nodes[nodes.length - 1], xOut, RAIL));
    txt("port", xOut - 6, RAIL - 14, "end", "OUT");
    txt("port", xOut - 6, RAIL + 22, "end", fmtOhm(zl));

    // ---- shunt arms ----------------------------------------------------
    for (const sh of shunts) {
      const { x, br, i } = sh, lab = labels[i];
      const mid = (RAIL + GROUND) / 2;
      const hasL = br.L != null, hasC = br.C != null;
      dot(x, RAIL);
      if (hasC && !hasL) comp(vcap(x, RAIL, GROUND));
      else if (hasL && !hasC) comp(vind(x, RAIL, GROUND));
      else if (br.series) { comp(vind(x, RAIL, mid)); comp(vcap(x, mid, GROUND)); }
      else {
        comp(vind(x - XS, RAIL, GROUND)); comp(vcap(x + XS, RAIL, GROUND));
        wire(hlead(x - XS, x + XS, RAIL) + " " + hlead(x - XS, x + XS, GROUND));
      }
      earth(x, GROUND);
      // label block beside the vertical arm (label over value, per component)
      const parallel = hasL && hasC && !br.series;
      const right = parallel ? x + XS + PH : (hasC ? x + PH : x + 6);
      const X = right + 10;
      const lines = [];
      if (hasL) { lines.push(["rlabel", lab.L]); lines.push(["rval", fmtL(br.L)]); }
      if (hasC) { lines.push(["rlabel", lab.C]); lines.push(["rval", fmtC(br.C)]); }
      const LH = 15, y0 = mid - (lines.length - 1) * LH / 2;
      lines.forEach((ln, k) => {
        txt(ln[0], X, y0 + k * LH, "start", ln[1]);
        maxLabelX = Math.max(maxLabelX, X + 6.6 * ln[1].length);
      });
    }

    const W = Math.max(xOut + M, maxLabelX + 12);
    return `<svg viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}" xmlns="http://www.w3.org/2000/svg">${P.join("")}</svg>`;
  }

  /* ------------------------------------------------------------- chart */
  let chartState = null;   // geometry of the last drawn chart
  let chartTip = null;     // tooltip element

  function nearestPt(pts, f) {
    let best = null, bd = Infinity;
    for (const p of pts) {
      const d = Math.abs(Math.log10(p.x) - Math.log10(f));
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function drawChart(canvas, curves, fmin, fmax, hoverF) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 420, H = canvas.clientHeight || 220;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue("--muted").trim() || "#999";
    const border = css.getPropertyValue("--border").trim() || "#888";
    const L = 48, R = 42, T = 14, Bm = 46;
    const pw = W - L - R, ph = H - T - Bm;
    const lx = (f) => L + (Math.log10(f) - Math.log10(fmin)) / (Math.log10(fmax) - Math.log10(fmin)) * pw;
    // per-curve dB scale (S21 left, S22 right)
    const yminL = curves[0] ? curves[0].ymin : -80;
    const yminR = curves[1] ? curves[1].ymin : yminL;
    const lyL = (d) => T + (0 - d) / (0 - yminL) * ph;
    const lyR = (d) => T + (0 - d) / (0 - yminR) * ph;
    const lyC = (c, d) => T + (0 - d) / (0 - c.ymin) * ph;
    const step = (mn) => (0 - mn) > 80 ? 20 : (0 - mn) > 40 ? 10 : 5;

    // grid + left tick labels (S21 scale)
    ctx.strokeStyle = border; ctx.fillStyle = muted; ctx.lineWidth = 1;
    ctx.font = "10px Consolas, monospace";
    ctx.textBaseline = "middle";
    const ysL = step(yminL);
    for (let d = 0; d >= yminL; d -= ysL) {
      const y = lyL(d);
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = "right"; ctx.fillText(d + "", L - 6, y);
    }
    // right ruler labels (S22 scale)
    const ysR = step(yminR);
    for (let d = 0; d >= yminR; d -= ysR) {
      const y = lyR(d);
      ctx.textAlign = "left"; ctx.fillText(d + "", L + pw + 6, y);
    }
    // x decade labels
    ctx.textBaseline = "alphabetic";
    for (let e = Math.ceil(Math.log10(fmin)); e <= Math.floor(Math.log10(fmax)); e++) {
      const x = lx(Math.pow(10, e));
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = "center"; ctx.fillText(engHz(Math.pow(10, e)), x, T + ph + 14);
    }
    // axes (left, bottom, right ruler)
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L + pw, T); ctx.lineTo(L + pw, T + ph); ctx.stroke();
    ctx.globalAlpha = 1;

    // axis titles
    ctx.fillStyle = muted; ctx.font = "11px Segoe UI, sans-serif";
    ctx.save(); ctx.translate(13, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("S21 (dB)", 0, 0); ctx.restore();
    ctx.save(); ctx.translate(W - 13, T + ph / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("S22 (dB)", 0, 0); ctx.restore();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("Frequency (Hz)", L + pw / 2, H - 6);
    ctx.textAlign = "start";

    // curves (each on its own dB scale)
    for (const c of curves) {
      ctx.strokeStyle = c.color; ctx.lineWidth = 2; ctx.beginPath();
      let started = false;
      for (const p of c.pts) {
        if (p.x < fmin || p.x > fmax) continue;
        const X = lx(p.x), Y = lyC(c, Math.max(c.ymin, p.y));
        if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }

    // hover crosshair + markers
    if (hoverF != null && hoverF >= fmin && hoverF <= fmax) {
      const xh = lx(hoverF);
      ctx.strokeStyle = muted; ctx.globalAlpha = 0.55; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(xh, T); ctx.lineTo(xh, T + ph); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      for (const c of curves) {
        const p = nearestPt(c.pts, hoverF);
        if (!p) continue;
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.arc(lx(p.x), lyC(c, Math.max(c.ymin, p.y)), 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    chartState = { canvas, curves, fmin, fmax, L, R, T, Bm, pw, ph, W, H };
  }
  function engHz(v) {
    if (v >= 1e9) return (v / 1e9) + "G";
    if (v >= 1e6) return (v / 1e6) + "M";
    if (v >= 1e3) return (v / 1e3) + "k";
    return v + "";
  }

  /* ------------------------------------------------------------ render */
  function render() {
    const unit = FREQ_UNIT;
    const opts = {
      response: state.response,
      type: state.type,
      topology: state.topology,
      order: Math.max(1, Math.min(10, Math.round(readNumber("order", 3)))),
      ripple: readNumber("ripple", 0.5),
      zin: readNumber("z0", 50),
      zout: readNumber("z0", 50),
    };
    if (state.response === "lowpass") {
      opts.fc = readNumber("fc", 100) * unit;
    } else {
      opts.f1 = readNumber("f1", 90) * unit;
      opts.f2 = readNumber("f2", 110) * unit;
      if (opts.f2 <= opts.f1) { opts.f2 = opts.f1 * 1.1; }
    }

    const design = buildBranches(opts);
    const { branches, zs, zl, g } = design;
    const useStd = state.vmode === "std";
    const effBranches = useStd ? standardBranches(branches) : branches;

    // --- schematic
    $("schematic").innerHTML = drawSchematic(effBranches, zs, zl);

    // --- component table
    const comps = componentList(branches);
    let rows = "";
    for (const c of comps) {
      const exact = c.kind === "L" ? fmtL(c.value) : fmtC(c.value);
      let shown = exact;
      if (state.vmode === "std") {
        const r = nearestE24(c.value);
        shown = (c.kind === "L" ? fmtL(r) : fmtC(r));
      }
      const where = c.arm === "series" ? "series" : "shunt";
      rows += `<tr><td>${c.kind}${c.n}</td><td>${where}</td><td class="dev">${shown}</td></tr>`;
    }
    $("compTable").innerHTML =
      `<thead><tr><th>Ref</th><th>Arm</th><th class="dev">Value${state.vmode === "std" ? " (E24)" : ""}</th></tr></thead><tbody>${rows}</tbody>`;
    $("termInfo").innerHTML =
      `<tr><td>Source (R1)</td><td>${fmtOhm(zs)}</td></tr>`
      + `<tr><td>Load (R2)</td><td>${fmtOhm(zl)}</td></tr>`
      + `<tr><td>Order</td><td>${opts.order}</td></tr>`;
    $("designNote").innerHTML = design.note
      || "Desain tercocok pada impedansi sistem. " + (state.vmode === "std" ? "Nilai dibulatkan ke deret E24." : "Nilai eksak ideal.");

    // --- response curves
    const HI = 6.5, LO = 0.4; // chart x-range: min = 0.4*f, max = 6.5*f
    let fmin, fmax;
    if (state.response === "lowpass") { fmin = opts.fc * LO; fmax = opts.fc * HI; }
    else { fmin = opts.f1 * LO; fmax = opts.f2 * HI; }
    const N = 400;
    const c21 = [], c11 = [];
    const zsTx = zs, zlTx = zl;
    for (let i = 0; i <= N; i++) {
      const f = fmin * Math.pow(fmax / fmin, i / N);
      const w = 2 * Math.PI * f;
      const s = ladderSPars(effBranches, w, zsTx, zlTx);
      c21.push({ x: f, y: s.s21db });
      c11.push({ x: f, y: s.s11db });
    }
    const css = getComputedStyle(document.documentElement);
    const acc = css.getPropertyValue("--accent").trim() || "#E5E793";
    const warn = css.getPropertyValue("--warn").trim() || "#d9b84a";
    const curves = [
      { pts: c21, color: acc, name: "S21", ymin: -80 },
      { pts: c11, color: warn, name: "S22", ymin: -40 },
    ];
    lastChart = { curves, fmin, fmax };
    drawChart($("chart"), curves, fmin, fmax);
    bindChartHover();
    $("chartLegend").innerHTML =
      `<span><span class="dot" style="background:${acc}"></span>S21</span>`
      + `<span><span class="dot" style="background:${warn}"></span>S22</span>`;
  }

  /* --------------------------------------------------- chart hover tip */
  let lastChart = null, chartHoverBound = false;

  function fmtFreqHz(f) {
    if (f >= 1e9) return (f / 1e9).toFixed(3) + " GHz";
    if (f >= 1e6) return (f / 1e6).toFixed(3) + " MHz";
    if (f >= 1e3) return (f / 1e3).toFixed(3) + " kHz";
    return f.toFixed(2) + " Hz";
  }

  function redrawChart(hoverF) {
    if (!lastChart) return;
    drawChart($("chart"), lastChart.curves, lastChart.fmin, lastChart.fmax, hoverF);
  }

  function bindChartHover() {
    if (chartHoverBound) return;
    chartHoverBound = true;
    const canvas = $("chart"), box = canvas.parentElement;
    if (!chartTip) { chartTip = document.createElement("div"); chartTip.className = "chart-tip"; chartTip.style.display = "none"; box.appendChild(chartTip); }
    canvas.addEventListener("mousemove", (e) => {
      if (!lastChart || !chartState) return;
      const rect = canvas.getBoundingClientRect(), boxRect = box.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const { fmin, fmax, L, pw } = chartState;
      const frac = Math.min(1, Math.max(0, (mx - L) / pw));
      const f = Math.pow(10, Math.log10(fmin) + frac * (Math.log10(fmax) - Math.log10(fmin)));
      redrawChart(f);
      let html = `<div class="tt-freq">${fmtFreqHz(f)}</div>`;
      for (const c of lastChart.curves) {
        const p = nearestPt(c.pts, f);
        if (!p) continue;
        html += `<div class="tt-row"><span class="tt-dot" style="background:${c.color}"></span>${c.name}<b>${p.y.toFixed(2)} dB</b></div>`;
      }
      chartTip.innerHTML = html;
      chartTip.style.display = "block";
      let tx = e.clientX - boxRect.left + 14;
      const tw = chartTip.offsetWidth;
      if (tx + tw > boxRect.width) tx = e.clientX - boxRect.left - tw - 14;
      chartTip.style.left = Math.max(0, tx) + "px";
      chartTip.style.top = (e.clientY - boxRect.top + 10) + "px";
    });
    canvas.addEventListener("mouseleave", () => {
      if (chartTip) chartTip.style.display = "none";
      redrawChart(null);
    });
  }

  /* ------------------------------------------------------------ events */
  $("respType").addEventListener("change", (e) => { state.response = e.target.value; syncVisibility(); render(); });
  $("filterType").addEventListener("change", (e) => { state.type = e.target.value; syncVisibility(); render(); });
  $("topology").addEventListener("change", (e) => { state.topology = e.target.value; render(); });
  document.querySelectorAll("#vmode button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#vmode button").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); state.vmode = b.dataset.v; render();
  }));
  ["order", "ripple", "fc", "f1", "f2", "z0"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("input", render);
    if (el) el.addEventListener("change", render);
  });

  window.addEventListener("resize", () => render());

  syncVisibility();
  render();
  if (window.lucide) lucide.createIcons();
})();
