"use strict";

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

// ---- Complex helpers ----
const cx = {
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => {
    const d = b.re * b.re + b.im * b.im || 1e-18;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  conj: (a) => ({ re: a.re, im: -a.im }),
  abs2: (a) => a.re * a.re + a.im * a.im,
  abs: (a) => Math.hypot(a.re, a.im)
};
const jZ = (x) => ({ re: 0, im: x });
const rect = (r, x) => ({ re: r, im: x });
const ONE = { re: 1, im: 0 };

// ---- Formatting ----
function fmtFreq(f) {
  if (!isFinite(f)) return "—";
  if (f >= 1e9) return (f / 1e9).toPrecision(4).replace(/\.?0+$/, "") + " GHz";
  if (f >= 1e6) return (f / 1e6).toPrecision(4).replace(/\.?0+$/, "") + " MHz";
  if (f >= 1e3) return (f / 1e3).toPrecision(4).replace(/\.?0+$/, "") + " kHz";
  return f.toFixed(2) + " Hz";
}
function fmtL(v) {
  if (!isFinite(v) || v <= 0) return "—";
  if (v >= 1e-3) return (v * 1e3).toPrecision(4).replace(/\.?0+$/, "") + " mH";
  if (v >= 1e-6) return (v * 1e6).toPrecision(4).replace(/\.?0+$/, "") + " µH";
  if (v >= 1e-9) return (v * 1e9).toPrecision(4).replace(/\.?0+$/, "") + " nH";
  return (v * 1e12).toPrecision(4).replace(/\.?0+$/, "") + " pH";
}
function fmtC(v) {
  if (!isFinite(v) || v <= 0) return "—";
  if (v >= 1e-6) return (v * 1e6).toPrecision(4).replace(/\.?0+$/, "") + " µF";
  if (v >= 1e-9) return (v * 1e-9).toPrecision(4).replace(/\.?0+$/, "") + " nF";
  return (v * 1e12).toPrecision(4).replace(/\.?0+$/, "") + " pF";
}
const fmtZc = (v, t) => (t === "L" ? fmtL(v) : fmtC(v));

// Reflection coefficient w.r.t. reference impedance Zref; zero when matched
function gamma(Zin, Zref) {
  return cx.div(cx.sub(Zin, Zref), cx.add(Zin, Zref));
}

// Reactance of a reactive element at frequency f
function zElem(e, f) {
  const w = TAU * f;
  return e.t === "L" ? jZ(w * e.v) : jZ(-1 / (w * e.v));
}

// Input impedance of the L-network at frequency f (exact, complex)
function zInAtF(s, f, ZL) {
  const zsh = zElem(s.shunt, f);
  const zsr = zElem(s.series, f);
  if (s.form === "Shunt–Series") {
    // ZL in parallel with shunt, then series
    const zpar = cx.div(cx.mul(ZL, zsh), cx.add(ZL, zsh));
    return cx.add(zpar, zsr);
  }
  // Series–Shunt: ZL in series with series element, then shunt to source
  const z1 = cx.add(ZL, zsr);
  const yTot = cx.add(cx.div(ONE, z1), cx.div(ONE, zsh));
  return cx.div(ONE, yTot);
}

// ---- L-Network solver: transform ZL -> Zin = Zt = Zs* (conjugate match to source) ----
function solveLMatching(Zs, ZL, f0) {
  const w = TAU * f0;
  const Zt = cx.conj(Zs);
  const Rl = ZL.re, Xl = ZL.im, Rt = Zt.re, Xt = Zt.im;
  const zl2 = cx.abs2(ZL);
  const zt2 = cx.abs2(Zt);
  const sols = [];
  if (!(Rt > 0) || !(zl2 > 1e-12) || !(f0 > 0)) return sols;

  // FORM 1: shunt susceptance jB across the load, then series jXs to source.
  // Parallel section: G = Rl/zl2, Bp = B - Xl/zl2.  Re(Zp) = G/(G²+Bp²) = Rt
  //   => Bp = ± sqrt( Rl*(zl2 - Rt*Rl) / (Rt*zl2²) )
  // Series: Xs = Xt - Im(Zp) = Xt + Bp*Rt*zl2/Rl
  {
    const K1 = Rl * (zl2 - Rt * Rl) / (Rt * zl2 * zl2);
    if (K1 >= 0) {
      const bSigns = K1 > 1e-15 ? [1, -1] : [1];
      for (const sgn of bSigns) {
        const Bp = sgn * Math.sqrt(K1);
        const B = Bp + Xl / zl2;
        if (Math.abs(B) < 1e-9) continue;
        const Xs = Xt + (Bp * Rt * zl2) / Rl;
        if (Math.abs(Xs) < 1e-9) continue;
        const shunt = B > 0 ? { t: "C", v: B / w } : { t: "L", v: -1 / (w * B) };
        const ser = Xs > 0 ? { t: "L", v: Xs / w } : { t: "C", v: -1 / (w * Xs) };
        sols.push({ form: "Shunt–Series", shunt, series: ser });
      }
    }
  }

  // FORM 2: series reactance jXs with the load, then shunt susceptance jB to source.
  // Z1 = Rl + j(Xl+Xs).  Y1.re must equal Gt = Rt/zt2  =>  zl1 = Rl*zt2/Rt.
  //   (Xl+Xs)^2 = Rl*zt2/Rt - Rl^2
  // Shunt: B = Bt - Y1.im where Bt = -Xt/zt2.
  {
    const D = (Rl * zt2) / Rt - Rl * Rl;
    if (D >= 0) {
      const sd = Math.sqrt(D);
      const signs = D > 1e-15 ? [1, -1] : [1];
      const Bt = -Xt / zt2;
      for (const sgn of signs) {
        const X1tot = sgn * sd;      // = Xl + Xs
        const Xs = X1tot - Xl;
        if (Math.abs(Xs) < 1e-9) continue;
        const zl1 = (Rl * zt2) / Rt;
        const Y1im = -X1tot / zl1;
        const B = Bt - Y1im;
        if (Math.abs(B) < 1e-9) continue;
        const ser = Xs > 0 ? { t: "L", v: Xs / w } : { t: "C", v: -1 / (w * Xs) };
        const shunt = B > 0 ? { t: "C", v: B / w } : { t: "L", v: -1 / (w * B) };
        sols.push({ form: "Series–Shunt", shunt, series: ser });
      }
    }
  }

  // Loaded Q & bandwidth (VSWR < 2) per solution
  for (const s of sols) {
    s.bw = bwOf(s, ZL, Zt, f0);
    s.q = s.bw > 0 ? f0 / s.bw : null;
  }
  let best = null;
  for (const s of sols) if (s.q != null && (best == null || s.q < best.q)) best = s;
  sols.forEach((s) => (s.rec = s === best));
  return sols;
}
// Bandwidth where VSWR <= 2 (|Gamma| <= 1/3), scanning outward from f0
function bwOf(s, ZL, Zt, f0) {
  const fmin = 0.35 * f0, fmax = 3 * f0;
  const gm = (f) => { const g = gamma(zInAtF(s, f, ZL), Zt); return Math.sqrt(g.re * g.re + g.im * g.im); };
  if (gm(f0) > 1 / 3) return 0;
  const step = (fmax - fmin) / 400;
  let loF = f0, hiF = f0;
  for (let f = f0 - step; f >= fmin; f -= step) { if (gm(f) <= 1 / 3) loF = f; else break; }
  for (let f = f0 + step; f <= fmax; f += step) { if (gm(f) <= 1 / 3) hiF = f; else break; }
  return hiF - loF;
}

// Frequency sweep data
function sweepOf(s, ZL, Zt, f0) {
  const fmin = 0.35 * f0, fmax = 3 * f0;
  const N = 160;
  const out = [];
  for (let i = 0; i <= N; i++) {
    const f = fmin * Math.pow(fmax / fmin, i / N);
    const g = gamma(zInAtF(s, f, ZL), Zt);
    const gm = Math.sqrt(g.re * g.re + g.im * g.im);
    out.push({ f, gm, vswr: gm >= 0.999999 ? 999 : (1 + gm) / (1 - gm), rl: gm <= 1e-6 ? 60 : -20 * Math.log10(gm) });
  }
  return out;
}

// Interpolate sweep curve values at frequency f (log-spaced points)
function interpAt(sw, f) {
  let lo = 0, hi = sw.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sw[m].f <= f) lo = m; else hi = m; }
  const a = sw[lo], b = sw[hi];
  const t = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f);
  const L = (u, v) => u + (v - u) * t;
  return { gm: L(a.gm, b.gm), vswr: L(a.vswr, b.vswr), rl: L(a.rl, b.rl) };
}

// ---------- SVG Schematic & Sparkline helpers ----------
function schematicSVG(s) {
  const serVal = fmtZc(s.series.v, s.series.t);
  const shVal = fmtZc(s.shunt.v, s.shunt.t);
  const serLbl = s.series.t + "1";
  const shLbl = s.shunt.t + "2";

  if (s.shunt.t === "C") {
    // --- Low-pass layout (Shunt-C; Series-L by default) ---
    const serSVG = s.series.t === "L"
      ? `<line x1="110" y1="72" x2="174" y2="72"/>
  <path d="M174 72 C174 60 184 60 184 72 C184 60 194 60 194 72 C194 60 204 60 204 72 C204 60 214 60 214 72"/>
  <line x1="214" y1="72" x2="270" y2="72"/>`
      : `<line x1="110" y1="72" x2="190" y2="72"/>
  <line x1="190" y1="60" x2="190" y2="84" stroke="#ffffff" stroke-width="3"/>
  <line x1="198" y1="60" x2="198" y2="84" stroke="#ffffff" stroke-width="3"/>
  <line x1="198" y1="72" x2="270" y2="72"/>`;
    return `<svg class="calc-svg" viewBox="0 0 300 152" role="img" aria-label="LC matching network schematic" fill="none">
  <rect x="0" y="0" width="300" height="152" rx="10" fill=""/>
    <g fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <!-- Main signal path -->
    <line x1="30" y1="72" x2="110" y2="72"/>
    ${serSVG}
    <!-- Shunt capacitor and ground -->
    <line x1="110" y1="72" x2="110" y2="92"/>
    <line x1="99" y1="92" x2="121" y2="92" stroke="#ffffff" stroke-width="3"/>
    <line x1="99" y1="101" x2="121" y2="101" stroke="#ffffff" stroke-width="3"/>
    <line x1="110" y1="101" x2="110" y2="122"/>
    <line x1="98" y1="122" x2="122" y2="122"/>
    <line x1="102" y1="127" x2="118" y2="127"/>
    <line x1="106" y1="132" x2="114" y2="132"/>
  </g>
  <!-- Ports and junction -->
  <circle cx="30" cy="72" r="4" fill="#ffffff"/>
  <circle cx="270" cy="72" r="4" fill="#ffffff"/>
  <circle cx="110" cy="72" r="3.5" fill="#ffffff"/>
  <!-- Labels -->
  <g font-family="ui-monospace, SFMono-Regular, Consolas, monospace" fill="#ffffff">
    <text x="30" y="53" text-anchor="middle" font-size="13" font-weight="600">Zs</text>
    <text x="270" y="53" text-anchor="middle" font-size="13" font-weight="600">ZL</text>
    <text x="194" y="43" text-anchor="middle" font-size="11" fill="#ffffff">${serLbl} = ${serVal}</text>
    <text x="126" y="99" text-anchor="start" font-size="11" fill="#ffffff">${shLbl} = ${shVal}</text>
  </g>
</svg>`;
  }

  // --- High-pass layout (Shunt-L; Series-C by default) ---
  const serSVG = s.series.t === "C"
    ? `<line x1="112" y1="52" x2="204" y2="52" stroke="#ffffff" stroke-width="2" opacity=".8"/>
  <line x1="204" y1="40" x2="204" y2="64" stroke="#ffffff" stroke-width="3" opacity=".9"/>
  <line x1="212" y1="40" x2="212" y2="64" stroke="#ffffff" stroke-width="3" opacity=".9"/>
  <line x1="212" y1="52" x2="270" y2="52" stroke="#ffffff" stroke-width="2" opacity=".8"/>`
    : `<line x1="112" y1="52" x2="196" y2="52" stroke="#ffffff" stroke-width="2" opacity=".8"/>
  <path d="M196 52 C196 40 206 40 206 52 C206 40 216 40 216 52 C216 40 226 40 226 52" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
  <line x1="226" y1="52" x2="270" y2="52" stroke="#ffffff" stroke-width="2" opacity=".8"/>`;
  const serLblX = s.series.t === "C" ? 208 : 211;
  return `<svg class="calc-svg" viewBox="0 0 300 152" role="img" aria-label="Matching network schematic" fill="none">
  <!-- Main signal path -->
  <line x1="30" y1="52" x2="112" y2="52" stroke="#ffffff" stroke-width="2" opacity=".8"/>
  ${serSVG}

  <!-- Shunt inductor and ground -->
  <line x1="112" y1="52" x2="112" y2="66" stroke="#ffffff" stroke-width="2" opacity=".8"/>
  <path d="M112 66a6 6 0 0 0 0 12a6 6 0 0 0 0 12a6 6 0 0 0 0 12" fill="none" stroke="#ffffff" stroke-width="2" opacity=".8"/>
  <line x1="112" y1="102" x2="112" y2="124" stroke="#ffffff" stroke-width="2" opacity=".8"/>
  <line x1="100" y1="124" x2="124" y2="124" stroke="#ffffff" stroke-width="2" opacity=".8"/>
  <line x1="104" y1="128" x2="120" y2="128" stroke="#ffffff" stroke-width="2" opacity=".8"/>
  <line x1="108" y1="132" x2="116" y2="132" stroke="#ffffff" stroke-width="2" opacity=".8"/>

  <!-- Ports and component labels -->
  <circle cx="30" cy="52" r="3.5" fill="#ffffff"/>
  <circle cx="270" cy="52" r="3.5" fill="#ffffff"/>
  <text x="30" y="34" text-anchor="middle" font-size="13" font-weight="600" font-family="monospace" fill="#ffffff">Zs</text>
  <text x="270" y="34" text-anchor="middle" font-size="13" font-weight="600" font-family="monospace" fill="#ffffff">ZL</text>
  <text x="${serLblX}" y="26" text-anchor="middle" font-size="11" font-family="monospace" fill="#ffffff">${serLbl}=${serVal}</text>
  <text x="124" y="88" text-anchor="start" font-size="11" font-family="monospace" fill="#ffffff">${shLbl}=${shVal}</text>
</svg>`;
}

// ---------- UI ----------
let selected = 0;
// hover state for VSWR / RL line charts: { draw(hf), tip(hf), fmin, fmax, x0, x1 }
const hoverState = { vswr: null, rl: null };
let tipEl = null;
function getTip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "chart-tip";
  tipEl.style.position = "fixed";
  tipEl.style.display = "none";
  document.body.appendChild(tipEl);
  return tipEl;
}
function bindHoverOnce() {
  const map = { vswr: "vswr", rl: "rlChart" };
  Object.keys(map).forEach((key) => {
    const cv = $(map[key]);
    if (!cv || cv.dataset.hb === "1") return;
    cv.dataset.hb = "1";
    cv.style.cursor = "crosshair";
    let rafId = null, lastHf = null, lastE = null;
    const paint = () => {
      rafId = null;
      if (lastHf == null) return;
      const p = hoverState[key]; if (!p) return;
      p.draw(lastHf);
      const tip = getTip();
      tip.innerHTML = p.tip(lastHf);
      tip.style.display = "block";
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let tx = lastE.clientX + 14, ty = lastE.clientY + 12;
      if (tx + tw > window.innerWidth) tx = lastE.clientX - tw - 14;
      if (ty + th > window.innerHeight) ty = lastE.clientY - th - 12;
      tip.style.left = Math.max(4, tx) + "px";
      tip.style.top = Math.max(4, ty) + "px";
    };
    cv.addEventListener("mousemove", (e) => {
      const p = hoverState[key]; if (!p) return;
      const rect = cv.getBoundingClientRect();
      let frac = (e.clientX - rect.left - p.x0) / (p.x1 - p.x0);
      frac = Math.max(0, Math.min(1, frac));
      lastHf = p.fmin + frac * (p.fmax - p.fmin);
      lastE = e;
      if (rafId == null) rafId = requestAnimationFrame(paint);
    });
    cv.addEventListener("mouseleave", () => {
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
      const p = hoverState[key];
      if (p) p.draw(null);
      getTip().style.display = "none";
      lastHf = null;
    });
  });
}

function readInputs() {
  const ids = ["fUnit", "f0", "rs", "xs", "rl", "xl", "z0"];
  for (const id of ids) if (!$(id)) return null;
  const fu = parseFloat($("fUnit").value) || 1e6;
  const f0 = (parseFloat($("f0").value) || 0) * fu;
  return {
    f0,
    Zs: rect(parseFloat($("rs").value) || 0, parseFloat($("xs").value) || 0),
    ZL: rect(parseFloat($("rl").value) || 0, parseFloat($("xl").value) || 0),
    Z0: parseFloat($("z0").value) || 50
  };
}

function render() {
  const inp = readInputs();
  if (!inp) return;
  const { f0, Zs, ZL, Z0 } = inp;
  const Zt = cx.conj(Zs);
  const sols = solveLMatching(Zs, ZL, f0);
  if (selected >= sols.length) selected = 0;

  // Build solution cards
  const container = $("solCards");
  if (container) {
    container.innerHTML = "";
    if (!sols.length) {
      container.innerHTML = '<div class="alert">No valid solution — check that Re(Z<sub>s</sub>*) &gt; 0 and the load is reachable.</div>';
    } else {
      sols.forEach((s, i) => {
        const card = document.createElement("div");
        card.className = "sol-card" + (i === selected ? " sel" : "");
        const tag = s.rec ? 'Recommended · best Q' : 'Alternative';
        const tagCls = s.rec ? "sol-tag rec" : "sol-tag";
        card.innerHTML =
          `<div class="sol-card-head">
            <span class="sol-card-index">${i + 1}</span>
            <span class="sol-card-type">${s.form}</span>
            <span class="${tagCls}">${tag}</span>
          </div>
          <div class="sol-tiles">
            <div class="sol-tile"><span class="k">${s.shunt.t} (shunt)</span><span class="v">${fmtZc(s.shunt.v, s.shunt.t)}</span></div>
            <div class="sol-tile"><span class="k">${s.series.t} (series)</span><span class="v">${fmtZc(s.series.v, s.series.t)}</span></div>
            <div class="sol-tile"><span class="k">Q<sub>L</sub></span><span class="v">${s.q != null ? s.q.toFixed(2) : "—"}</span></div>
            <div class="sol-tile"><span class="k">BW (VSWR&lt;2)</span><span class="v">${s.bw > 0 ? fmtFreq(s.bw) : "—"}</span></div>
          </div>
          <div class="sol-schematic">${schematicSVG(s)}</div>
          <button class="sol-select" data-i="${i}">${i === selected ? "Selected" : "Select"}</button>`;
        card.querySelector(".sol-select").onclick = () => { selected = i; render(); };
        container.appendChild(card);
      });
    }
  }
  const note = $("solNote");
  if (note) note.innerHTML = "";

  const sel = sols[selected] || null;
  drawSmith(sols, sel, ZL, Zt, Z0, f0);
  drawVSWR(sols, sel, ZL, Zt, f0);
  drawRL(sols, sel, ZL, Zt, f0);
  drawMetrics(sel, ZL, Zt, f0, Z0);
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function canvas2d(id, pad, fixedW, fixedH) {
  const cv = $(id);
  if (!cv) return null;
  const dpr = window.devicePixelRatio || 1;
  // lock the design height once so repeated (hover) redraws don't compound dpr
  if (!cv.dataset.baseh) cv.dataset.baseh = fixedH || (parseInt(cv.getAttribute("height")) || 260);
  const H = fixedH || +cv.dataset.baseh;
  const parentW = cv.parentElement ? cv.parentElement.clientWidth : 0;
  const W = fixedW || (parentW > 0 ? parentW : (cv.clientWidth || 560));
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  cv.style.width = W + "px"; cv.style.height = H + "px";
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H, pad: pad || { l: 46, r: 14, t: 18, b: 30 } };
}

// ---------- Smith chart (unit-impedance, normalized to Z0) ----------
// Grid scale as the reference SVG: sx=62+62·Re, sy=62-62·Im for normalized z.
// Resistance circles r: cx=62+62·r/(r+1), R=62/√((r+1)²+r²)
// Reactance/susceptance arcs v: cx=62+62·(v-1/v)/2, R=31/|v|  (x arcs up, b arcs down)
const S_R = [0.2, 0.5, 1, 2, 5];   // resistance circles
const S_X = [0.2, 0.5, 1, 2, 5];   // reactance arcs (upper half, +x)
const S_B = [0.2, 0.5, 1, 2, 5];   // susceptance arcs (lower half, -b)

// normalized impedance z = Z/Z0 -> reflection coefficient Î“ = (z-1)/(z+1) -> svg xy.
// Î“.real/imag are in [-1,1]; map to a 62-radius circle centred at (62,62).
function nz2xy(z) {
  // Γ = (z - 1) / (z + 1),  z = re + j·im
  const zr = z.re, zi = z.im;
  const dr = zr + 1, di = zi;                       // (z+1)
  const nr = zr - 1, ni = zi;                       // (z-1)
  const d2 = dr * dr + di * di;
  const gRe = (nr * dr + ni * di) / (d2 || 1e-18);  // Re(Γ)
  const gIm = (ni * dr - nr * di) / (d2 || 1e-18);  // Im(Γ)
  return { sx: 300 + 255 * gRe, sy: 300 - 255 * gIm };
}
// normalized admittance y = Y/Y0 -> reflection coefficient Γ = (y-1)/(y+1) -> svg xy.
// Admittance-form Smith chart: maps y directly without converting to z = 1/y.
function ny2xy(y) {
  const yr = y.re, yi = y.im;
  const dr = yr + 1, di = yi;                       // (y+1)
  const nr = yr - 1, ni = yi;                       // (y-1)
  const d2 = dr * dr + di * di;
  const gRe = (nr * dr + ni * di) / (d2 || 1e-18);  // Re(Γ)
  const gIm = (ni * dr - nr * di) / (d2 || 1e-18);  // Im(Γ)
  return { sx: 300 + 255 * gRe, sy: 300 - 255 * gIm };
}
// constant-r circle centre/radius. In the unit Î“ plane: centre Î“.re = r/(1+r), R = 1/(1+r).
function rCircle(r) { return { c: 300 + 255 * r / (r + 1), R: 255 / (r + 1) }; }
// constant-x (reactance/susceptance) circle centre/radius. Verified against the Î“-mapping:
// the x-locus (z = r + jx, r -> 0..inf) is an arc of a circle centred at Gamma = (1, 1/x),
// i.e. always tangent to the right edge of the chart (Gamma=+1). In chart coords:
//   cx = 124,  cy = 62 - 62/x,  R = 62/|x|.
// (x=1 -> centre (124, 0) R=62 ; x=2 -> centre (124, 31) R=31 ; x=0.5 -> centre (124, -62) R=124.)
function bCircle(v) {
  const R = 255 / Math.abs(v);
  return { cx: 555, cy: 300 - 255 / v, R };
}
// constant-g (conductance) circle on the impedance Smith chart. Verified: the g-locus
// (y = g + jb) maps to a circle centred at Gamma = (-g/(g+1), 0), radius = 1/(g+1).
// In the 255-scale chart: c = 300 - 255*g/(g+1),  R = 255/(g+1).  (g = 0 -> the real axis.)
function gCircle(g) {
  if (Math.abs(g) < 1e-9) return { c: 300, R: Infinity };
  return { c: 300 - 255 * g / (g + 1), R: 255 / (g + 1) };
}

// ---------------------------------------------------------------------------
// Arc drawing as SAMPLED POLYLINES (hug the true locus exactly; no closed-form
// centre/radius or sweep-flag needed, robust to the Gamma convention).
// Each helper walks the underlying constant-parameter locus in small steps.
// ---------------------------------------------------------------------------
// constant-r series arc: z = r + j*x, r fixed, x travels from xA to xB.
function rArc(A, B, r) {
  const xA = A.im, xB = B.im;                    // A,B are normalized impedances
  const n = 48, pts = [];
  for (let i = 0; i <= n; i++) {
    const x = xA + (xB - xA) * (i / n);
    pts.push(nz2xy({ re: r, im: x }));
  }
  return polyLine(pts);
}
// constant-g shunt arc: y = g + j*b, g fixed, b travels from bA to bB (z = 1/y).
function gArc(A, B, g) {
  // convert endpoints (normalized z) to their susceptance b = Im(y), y = 1/z.
  const by = (z) => -z.im / (z.re * z.re + z.im * z.im);
  const bA = by(A), bB = by(B);
  const n = 48, pts = [];
  for (let i = 0; i <= n; i++) {
    const b = bA + (bB - bA) * (i / n);
    const d = g * g + b * b || 1e-18;
    pts.push(nz2xy({ re: g / d, im: -b / d }));
  }
  return polyLine(pts);
}
// --- constant-x (positive reactance) grid arc: z = r + jx, x fixed, r: 0 â†’ +âˆž ---
function xArc(x) {
  const n = 64, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = t * 50; // r from 0 toward large values
    pts.push(nz2xy({ re: r, im: x }));
  }
  return polyLine(pts);
}
// --- constant-b (negative susceptance) grid arc: Y = g - jb, b > 0 ---
// Uses admittance-form Smith chart: Γ_Y = (Y-1)/(Y+1) directly.
// For capacitive arcs (b > 0), Yi = -b places them in LOWER half.
// Arcs flow outward from left edge toward right edge, symmetric to xArc.
function bArc(b) {
  const n = 64, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const g = t * 50; // g from 0 up to 50
    // y = g - jb (normalized admittance)
    const y = { re: g, im: -b };
    pts.push(ny2xy(y));
  }
  return polyLine(pts);
}
function polyLine(pts) {
  let d = `M ${pts[0].sx.toFixed(2)} ${pts[0].sy.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].sx.toFixed(2)} ${pts[i].sy.toFixed(2)}`;
  return d;
}

function smithSVG(sols, sel, ZL, Zt, Z0, f0) {
  const labelCol = "rgba(90,100,110,0.75)";
  const norm = (z) => cx.div(z, { re: Z0, im: 0 });
  const grid = "0.18";
  const gridCol = "rgba(120,130,140,0.45)";

  // Hardcoded grid from the reference SVG (exact same structure)
  const gridSVG = `
    <circle cx="342.5" cy="300" r="212.5"/>
    <circle cx="385" cy="300" r="170"/>
    <circle cx="427.5" cy="300" r="127.5"/>
    <circle cx="470" cy="300" r="85"/>
    <circle cx="512.5" cy="300" r="42.5"/>
    <circle cx="555" cy="-975" r="1275"/>
    <circle cx="555" cy="-210" r="510"/>
    <circle cx="555" cy="45" r="255"/>
    <circle cx="555" cy="172.5" r="127.5"/>
    <circle cx="555" cy="249" r="51"/>
    <circle cx="555" cy="555" r="255"/>
    <circle cx="555" cy="427.5" r="127.5"/>
    <circle cx="555" cy="351" r="51"/>
    <circle cx="555" cy="810" r="510"/>
    <circle cx="555" cy="1575" r="1275"/>
    <path d="M45 300H555" stroke-width="1.5"/>
  `;

  // --- L-network matching paths: ZL -> intermediate -> Zt ---
  const pL = norm(ZL), pT = norm(Zt);
  let pathSVG = "";
  for (const s of sols) {
    const isSel = s === sel;
    const col = isSel ? "var(--accent)" : "rgba(150,160,170,0.5)";
    const w = isSel ? 1.6 : 0.5;
    let d;
    if (s.form === "Shunt–Series") {
      // Shunt element first: Y -> Y + jB keeps conductance g = Re(Y) constant,
      // so travel along a constant-g circle from ZL to the intermediate point zMid.
      // Then series element: Z -> Z + jX keeps r = Re(Z) constant, travel along a
      // constant-r circle from zMid to Zt.
      const gL = pL.re / (pL.re * pL.re + pL.im * pL.im);          // Re(Y_ZL), constant through shunt leg
      const zSh = zElem(s.shunt, f0);
      const zMid = norm(cx.add(cx.div(cx.mul(ZL, zSh), cx.add(ZL, zSh)), zElem({ t: "L", v: 0 }, f0)));
      const rMid = zMid.re;                                        // Re(Z_mid), constant through series leg
      d = gArc(pL, zMid, gL) + " " + rArc(zMid, pT, rMid);
    } else {
      // Series element first: Z -> Z + jX keeps r = Re(Z) constant,
      // so travel along a constant-r circle from ZL to the intermediate point zMid.
      // Then shunt element: Y -> Y + jB keeps g = Re(Y) constant, travel along a
      // constant-g circle from zMid to Zt.
      const zMid = norm(cx.add(ZL, zElem(s.series, f0)));          // load + series element only
      const rL = pL.re;                                            // Re(Z_L), constant through series leg
      const gMid = zMid.re / (zMid.re * zMid.re + zMid.im * zMid.im); // Re(Y_mid), constant through shunt leg
      d = rArc(pL, zMid, rL) + " " + gArc(zMid, pT, gMid);
    }
    pathSVG += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w * 3}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (isSel) {
      const zm = norm(zInAtF({ form: s.form, shunt: s.shunt, series: s.series }, f0, ZL));
      pathSVG += `<circle cx="${nz2xy(zm).sx.toFixed(2)}" cy="${nz2xy(zm).sy.toFixed(2)}" r="${1.6 * 3}" fill="var(--accent)"/>`;
    }
  }

  // --- load / target dots ---
  const dotSVG =
    `<circle cx="${nz2xy(pL).sx.toFixed(2)}" cy="${nz2xy(pL).sy.toFixed(2)}" r="${2.4 * 3}" fill="#f59e0b"/>` +
    `<circle cx="${nz2xy(pT).sx.toFixed(2)}" cy="${nz2xy(pT).sy.toFixed(2)}" r="${2.4 * 3}" fill="#22c55e"/>`;

  // --- labels (OUTSIDE the clipped group) ---
  let labSVG = "";
  // r circles: center on real axis, label well above the circle (outside unit boundary)
  for (const r of S_R) {
    if (r === 0) continue;
    const o = rCircle(r);
    // Position well above the unit circle boundary
    const lx = o.c.toFixed(2);
    const ly = "-3.00";  // Fixed position well outside the circle
    labSVG += `<text x="${lx}" y="${ly}" fill="${labelCol}" stroke="none" font-family="Arial,sans-serif" font-size="4" text-anchor="middle">r=${r}</text>`;
  }
  // x arcs: label at the point where arc meets the outer unit circle (upper half, y<62)
  for (const x of S_X) {
    // z = j*x => Gamma = (jx-1)/(jx+1), at the unit circle point
    const gr = (x * x - 1) / (x * x + 1);
    const gi = 2 * x / (x * x + 1);
    // Position ON the unit circle boundary, then offset outward by 6 units
    const bx = 300 + 255 * gr;
    const by = 300 - 255 * gi;
    const dx = bx - 300, dy = 300 - by; // direction from center
    const dist = Math.sqrt(dx * dx + dy * dy);
    const lx = (300 + dx / dist * 320).toFixed(2);
    const ly = (300 - dy / dist * 320).toFixed(2);
    labSVG += `<text x="${lx}" y="${ly}" fill="${labelCol}" stroke="none" font-family="Arial,sans-serif" font-size="4" text-anchor="middle" dominant-baseline="middle">x=${x}</text>`;
  }
  // b arcs: label at the point where arc meets the outer unit circle (lower half, y>62)
  for (const b of S_B) {
    // y = g - jb => Gamma = (y-1)/(y+1), at the unit circle point (g=0)
    const gr = (b * b - 1) / (b * b + 1);
    const gi = -2 * b / (b * b + 1);
    // Position ON the unit circle boundary, then offset outward by 6 units
    const bx = 300 + 255 * gr;
    const by = 300 - 255 * gi;
    const dx = bx - 300, dy = 300 - by; // direction from center
    const dist = Math.sqrt(dx * dx + dy * dy);
    const lx = (300 + dx / dist * 320).toFixed(2);
    const ly = (300 - dy / dist * 320).toFixed(2);
    labSVG += `<text x="${lx}" y="${ly}" fill="${labelCol}" stroke="none" font-family="Arial,sans-serif" font-size="4" text-anchor="middle" dominant-baseline="middle">b=${b}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <clipPath id="chart">
      <circle cx="300" cy="300" r="255"/>
    </clipPath>
  </defs>
  <g fill="none" stroke="#888" stroke-width="1.5" opacity="1">
    <g clip-path="url(#chart)">
      ${gridSVG}
    </g>
    <circle cx="300" cy="300" r="255" stroke-width="2"/>
  </g>
  ${pathSVG}${dotSVG}
</svg>`;
}

function drawSmith(sols, sel, ZL, Zt, Z0, f0) {
  const el = $("smith");
  if (!el) return;
  el.innerHTML = smithSVG(sols, sel, ZL, Zt, Z0, f0);
}

// ---------- Line charts ----------
function drawVSWR(sols, sel, ZL, Zt, f0, hf = null) {
  const c2 = canvas2d("vswr");
  if (!c2) return;
  const { ctx, W, H, pad } = c2;
  const x0 = pad.l, x1 = W - pad.r, y0 = pad.t, y1 = H - pad.b;
  const muted = cssVar("--muted", "#888");
  const accent = cssVar("--accent", "#E5E793");

  const all = sols.map((s) => sweepOf(s, ZL, Zt, f0));
  const fmin = all.length ? all[0][0].f : 0.35 * f0;
  const fmax = all.length ? all[0][all[0].length - 1].f : 3 * f0;
  let vmax = 2;
  for (const sw of all) for (const p of sw) vmax = Math.max(vmax, Math.min(p.vswr, 50));
  vmax = Math.ceil(vmax * 1.1);
  const yAt = (v) => y1 - (y1 - y0) * (Math.min(v, vmax) / vmax);

  ctx.strokeStyle = "rgba(150,160,170,0.4)";
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.font = "10px system-ui, sans-serif";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = (vmax * i) / ticks;
    const y = y1 - ((y1 - y0) * i) / ticks;
    ctx.strokeStyle = "rgba(150,160,170,0.15)";
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(v.toFixed(0), x0 - 22, y + 3);
  }
  if (2 < vmax) {
    const y2 = y1 - (y1 - y0) * (2 / vmax);
    ctx.strokeStyle = "rgba(245,158,11,0.6)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x0, y2); ctx.lineTo(x1, y2); ctx.stroke();
    ctx.setLineDash([]);
  }
  const xf = (f) => x0 + (x1 - x0) * ((f - fmin) / (fmax - fmin));
  // f0 marker
  ctx.strokeStyle = "rgba(150,160,170,0.4)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(xf(f0), y0); ctx.lineTo(xf(f0), y1); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = muted;
  ctx.fillText(fmtFreq(f0) + " (f₀)", Math.min(xf(f0) + 4, x1 - 60), y1 + 14);

  all.forEach((sw, i) => {
    const isSel = sols[i] === sel;
    ctx.strokeStyle = isSel ? accent : "rgba(150,160,170,0.5)";
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.beginPath();
    sw.forEach((p, k) => {
      const v = Math.min(p.vswr, vmax);
      const x = xf(p.f), y = y1 - (y1 - y0) * (v / vmax);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  // hover crosshair
  if (hf != null) {
    const hx = xf(hf);
    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(hx, y0); ctx.lineTo(hx, y1); ctx.stroke();
    ctx.setLineDash([]);
    all.forEach((sw, i) => {
      const hv = interpAt(sw, hf);
      ctx.fillStyle = (sols[i] === sel) ? accent : "rgba(150,160,170,0.7)";
      ctx.beginPath(); ctx.arc(hx, yAt(hv.vswr), (sols[i] === sel ? 4 : 3), 0, Math.PI * 2); ctx.fill();
    });
  }

  if (!sols.length) {
    ctx.fillStyle = muted;
    ctx.font = "12px system-ui";
    ctx.fillText("No valid solution", x0 + 10, y0 + 20);
  }

  // register hover callback
  hoverState.vswr = {
    fmin, fmax, x0, x1,
    draw: (h) => drawVSWR(sols, sel, ZL, Zt, f0, h),
    tip: (h) => {
      const rows = sols.map((s, i) => {
        const hv = interpAt(all[i], h);
        const col = (s === sel) ? accent : "rgba(150,160,170,0.9)";
        return `<div class="tt-row"><span class="tt-dot" style="background:${col}"></span>Sol ${i + 1}${s === sel ? " · sel" : ""}<b>VSWR ${isFinite(hv.vswr) && hv.vswr < 999 ? hv.vswr.toFixed(3) : "â‰¥100"}</b></div>`;
      }).join("");
      return `<div class="tt-freq">${fmtFreq(h)}</div>${rows}`;
    },
  };
}

function drawRL(sols, sel, ZL, Zt, f0, hf = null) {
  const c2 = canvas2d("rlChart");
  if (!c2) return;
  const { ctx, W, H, pad } = c2;
  const x0 = pad.l, x1 = W - pad.r, y0 = pad.t, y1 = H - pad.b;
  const muted = cssVar("--muted", "#888");
  const accent = cssVar("--accent", "#E5E793");

  const all = sols.map((s) => sweepOf(s, ZL, Zt, f0));
  const fmin = all.length ? all[0][0].f : 0.35 * f0;
  const fmax = all.length ? all[0][all[0].length - 1].f : 3 * f0;
  const rmax = 40;
  const yr = (db) => y0 + (y1 - y0) * (db / rmax);

  ctx.strokeStyle = "rgba(150,160,170,0.4)";
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.font = "10px system-ui, sans-serif";
  for (let db = 0; db <= rmax; db += 10) {
    const y = yr(db);
    ctx.strokeStyle = "rgba(150,160,170,0.15)";
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(db + " dB", x0 - 32, y + 3);
  }
  ctx.strokeStyle = "rgba(245,158,11,0.6)";
  ctx.setLineDash([4, 4]);
  const y2 = yr(9.54);
  ctx.beginPath(); ctx.moveTo(x0, y2); ctx.lineTo(x1, y2); ctx.stroke();
  ctx.setLineDash([]);

  const xf = (f) => x0 + (x1 - x0) * ((f - fmin) / (fmax - fmin));
  ctx.strokeStyle = "rgba(150,160,170,0.4)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(xf(f0), y0); ctx.lineTo(xf(f0), y1); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = muted;
  ctx.fillText(fmtFreq(f0) + " (f₀)", Math.min(xf(f0) + 4, x1 - 60), y1 + 14);

  all.forEach((sw, i) => {
    const isSel = sols[i] === sel;
    ctx.strokeStyle = isSel ? accent : "rgba(150,160,170,0.5)";
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.beginPath();
    sw.forEach((p, k) => {
      const db = Math.min(Math.max(p.rl, 0), rmax);
      const x = xf(p.f), y = yr(db);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  // hover crosshair
  if (hf != null) {
    const hx = xf(hf);
    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(hx, y0); ctx.lineTo(hx, y1); ctx.stroke();
    ctx.setLineDash([]);
    all.forEach((sw, i) => {
      const hv = interpAt(sw, hf);
      ctx.fillStyle = (sols[i] === sel) ? accent : "rgba(150,160,170,0.7)";
      ctx.beginPath(); ctx.arc(hx, yr(Math.min(Math.max(hv.rl, 0), rmax)), (sols[i] === sel ? 4 : 3), 0, Math.PI * 2); ctx.fill();
    });
  }

  if (!sols.length) {
    ctx.fillStyle = muted;
    ctx.font = "12px system-ui";
    ctx.fillText("No valid solution", x0 + 10, y0 + 20);
  }

  // register hover callback
  hoverState.rl = {
    fmin, fmax, x0, x1,
    draw: (h) => drawRL(sols, sel, ZL, Zt, f0, h),
    tip: (h) => {
      const rows = sols.map((s, i) => {
        const hv = interpAt(all[i], h);
        const col = (s === sel) ? accent : "rgba(150,160,170,0.9)";
        return `<div class="tt-row"><span class="tt-dot" style="background:${col}"></span>Sol ${i + 1}${s === sel ? " · sel" : ""}<b>${hv.rl.toFixed(2)} dB (|Î“| ${hv.gm.toExponential(2)})</b></div>`;
      }).join("");
      return `<div class="tt-freq">${fmtFreq(h)}</div>${rows}`;
    },
  };
}

function drawMetrics(sel, ZL, Zt, f0, Z0) {}

// ---------- Buttons & events ----------
const swapBtn = $("swap");
if (swapBtn) {
  swapBtn.addEventListener("click", () => {
    const rs = $("rs"), xs = $("xs"), rl = $("rl"), xl = $("xl");
    if (!rs || !xs || !rl || !xl) return;
    const tr = rs.value, tx = xs.value;
    rs.value = rl.value; xs.value = xl.value; rl.value = tr; xl.value = tx;
    render();
  });
}
const resetBtn = $("reset");
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    const d = { f0: "100", fUnit: "1e6", rs: "50", xs: "0", rl: "25", xl: "0", z0: "50" };
    for (const k in d) { const el = $(k); if (el) el.value = d[k]; }
    selected = 0;
    render();
  });
}
["f0", "fUnit", "rs", "xs", "rl", "xl", "z0"].forEach((id) => {
  const el = $(id);
  if (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
});
window.addEventListener("resize", render);

// generate on load with default values
bindHoverOnce();
render();
if (window.lucide) lucide.createIcons();
