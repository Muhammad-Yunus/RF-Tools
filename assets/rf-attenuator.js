"use strict";

/* ---------- State ---------- */
const state = {
  net: "pi",
  mode: "design",
};

/* ---------- Math ---------- */
const Z0_DEFAULT = 50;

function dbToK(db) { return Math.pow(10, db / 20); }

// Design: dB + Z0 -> resistor values
function designPi(db, z0) {
  const K = dbToK(db);
  const series = z0 * (K * K - 1) / (2 * K);
  const shunt  = z0 * (K + 1) / (K - 1);
  return { series, shunt };
}
function designT(db, z0) {
  const K = dbToK(db);
  const series = z0 * (K - 1) / (K + 1);
  const shunt  = z0 * 2 * K / (K * K - 1);
  return { series, shunt };
}

// Analyze: R values -> attenuation (matched, symmetric)
// A = 1 + Rs/Rp ; K = A + sqrt(A^2 - 1)
function analyzeRsRp(rs, rp) {
  const A = 1 + rs / rp;
  if (A <= 1) return { db: 0, z0c: NaN };
  const K = A + Math.sqrt(A * A - 1);
  const db = 20 * Math.log10(K);
  return { db, K };
}
function charZPi(rs, rp) { return Math.sqrt(rs * rp * rp / (rs + 2 * rp)); }
function charZT(rs, rp)  { return Math.sqrt(rs * (rs + 2 * rp)); }

/* ---------- Power dissipation (matched, source Z0, load Z0) ---------- */
function powerPi(series, shunt, z0, Pin) {
  const Vr = Math.sqrt(Pin * z0);          // rms input
  const rl = (shunt * z0) / (shunt + z0);  // shunt || load
  const Vout = Vr * rl / (series + rl);
  const Vmid = Vout;                        // same node
  const pSer  = Math.pow(Vr - Vmid, 2) / series;
  const pShIn = Vr * Vr / shunt;
  const pShOut= Vout * Vout / shunt;
  return {
    "Series R1": pSer,
    "Shunt R2 (in)": pShIn,
    "Shunt R2 (out)": pShOut,
  };
}
function powerT(series, shunt, z0, Pin) {
  const Vr = Math.sqrt(Pin * z0);
  const rPar = (shunt * z0) / (shunt + z0);
  const Vmid = Vr * rPar / (series + rPar);
  const Vout = Vmid * z0 / (series + z0);
  const pSerIn  = Math.pow(Vr - Vmid, 2) / series;
  const pSerOut = Math.pow(Vmid - Vout, 2) / series;
  const pShunt  = Vmid * Vmid / shunt;
  return {
    "Series R1 (in)": pSerIn,
    "Series R1 (out)": pSerOut,
    "Shunt R2": pShunt,
  };
}
function recRating(w) {
  const opts = [0.0625, 0.125, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  for (const o of opts) if (w <= o * 0.75) return o + " W";
  return "> 100 W (pakai heatsink / banyak paralel)";
}

/* ---------- SVG build ---------- */
/* Fixed-size zigzag body so every resistor looks identical regardless of
   the lead length. Only shrinks when the span is genuinely too short. */
const RZ = { teeth: 6, seg: 8, amp: 11, minLead: 8 };

function resPoints(len) {
  const teeth = RZ.teeth, seg = RZ.seg;
  const bodyFull = teeth * seg;
  const usable = Math.max(0, len - 2 * RZ.minLead);
  const scale = usable < bodyFull ? Math.max(0.25, usable / bodyFull) : 1;
  const bodyLen = bodyFull * scale;
  const ampV = RZ.amp * scale;
  const w = bodyLen / teeth;
  const x0 = (len - bodyLen) / 2;      // body start (centered)
  const pts = [[0, 0], [x0, 0]];
  let up = true;
  for (let i = 0; i < teeth; i++) {
    pts.push([x0 + w * (i + 0.5), up ? -ampV : ampV]);
    up = !up;
  }
  pts.push([len - x0, 0]);              // body end
  pts.push([len, 0]);                   // final lead
  return pts;
}
function resPathH(x1, x2, y) {
  return "M " + resPoints(Math.abs(x2 - x1))
    .map(p => `${(x1 + p[0]).toFixed(1)} ${(y + p[1]).toFixed(1)}`).join(" L ");
}
function resPathV(x, y1, y2) {
  return "M " + resPoints(Math.abs(y2 - y1))
    .map(p => `${(x + p[1]).toFixed(1)} ${(y1 + p[0]).toFixed(1)}`).join(" L ");
}
function gnd(x, y) {
  return `<path class="gnd" d="M ${x-12} ${y} L ${x+12} ${y} M ${x-8} ${y+6} L ${x+8} ${y+6} M ${x-4} ${y+12} L ${x+4} ${y+12}"/>`;
}

function drawPi(d) {
  const svg = `
  <svg viewBox="0 0 520 250" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(30,0)">
    <path class="wire" d="M 15 110 L 70 110"/>
    <path class="wire" d="M 390 110 L 445 110"/>
    <path class="wire" d="M 70 110 L 70 130"/>
    <path class="wire" d="M 70 205 L 70 215"/>
    <path class="wire" d="M 390 110 L 390 130"/>
    <path class="wire" d="M 390 205 L 390 215"/>
    <path class="wire" d="${resPathH(70, 390, 110)}"/>
    <path class="wire" d="${resPathV(70, 130, 205)}"/>
    <path class="wire" d="${resPathV(390, 130, 205)}"/>
    ${gnd(70, 215)} ${gnd(390, 215)}
    <circle class="node" cx="70" cy="110" r="4"/>
    <circle class="node" cx="390" cy="110" r="4"/>
    <text class="port" x="15" y="98">IN</text>
    <text class="port" x="428" y="98">OUT</text>
    <text class="rlabel" x="205" y="98" text-anchor="middle">R1</text>
    <text class="rval" x="205" y="140" text-anchor="middle">${d.seriesTxt}</text>
    <text class="rlabel" x="52" y="172" text-anchor="end">R2</text>
    <text class="rval" x="86" y="172" text-anchor="start">${d.shuntTxt}</text>
    <text class="rlabel" x="372" y="172" text-anchor="end">R2</text>
    <text class="rval" x="406" y="172" text-anchor="start">${d.shuntTxt}</text>
    </g>
  </svg>`;
  return svg;
}
function drawT(d) {
  const svg = `
  <svg viewBox="0 0 520 250" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(30,0)">
    <path class="wire" d="M 15 100 L 90 100"/>
    <path class="wire" d="M 370 100 L 445 100"/>
    <path class="wire" d="M 230 100 L 230 130"/>
    <path class="wire" d="M 230 205 L 230 215"/>
    <path class="wire" d="${resPathH(90, 210, 100)}"/>
    <path class="wire" d="M 210 100 L 250 100"/>
    <path class="wire" d="${resPathH(250, 370, 100)}"/>
    <path class="wire" d="${resPathV(230, 130, 205)}"/>
    ${gnd(230, 215)}
    <circle class="node" cx="230" cy="100" r="4"/>
    <text class="port" x="15" y="88">IN</text>
    <text class="port" x="428" y="88">OUT</text>
    <text class="rlabel" x="150" y="88" text-anchor="middle">R1</text>
    <text class="rval" x="150" y="130" text-anchor="middle">${d.seriesTxt}</text>
    <text class="rlabel" x="310" y="88" text-anchor="middle">R1</text>
    <text class="rval" x="310" y="130" text-anchor="middle">${d.seriesTxt}</text>
    <text class="rlabel" x="213" y="172" text-anchor="end">R2</text>
    <text class="rval" x="248" y="172" text-anchor="start">${d.shuntTxt}</text>
    </g>
  </svg>`;
  return svg;
}

/* ---------- Format ---------- */
function fmtOhm(v) {
  if (!isFinite(v)) return "&infin;";
  if (v >= 1000) return (v / 1000).toFixed(3) + " k&Omega;";
  if (v < 1) return v.toFixed(3) + " &Omega;";
  return v.toFixed(2) + " &Omega;";
}
function fmtW(w) {
  if (w >= 1) return w.toFixed(3) + " W";
  return (w * 1000).toFixed(1) + " mW";
}

/* ---------- Render ---------- */
function render() {
  const net = state.net;
  const tol = parseFloat(document.getElementById("tol").value) || 0;
  const Pin = parseFloat(document.getElementById("pin").value) || 0;
  const badge = document.getElementById("netBadge");
  badge.textContent = net === "pi" ? "Pi (\u03C0)" : "T (Tee)";

  let series, shunt, db, z0c, rows = [], note = "";

  if (state.mode === "design") {
    const z0 = parseFloat(document.getElementById("z0").value) || Z0_DEFAULT;
    const attn = parseFloat(document.getElementById("attn").value) || 0;
    const r = net === "pi" ? designPi(attn, z0) : designT(attn, z0);
    series = r.series; shunt = r.shunt;
    db = attn; z0c = z0;
    note = `Desain tercocok (matched) pada Z&#8320; = ${z0} &Omega;. Nilai dibulatkan ke resistor standar terdekat akan menggeser atenuasi.`;
  } else {
    series = parseFloat(document.getElementById("rSeries").value) || 1;
    shunt  = parseFloat(document.getElementById("rShunt").value) || 1;
    const a = analyzeRsRp(series, shunt);
    db = a.db;
    z0c = net === "pi" ? charZPi(series, shunt) : charZT(series, shunt);
    note = `Dianalisis dari nilai R (asumsi simetris). Impedansi karakteristik = ${fmtOhm(z0c)}.`;
  }

  // Diagram
  const dv = {
    seriesTxt: fmtOhm(series).replace(/<\/?[^>]+>/g, ""),
    shuntTxt: fmtOhm(shunt).replace(/<\/?[^>]+>/g, ""),
  };
  document.getElementById("diagram").innerHTML = net === "pi" ? drawPi(dv) : drawT(dv);

  // Results
  rows.push(["Atenuasi", `<span class="val-acc">${db.toFixed(2)} dB</span>`]);
  rows.push(["R series (R1)", fmtOhm(series)]);
  rows.push(["R shunt (R2)", fmtOhm(shunt)]);
  rows.push(["Z&#8320; karakteristik", fmtOhm(z0c)]);

  // Tolerance spread
  if (tol > 0) {
    const sHi = series * (1 + tol / 100), sLo = series * (1 - tol / 100);
    const pHi = shunt * (1 + tol / 100), pLo = shunt * (1 - tol / 100);
    const dbMax = analyzeRsRp(sHi, pLo).db;
    const dbMin = analyzeRsRp(sLo, pHi).db;
    rows.push(["Atenuasi (worst-case)", `<span class="val-warn">${dbMin.toFixed(2)} &ndash; ${dbMax.toFixed(2)} dB</span>`]);
  }

  // Power
  if (Pin > 0 && state.mode === "design") {
    const pw = net === "pi" ? powerPi(series, shunt, z0c, Pin) : powerT(series, shunt, z0c, Pin);
    let maxW = 0, maxName = "";
    for (const [k, v] of Object.entries(pw)) {
      if (v > maxW) { maxW = v; maxName = k; }
      rows.push([`P(${k})`, fmtW(v)]);
    }
    rows.push(["Rating rekomendasi", `<span class="val-acc">${recRating(maxW)}</span> (${maxName})`]);
    const pOut = Pin / Math.pow(10, db / 10);
    rows.push(["Output power", fmtW(pOut)]);
  }

  document.getElementById("results").innerHTML =
    rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("");
  document.getElementById("resultNote").innerHTML = note;
}

/* ---------- Events ---------- */
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.net = t.dataset.net;
    render();
  });
});

const modeDesign = document.getElementById("modeDesign");
const modeAnalyze = document.getElementById("modeAnalyze");
modeDesign.addEventListener("click", () => {
  state.mode = "design";
  modeDesign.classList.add("active"); modeAnalyze.classList.remove("active");
  document.getElementById("designInputs").classList.remove("hidden");
  document.getElementById("analyzeInputs").classList.add("hidden");
  render();
});
modeAnalyze.addEventListener("click", () => {
  state.mode = "analyze";
  modeAnalyze.classList.add("active"); modeDesign.classList.remove("active");
  document.getElementById("analyzeInputs").classList.remove("hidden");
  document.getElementById("designInputs").classList.add("hidden");
  render();
});

document.querySelectorAll(".presets button").forEach(b => {
  b.addEventListener("click", () => {
    document.getElementById("attn").value = b.dataset.db;
    render();
  });
});

["z0", "attn", "rSeries", "rShunt", "tol", "pin"].forEach(id => {
  document.getElementById(id).addEventListener("input", render);
});
document.getElementById("tol").addEventListener("change", render);

render();
if (window.lucide) lucide.createIcons();
