// ─── Complex number helpers ───────────────────────────────────────────────
const cx = {
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => { const d = b.re * b.re + b.im * b.im || 1e-18; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; },
  conj: a => ({ re: a.re, im: -a.im }),
  abs: a => Math.hypot(a.re, a.im),
  arg: a => Math.atan2(a.im, a.re),
};
const jZ = x => ({ re: 0, im: x });
const rect = (r, x) => ({ re: r, im: x });
const ONE = { re: 1, im: 0 };

function omega(f) { return 2 * Math.PI * f; }

// ─── Gamma / normalization ────────────────────────────────────────────────
function gamma(Z, Z0) {
  const z = { re: Z.re / Z0, im: Z.im / Z0 };
  const dr = z.re + 1, di = z.im;
  const nr = z.re - 1, ni = z.im;
  const d2 = dr * dr + di * di || 1e-18;
  return { re: (nr * dr + ni * di) / d2, im: (ni * dr - nr * di) / d2 };
}

function normZ(Z, Z0) { return { re: Z.re / Z0, im: Z.im / Z0 }; }

// ─── Smith chart coords: scale=325, center=(325,325) [proper viewBox] ───
function nz2xy(z) {
  const zr = z.re, zi = z.im;
  const dr = zr + 1, di = zi;
  const nr = zr - 1, ni = zi;
  const d2 = dr * dr + di * di || 1e-18;
  const gx = (nr * dr + ni * di) / d2;
  const gy = (ni * dr - nr * di) / d2;
  return { sx: 325 + 325 * gx, sy: 325 - 325 * gy };
}

function xy2nz(sx, sy) {
  const gx = (sx - 325) / 325;
  const gy = -(sy - 325) / 325;
  const d2 = (1 - gx) * (1 - gx) + gy * gy || 1e-18;
  return { re: ((1 - gx) * (1 - gx) + gy * gy) / d2, im: 2 * gy / d2 };
}

// ─── Grid geometry (matches reference: r=0.2,0.5,1,2,5,10,25,50,...) ─────
const S_R = [0.2, 0.5, 1, 2, 5, 10, 25, 50, 100, 200, 500];
const S_X = [0.2, 0.5, 1, 2, 5, 10, 25, 50, 100, 200, 500];
const S_B = [0.2, 0.5, 1, 2, 5, 10, 25, 50, 100, 200, 500];

function rCircle(r) {
  const R = 325 / (r + 1);
  const c = 325 + 325 * r / (r + 1);
  return { c, R };
}
function bCircle(v) { const R = 325 / Math.abs(v); return { cx: 325, cy: 325 - 325 / v, R }; }
function gCircle(g) { if (Math.abs(g) < 1e-9) return null; return { c: 325 + 325 * g / (g + 1), R: 325 / (g + 1) }; }

function vswrCircle(V) {
  const r = (V - 1) / (V + 1);
  return { c: 650, R: 325 * r };
}

function qCircle(Q) {
  // Constant Q circles: center on real axis at c = 650/(1+Q²), R = 325*Q/(1+Q²)
  const c = 650 / (1 + Q * Q);
  const R = 325 * Q / (1 + Q * Q);
  return { c, R };
}

// ─── Component impedance / ABCD ──────────────────────────────────────────
function compImpedance(comp, f) {
  const w = omega(f * 1e6);
  switch (comp.type) {
    case 'blackbox':  return { re: comp.R || 0, im: comp.X || 0 };
    case 'seriesL':   return { re: 0, im: w * comp.L };
    case 'seriesC':   return { re: 0, im: -1 / (w * comp.C) };
    case 'seriesR':   return { re: comp.R, im: 0 };
    default:          return { re: 0, im: 0 };
  }
}

function compAdmittance(comp, f) {
  const w = omega(f * 1e6);
  switch (comp.type) {
    case 'shuntL':    return { re: 0, im: -1 / (w * comp.L) };
    case 'shuntC':    return { re: 0, im: w * comp.C };
    default:          return { re: 0, im: 0 };
  }
}

// ─── ABCD matrix multiplication ───────────────────────────────────────────
function matMul(A, B) {
  return [
    [cx.add(cx.mul(A[0][0], B[0][0]), cx.mul(A[0][1], B[1][0])),
     cx.add(cx.mul(A[0][0], B[0][1]), cx.mul(A[0][1], B[1][1]))],
    [cx.add(cx.mul(A[1][0], B[0][0]), cx.mul(A[1][1], B[1][0])),
     cx.add(cx.mul(A[1][0], B[0][1]), cx.mul(A[1][1], B[1][1]))],
  ];
}

function matApply(A, Z) {
  return {
    re: (A[0][0].re*Z.re - A[0][0].im*Z.im + A[0][1].re) /
         (A[1][0].re*Z.re - A[1][0].im*Z.im + A[1][1].re + 1e-18),
    im: 0 // simplified; will use complex division below
  };
}

function zApply(A, Z) {
  // Z_in = (A00*Z + A01) / (A10*Z + A11) using complex arithmetic
  const num = cx.add(cx.mul(A[0][0], Z), A[0][1]);
  const den = cx.add(cx.mul(A[1][0], Z), A[1][1]);
  return cx.div(num, den);
}

// ─── Build ABCD for one component ────────────────────────────────────────
// Units: L in nH (×1e-9), C in pF (×1e-12), R in Ω
function compABCD(comp, f) {
  const w = omega(f); // f in Hz
  switch (comp.type) {
    case 'blackbox':
      return [[ONE, { re: comp.R || 0, im: comp.X || 0 }],
              [{ re: 0, im: 0 }, ONE]];
    case 'seriesL': {
      const L = (comp.L || 0) * 1e-9;
      return [[ONE, { re: 0, im: w * L }],
              [{ re: 0, im: 0 }, ONE]];
    }
    case 'seriesC': {
      const C = (comp.C || 0) * 1e-12;
      return [[ONE, { re: 0, im: -1 / (w * C) }],
              [{ re: 0, im: 0 }, ONE]];
    }
    case 'seriesR':
      return [[ONE, { re: comp.R || 0, im: 0 }],
              [{ re: 0, im: 0 }, ONE]];
    case 'shuntL': {
      const L = (comp.L || 0) * 1e-9;
      return [[ONE, { re: 0, im: 0 }],
              [{ re: 0, im: -1 / (w * L) }, ONE]];
    }
    case 'shuntC': {
      const C = (comp.C || 0) * 1e-12;
      return [[ONE, { re: 0, im: 0 }],
              [{ re: 0, im: w * C }, ONE]];
    }
    case 'tline': {
      const th = (comp.theta * Math.PI) / 180;
      const c = Math.cos(th), s = Math.sin(th);
      const z0 = comp.Z0 || 50;
      return [
        [{ re: c, im: 0 }, { re: 0, im: s * z0 }],
        [{ re: 0, im: s / z0 }, { re: c, im: 0 }],
      ];
    }
    case 'transformer': {
      const n = comp.n || 1;
      return [
        [{ re: n, im: 0 }, { re: 0, im: 0 }],
        [{ re: 0, im: 0 }, { re: 1 / n, im: 0 }],
      ];
    }
    default:
      return [[ONE, { re: 0, im: 0 }], [{ re: 0, im: 0 }, ONE]];
  }
}

// ─── Compute Z_in for entire circuit at frequency f ──────────────────────
// Cascade: components[0] is nearest source, last blackbox is load
function computeZin(components, f, Z0) {
  // Find load impedance (last blackbox in cascade)
  let Zload = { re: 0, im: 0 };
  for (let i = components.length - 1; i >= 0; i--) {
    if (components[i].type === 'blackbox') {
      Zload = { re: components[i].R || 0, im: components[i].X || 0 };
      break;
    }
  }
  // ABCD cascade from load to source (right to left)
  // Z_in = Z(M_n(...Z(M_1(Z(M_0(Z_load))...)))
  // When iterating right-to-left: A = M_i * A (pre-multiply)
  let A = [[{ re: 1, im: 0 }, { re: 0, im: 0 }],
            [{ re: 0, im: 0 }, { re: 1, im: 0 }]];
  for (let i = components.length - 1; i >= 0; i--) {
    if (components[i].type === 'blackbox') continue; // skip load
    const M = compABCD(components[i], f);
    A = matMul(M, A); // Pre-multiply: M * A (not A * M)
  }
  return zApply(A, Zload);
}

// ─── Sweep: returns array of { f, Zin, gamma, vswr } ────────────────────
function sweep(components, f0, span, points, Z0) {
  const data = [];
  let fmin, fmax, step;
  if (span > 0) {
    fmin = Math.max(0.001, f0 - span / 2);
    fmax = f0 + span / 2;
    step = points > 1 ? (fmax - fmin) / (points - 1) : 0;
  } else {
    // Zero span: sweep symmetrically around f0 to still show a locus
    fmin = Math.max(0.001, f0 * 0.9);
    fmax = f0 * 1.1;
    step = points > 1 ? (fmax - fmin) / (points - 1) : 0;
  }
  for (let i = 0; i < points; i++) {
    const f = points === 1 ? f0 : fmin + i * step;
    const Zin = computeZin(components, f, Z0);
    if (!isFinite(Zin.re) || !isFinite(Zin.im)) continue;
    const g = gamma(Zin, Z0);
    const mag = cx.abs(g);
    const VSWR = mag >= 1 ? Infinity : (1 + mag) / (1 - mag);
    data.push({ f, Zin, g, mag, VSWR, ang: cx.arg(g) });
  }
  return data;
}

// ─── Format helpers ───────────────────────────────────────────────────────
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

// ─── State ────────────────────────────────────────────────────────────────
let Z0 = 50;
let components = []; // { type, R, X, L, C, theta, n, ... }
let sweepData = null;

// ─── Circuit row rendering ─────────────────────────��─────────────────────
function compLabel(type) {
  const map = {
    blackbox: 'Z Load', seriesL: 'Series L', seriesC: 'Series C', seriesR: 'Series R',
    shuntL: 'Shunt L', shuntC: 'Shunt C', tline: 'T-Line', transformer: 'Xformer'
  };
  return map[type] || type;
}
function compIcon(type) {
  const map = {
    blackbox: 'box', seriesL: 'wave-sine', seriesC: 'battery', seriesR: 'zap',
    shuntL: 'circle-dot', shuntC: 'circle-dot', tline: 'arrow-right-left', transformer: 'git-merge'
  };
  return map[type] || 'component';
}

function renderCircuitRows() {
  const container = document.getElementById('circuitRows');
  if (!container) return;
  container.innerHTML = '';
  components.forEach((comp, idx) => {
    const row = document.createElement('div');
    row.className = 'circuit-row';
    let fieldsHTML = '';
    switch (comp.type) {
      case 'blackbox':
        fieldsHTML = `<div class="mini-field"><label>R (Ω)</label><input type="number" step="any" value="${comp.R ?? 50}" data-idx="${idx}" data-f="R"></div>
                      <div class="mini-field"><label>X (Ω)</label><input type="number" step="any" value="${comp.X ?? 0}" data-idx="${idx}" data-f="X"></div>`;
        break;
      case 'seriesL':
        fieldsHTML = `<div class="mini-field"><label>L (nH)</label><input type="number" step="any" value="${comp.L ?? 10}" data-idx="${idx}" data-f="L"></div>`;
        break;
      case 'seriesC':
        fieldsHTML = `<div class="mini-field"><label>C (pF)</label><input type="number" step="any" value="${comp.C ?? 1}" data-idx="${idx}" data-f="C"></div>`;
        break;
      case 'seriesR':
        fieldsHTML = `<div class="mini-field"><label>R (Ω)</label><input type="number" step="any" value="${comp.R ?? 50}" data-idx="${idx}" data-f="R"></div>`;
        break;
      case 'shuntL':
        fieldsHTML = `<div class="mini-field"><label>L (nH)</label><input type="number" step="any" value="${comp.L ?? 10}" data-idx="${idx}" data-f="L"></div>`;
        break;
      case 'shuntC':
        fieldsHTML = `<div class="mini-field"><label>C (pF)</label><input type="number" step="any" value="${comp.C ?? 1}" data-idx="${idx}" data-f="C"></div>`;
        break;
      case 'tline':
        fieldsHTML = `<div class="mini-field"><label>Z₀ (Ω)</label><input type="number" step="any" value="${comp.Z0 ?? 50}" data-idx="${idx}" data-f="Z0"></div>
                      <div class="mini-field"><label>θ (°)</label><input type="number" step="any" value="${comp.theta ?? 45}" data-idx="${idx}" data-f="theta"></div>`;
        break;
      case 'transformer':
        fieldsHTML = `<div class="mini-field"><label>n₁/n₂</label><input type="number" step="any" value="${comp.n ?? 1}" data-idx="${idx}" data-f="n"></div>`;
        break;
    }
    row.innerHTML = `
      <span class="row-label"><i data-lucide="${compIcon(comp.type)}"></i> ${compLabel(comp.type)}</span>
      <div class="row-fields">${fieldsHTML}</div>
      <button class="rm" onclick="removeComp(${idx})" title="Remove"><i data-lucide="trash-2"></i></button>
    `;
    container.appendChild(row);

    // Bind input events
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.idx);
        const f = e.target.dataset.f;
        components[i][f] = parseFloat(e.target.value) || 0;
        updateAll();
      });
    });
  });
  if (window.lucide) lucide.createIcons();
}

function removeComp(idx) {
  components.splice(idx, 1);
  renderCircuitRows();
  updateAll();
}

// ─── Add component ──────────────────────────────────────────────────────────
function addComponent(type) {
  const defaults = {
    blackbox: { type, R: 25, X: 12 },
    seriesL:  { type, L: 10 },
    seriesC:  { type, C: 1 },
    seriesR:  { type, R: 50 },
    shuntL:   { type, L: 10 },
    shuntC:   { type, C: 1 },
    tline:    { type, Z0: 50, theta: 45 },
    transformer: { type, n: 1 },
  };
  components.unshift(defaults[type] || { type });
  renderCircuitRows();
  updateAll();
  const spanEl = document.getElementById('fspanInput');
  if (spanEl && parseFloat(spanEl.value) !== 0) {
    console.log('[addComp] auto-running sweep, span=', spanEl.value);
    runSweep();
  } else {
    console.log('[addComp] span=0, skipping auto-sweep');
  }
}

// ─── Presets ─────────────────────────────────────────────────────────────
function setZ0(v) {
  Z0 = v;
  const z0El = document.getElementById('z0Display');
  if (z0El) z0El.textContent = v + ' Ω';
  document.querySelectorAll('.presets-bar .seg:first-child button').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === v + 'Ω');
  });
  updateAll();
}

function setZLoad(R, X) {
  // Replace or add blackbox
  if (components.length > 0 && components[components.length - 1].type === 'blackbox') {
    components[components.length - 1].R = R;
    components[components.length - 1].X = X;
  } else {
    components.push({ type: 'blackbox', R, X });
  }
  renderCircuitRows();
  updateAll();
}

function setF0(v) {
  document.getElementById('f0Input').value = v;
  updateAll();
}

// ─── Smith Chart SVG renderer ─────────────────────────────────────────────
function renderSmithChart() {
  const svg = document.getElementById('smithSvg');
  if (!svg) return;
  const showVSWR = document.getElementById('chkVSWR')?.checked;
  const showQ = document.getElementById('chkQ')?.checked;
  const vswrValsStr = document.getElementById('vswrVals')?.value || '';
  const vswrVals = showVSWR ? vswrValsStr.split(',').map(s => parseFloat(s.trim())).filter(v => isFinite(v) && v > 1) : [];
  const Qvals = showQ ? [0.5, 1, 2, 5] : [];

  let html = `<defs>
    <clipPath id="smithClip"><circle cx="325" cy="325" r="325"/></clipPath>
  </defs>`;

  // Grid circles group (clipped)
  html += `<g clip-path="url(#smithClip)">`;

  // R-circles
  for (const r of S_R) {
    const { c, R } = rCircle(r);
    html += `<circle cx="${c}" cy="325" r="${R}" fill="none" stroke="var(--border)" stroke-width="0.8" opacity="0.7"/>`;
  }
  // X-arcs (upper half - positive reactance)
  for (const x of S_X) {
    const cx2 = 650;
    const cy2 = 325 - 325 / x;
    const R2 = 325 / x;
    html += `<circle cx="${cx2}" cy="${cy2}" r="${R2}" fill="none" stroke="var(--border)" stroke-width="0.8" opacity="0.7"/>`;
  }
  // -X-arcs (lower half - negative reactance)
  for (const x of S_X) {
    const cx2 = 650;
    const cy2 = 325 + 325 / x;
    const R2 = 325 / x;
    html += `<circle cx="${cx2}" cy="${cy2}" r="${R2}" fill="none" stroke="var(--border)" stroke-width="0.8" opacity="0.7"/>`;
  }
  // B-arcs (lower half - positive susceptance)
  for (const b of S_B) {
    const cx2 = 650;
    const cy2 = 325 + 325 / b;
    const R2 = 325 / b;
    html += `<circle cx="${cx2}" cy="${cy2}" r="${R2}" fill="none" stroke="var(--border)" stroke-width="0.8" opacity="0.7"/>`;
  }
  // -B-arcs (upper half - negative susceptance)
  for (const b of S_B) {
    const cx2 = 650;
    const cy2 = 325 - 325 / b;
    const R2 = 325 / b;
    html += `<circle cx="${cx2}" cy="${cy2}" r="${R2}" fill="none" stroke="var(--border)" stroke-width="0.8" opacity="0.7"/>`;
  }

  // Real axis
  html += `<line x1="0" y1="325" x2="650" y2="325" stroke="var(--wire)" stroke-width="1.2"/>`;

  // VSWR circles
  for (const V of vswrVals) {
    const { c, R } = vswrCircle(V);
    html += `<circle cx="${c}" cy="325" r="${R}" fill="none" stroke="#e74c3c" stroke-width="1" stroke-dasharray="4,3" opacity="0.6"/>`;
  }

  // Q circles
  for (const Q of Qvals) {
    const { c, R } = qCircle(Q);
    html += `<circle cx="${c}" cy="325" r="${R}" fill="none" stroke="#9b59b6" stroke-width="1" stroke-dasharray="3,4" opacity="0.5"/>`;
  }

  html += `</g>`; // end clip

  // Unit circle
  html += `<circle cx="325" cy="325" r="325" fill="none" stroke="var(--wire)" stroke-width="1.5"/>`;

  // Labels (outside clip)
  const labelCol = "var(--muted)";
  // R labels (on horizontal axis, at left intersection of each circle)
  for (const r of S_R) {
    if (r === 0) continue;
    const { c, R } = rCircle(r);
    const lx = c - R;
    html += `<text x="${lx}" y="320" fill="${labelCol}" font-size="9" text-anchor="middle" font-family="sans-serif">${r}</text>`;
  }
  // X labels (on outer circle at calculated positions)
  for (const x of S_X) {
    // Positive X (upper half of chart)
    const thetaUp = 2 * Math.atan(1 / x);
    const pxUp = 325 + 325 * Math.cos(thetaUp);
    const pyUp = 325 - 325 * Math.sin(thetaUp);
    html += `<text x="${pxUp.toFixed(0)}" y="${pyUp.toFixed(0)}" fill="${labelCol}" font-size="9" font-family="sans-serif">j${x}</text>`;

    // Negative X (lower half of chart)
    const thetaLo = -thetaUp;
    const pxLo = 325 + 325 * Math.cos(thetaLo);
    const pyLo = 325 - 325 * Math.sin(thetaLo);
    html += `<text x="${pxLo.toFixed(0)}" y="${pyLo.toFixed(0)}" fill="${labelCol}" font-size="9" font-family="sans-serif">-j${x}</text>`;
  }

  // Calculate f0 first
  const f0_MHz = parseFloat(document.getElementById('f0Input')?.value) || 100;
  const f0_Hz = f0_MHz * 1e6;

  // Find Z_load
  let Zload = { re: 0, im: 0 };
  for (let i = components.length - 1; i >= 0; i--) {
    if (components[i].type === 'blackbox') {
      Zload = { re: components[i].R || 0, im: components[i].X || 0 };
      break;
    }
  }

  // Impedance arcs: show path from Z_load through each component to Z_in
  function computeIntermediateZs(comps, f) {
    const result = [];
    // Start with load impedance
    result.push({ Z: { ...Zload }, type: 'load' });

    // Walk from right to left (load to source), applying each component
    for (let i = comps.length - 2; i >= 0; i--) {
      const comp = comps[i];
      if (comp.type === 'blackbox') continue;
      const M = compABCD(comp, f);
      const lastZ = result[result.length - 1].Z;
      const Znew = zApply(M, lastZ);
      result.push({ Z: { ...Znew }, type: comp.type });
    }
    return result;
  }

  const intermediates = computeIntermediateZs(components, f0_Hz);

  // Draw arcs between consecutive points with component-colored paths
  const arcColors = {
    seriesC: '#1f77b4',  // blue
    seriesL: '#1f77b4',  // blue
    shuntC: '#2ca02c',   // green
    shuntL: '#2ca02c',   // green
    seriesR: '#d62728',  // red
  };

  for (let i = 0; i < intermediates.length - 1; i++) {
    const p1 = intermediates[i];
    const p2 = intermediates[i + 1];
    const comp = components[i];
    const color = comp ? (arcColors[comp.type] || '#ff7f0e') : '#ff7f0e';

    const pt1 = nz2xy(normZ(p1.Z, Z0));
    const pt2 = nz2xy(normZ(p2.Z, Z0));
    if (!isFinite(pt1.sx) || !isFinite(pt1.sy) || !isFinite(pt2.sx) || !isFinite(pt2.sy)) continue;
    if (Math.hypot(pt1.sx - pt2.sx, pt1.sy - pt2.sy) < 1) continue;

    // Quadratic bezier for smooth arc
    const mx = (pt1.sx + pt2.sx) / 2;
    const my = (pt1.sy + pt2.sy) / 2;
    const dx = pt2.sx - pt1.sx;
    const dy = pt2.sy - pt1.sy;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const nx = -dy / len * len * 0.15;
      const ny = dx / len * len * 0.15;
      html += `<path d="M ${pt1.sx},${pt1.sy} Q ${mx+nx},${my+ny} ${pt2.sx},${pt2.sy}"
                 fill="none" stroke="${color}" stroke-width="3"
                 stroke-linecap="round" opacity="0.85"/>`;
    } else {
      html += `<line x1="${pt1.sx}" y1="${pt1.sy}" x2="${pt2.sx}" y2="${pt2.sy}"
                 stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.85"/>`;
    }
  }

  // Load point (blackbox = load impedance)
  const zNorm = normZ(Zload, Z0);
  const lp = nz2xy(zNorm);
  if (isFinite(lp.sx) && isFinite(lp.sy) && lp.sx >= 325 && lp.sx <= 975) {
    html += `<circle cx="${lp.sx}" cy="${lp.sy}" r="6" fill="#f59e0b" stroke="var(--panel)" stroke-width="2"/>`;
  }

  // Input point (same as load when no components)
  const Zin = components.length > 0 ? computeZin(components, f0_Hz, Z0) : Zload;
  const izNorm = normZ(Zin, Z0);
  const ip = nz2xy(izNorm);
  if (components.length > 0 && isFinite(ip.sx) && isFinite(ip.sy) && ip.sx >= 325 && ip.sx <= 975) {
    html += `<circle cx="${ip.sx}" cy="${ip.sy}" r="6" fill="#22c55e" stroke="var(--panel)" stroke-width="2"/>`;
  }

  // Center dot
  html += `<circle cx="325" cy="325" r="3" fill="var(--muted)"/>`;

  svg.innerHTML = html;

  // Re-attach click handler
  attachSmithClick();
}

function attachSmithClick() {
  const svg = document.getElementById('smithSvg');
  const tip = document.getElementById('smithTip');
  if (!svg || !tip) return;

  svg.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const scaleX = 650 / rect.width;
    const scaleY = 650 / rect.height;
    const sx = (e.clientX - rect.left) * scaleX;
    const sy = (e.clientY - rect.top) * scaleY;

    if (Math.hypot(sx - 325, sy - 325) > 325) {
      tip.style.display = 'none';
      return;
    }

    const z = xy2nz(sx, sy);
    const Z = { re: z.re * Z0, im: z.im * Z0 };
    const g = gamma(Z, Z0);
    const mag = cx.abs(g);
    const VSWR = mag >= 1 ? Infinity : (1 + mag) / (1 - mag);
    const RL = mag > 0 ? -20 * Math.log10(mag) : Infinity;

    tip.innerHTML = `
      <div style="color:var(--accent);font-weight:700;margin-bottom:3px">z = ${z.re.toFixed(2)} + j${z.im.toFixed(2)}</div>
      <div>Z = ${Z.re.toFixed(1)} + j${Z.im.toFixed(1)} Ω</div>
      <div>|Γ| = ${mag.toFixed(4)}</div>
      <div>VSWR = ${isFinite(VSWR) ? VSWR.toFixed(2) : '∞'}</div>
      <div>RL = ${isFinite(RL) ? RL.toFixed(2) : '∞'} dB</div>
    `;
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX - rect.left + 15, rect.width - 160) + 'px';
    tip.style.top = (e.clientY - rect.top - 10) + 'px';
  });

  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

  svg.addEventListener('click', e => {
    const rect = svg.getBoundingClientRect();
    const scaleX = 650 / rect.width;
    const scaleY = 650 / rect.height;
    const sx = (e.clientX - rect.left) * scaleX;
    const sy = (e.clientY - rect.top) * scaleY;

    if (Math.hypot(sx - 325, sy - 325) > 325) return;

    // Set this as the load impedance
    const z = xy2nz(sx, sy);
    const Z = { re: z.re * Z0, im: z.im * Z0 };
    // Replace or add blackbox
    if (components.length > 0 && components[components.length - 1].type === 'blackbox') {
      components[components.length - 1].R = Z.re;
      components[components.length - 1].X = Z.im;
    } else {
      components.push({ type: 'blackbox', R: Z.re, X: Z.im });
    }
    renderCircuitRows();
    updateAll();
  });
}

// ─── Readout update ──────────────────────────────────────────────────────
function updateReadout(Zin) {
  const g = gamma(Zin, Z0);
  const mag = cx.abs(g);
  const ang = cx.arg(g);
  const VSWR = mag >= 1 ? Infinity : (1 + mag) / (1 - mag);
  const RL = mag > 0 ? -20 * Math.log10(mag) : Infinity;
  const z = normZ(Zin, Z0);

  document.getElementById('rdZin').textContent =
    `${Zin.re.toFixed(2)} + j${Zin.im.toFixed(2)} Ω`;
  document.getElementById('rdGamma').textContent = mag.toFixed(4);
  document.getElementById('rdGammaAng').textContent = `${(ang * 180 / Math.PI).toFixed(1)}°`;
  document.getElementById('rdVswr').textContent = isFinite(VSWR) ? VSWR.toFixed(3) : '∞';
  document.getElementById('rdRL').textContent = isFinite(RL) ? RL.toFixed(2) + ' dB' : '∞ dB';
  document.getElementById('rdNZ').textContent =
    `${z.re.toFixed(3)} + j${z.im.toFixed(3)}`;
}

// ─── Sweep summary ───────────────────────────────────────────────────────
function updateSweepSummary() {
  const el = document.getElementById('sweepSummary');
  const clearBtn = document.getElementById('clearSweepBtn');
  if (!sweepData || sweepData.length < 2) {
    el.textContent = '';
    clearBtn.style.display = 'none';
    return;
  }
  const mins = sweepData.map(d => d.VSWR).filter(v => isFinite(v));
  const f0 = parseFloat(document.getElementById('f0Input')?.value) || 100;
  el.textContent = `f: ${fmtFreq(sweepData[0].f)} → ${fmtFreq(sweepData[sweepData.length - 1].f)}  |  ` +
    `VSWR min: ${Math.min(...mins).toFixed(2)}  max: ${Math.max(...mins).toFixed(2)}`;
  clearBtn.style.display = 'inline-flex';
}

// ─── Main update ─────────────────────────────────────────────────────────
function updateAll() {
  const f0_MHz = parseFloat(document.getElementById('f0Input')?.value) || 100;
  const f0_Hz = f0_MHz * 1e6;
  const Zin = computeZin(components, f0_Hz, Z0);
  const zNorm = normZ(Zin, Z0);
  const pt = nz2xy(zNorm);
  console.log('[updateAll] f0=', f0_MHz, 'MHz', 'Zin=', Zin, 'zNorm=', zNorm, 'pt=', pt, 'nComps=', components.length);
  updateReadout(Zin);
  renderSmithChart();
  updateSweepSummary();
}

// ─── Sweep button ────────────────────────────────────────────────────────
function runSweep() {
  const f0_MHz = parseFloat(document.getElementById('f0Input')?.value) || 100;
  const f0_Hz = f0_MHz * 1e6;
  const span_MHz = parseFloat(document.getElementById('fspanInput')?.value) || 0;
  const span_Hz = span_MHz * 1e6;
  const pts = parseInt(document.getElementById('fpntsInput')?.value) || 100;
  console.log('[runSweep] f0=', f0_MHz, 'MHz span=', span_MHz, 'MHz pts=', pts, 'nComps=', components.length);
  sweepData = sweep(components, f0_Hz, span_Hz, pts, Z0);
  console.log('[runSweep] sweepData length=', sweepData?.length);
  if (sweepData?.length > 0) {
    console.log('[runSweep] first f=', sweepData[0].f/1e6.toFixed(1), 'MHz Zin=', sweepData[0].Zin);
    console.log('[runSweep] last f=', sweepData[sweepData.length-1].f/1e6.toFixed(1), 'MHz Zin=', sweepData[sweepData.length-1].Zin);
  }
  renderSmithChart();
  updateSweepSummary();
}

// ─── Parse URL circuit parameter ──────────────────────────────────────
function parseURLCircuit() {
  const params = new URLSearchParams(window.location.search);
  const circuit = params.get('circuit');
  if (!circuit) return false;

  const comps = [];
  const parts = circuit.split('__');
  for (const part of parts) {
    if (!part) continue;
    const segs = part.split('_');
    const type = segs[0];
    let comp = { type };
    if (type === 'blackbox') {
      comp.R = parseFloat(segs[1]) || 0;
      comp.X = parseFloat(segs[2]) || 0;
    } else if (type === 'seriesL') {
      comp.L = parseFloat(segs[1]) || 0;
    } else if (type === 'seriesC') {
      comp.C = parseFloat(segs[1]) || 0;
    } else if (type === 'seriesR') {
      comp.R = parseFloat(segs[1]) || 0;
    } else if (type === 'shuntL') {
      comp.L = parseFloat(segs[1]) || 0;
    } else if (type === 'shuntC') {
      comp.C = parseFloat(segs[1]) || 0;
    }
    comps.push(comp);
  }

  if (comps.length > 0) {
    window._urlComponents = comps;
    return true;
  }
  return false;
}

// ─── Event wiring ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load circuit from URL if present, else default
  if (!parseURLCircuit()) {
    components = [
      { type: 'shuntL', L: 3.3 },
      { type: 'seriesC', C: 1.75 },
      { type: 'blackbox', R: 25, X: 12 }
    ];
  } else {
    components = window._urlComponents;
  }
  renderCircuitRows();
  updateAll();

  document.getElementById('sweepBtn')?.addEventListener('click', runSweep);
  document.getElementById('clearSweepBtn')?.addEventListener('click', () => {
    sweepData = null;
    document.getElementById('sweepSummary').textContent = '';
    document.getElementById('clearSweepBtn').style.display = 'none';
    renderSmithChart();
  });

  document.getElementById('chkVSWR')?.addEventListener('change', e => {
    document.getElementById('vswrVals').disabled = !e.target.checked;
    renderSmithChart();
  });
  document.getElementById('chkQ')?.addEventListener('change', () => renderSmithChart());
  document.getElementById('vswrVals')?.addEventListener('input', () => renderSmithChart());

  ['f0Input', 'fspanInput', 'fpntsInput'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (sweepData) { runSweep(); }
      else { updateAll(); }
    });
  });

  // Handle resize
  window.addEventListener('resize', () => renderSmithChart());
});
