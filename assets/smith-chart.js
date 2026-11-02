(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var ARC_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
  var SP_COLORS = { S11: "#0072B2", S21: "#E69F00", S12: "#CC79A7", S22: "#009E73" };
  var DASH = ["5,5", "10,5", "2,2,10,2", "4,6", "10,2,2,2"];
  var ESLUnit = 1e-9;
  var speedOfLight = 299792458;
  var MARKER_R = 6;
  var SP_MARKER_R = 4.2;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function isFiniteNum(v) { return typeof v === "number" && isFinite(v); }
  function num(v, fallback) {
    if (v === "" || v == null) return fallback == null ? 0 : fallback;
    var n = Number(v);
    return isFinite(n) ? n : (fallback == null ? 0 : fallback);
  }
  function fmtFixed(v, digits) {
    if (!isFiniteNum(v)) return "\u2014";
    return Math.abs(v) < 5e-15 ? (0).toFixed(digits) : v.toFixed(digits);
  }
  function fmtSig(v, digits) {
    if (!isFiniteNum(v)) return "\u2014";
    return Number(v).toPrecision(digits);
  }
  function fmtZ(z) {
    if (!z || !isFiniteNum(Number(z.real)) || !isFiniteNum(Number(z.imaginary))) return "\u2014";
    var sign = Number(z.imaginary) < 0 ? "-" : "+";
    return fmtFixed(Number(z.real), 2) + " " + sign + " j" + fmtFixed(Math.abs(Number(z.imaginary)), 2) + " \u03a9";
  }
  function fmtPolar(z) {
    if (!z || !isFiniteNum(Number(z.magnitude))) return "\u2014";
    return fmtFixed(Number(z.magnitude), 2) + " \u2220 " + fmtFixed(Number(z.angle), 2) + "\u00b0";
  }
  function fmtGamma(g) {
    if (!g || !isFiniteNum(Number(g.real)) || !isFiniteNum(Number(g.imaginary))) return "\u2014";
    var sign = Number(g.imaginary) < 0 ? "-" : "+";
    return fmtFixed(Number(g.real), 4) + " " + sign + " j" + fmtFixed(Math.abs(Number(g.imaginary)), 4);
  }
  function fmtDb(v) {
    if (!isFiniteNum(Number(v))) return "\u2014";
    if (Number(v) === -Infinity) return "-\u221e dB";
    return fmtFixed(Number(v), 6) + " dB";
  }
  function fmtFreq(v) {
    if (!isFiniteNum(Number(v))) return "\u2014";
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 }) + " " + state.settings.frequencyUnit;
  }
  function parseInput(v) {
    if (typeof v === "string") return v.replace(/[^0-9.\-eE]/g, "");
    return v;
  }
  function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
  function debounce(fn, wait) {
    var timer = 0;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  var unitConverter = {
    H: 1, mH: 1e-3, uH: 1e-6, nH: 1e-9, pH: 1e-12, fH: 1e-15,
    F: 1, mF: 1e-3, uF: 1e-6, nF: 1e-9, pF: 1e-12, fF: 1e-15,
    MIc: 1e6, KIc: 1e3, Ic: 1, mIc: 1e-3,
    "\u03bb": 0, m: 1, mm: 1e-3, um: 1e-6, deg: 0,
    Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9, THz: 1e12
  };

  function correctUnitCase(unit) {
    var lower = String(unit).toLowerCase();
    for (var key in unitConverter) if (key.toLowerCase() === lower) return key;
    return unit;
  }

  function one_over_complex(z) {
    var d = z.real * z.real + z.imaginary * z.imaginary;
    return { real: z.real / d, imaginary: -z.imaginary / d };
  }
  function complex_multiply(a, b) {
    return { real: a.real * b.real - a.imaginary * b.imaginary, imaginary: a.real * b.imaginary + a.imaginary * b.real };
  }
  function complex_add(a, b) { return { real: a.real + b.real, imaginary: a.imaginary + b.imaginary }; }
  function complex_subtract(a, b) { return { real: a.real - b.real, imaginary: a.imaginary - b.imaginary }; }
  function complex_abs(z) { return Math.sqrt(z.real * z.real + z.imaginary * z.imaginary); }
  function rectangularToPolar(z) {
    return { magnitude: Math.sqrt(z.real * z.real + z.imaginary * z.imaginary), angle: Math.atan2(z.imaginary, z.real) * 180 / Math.PI };
  }
  function polarToRectangular(a) {
    var r = a.angle * Math.PI / 180;
    return { real: a.magnitude * Math.cos(r), imaginary: a.magnitude * Math.sin(r) };
  }
  function zToRefl(z, zTerm) {
    var zt = typeof zTerm === "number" ? { real: zTerm, imaginary: 0 } : zTerm;
    return complex_multiply(complex_subtract(z, zt), one_over_complex(complex_add(z, zt)));
  }
  function reflToZ(refl, zo) {
    var z0 = typeof zo === "number" ? zo : 50;
    return complex_multiply(one_over_complex({ real: 1 - refl.real, imaginary: -refl.imaginary }), { real: z0 + z0 * refl.real, imaginary: z0 * refl.imaginary });
  }

  function processImpedance(z, zo) {
    var real = Number(z.real).toFixed(2);
    var imaginary = Number(z.imaginary).toFixed(2);
    var zStr = Number(imaginary) < 0 ? real + " - " + (-imaginary) + "j" : real + " + " + imaginary + "j";
    var polar = rectangularToPolar(z);
    var zPolarStr = polar.magnitude.toFixed(2) + " \u2220 " + polar.angle.toFixed(2) + "\u00b0";
    var reflection = zToRefl(z, { real: Number(zo), imaginary: 0 });
    var refStr = reflection.imaginary < 0 ? reflection.real.toFixed(3) + " - " + (-reflection.imaginary).toFixed(3) + "j" : reflection.real.toFixed(3) + " + " + reflection.imaginary.toFixed(3) + "j";
    var refPolar = rectangularToPolar(reflection);
    var refPolarStr = refPolar.magnitude.toFixed(3) + " \u2220 " + refPolar.angle.toFixed(1) + "\u00b0";
    var vswr = ((1 + refPolar.magnitude) / (1 - refPolar.magnitude)).toPrecision(3);
    var qFactor = Math.abs(z.imaginary / z.real);
    qFactor = qFactor < 0.01 ? qFactor.toExponential(1) : qFactor.toFixed(2);
    var admittance = one_over_complex(z);
    var admString = admittance.imaginary < 0
      ? Number(admittance.real).toPrecision(3) + " - " + (-Number(admittance.imaginary)).toPrecision(3) + "j"
      : Number(admittance.real).toPrecision(3) + " + " + Number(admittance.imaginary).toPrecision(3) + "j";
    return { zStr: zStr, zPolarStr: zPolarStr, refStr: refStr, refPolarStr: refPolarStr, vswr: vswr, qFactor: qFactor, refReal: reflection.real, refImag: reflection.imaginary, admString: admString };
  }

  function customZAtFrequency(customZ, frequency, interpolation) {
    var freqs = Object.keys(customZ || {}).map(parseFloat).filter(isFinite).sort(function (a, b) { return a - b; });
    if (!freqs.length) return { real: 0, imaginary: 0 };
    var values = freqs.map(function (f) { return customZ[f]; });
    if (frequency <= freqs[0]) return values[0];
    if (frequency >= freqs[freqs.length - 1]) return values[values.length - 1];
    for (var i = 0; i < freqs.length - 1; i++) {
      if (frequency >= freqs[i] && frequency < freqs[i + 1]) {
        if (interpolation === "sah") return values[i];
        var t = (frequency - freqs[i]) / (freqs[i + 1] - freqs[i]);
        return {
          real: values[i].real + t * (values[i + 1].real - values[i].real),
          imaginary: values[i].imaginary + t * (values[i + 1].imaginary - values[i].imaginary)
        };
      }
    }
    return values[values.length - 1];
  }

  function createToleranceArray(copyCircuit) {
    var originalCircuit = deepClone(copyCircuit[0]);
    var newCircuit;
    var valueHolders = ["value", "real", "imaginary"];
    for (var i = 0; i < originalCircuit.length; i++) {
      if (originalCircuit[i].tolerance) {
        newCircuit = deepClone(copyCircuit);
        for (var j = 0; j < copyCircuit.length; j++) {
          for (var k = 0; k < valueHolders.length; k++) {
            var value = valueHolders[k];
            if (copyCircuit[j][i] && value in copyCircuit[j][i]) {
              copyCircuit[j][i][value] = copyCircuit[j][i][value] * (1 + copyCircuit[j][i].tolerance / 100);
              newCircuit[j][i][value] = newCircuit[j][i][value] * (1 - copyCircuit[j][i].tolerance / 100);
            }
          }
        }
        copyCircuit.push.apply(copyCircuit, newCircuit);
      }
    }
    if (copyCircuit.length > 1) copyCircuit.push(originalCircuit);
    return copyCircuit;
  }

  function applySliders(circuit) {
    for (var i = 0; i < circuit.length; i++) {
      if (circuit[i].slider) circuit[i].value = circuit[i].value * (1 + circuit[i].slider / 100);
      if (circuit[i].slider_im) circuit[i].imaginary = circuit[i].imaginary * (1 + circuit[i].slider_im / 100);
      if (circuit[i].slider_re) circuit[i].real = circuit[i].real * (1 + circuit[i].slider_re / 100);
    }
    return circuit;
  }

  function convertStrToFloat(circuit) {
    var fields = ["tolerance", "real", "imaginary", "esl", "esr", "value", "slider_re", "slider_im", "l1", "l2", "k", "slider", "zo", "value_c", "value_l", "eeff"];
    for (var i = 0; i < circuit.length; i++) {
      for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        if (field in circuit[i] && typeof circuit[i][field] === "string") {
          var r = parseFloat(circuit[i][field]);
          circuit[i][field] = isNaN(r) ? 0 : r;
        }
      }
    }
    return circuit;
  }

  function convertLengthToM(circuit, frequency) {
    for (var i = 0; i < circuit.length; i++) {
      if (circuit[i].unit === "\u03bb" || circuit[i].unit === "I\u03bb" || circuit[i].unit === "deg") {
        var lambdaLen = circuit[i].value;
        if (circuit[i].unit === "deg") lambdaLen = circuit[i].value / 360;
        circuit[i].value = lambdaLen * speedOfLight / frequency / Math.sqrt(circuit[i].eeff || 1);
        circuit[i].unit = "m";
      }
    }
    return circuit;
  }

  function calculateTlineZ(resolution, component, line_length, beta, startImaginary, startReal, impedanceResolution, startAdmittance, flipArc) {
    var tan_beta, zBottom_inv, zTop;
    for (var j = 0; j <= resolution; j++) {
      tan_beta = flipArc ? Math.tan((beta * j * -line_length) / resolution) : Math.tan((beta * j * line_length) / resolution);
      if (component.name === "transmissionLine") {
        zBottom_inv = one_over_complex({ real: component.zo - startImaginary * tan_beta, imaginary: startReal * tan_beta });
        zTop = { real: startReal * component.zo, imaginary: startImaginary * component.zo + tan_beta * component.zo * component.zo };
        impedanceResolution.push({
          real: zTop.real * zBottom_inv.real - zTop.imaginary * zBottom_inv.imaginary,
          imaginary: zTop.real * zBottom_inv.imaginary + zTop.imaginary * zBottom_inv.real
        });
      } else {
        impedanceResolution.push(one_over_complex({ real: startAdmittance.real, imaginary: startAdmittance.imaginary + tan_beta / component.zo }));
      }
    }
  }

  function calculateImpedance(userCircuit, frequency, resolution, showIdeal) {
    var first = userCircuit[0];
    var impedanceResults;
    if (first && first.type === "s1p" && first.data && first.data[frequency] && first.data[frequency].zS11) {
      impedanceResults = [[{ real: first.data[frequency].zS11.real, imaginary: first.data[frequency].zS11.imaginary }]];
    } else {
      impedanceResults = [[{ real: first ? first.real : 0, imaginary: first ? first.imaginary : 0 }]];
    }
    var w = 2 * Math.PI * Number(frequency);
    for (var i = 1; i < userCircuit.length; i++) {
      var impedanceResolution = [];
      var component = userCircuit[i];
      var prevResult = impedanceResults[impedanceResults.length - 1];
      var startReal = prevResult[prevResult.length - 1].real;
      var startImaginary = prevResult[prevResult.length - 1].imaginary;
      var esr = showIdeal ? 0 : component.esr ? Number(component.esr) : 0;
      var esl = showIdeal ? 0 : component.esl ? Number(component.esl) : 0;
      var j;
      if (component.name === "shortedCap" || component.name === "shortedInd" || component.name === "shortedRes") {
        var startAdmittance = one_over_complex({ real: startReal, imaginary: startImaginary });
        var newAdmittance = {};
        if (component.name === "shortedInd") newAdmittance = one_over_complex({ real: esr, imaginary: w * Number(component.value) * unitConverter[component.unit] });
        else if (component.name === "shortedCap") newAdmittance = one_over_complex({ real: esr, imaginary: w * esl * ESLUnit - 1 / (w * Number(component.value) * unitConverter[component.unit]) });
        else newAdmittance = one_over_complex({ real: Number(component.value) * unitConverter[component.unit], imaginary: w * esl * ESLUnit });
        for (j = 0; j <= resolution; j++) {
          impedanceResolution.push(one_over_complex({
            real: startAdmittance.real + newAdmittance.real * j / resolution,
            imaginary: startAdmittance.imaginary + newAdmittance.imaginary * j / resolution
          }));
        }
      } else if (component.name === "seriesCap" || component.name === "seriesInd" || component.name === "seriesRes" || component.name === "seriesRlc") {
        var newImpedance = {};
        if (component.name === "seriesInd") {
          newImpedance = { real: esr, imaginary: w * Number(component.value) * unitConverter[component.unit] };
        } else if (component.name === "seriesCap") {
          newImpedance = { real: esr, imaginary: w * esl * ESLUnit - 1 / (w * Number(component.value) * unitConverter[component.unit]) };
        } else if (component.name === "seriesRlc") {
          var zj = (w * Number(component.value_l) * unitConverter[component.unit_l]) / (1 - w * w * Number(component.value_l) * unitConverter[component.unit_l] * Number(component.value_c) * unitConverter[component.unit_c]);
          newImpedance = one_over_complex({ real: 1 / (Number(component.value) * unitConverter[component.unit]), imaginary: -1 / zj });
        } else {
          newImpedance = { real: Number(component.value) * unitConverter[component.unit], imaginary: w * esl * ESLUnit };
        }
        for (j = 0; j <= resolution; j++) {
          impedanceResolution.push({ real: startReal + newImpedance.real * j / resolution, imaginary: startImaginary + newImpedance.imaginary * j / resolution });
        }
      } else if (component.name === "transmissionLine" || component.name === "stub" || component.name === "shortedStub") {
        var beta = w / speedOfLight;
        var startAdm = one_over_complex({ real: startReal, imaginary: startImaginary });
        var lengthLambda = Number(component.value) * unitConverter[component.unit] * Number(frequency) / speedOfLight;
        lengthLambda = lengthLambda * Math.sqrt(Number(component.eeff) || 1);
        if (lengthLambda >= 0.5) calculateTlineZ(resolution, component, 0.5 * speedOfLight / Number(frequency), beta, startImaginary, startReal, impedanceResolution, startAdm, false);
        var segmentLambda = lengthLambda % 0.5;
        var flipArc = false;
        if (component.name === "shortedStub") {
          if (segmentLambda > 0 && segmentLambda < 0.25) {
            flipArc = true;
            segmentLambda = 0.25 - segmentLambda;
          } else if (segmentLambda >= 0.25) {
            segmentLambda = segmentLambda - 0.25;
          }
        }
        calculateTlineZ(resolution, component, segmentLambda * speedOfLight / Number(frequency), beta, startImaginary, startReal, impedanceResolution, startAdm, flipArc);
      } else if (component.name === "transformer") {
        if (component.model === "ideal") {
          var n = Number(component.k);
          if (isNaN(n) || n <= 0) n = 1;
          var n2 = n * n;
          for (j = 0; j <= resolution; j++) {
            var scaler = 1 + (n2 - 1) * j / resolution;
            impedanceResolution.push({ real: scaler * startReal, imaginary: scaler * startImaginary });
          }
        } else {
          var l1w = w * Number(component.l1) * unitConverter[component.unit_l1];
          var l2w = w * Number(component.l2) * unitConverter[component.unit_l2];
          var lmw = Number(component.k) * Math.sqrt(l1w * l2w);
          for (j = 0; j <= resolution; j++) {
            var i1z = { real: startReal, imaginary: startImaginary + (l1w - lmw) * j / resolution };
            var ad = one_over_complex(i1z);
            var i2z = lmw ? one_over_complex({ real: ad.real, imaginary: ad.imaginary - (1 / lmw) * j / resolution }) : ad;
            impedanceResolution.push({ real: i2z.real, imaginary: i2z.imaginary + (l2w - lmw) * j / resolution });
          }
        }
      } else if (component.name === "custom") {
        var customZ = customZAtFrequency(component.value, Number(frequency), component.interpolation);
        for (j = 0; j <= resolution; j++) impedanceResolution.push({ real: startReal + customZ.real * j / resolution, imaginary: startImaginary + customZ.imaginary * j / resolution });
      } else {
        impedanceResolution.push({ real: startReal, imaginary: startImaginary });
      }
      impedanceResults.push(impedanceResolution);
    }
    return impedanceResults;
  }

  function impedanceAtFrequency(circuit, frequency, showIdeal) {
    var spanTol = calculateImpedance(circuit, frequency, 2, showIdeal);
    var finalDp = spanTol[spanTol.length - 1];
    return finalDp[finalDp.length - 1];
  }

  function sParamFrequencyRange(data, fmin, fmax) {
    var out = {};
    if (!data) return out;
    Object.keys(data).forEach(function (key) {
      var f = Number(key);
      if (f >= fmin && f <= fmax) out[key] = data[key];
    });
    return out;
  }

  function touchstoneFrequencyHz(freq, fUnit) { return Math.round(parseFloat(freq) * unitConverter[fUnit]); }

  function sParamDataToPolar(splLine, format, fUnit, zo) {
    var frequency = touchstoneFrequencyHz(splLine[0], fUnit);
    var sparam = {};
    var vals = splLine.map(parseFloat);
    if (format === "RI") {
      if (splLine.length === 3) sparam = { S11: rectangularToPolar({ real: vals[1], imaginary: vals[2] }) };
      else if (splLine.length === 9) sparam = {
        S11: rectangularToPolar({ real: vals[1], imaginary: vals[2] }),
        S21: rectangularToPolar({ real: vals[3], imaginary: vals[4] }),
        S12: rectangularToPolar({ real: vals[5], imaginary: vals[6] }),
        S22: rectangularToPolar({ real: vals[7], imaginary: vals[8] })
      };
    } else if (format === "MA" || format === "DB") {
      var conv = format === "DB" ? function (v) { return Math.pow(10, v / 20); } : function (v) { return v; };
      if (splLine.length === 3) sparam = { S11: { magnitude: conv(vals[1]), angle: vals[2] } };
      else if (splLine.length === 9) sparam = {
        S11: { magnitude: conv(vals[1]), angle: vals[2] },
        S21: { magnitude: conv(vals[3]), angle: vals[4] },
        S12: { magnitude: conv(vals[5]), angle: vals[6] },
        S22: { magnitude: conv(vals[7]), angle: vals[8] }
      };
    }
    if (!sparam.S11) return [frequency, null];
    sparam.zS11 = reflToZ(polarToRectangular(sparam.S11), zo);
    return [frequency, sparam];
  }

  function parseTouchstoneFile(content) {
    var optionsRegex = /^\s*#\s+(\S+)\s+(\S+)\s+(\S+)\s+R\s+(\S+)\s*$/;
    var noiseRegex = /^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/;
    var results = { data: {}, noise: {}, settings: {}, error: null, name: "sparam", raw: content };
    if (typeof content !== "string") {
      results.error = "Invalid content format. Expected a string.";
      return results;
    }
    var lines = content.trim().replace(/\u2013/g, "-").split(/\r?\n/);
    var firstNonEmpty = "";
    for (var q = 0; q < lines.length; q++) if (lines[q].trim() !== "") { firstNonEmpty = lines[q].trim(); break; }
    lines = lines.filter(function (line) { return !(line.trim().indexOf("!") === 0 && line.indexOf("Noise parameters") === -1); });
    if (!lines.length) {
      results.error = "Missing Touchstone options line. Add a # header before your data.";
      return results;
    }
    var match = lines[0].match(optionsRegex);
    if (!match) {
      var hint = "Expected: # <freq_unit> S <RI|MA|DB> R <Z0>, e.g. # GHz S MA R 50.";
      results.error = "Missing or invalid Touchstone options line. " + hint;
      return results;
    }
    results.settings = { freq_unit: correctUnitCase(match[1]), param: match[2], format: match[3].toUpperCase(), zo: parseFloat(match[4]) };
    if (results.settings.param !== "S") {
      results.error = "Only S-parameters are supported (you have " + results.settings.param + ").";
      return results;
    }
    if (["RI", "MA", "DB"].indexOf(results.settings.format) === -1) {
      results.error = "Unsupported data format " + results.settings.format + ". Use RI, MA, or DB.";
      return results;
    }
    var noiseExists = false;
    var lineIndex = 1;
    for (; lineIndex < lines.length; lineIndex++) {
      if (lines[lineIndex].indexOf("! Noise parameters") !== -1) { noiseExists = true; break; }
      var spl = lines[lineIndex].trim().split(/\s+/);
      if (spl.length !== 3 && spl.length !== 9) {
        results.error = "Data line has the wrong number of columns: " + lines[lineIndex];
        return results;
      }
      var pair = sParamDataToPolar(spl, results.settings.format, results.settings.freq_unit, results.settings.zo);
      if (!pair[1]) {
        results.error = "Could not parse line as " + results.settings.format + ": " + lines[lineIndex];
        return results;
      }
      results.data[pair[0]] = pair[1];
      results.type = spl.length === 9 ? "s2p" : "s1p";
    }
    if (noiseExists) {
      for (lineIndex++; lineIndex < lines.length; lineIndex++) {
        var nm = lines[lineIndex].match(noiseRegex);
        if (!nm) { results.error = "Invalid Touchstone noise data format."; return results; }
        var f = touchstoneFrequencyHz(nm[1], results.settings.freq_unit);
        if (!(f in results.data)) continue;
        results.noise[f] = {
          rn: parseFloat(nm[5]) * results.settings.zo,
          fmin: parseFloat(nm[2]),
          gamma: { magnitude: parseFloat(nm[3]), angle: parseFloat(nm[4]) }
        };
        results.noise[f].yGamma = one_over_complex(reflToZ(polarToRectangular(results.noise[f].gamma), results.settings.zo));
      }
    }
    return results;
  }

  function sparamNoiseCircles(fMin, F, Rn, gamma) {
    var Go = polarToRectangular(gamma);
    var GoMagP1 = (Go.real + 1) * (Go.real + 1) + Go.imaginary * Go.imaginary;
    var FminLinear = Math.pow(10, fMin / 10);
    var FLinear = Math.pow(10, F / 10);
    var Ni = ((FLinear - FminLinear) * GoMagP1) / (4 * Rn);
    var center = { real: Go.real / (Ni + 1), imaginary: Go.imaginary / (Ni + 1) };
    var radius = Math.sqrt(Ni * (Ni + 1 - gamma.magnitude * gamma.magnitude)) / (Ni + 1);
    return [reflToZ(center, 50), radius];
  }

  function sparamGainCircles(S11, zo, gain) {
    var gs_max = 1 / (1 - S11.magnitude * S11.magnitude);
    var gs = Math.pow(10, gain / 10) / gs_max;
    var cs_numerator = complex_multiply({ real: gs, imaginary: 0 }, polarToRectangular({ magnitude: S11.magnitude, angle: -S11.angle }));
    var cs = complex_multiply(cs_numerator, { real: 1 / (1 - S11.magnitude * S11.magnitude * (1 - gs)), imaginary: 0 });
    var rs = Math.sqrt(1 - gs) * (1 - S11.magnitude * S11.magnitude) / (1 - S11.magnitude * S11.magnitude * (1 - gs));
    return { center: reflToZ(cs, zo), radius: rs };
  }

  function stabilityCircles(sparam, zo) {
    var S11r = polarToRectangular(sparam.S11);
    var S22r = polarToRectangular(sparam.S22);
    var S12r = polarToRectangular(sparam.S12);
    var S21r = polarToRectangular(sparam.S21);
    var product1 = complex_multiply(S11r, S22r);
    var product2 = complex_multiply(S12r, S21r);
    var delta = complex_subtract(product1, product2);
    var deltaPolar = rectangularToPolar(delta);
    var denominator = sparam.S22.magnitude * sparam.S22.magnitude - deltaPolar.magnitude * deltaPolar.magnitude;
    var numerator = complex_subtract(S22r, complex_multiply(delta, { real: S11r.real, imaginary: -S11r.imaginary }));
    var center = { real: numerator.real / denominator, imaginary: -numerator.imaginary / denominator };
    var radiusNum = complex_multiply(S12r, S21r);
    var radius = rectangularToPolar({ real: radiusNum.real / denominator, imaginary: radiusNum.imaginary / denominator });
    return { center: reflToZ(center, zo), radius: radius.magnitude };
  }

  function allImpedanceCalculations(userCircuit, settings, showIdeal) {
    var sParamIndex = -1;
    var s2pIndex = -1;
    var s1pIndex = -1;
    for (var si = 0; si < userCircuit.length; si++) {
      if (userCircuit[si].name === "sparam" && sParamIndex === -1) sParamIndex = si;
      if (userCircuit[si].type === "s2p" && s2pIndex === -1) s2pIndex = si;
      if (userCircuit[si].type === "s1p" && s1pIndex === -1) s1pIndex = si;
    }
    var RefIn = [];
    var spanFrequencies = [];
    var numericalFrequencyTemp = Number(settings.frequency) * unitConverter[settings.frequencyUnit];
    var numericalFrequency = numericalFrequencyTemp;
    var noiseFrequency = -1;
    if (sParamIndex !== -1 && userCircuit[sParamIndex].data) {
      var allF = Object.keys(userCircuit[sParamIndex].data);
      numericalFrequency = allF.length ? Number(allF[allF.length - 1]) : numericalFrequencyTemp;
      for (var fi = 0; fi < allF.length; fi++) {
        if (Number(allF[fi]) >= numericalFrequencyTemp) { numericalFrequency = Number(allF[fi]); break; }
      }
      var allFN = Object.keys(userCircuit[sParamIndex].noise || {});
      if (allFN.length) {
        noiseFrequency = Number(allFN[allFN.length - 1]);
        for (var fni = 0; fni < allFN.length; fni++) if (Number(allFN[fni]) >= numericalFrequencyTemp) { noiseFrequency = Number(allFN[fni]); break; }
      }
    }
    var numericalFspan = Number(settings.fSpan) * unitConverter[settings.fSpanUnit];
    var spanStep = numericalFspan / Number(settings.fRes || 1);
    var prepared = convertStrToFloat(deepClone(userCircuit));
    var withSliders = applySliders(prepared);
    var noLambda = convertLengthToM(withSliders, numericalFrequency);
    if (sParamIndex !== -1 && noLambda[sParamIndex]) {
      noLambda[sParamIndex].data = sParamFrequencyRange(noLambda[sParamIndex].data, numericalFrequency - numericalFspan, numericalFrequency + numericalFspan);
      noLambda[sParamIndex].noise = sParamFrequencyRange(noLambda[sParamIndex].noise, numericalFrequency - numericalFspan, numericalFrequency + numericalFspan);
    }
    if (sParamIndex !== -1 && Object.keys(noLambda[sParamIndex].data || {}).length) {
      spanFrequencies = Object.keys(noLambda[sParamIndex].data);
    } else if (Number(settings.fSpan) > 0) {
      for (var i = -Number(settings.fRes); i <= Number(settings.fRes); i++) spanFrequencies.push(numericalFrequency + i * spanStep);
    } else {
      spanFrequencies.push(numericalFrequency);
    }
    var multiZCircuits = s2pIndex === -1 ? [noLambda] : [noLambda.slice(0, s2pIndex), noLambda.slice(s2pIndex + 1).reverse()];
    var multiZResults = [];
    var loadTermIdx = -1;
    for (var lt = 0; lt < noLambda.length; lt++) if (noLambda[lt].name === "loadTerm") { loadTermIdx = lt; break; }
    var finalZ = { real: 0, imaginary: 0 };
    for (var ci = 0; ci < multiZCircuits.length; ci++) {
      var c = multiZCircuits[ci];
      var zResultsSrc = [];
      var circuitArray = createToleranceArray([c]);
      for (var zi = 0; zi < circuitArray.length; zi++) zResultsSrc.push(calculateImpedance(circuitArray[zi], numericalFrequency, 50, showIdeal));
      var noToleranceResult = zResultsSrc[zResultsSrc.length - 1];
      var finalDp = noToleranceResult[noToleranceResult.length - 1];
      finalZ = finalDp[finalDp.length - 1];
      var spanResults = [];
      for (var ai = 0; ai < circuitArray.length; ai++) {
        var fRes = {};
        var RefInVsF = {};
        for (var sp = 0; sp < spanFrequencies.length; sp++) {
          var f = spanFrequencies[sp];
          var z = impedanceAtFrequency(circuitArray[ai], f, showIdeal);
          fRes[f] = { z: z };
          if (sParamIndex !== -1 && noLambda[sParamIndex] && noLambda[sParamIndex].settings) fRes[f].reflAtSZo = zToRefl(z, { real: noLambda[sParamIndex].settings.zo, imaginary: 0 });
          if (s1pIndex !== -1) {
            var termZ = loadTermIdx !== -1 ? { real: noLambda[loadTermIdx].real, imaginary: noLambda[loadTermIdx].imaginary } : (noLambda[0] && noLambda[0].real != null ? { real: noLambda[0].real, imaginary: noLambda[0].imaginary } : { real: 50, imaginary: 0 });
            RefInVsF[f] = rectangularToPolar(zToRefl(z, termZ));
          }
        }
        spanResults.push(fRes);
        if (s1pIndex !== -1) RefIn.push(RefInVsF);
      }
      multiZResults.push({ arcs: zResultsSrc, ZvsF: spanResults });
    }
    var gainArray = [];
    var noiseArray = [];
    if (s2pIndex !== -1 && multiZResults.length > 1) {
      for (var x in multiZResults[0].ZvsF) {
        for (var y in multiZResults[1].ZvsF) {
          var gainResults = {};
          for (var gf in noLambda[s2pIndex].data) {
            var p = noLambda[s2pIndex].data[gf];
            var zx = multiZResults[0].ZvsF[x][gf];
            var zy = multiZResults[1].ZvsF[y][gf];
            if (!zx || !zy || !p.S21) continue;
            var sg = subEq(zx.reflAtSZo, polarToRectangular(p.S11)) * subEq(zy.reflAtSZo, polarToRectangular(p.S22)) * p.S21.magnitude * p.S21.magnitude;
            gainResults[gf] = sg;
          }
          gainArray.push(gainResults);
        }
      }
      if (Object.keys(noLambda[s2pIndex].noise || {}).length) {
        for (var nx in multiZResults[0].ZvsF) {
          var noiseResults = {};
          for (var nf in noLambda[s2pIndex].noise) {
            var np = noLambda[s2pIndex].noise[nf];
            var nz = multiZResults[0].ZvsF[nx][nf];
            if (!nz) continue;
            var yy = one_over_complex(nz.z);
            var diff = complex_subtract(yy, np.yGamma);
            noiseResults[nf] = Math.pow(10, np.fmin / 10) + np.rn / yy.real * (diff.real * diff.real + diff.imaginary * diff.imaginary);
          }
          noiseArray.push(noiseResults);
        }
      }
    }
    var processed = processImpedance(finalZ, Number(settings.zo));
    return [processed, spanResults, multiZResults, gainArray, noiseArray, numericalFrequency, RefIn, noiseFrequency];
  }

  function subEq(Rs, S11) {
    var numerator = 1 - Rs.real * Rs.real - Rs.imaginary * Rs.imaginary;
    var denominator = Math.pow(1 - S11.real * Rs.real + S11.imaginary * Rs.imaginary, 2) + Math.pow(S11.imaginary * Rs.real + S11.real * Rs.imaginary, 2);
    return numerator / denominator;
  }

  function sparamAtFrequency(sparam, frequency) {
    if (!sparam || !sparam.data) return null;
    var keys = Object.keys(sparam.data);
    if (!keys.length) return null;
    var target = Number(frequency);
    var best = null;
    for (var i = 0; i < keys.length; i++) {
      if (Number(keys[i]) === target) return sparam.data[keys[i]];
      if (Number(keys[i]) >= target) { best = sparam.data[keys[i]]; break; }
    }
    return best || sparam.data[keys[keys.length - 1]];
  }

  function componentSvg(name) { return componentIcon(name); }
  function componentIcon(name) {
    var open = '<svg viewBox="0 0 500 300" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    var close = "</svg>";
    var body = "";
    if (name === "blackBox") body = '<rect x="125" y="30" width="250" height="140" fill="currentColor" fill-opacity=".15"/><path d="M380 100 L500 100"/><text x="250" y="110" font-family="Helvetica" font-size="35" text-anchor="middle" fill="currentColor" stroke="none">BLACK BOX</text>';
    else if (name === "loadTerm") body = '<path d="M0 100 L195 100"/><path d="M315 100 L500 100"/><path d="M205 70 L195 100"/><path d="M205 70 L225 130"/><path d="M245 70 L265 130"/><path d="M285 70 L305 130"/><path d="M245 70 L225 130"/><path d="M285 70 L265 130"/><path d="M315 100 L305 130"/>';
    else if (name === "shortedCap") body = '<path d="M0 100 L500 100"/><path d="M255 170 L255 100"/><path d="M185 170 L325 170"/><path d="M185 200 L325 200"/><path d="M255 260 L255 200"/><path d="M255 260 L285 260 Q295 260 287 267 L263 285 Q255 291 247 285 L223 267 Q215 260 225 260 L255 260"/>';
    else if (name === "seriesCap") body = '<path d="M0 100 L235 100"/><path d="M240 30 L240 170"/><path d="M270 30 L270 170"/><path d="M275 100 L500 100"/>';
    else if (name === "shortedInd") body = '<path d="M0 100 L500 100"/><path d="M255 120 L255 100"/><path d="M255 240 Q205 220 255 200"/><path d="M255 200 Q205 180 255 160"/><path d="M255 160 Q205 140 255 120"/><path d="M255 260 L285 260 Q295 260 287 267 L263 285 Q255 291 247 285 L223 267 Q215 260 225 260 L255 260"/><path d="M255 260 L255 240"/>';
    else if (name === "seriesInd") body = '<path d="M0 100 L195 100"/><path d="M315 100 L500 100"/><path d="M195 100 Q215 50 235 100"/><path d="M235 100 Q255 50 275 100"/><path d="M275 100 Q295 50 315 100"/>';
    else if (name === "shortedRes") body = '<path d="M0 100 L500 100"/><path d="M255 120 L255 100"/><path d="M285 130 L255 120"/><path d="M285 170 L225 150"/><path d="M285 210 L225 190"/><path d="M285 170 L225 190"/><path d="M285 130 L225 150"/><path d="M285 210 L225 230"/><path d="M255 240 L225 230"/><path d="M255 260 L285 260 Q295 260 287 267 L263 285 Q255 291 247 285 L223 267 Q215 260 225 260 L255 260"/><path d="M255 260 L255 240"/>';
    else if (name === "seriesRes") body = '<path d="M0 100 L195 100"/><path d="M315 100 L500 100"/><path d="M205 70 L195 100"/><path d="M205 70 L225 130"/><path d="M245 70 L265 130"/><path d="M285 70 L305 130"/><path d="M245 70 L225 130"/><path d="M285 70 L265 130"/><path d="M315 100 L305 130"/>';
    else if (name === "seriesRlc") body = '<path d="M0 100 L195 100"/><path d="M315 100 L500 100"/><path d="M205 70 L195 100"/><path d="M205 70 L225 130"/><path d="M245 70 L265 130"/><path d="M285 70 L305 130"/><path d="M245 70 L225 130"/><path d="M285 70 L265 130"/><path d="M315 100 L305 130"/><path d="M125 180 L195 180"/><path d="M195 180 Q215 130 235 180"/><path d="M235 180 Q255 130 275 180"/><path d="M275 180 Q295 130 315 180"/><path d="M125 240 L235 240"/><path d="M240 200 L240 280"/><path d="M270 200 L270 280"/><path d="M125 240 L125 100"/><path d="M385 240 L385 100"/><path d="M275 240 L385 240"/><path d="M315 180 L385 180"/>';
    else if (name === "custom") body = '<path d="M0 100 L165 100"/><path d="M345 100 L500 100"/><rect x="165" y="41" width="180" height="120"/><text x="250" y="90" font-family="Helvetica" font-size="35" text-anchor="middle" fill="currentColor" stroke="none">custom</text><text x="250" y="130" font-family="Helvetica" font-size="35" text-anchor="middle" fill="currentColor" stroke="none">Z vs f</text>';
    else if (name === "transmissionLine") body = '<path d="M0 100 L150 100"/><path d="M350 100 L500 100"/><rect x="150" y="50" width="200" height="100"/><text x="250" y="110" font-family="Helvetica" font-size="35" text-anchor="middle" fill="currentColor" stroke="none">Zo</text>';
    else if (name === "stub") body = '<path d="M0 100 L500 100"/><path d="M255 130 L255 100"/><rect x="225" y="130" width="60" height="100"/>';
    else if (name === "shortedStub") body = '<path d="M0 100 L500 100"/><path d="M255 130 L255 100"/><path d="M255 260 L285 260 Q295 260 287 267 L263 285 Q255 291 247 285 L223 267 Q215 260 225 260 L255 260"/><path d="M255 260 L255 230"/><rect x="225" y="130" width="60" height="100"/>';
    else if (name === "transformer") body = '<path d="M305 122 L305 102"/><path d="M305 242 Q255 222 305 202"/><path d="M305 202 Q255 182 305 162"/><path d="M305 162 Q255 142 305 122"/><path d="M305 262 L335 262 Q345 262 337 268 L313 286 Q305 292 297 286 L273 268 Q265 262 275 262 L305 262"/><path d="M305 262 L305 242"/><path d="M0 100 L205 100"/><path d="M205 162 Q255 142 205 122"/><path d="M205 202 Q255 182 205 162"/><path d="M205 242 Q255 222 205 202"/><path d="M205 262 L235 262 Q245 262 237 268 L213 286 Q205 292 197 286 L173 268 Q165 262 175 262 L205 262"/><path d="M205 262 L205 242"/><path d="M205 122 L205 102"/><path d="M245 242 L245 122"/><path d="M265 242 L265 122"/><path d="M305 102 L500 100"/><text x="170" y="190" font-family="Helvetica" font-size="25" text-anchor="middle" fill="currentColor" stroke="none">L1</text><text x="340" y="190" font-family="Helvetica" font-size="25" text-anchor="middle" fill="currentColor" stroke="none">L2</text>';
    else if (name === "sparam") body = '<path d="M0 100 L130 100"/><path d="M370 100 L500 100"/><rect x="130" y="60" width="240" height="80"/><text x="250" y="110" font-family="Helvetica" font-size="35" text-anchor="middle" fill="currentColor" stroke="none">S-Parameters</text>';
    return open + body + close;
  }

  function resistorUnits() {
    return [
      { value: "mIc", label: "m\u03a9" }, { value: "Ic", label: "\u03a9" },
      { value: "KIc", label: "k\u03a9" }, { value: "MIc", label: "M\u03a9" }
    ];
  }
  function inductorUnits() {
    return [{ value: "pH", label: "pH" }, { value: "nH", label: "nH" }, { value: "uH", label: "\u00b5H" }, { value: "mH", label: "mH" }, { value: "H", label: "H" }];
  }
  function capacitorUnits() {
    return [{ value: "fF", label: "fF" }, { value: "pF", label: "pF" }, { value: "nF", label: "nF" }, { value: "uF", label: "\u00b5F" }, { value: "mF", label: "mF" }, { value: "F", label: "F" }];
  }
  function lengthUnits() {
    return [{ value: "um", label: "\u00b5m" }, { value: "mm", label: "mm" }, { value: "m", label: "m" }, { value: "\u03bb", label: "\u03bb" }, { value: "deg", label: "deg" }];
  }
  function frequencyUnits() {
    return ["Hz", "kHz", "MHz", "GHz", "THz"];
  }

  var circuitComponents = {
    blackBox: {
      label: "Black Box Z", short: "Load impedance", icon: "blackBox",
      fields: [
        { key: "real", label: "Resistance R", unit: "\u03a9", step: "any" },
        { key: "imaginary", label: "Reactance X", unit: "\u03a9", step: "any" },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { real: 50, imaginary: 0, tolerance: 0 },
      toURL: function (c) { return "blackBox_" + c.real + "_" + c.imaginary + "_" + (c.tolerance || 0); },
      fromURL: function (p) { return { real: Number(p[0]), imaginary: Number(p[1]), tolerance: Number(p[2] || 0) }; }
    },
    loadTerm: {
      label: "Load Termination", short: "Ideal termination", icon: "loadTerm",
      fields: [
        { key: "real", label: "Resistance R", unit: "\u03a9", step: "any" },
        { key: "imaginary", label: "Reactance X", unit: "\u03a9", step: "any" },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { real: 50, imaginary: 0, tolerance: 0 },
      toURL: function (c) { return "loadTerm_" + c.real + "_" + c.imaginary + "_" + (c.tolerance || 0); },
      fromURL: function (p) { return { real: Number(p[0]), imaginary: Number(p[1]), tolerance: Number(p[2] || 0) }; }
    },
    shortedCap: {
      label: "Shorted Capacitor", short: "Shunt capacitor", icon: "shortedCap",
      fields: [
        { key: "value", label: "Capacitance", unitKey: "unit", units: capacitorUnits(), step: "any" },
        { key: "esr", label: "ESR", unit: "\u03a9", step: "any", optional: true },
        { key: "esl", label: "ESL", unit: "nH", step: "any", optional: true },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { value: 1.3, unit: "pF", tolerance: 0, esr: 0, esl: 0 },
      toURL: function (c) { return "shortedCap_" + c.value + "_" + c.unit + "_" + (c.tolerance || 0) + "_" + (c.esr || 0) + "_" + (c.esl || 0); },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], tolerance: Number(p[2] || 0), esr: Number(p[3] || 0), esl: Number(p[4] || 0) }; }
    },
    seriesCap: {
      label: "Series Capacitor", short: "Series capacitor", icon: "seriesCap",
      fields: [
        { key: "value", label: "Capacitance", unitKey: "unit", units: capacitorUnits(), step: "any" },
        { key: "esr", label: "ESR", unit: "\u03a9", step: "any", optional: true },
        { key: "esl", label: "ESL", unit: "nH", step: "any", optional: true },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { value: 1, unit: "pF", tolerance: 0, esr: 0, esl: 0 },
      toURL: function (c) { return "seriesCap_" + c.value + "_" + c.unit + "_" + (c.tolerance || 0) + "_" + (c.esr || 0) + "_" + (c.esl || 0); },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], tolerance: Number(p[2] || 0), esr: Number(p[3] || 0), esl: Number(p[4] || 0) }; }
    },
    shortedInd: {
      label: "Shorted Inductor", short: "Shunt inductor", icon: "shortedInd",
      fields: [
        { key: "value", label: "Inductance", unitKey: "unit", units: inductorUnits(), step: "any" },
        { key: "esr", label: "ESR", unit: "\u03a9", step: "any", optional: true },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { value: 1, unit: "nH", tolerance: 0, esr: 0 },
      toURL: function (c) { return "shortedInd_" + c.value + "_" + c.unit + "_" + (c.tolerance || 0) + "_" + (c.esr || 0); },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], tolerance: Number(p[2] || 0), esr: Number(p[3] || 0) }; }
    },
    seriesInd: {
      label: "Series Inductor", short: "Series inductor", icon: "seriesInd",
      fields: [
        { key: "value", label: "Inductance", unitKey: "unit", units: inductorUnits(), step: "any" },
        { key: "esr", label: "ESR", unit: "\u03a9", step: "any", optional: true },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { value: 1, unit: "nH", tolerance: 0, esr: 0 },
      toURL: function (c) { return "seriesInd_" + c.value + "_" + c.unit + "_" + (c.tolerance || 0) + "_" + (c.esr || 0); },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], tolerance: Number(p[2] || 0), esr: Number(p[3] || 0) }; }
    },
    shortedRes: {
      label: "Shorted Resistor", short: "Shunt resistor", icon: "shortedRes",
      fields: [
        { key: "value", label: "Resistance", unitKey: "unit", units: resistorUnits(), step: "any" },
        { key: "esl", label: "ESL", unit: "nH", step: "any", optional: true },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { value: 50, unit: "Ic", tolerance: 0, esl: 0 },
      toURL: function (c) { return "shortedRes_" + c.value + "_" + c.unit + "_" + (c.tolerance || 0) + "_" + (c.esl || 0); },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], tolerance: Number(p[2] || 0), esl: Number(p[3] || 0) }; }
    },
    seriesRes: {
      label: "Series Resistor", short: "Series resistor", icon: "seriesRes",
      fields: [
        { key: "value", label: "Resistance", unitKey: "unit", units: resistorUnits(), step: "any" },
        { key: "esl", label: "ESL", unit: "nH", step: "any", optional: true },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { value: 50, unit: "Ic", tolerance: 0, esl: 0 },
      toURL: function (c) { return "seriesRes_" + c.value + "_" + c.unit + "_" + (c.tolerance || 0) + "_" + (c.esl || 0); },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], tolerance: Number(p[2] || 0), esl: Number(p[3] || 0) }; }
    },
    seriesRlc: {
      label: "Parallel RLC", short: "Parallel RLC", icon: "seriesRlc",
      fields: [
        { key: "value", label: "Resistance", unitKey: "unit", units: resistorUnits(), step: "any" },
        { key: "value_l", label: "Inductance", unitKey: "unit_l", units: inductorUnits(), step: "any" },
        { key: "value_c", label: "Capacitance", unitKey: "unit_c", units: capacitorUnits(), step: "any" }
      ],
      default: { value: 50, unit: "Ic", value_l: 1, unit_l: "nH", value_c: 1, unit_c: "pF" },
      toURL: function (c) { return "seriesRlc_" + c.value + "_" + c.unit + "_" + c.value_l + "_" + c.unit_l + "_" + c.value_c + "_" + c.unit_c; },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], value_l: Number(p[2]), unit_l: p[3], value_c: Number(p[4]), unit_c: p[5] }; }
    },
    custom: {
      label: "Custom Z(f)", short: "Tabulated impedance", icon: "custom",
      fields: [],
      default: { interpolation: "linear", value: { 0: { real: 1, imaginary: 1 }, 1e3: { real: 30, imaginary: 30 }, 1e6: { real: 60, imaginary: 60 }, 1e9: { real: 90, imaginary: 90 }, 1e12: { real: 120, imaginary: 120 } } },
      toURL: function (c) { return "custom_" + c.interpolation + "_" + JSON.stringify(c.value); },
      fromURL: function (p) { return { interpolation: p[0], value: JSON.parse(p[1]) }; }
    },
    transmissionLine: {
      label: "Transmission Line", short: "Transmission line", icon: "transmissionLine",
      fields: [
        { key: "value", label: "Length", unitKey: "unit", units: lengthUnits(), step: "any" },
        { key: "zo", label: "Line Z0", unit: "\u03a9", step: "any" },
        { key: "eeff", label: "Effective \u03b5r", unit: "", step: "any" },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { value: 1, unit: "mm", zo: 50, eeff: 1, tolerance: 0 },
      toURL: function (c) { return "transmissionLine_" + c.value + "_" + c.unit + "_" + (c.tolerance || 0) + "_" + c.zo + "_" + c.eeff; },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], tolerance: Number(p[2] || 0), zo: Number(p[3]), eeff: Number(p[4]) }; }
    },
    stub: {
      label: "Open Stub", short: "Open stub", icon: "stub",
      fields: [
        { key: "value", label: "Length", unitKey: "unit", units: lengthUnits(), step: "any" },
        { key: "zo", label: "Stub Z0", unit: "\u03a9", step: "any" },
        { key: "eeff", label: "Effective \u03b5r", unit: "", step: "any" },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { value: 1, unit: "mm", zo: 50, eeff: 1, tolerance: 0 },
      toURL: function (c) { return "stub_" + c.value + "_" + c.unit + "_" + (c.tolerance || 0) + "_" + c.zo + "_" + c.eeff; },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], tolerance: Number(p[2] || 0), zo: Number(p[3]), eeff: Number(p[4]) }; }
    },
    shortedStub: {
      label: "Shorted Stub", short: "Shorted stub", icon: "shortedStub",
      fields: [
        { key: "value", label: "Length", unitKey: "unit", units: lengthUnits(), step: "any" },
        { key: "zo", label: "Stub Z0", unit: "\u03a9", step: "any" },
        { key: "eeff", label: "Effective \u03b5r", unit: "", step: "any" },
        { key: "tolerance", label: "Tolerance", unit: "%", step: "any", optional: true }
      ],
      default: { value: 1, unit: "mm", zo: 50, eeff: 1, tolerance: 0 },
      toURL: function (c) { return "shortedStub_" + c.value + "_" + c.unit + "_" + (c.tolerance || 0) + "_" + c.zo + "_" + c.eeff; },
      fromURL: function (p) { return { value: Number(p[0]), unit: p[1], tolerance: Number(p[2] || 0), zo: Number(p[3]), eeff: Number(p[4]) }; }
    },
    transformer: {
      label: "Transformer", short: "Coupled / ideal", icon: "transformer",
      fields: [
        { key: "l1", label: "Primary L", unitKey: "unit_l1", units: inductorUnits(), step: "any" },
        { key: "l2", label: "Secondary L", unitKey: "unit_l2", units: inductorUnits(), step: "any" },
        { key: "k", label: "Coupling / ratio", unit: "", step: "any" },
        { key: "model", label: "Model", options: [{ value: "coupledInductor", label: "Coupled inductors" }, { value: "ideal", label: "Ideal transformer" }] }
      ],
      default: { l1: 1, unit_l1: "nH", l2: 1, unit_l2: "nH", k: 1, model: "coupledInductor" },
      toURL: function (c) { return "transformer_" + c.l1 + "_" + c.unit_l1 + "_" + c.l2 + "_" + c.unit_l2 + "_" + c.k + "_" + (c.model || "coupledInductor"); },
      fromURL: function (p) { return { l1: Number(p[0]), unit_l1: p[1], l2: Number(p[2]), unit_l2: p[3], k: Number(p[4]), model: p[5] === "ideal" ? "ideal" : "coupledInductor" }; }
    },
    sparam: {
      label: "S-Parameter", short: "Touchstone file", icon: "sparam",
      fields: [],
      default: { type: "s1p", data: {}, noise: {}, settings: { freq_unit: "GHz", param: "S", format: "MA", zo: 50 }, error: null, raw: "" },
      toURL: function (c) {
        if (!c || !c.data || !Object.keys(c.data).length) return "sparam_s1p_GHz_50_tooLong";
        var base = "sparam_" + c.type + "_" + c.settings.freq_unit + "_" + c.settings.zo;
        if (c.raw && c.raw.length > 1000) return base + "_tooLong";
        if (c.type === "s2p") {
          var out = base + "_" + Object.keys(c.data).map(function (f) {
            var d = c.data[f];
            return [Number(f) / unitConverter[c.settings.freq_unit], d.S11.magnitude, d.S11.angle, d.S21.magnitude, d.S21.angle, d.S12.magnitude, d.S12.angle, d.S22.magnitude, d.S22.angle].join("_");
          }).join("_");
          if (Object.keys(c.noise || {}).length) {
            out += "_noise_" + Object.keys(c.noise).map(function (f) {
              var n = c.noise[f];
              return [Number(f) / unitConverter[c.settings.freq_unit], n.fmin, n.gamma.magnitude, n.gamma.angle, n.rn].join("_");
            }).join("_");
          }
          return out;
        }
        return base + "_" + Object.keys(c.data).map(function (f) {
          var d = c.data[f];
          return [Number(f) / unitConverter[c.settings.freq_unit], d.S11.magnitude, d.S11.angle].join("_");
        }).join("_");
      },
      fromURL: function (p) {
        if (p[3] === "tooLong" || !p[0]) return { type: "s1p", data: {}, noise: {}, settings: { freq_unit: "GHz", param: "S", format: "MA", zo: 50 }, error: null, raw: "" };
        var unit = p[1];
        var zo = p[2];
        var type = p[0];
        var raw = "# " + unit + " S MA R " + zo;
        if (type === "s2p") {
          var noiseIndex = -1;
          for (var i = 3; i < p.length; i += 9) {
            if (p[i] === "noise") { noiseIndex = i + 1; break; }
            raw += "\n" + [p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5], p[i + 6], p[i + 7], p[i + 8]].join(" ");
          }
          if (noiseIndex > 0) {
            raw += "\n! Noise parameters";
            for (var n = noiseIndex; n < p.length; n += 5) raw += "\n" + [p[n], p[n + 1], p[n + 2], p[n + 3], Number(p[n + 4]) / Number(zo)].join(" ");
          }
        } else {
          for (var j = 3; j < p.length; j += 3) raw += "\n" + [p[j], p[j + 1], p[j + 2]].join(" ");
        }
        return parseTouchstoneFile(raw);
      }
    }
  };

  var state = {
    settings: { zo: 50, frequency: 2440, frequencyUnit: "MHz", fSpan: 0, fSpanUnit: "MHz", fRes: 10, zMarkers: [], vswrCircles: [], qCircles: [], nfCircles: [], gainInCircles: [], gainOutCircles: [] },
    circuit: [],
    overlays: { impedance: true, stability: false, conjugate: false, ideal: true, s11: true, s21: true, s12: true, s22: true },
    graph: { resistance: [0, 0.2, 0.5, 1, 2, 4, 10], reactance: [0.2, 0.5, 1, 2, 4, 10, -0.2, -0.5, -1, -2, -4, -10], showAdmittance: false },
    layout: "side"
  };
  var appData = null;
  var plotInstances = [];
  var dragIndex = -1;
  var toastTimer = 0;
  var hoverSnaps = [];
  var hoverOverlay = null;
  var hoverZ = null;

  function componentUrl(c) {
    var def = circuitComponents[c.name];
    return def ? def.toURL(c) : "";
  }
  function generateCircuitUrl() {
    return state.circuit.map(componentUrl).join("__");
  }
  function readCircuitFromUrl() {
    var params = new URLSearchParams(location.search);
    var value = params.get("circuit");
    if (!value) return [{ name: "blackBox", real: 50, imaginary: 0, tolerance: 0 }];
    var blocks = value.split("__");
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var parts = blocks[i].split("_");
      var name = parts.shift();
      var def = circuitComponents[name];
      if (!def) continue;
      var component = deepClone(def.default);
      component.name = name;
      var parsed;
      try { parsed = def.fromURL(parts); } catch (e) { parsed = {}; }
      for (var k in parsed) component[k] = parsed[k];
      out.push(component);
    }
    return out.length ? out : [{ name: "blackBox", real: 50, imaginary: 0, tolerance: 0 }];
  }

  function isFixedComponent(index) {
    return index === 0 && !!state.circuit[0] && state.circuit[0].name === "blackBox";
  }

  function normalizeCircuit() {
    var hasOnePortSparam = false;
    for (var s = 0; s < state.circuit.length; s++) {
      if (state.circuit[s].name === "sparam" && state.circuit[s].type === "s1p") { hasOnePortSparam = true; break; }
    }
    if (hasOnePortSparam) return;
    var firstBlackBox = -1;
    for (var i = 0; i < state.circuit.length; i++) {
      if (state.circuit[i].name === "blackBox") { firstBlackBox = i; break; }
    }
    if (firstBlackBox === -1) {
      state.circuit.unshift(Object.assign({}, circuitComponents.blackBox.default, { name: "blackBox" }));
    } else if (firstBlackBox > 0) {
      var fixed = state.circuit.splice(firstBlackBox, 1)[0];
      state.circuit.unshift(fixed);
    }
    for (var j = state.circuit.length - 1; j > 0; j--) {
      if (state.circuit[j].name === "blackBox") state.circuit.splice(j, 1);
    }
  }

  function showToast(message) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  function refreshIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function settingsFloat() {
    return {
      zo: num(state.settings.zo, 50),
      frequency: num(state.settings.frequency, 2440),
      frequencyUnit: state.settings.frequencyUnit,
      fSpan: num(state.settings.fSpan, 0),
      fSpanUnit: state.settings.fSpanUnit,
      fRes: Math.max(1, Math.round(num(state.settings.fRes, 10)))
    };
  }

  function prepareEditorCircuit(frequency) {
    var copy = convertStrToFloat(deepClone(state.circuit));
    copy = applySliders(copy);
    return convertLengthToM(copy, frequency);
  }

  function compute() {
    var settings = settingsFloat();
    var result = allImpedanceCalculations(state.circuit, settings, state.overlays.ideal);
    var sparam = null;
    for (var i = 0; i < state.circuit.length; i++) {
      if (state.circuit[i].name === "sparam" && state.circuit[i].data) { sparam = state.circuit[i]; break; }
    }
    var editorArcs = [];
    try { editorArcs = calculateImpedance(prepareEditorCircuit(result[5]), result[5], 2, state.overlays.ideal); } catch (e) { editorArcs = []; }
    appData = {
      settings: settings,
      processed: result[0], spanResults: result[1], multiZResults: result[2], gainArray: result[3], noiseArray: result[4],
      numericalFrequency: result[5], RefIn: result[6], noiseFrequency: result[7], sparam: sparam, editorArcs: editorArcs
    };
    return appData;
  }

  function nominalSpan() {
    if (!appData || !appData.spanResults || !appData.spanResults.length) return {};
    return appData.spanResults[appData.spanResults.length - 1] || {};
  }
  function componentImpedanceAt(index) {
    if (!appData || !appData.editorArcs || !appData.editorArcs[index]) return null;
    var arc = appData.editorArcs[index];
    return arc.length ? arc[arc.length - 1] : null;
  }

  function renderPalette() {
    var order = ["shortedCap", "seriesCap", "shortedInd", "seriesInd", "shortedRes", "seriesRes", "seriesRlc", "custom", "transmissionLine", "stub", "shortedStub", "transformer", "sparam"];
    var html = "";
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      var def = circuitComponents[key];
      html += '<button type="button" data-add="' + key + '" title="Add ' + esc(def.label) + '">' +
        '<span class="sc-comp-icon">' + componentIcon(def.icon) + "</span>" +
        '<span class="sc-palette-label">' + esc(def.label) + "</span></button>";
    }
    $("#componentPalette").innerHTML = html;
  }

  function unitOptions(units, current) {
    var html = "";
    for (var i = 0; i < units.length; i++) {
      html += '<option value="' + esc(units[i].value) + '"' + (units[i].value === current ? " selected" : "") + ">" + esc(units[i].label) + "</option>";
    }
    return html;
  }

  function fieldValue(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "number" && !isFinite(value)) return "";
    return String(value);
  }

  function fieldHtml(component, field, index) {
    var value = component[field.key];
    var input = "";
    if (field.options) {
      var opts = "";
      for (var oi = 0; oi < field.options.length; oi++) {
        var opt = field.options[oi];
        opts += '<option value="' + esc(opt.value) + '"' + (value === opt.value ? " selected" : "") + ">" + esc(opt.label) + "</option>";
      }
      input = '<select class="sc-select" data-field="' + field.key + '" data-index="' + index + '">' + opts + "</select>";
    } else if (field.units) {
      var unitKey = field.unitKey || "unit";
      input = '<div class="sc-unit-inline sc-unit-split"><input class="sc-input" type="number" inputmode="decimal" step="' + (field.step || "any") + '" data-field="' + field.key + '" data-index="' + index + '" value="' + esc(fieldValue(value)) + '" placeholder="0"><select class="sc-select" data-unitfield="' + unitKey + '" data-index="' + index + '">' + unitOptions(field.units, component[unitKey]) + "</select></div>";
    } else {
      var suffix = field.unit ? '<span class="unit">' + esc(field.unit) + "</span>" : "";
      input = '<div class="sc-unit-inline"><input class="sc-input" type="number" inputmode="decimal" step="' + (field.step || "any") + '" data-field="' + field.key + '" data-index="' + index + '" value="' + esc(fieldValue(value)) + '" placeholder="' + (field.optional ? "optional" : "0") + '">' + suffix + "</div>";
    }
    return '<div class="sc-mini-field"><label>' + esc(field.label) + "</label>" + input + "</div>";
  }

  function componentSummary(component, index) {
    if (component.name === "custom") {
      var keys = Object.keys(component.value || {});
      return '<p class="sc-item-note">' + keys.length + " impedance points, " + esc(component.interpolation || "linear") + ' interpolation</p><button class="btn sm" type="button" data-action="edit-custom" data-index="' + index + '"><i data-lucide="pencil"></i> Set Z(f)</button>';
    }
    if (component.name === "sparam") {
      var count = component.data ? Object.keys(component.data).length : 0;
      var type = component.type || "s1p";
      var range = "";
      if (component.data && count) {
        var keys = Object.keys(component.data).map(Number).sort(function (a, b) { return a - b; });
        range = " \u00b7 " + fmtFreq(keys[0] / unitConverter[component.settings.freq_unit]) + " to " + fmtFreq(keys[keys.length - 1] / unitConverter[component.settings.freq_unit]);
      }
      return '<p class="sc-item-note">' + esc(type.toUpperCase()) + " \u00b7 " + count + " points" + esc(range) + '</p><button class="btn sm" type="button" data-action="edit-sparam" data-index="' + index + '"><i data-lucide="file-up"></i> ' + (count ? "Replace file" : "Load file") + "</button>";
    }
    return "";
  }

  function renderCircuit() {
    var root = $("#circuitRows");
    if (!state.circuit.length) {
      root.innerHTML = '<div class="sc-empty">No components in the chain. Add a black box load or pick a component above.</div>';
      updateComponentCount();
      return;
    }
    var html = "";
    for (var i = 0; i < state.circuit.length; i++) {
      var c = state.circuit[i];
      var def = circuitComponents[c.name];
      if (!def) continue;
      var z = componentImpedanceAt(i);
      var gamma = z ? zToRefl(z, { real: num(state.settings.zo, 50), imaginary: 0 }) : null;
      var fields = "";
      for (var f = 0; f < def.fields.length; f++) fields += fieldHtml(c, def.fields[f], i);
      var fixed = isFixedComponent(i);
      html += '<div class="sc-block' + (fixed ? " sc-block-fixed" : "") + '" data-index="' + i + '" draggable="' + (fixed ? "false" : "true") + '">' +
        '<div class="sc-block-head">' +
          (fixed
            ? '<span class="sc-drag-icon" title="Fixed first block"><i data-lucide="lock"></i></span>'
            : '<button class="sc-drag-btn" type="button" data-action="drag-handle" data-index="' + i + '" title="Drag to reorder"><i data-lucide="grip-vertical"></i></button>') +
          '<span class="sc-block-img">' + componentSvg(def.icon) + '</span>' +
          '<span class="sc-block-dp">DP' + i + '</span>' +
          '<span class="sc-block-actions">' +
            (fixed
              ? '<span class="sc-badge">Fixed</span>'
              : '<button class="sc-act" type="button" data-action="move-up" data-index="' + i + '" title="Move closer to load"><i data-lucide="arrow-left"></i></button>' +
                '<button class="sc-act" type="button" data-action="move-down" data-index="' + i + '" title="Move toward input"><i data-lucide="arrow-right"></i></button>' +
                '<button class="sc-act danger" type="button" data-action="remove" data-index="' + i + '" title="Remove"><i data-lucide="trash-2"></i></button>') +
          "</span>" +
        "</div>" +
        '<div class="sc-block-body">' +
          '<div class="sc-block-z">Z = ' + (z ? fmtZ(z) : "\u2014") + "</div>" +
          '<div class="sc-block-fields">' + fields + "</div>" +
        "</div>" +
        '<div class="sc-block-info">' +
          '<span>Z<sub>in</sub> <b data-readout-z="' + i + '">' + (z ? fmtZ(z) : "\u2014") + "</b></span>" +
          '<span>\u0393 <b data-readout-g="' + i + '">' + (gamma ? fmtGamma(gamma) : "\u2014") + "</b></span>" +
        "</div>" +
      "</div>";
    }
    root.innerHTML = html;
    updateComponentCount();
    refreshIcons();
  }

  function updateCircuitReadouts() {
    for (var i = 0; i < state.circuit.length; i++) {
      var z = componentImpedanceAt(i);
      var g = z ? zToRefl(z, { real: num(state.settings.zo, 50), imaginary: 0 }) : null;
      var zEl = $('[data-readout-z="' + i + '"]');
      var gEl = $('[data-readout-g="' + i + '"]');
      if (zEl) zEl.textContent = z ? fmtZ(z) : "\u2014";
      if (gEl) gEl.textContent = g ? fmtGamma(g) : "\u2014";
    }
  }

  function updateComponentCount() {
    var el = $("#componentCount");
    if (el) el.textContent = String(state.circuit.length);
  }

  function gammaFromZ(z, zo) {
    var z0 = typeof zo === "number" ? zo : 50;
    return zToRefl(z, { real: z0, imaginary: 0 });
  }

  function dbFromGamma(g) {
    var mag = Math.sqrt(g.real * g.real + g.imaginary * g.imaginary);
    return 20 * Math.log10(mag);
  }

  function renderResults() {
    var root = $("#finalResults");
    if (!appData) { root.innerHTML = '<div class="sc-empty">No result.</div>'; return; }
    var nominal = nominalSpan();
    var sortedFreqs = Object.keys(nominal).sort(function (a, b) { return Number(a) - Number(b); });
    var s21Values = [];
    for (var i = 0; i < sortedFreqs.length; i++) {
      var g = gammaFromZ(nominal[sortedFreqs[i]].z, appData.settings.zo);
      var gm = Math.sqrt(g.real * g.real + g.imaginary * g.imaginary);
      s21Values.push(20 * Math.log10(Math.sqrt(Math.max(0, 1 - gm * gm))));
    }
    var maxS21 = s21Values.length ? s21Values[0] : NaN;
    var maxIndex = 0;
    var maxF = 0;
    for (var mi = 0; mi < s21Values.length; mi++) {
      if (s21Values[mi] > maxS21) { maxS21 = s21Values[mi]; maxIndex = mi; maxF = Number(sortedFreqs[mi]) / unitConverter[appData.settings.frequencyUnit]; }
    }
    var db3l = -1;
    var db3m = -1;
    for (var li = maxIndex; li >= 0; li--) if (s21Values[li] < maxS21 - 3) { db3l = Number(sortedFreqs[li]) / unitConverter[appData.settings.frequencyUnit]; break; }
    for (var ri = maxIndex; ri < s21Values.length; ri++) if (s21Values[ri] < maxS21 - 3) { db3m = Number(sortedFreqs[ri]) / unitConverter[appData.settings.frequencyUnit]; break; }
    var processed = appData.processed;
    var gamma = { real: processed.refReal, imaginary: processed.refImag };
    var gammaMag = Math.sqrt(gamma.real * gamma.real + gamma.imaginary * gamma.imaginary);
    var gammaPolar = rectangularToPolar(gamma);
    var load = componentImpedanceAt(0);
    var input = componentImpedanceAt(state.circuit.length - 1);
    var sp = appData.sparam ? sparamAtFrequency(appData.sparam, appData.numericalFrequency) : null;
    var sp11 = sp && sp.S11 ? sp.S11 : null;
    var sp21 = sp && sp.S21 ? sp.S21 : null;
    var sp22 = sp && sp.S22 ? sp.S22 : null;
    var bw = db3l === -1 || db3m === -1 ? "N/A" : (db3m - db3l).toPrecision(6) + " " + appData.settings.frequencyUnit;
    var rows = [
      ["section", "Impedance"],
      ["row", "System impedance Z<sub>0</sub>", fmtFixed(appData.settings.zo, 2) + " \u03a9"],
      ["row", "Load impedance", fmtZ(load)],
      ["row", "Input impedance Z<sub>in</sub>", fmtZ(input), "accent"],
      ["row", "Z<sub>in</sub> polar", fmtPolar(rectangularToPolar(input || { real: 0, imaginary: 0 }))],
      ["row", "Admittance Y<sub>in</sub>", processed.admString + " S"],
      ["section", "Reflection"],
      ["row", "Reflection coefficient \u0393", processed.refStr],
      ["row", "\u0393 polar", processed.refPolarStr],
      ["row", "VSWR", processed.vswr],
      ["row", "Return loss", gammaMag > 0 ? fmtDb(-20 * Math.log10(gammaMag)) : "\u221e"],
      ["row", "Mismatch loss", gammaMag < 1 ? fmtDb(-10 * Math.log10(1 - gammaMag * gammaMag)) : "\u2014"],
      ["row", "Q factor", processed.qFactor],
      ["section", "S-parameters"],
      ["row", "S11", sp11 ? fmtDb(20 * Math.log10(sp11.magnitude)) + " \u2220 " + fmtFixed(sp11.angle, 2) + "\u00b0" : gammaMag > 0 ? fmtDb(20 * Math.log10(gammaMag)) : "\u2014"],
      ["row", "S21", sp21 ? fmtDb(20 * Math.log10(sp21.magnitude)) + " \u2220 " + fmtFixed(sp21.angle, 2) + "\u00b0" : (isFiniteNum(maxS21) ? fmtDb(maxS21) : "\u2014")],
      ["row", "S22", sp22 ? fmtDb(20 * Math.log10(sp22.magnitude)) + " \u2220 " + fmtFixed(sp22.angle, 2) + "\u00b0" : "\u2014"],
      ["row", "Max S21", isFiniteNum(maxS21) ? fmtSig(maxS21, 6) + " dB @ " + fmtFreq(maxF) : "\u2014", "warn"],
      ["row", "3 dB bandwidth", bw],
      ["row", "Sweep points", String(sortedFreqs.length)]
    ];
    var html = "";
    for (var r = 0; r < rows.length; r++) {
      if (rows[r][0] === "section") html += '<div class="sc-result-section">' + rows[r][1] + "</div>";
      else html += '<div class="sc-result-row"><span class="k">' + rows[r][1] + '</span><span class="v ' + (rows[r][3] || "") + '">' + rows[r][2] + "</span></div>";
    }
    root.innerHTML = html;
    $("#resultsNote").textContent = "Results evaluated at " + fmtFreq(appData.settings.frequency) + " with Z0 = " + fmtFixed(appData.settings.zo, 2) + " \u03a9. S21 assumes a lossless two-port for non-S-parameter circuits.";
  }

  function markerListHtml() {
    var s = appData ? appData.settings : settingsFloat();
    var html = "";
    html += '<div class="sc-table-title"><span>Z markers</span><button type="button" data-action="add-zmarker">+ Add</button></div>';
    if (state.settings.zMarkers.length) {
      html += '<table class="sc-mini-table"><thead><tr><th>R (\u03a9)</th><th>X (\u03a9)</th><th></th></tr></thead><tbody>';
      for (var i = 0; i < state.settings.zMarkers.length; i++) {
        var m = state.settings.zMarkers[i];
        html += "<tr><td><input type=\"number\" step=\"any\" data-marker-list=\"zMarkers\" data-index=\"" + i + "\" data-marker-field=\"real\" value=\"" + esc(m[0]) + "\"></td>" +
          "<td><input type=\"number\" step=\"any\" data-marker-list=\"zMarkers\" data-index=\"" + i + "\" data-marker-field=\"imaginary\" value=\"" + esc(m[1]) + "\"></td>" +
          '<td><button type="button" class="sc-link-btn" data-action="remove-marker" data-list="zMarkers" data-index="' + i + '"><i data-lucide="x"></i></button></td></tr>';
      }
      html += "</tbody></table>";
    } else {
      html += '<p class="sc-item-note" style="margin:3px 0 8px">No custom markers.</p>';
    }
    var circles = [
      { key: "vswrCircles", label: "VSWR circles", step: "any", unit: "" },
      { key: "qCircles", label: "Q circles", step: "any", unit: "" },
      { key: "nfCircles", label: "Noise figure circles", step: "0.1", unit: "dB" },
      { key: "gainInCircles", label: "Gain circles (input)", step: "0.1", unit: "dB" },
      { key: "gainOutCircles", label: "Gain circles (output)", step: "0.1", unit: "dB" }
    ];
    for (var c = 0; c < circles.length; c++) {
      var ci = circles[c];
      html += '<div class="sc-table-title"><span>' + ci.label + '</span><button type="button" data-action="add-circle" data-list="' + ci.key + '">+ Add</button></div>';
      var list = state.settings[ci.key];
      if (list.length) {
        html += '<div class="sc-marker-chips">';
        for (var j = 0; j < list.length; j++) html += '<span class="sc-chip">' + esc(list[j]) + " " + esc(ci.unit) + ' <button type="button" data-action="remove-circle" data-list="' + ci.key + '" data-index="' + j + '"><i data-lucide="x"></i></button></span>';
        html += "</div>";
      } else {
        html += '<p class="sc-item-note" style="margin:3px 0 8px">None.</p>';
      }
    }
    return html;
  }

  function renderSettings() {
    var s = state.settings;
    var frequencyOptions = frequencyUnits().map(function (u) { return '<option value="' + u + '"' + (u === s.frequencyUnit ? " selected" : "") + ">" + u + "</option>"; }).join("");
    var spanOptions = frequencyUnits().map(function (u) { return '<option value="' + u + '"' + (u === s.fSpanUnit ? " selected" : "") + ">" + u + "</option>"; }).join("");
    var html = '<div class="sc-settings-grid">' +
      '<div class="sc-setting"><label>System impedance Z0</label><div class="row"><input class="sc-input" type="number" step="any" data-setting="zo" value="' + esc(s.zo) + '"><span class="unit">\u03a9</span></div></div>' +
      '<div class="sc-setting"><label>Frequency</label><div class="row"><input class="sc-input" type="number" step="any" data-setting="frequency" value="' + esc(s.frequency) + '"><select class="sc-select" data-setting-unit="frequencyUnit">' + frequencyOptions + "</select></div></div>" +
      '<div class="sc-setting"><label>Span</label><div class="row"><input class="sc-input" type="number" step="any" data-setting="fSpan" value="' + esc(s.fSpan) + '"><select class="sc-select" data-setting-unit="fSpanUnit">' + spanOptions + "</select></div></div>" +
      '<div class="sc-setting"><label>Points per side</label><input class="sc-input" type="number" min="1" max="500" step="1" data-setting="fRes" value="' + esc(s.fRes) + '"></div>' +
    "</div>" +
    '<div class="sc-feature-buttons">' +
      '<button class="btn sm" type="button" data-action="add-custom"><i data-lucide="plus"></i> Custom Z(f)</button>' +
      '<button class="btn sm" type="button" data-action="import-sparam"><i data-lucide="file-up"></i> S-parameters</button>' +
      '<button class="btn sm" type="button" data-action="auto-calc"><i data-lucide="calculator"></i> Auto calculate</button>' +
      '<button class="btn sm" type="button" data-action="graph-settings"><i data-lucide="settings-2"></i> Graph settings</button>' +
    "</div>" +
    '<div class="sc-toggle-row">' +
      '<label><input type="checkbox" data-toggle="impedance"' + (state.overlays.impedance ? " checked" : "") + "> Z arcs</label>" +
      '<label><input type="checkbox" data-toggle="ideal"' + (state.overlays.ideal ? " checked" : "") + "> Ideal components</label>" +
      '<label><input type="checkbox" data-toggle="stability"' + (state.overlays.stability ? " checked" : "") + "> Stability</label>" +
      '<label><input type="checkbox" data-toggle="conjugate"' + (state.overlays.conjugate ? " checked" : "") + "> Conjugate S</label>" +
      '<label><input type="checkbox" data-toggle="s11"' + (state.overlays.s11 ? " checked" : "") + "> Show S11</label>" +
      '<label><input type="checkbox" data-toggle="s21"' + (state.overlays.s21 ? " checked" : "") + "> Show S21</label>" +
      '<label><input type="checkbox" data-toggle="s22"' + (state.overlays.s22 ? " checked" : "") + "> Show S22</label>" +
    "</div>" +
    '<div class="sc-marker-tables">' + markerListHtml() + "</div>";
    $("#settingsPanel").innerHTML = html;
    refreshIcons();
  }

  function cssVar(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function smithGeometry() { return { cx: 360, cy: 360, R: 286 }; }
  function zNormToGammaPoint(z, zo) {
    var g = smithGeometry();
    var nz = { real: Number(z.real) / zo, imaginary: Number(z.imaginary) / zo };
    var refl = zToRefl(nz, { real: 1, imaginary: 0 });
    return { x: g.cx + g.R * refl.real, y: g.cy - g.R * refl.imaginary, gamma: refl };
  }
  function gammaPoint(gamma) {
    var g = smithGeometry();
    return { x: g.cx + g.R * gamma.real, y: g.cy - g.R * gamma.imaginary };
  }
  function pathFromPoints(points) {
    if (!points.length) return "";
    return "M " + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2) + " " + points.slice(1).map(function (p) { return "L " + p.x.toFixed(2) + " " + p.y.toFixed(2); }).join(" ");
  }
  function circle(cx, cy, r, attrs) {
    return '<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + Math.max(0, r).toFixed(2) + '" ' + (attrs || "") + "/>";
  }
  function svgText(x, y, text, attrs) {
    return '<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" ' + (attrs || "") + ">" + esc(text) + "</text>";
  }

  function drawSmith() {
    var svg = $("#smithSvg");
    if (!svg) return;
    var g = smithGeometry();
    var colors = {
      grid: cssVar("--sc-grid", "rgba(229,231,147,.22)"),
      gridSoft: cssVar("--sc-grid-soft", "rgba(229,231,147,.09)"),
      chartBg: cssVar("--sc-chart-bg", "#111309"),
      text: cssVar("--text", "#eef0e0"),
      muted: cssVar("--muted", "#9fa191"),
      accent: cssVar("--accent", "#e5e793"),
      blue: cssVar("--sc-blue", "#60a5fa"),
      orange: cssVar("--sc-orange", "#f5a524"),
      green: cssVar("--sc-green", "#4ade80"),
      purple: cssVar("--sc-purple", "#c084fc"),
      red: cssVar("--sc-red", "#f87171"),
      cyan: cssVar("--sc-cyan", "#22d3ee")
    };
    var html = "";
    html += '<defs><clipPath id="scClip"><circle cx="' + g.cx + '" cy="' + g.cy + '" r="' + g.R + '"/></clipPath></defs>';
    html += '<rect x="0" y="0" width="720" height="720" fill="' + colors.chartBg + '"/>';
    html += circle(g.cx, g.cy, g.R, 'fill="none" stroke="' + colors.grid + '" stroke-width="1.6"');
    for (var ri = 0; ri < state.graph.resistance.length; ri++) {
      var r = Number(state.graph.resistance[ri]);
      if (!isFinite(r) || r < 0) continue;
      var rc = g.R * r / (1 + r);
      html += circle(g.cx + rc, g.cy, g.R / (1 + r), 'fill="none" stroke="' + colors.gridSoft + '" stroke-width="0.8"');
      if (r === 0 || r === 0.2 || r === 0.5 || r === 1 || r === 2 || r === 4 || r === 10) {
        var label = r === 0 ? "0" : (r * 50).toFixed(0);
        var lx = g.cx - g.R + 2 * g.R * r / (1 + r);
        html += svgText(lx, g.cy + 11, label, 'font-size="11px" fill="' + colors.accent + '" text-anchor="middle"');
      }
    }
    for (var xi = 0; xi < state.graph.reactance.length; xi++) {
      var x = Number(state.graph.reactance[xi]);
      if (!isFinite(x) || x === 0) continue;
      var xc = g.cx + g.R;
      var xcy = g.cy - g.R / x;
      html += circle(xc, xcy, g.R / Math.abs(x), 'fill="none" stroke="' + colors.gridSoft + '" stroke-width="0.8" clip-path="url(#scClip)"');
        if (Math.abs(x) === 0.2 || Math.abs(x) === 0.5 || Math.abs(x) === 1 || Math.abs(x) === 2 || Math.abs(x) === 4 || Math.abs(x) === 10) {
         var labelX = (Math.abs(x) * 50).toFixed(0);
         var labelPrefix = x > 0 ? 'j' : '-j';
         var nx = Math.abs(x);
         // Intersection point with outer circle using Smith chart formula
         var gx = (nx * nx - 1) / (nx * nx + 1);
         var gy = 2 * nx / (nx * nx + 1);
         // Use negative gy for capacitive (x < 0) to mirror below axis
         var lyBase = x > 0 ? g.cy - g.R * gy : g.cy + g.R * gy;
         var lx = g.cx + g.R * gx;
         var ly = lyBase;
         // Offset label outward from circle edge
         var offset = 10;
         var angle = Math.atan2(ly - g.cy, lx - g.cx);
         var lx2 = lx + offset * Math.cos(angle);
         var ly2 = ly + offset * Math.sin(angle);
         var textAnchor = gx > 0 ? 'start' : (gx < 0 ? 'end' : 'middle');
         html += svgText(lx2, ly2, labelPrefix + labelX, 'font-size="10px" fill="' + colors.accent + '" text-anchor="' + textAnchor + '" dominant-baseline="middle"');
       }
    }
    html += '<line x1="' + (g.cx - g.R) + '" y1="' + g.cy + '" x2="' + (g.cx + g.R) + '" y2="' + g.cy + '" stroke="' + colors.grid + '" stroke-width="0.9"/>';
    html += svgText(g.cx + g.R - 17, g.cy - 5, "OPEN", 'font-size="7" fill="' + colors.muted + '" text-anchor="end"');
    html += svgText(g.cx - g.R + 5, g.cy - 5, "SHORT", 'font-size="7" fill="' + colors.muted + '"');

    for (var vi = 0; vi < state.settings.vswrCircles.length; vi++) {
      var vswr = Number(state.settings.vswrCircles[vi]);
      if (!(vswr > 1)) continue;
      var vr = (vswr - 1) / (vswr + 1);
      html += circle(g.cx, g.cy, vr * g.R, 'fill="none" stroke="' + colors.cyan + '" stroke-width="1.2" stroke-dasharray="4,4" opacity=".85"');
      html += svgText(g.cx + vr * g.R * 0.72, g.cy - vr * g.R * 0.72, "VSWR " + vswr, 'font-size="8" fill="' + colors.cyan + '"');
    }
    for (var qi = 0; qi < state.settings.qCircles.length; qi++) {
      var q = Number(state.settings.qCircles[qi]);
      if (!isFinite(q) || q <= 0) continue;
      for (var qs = -1; qs <= 1; qs += 2) {
        var qpts = [];
        for (var qr = 100; qr >= 0.01; qr *= 0.92) {
          var qz = { real: qr, imaginary: qs * q * qr };
          var qp = zNormToGammaPoint(qz, 1);
          qpts.push(qp);
        }
        html += '<path d="' + pathFromPoints(qpts) + '" fill="none" stroke="' + colors.purple + '" stroke-width="1" stroke-dasharray="2,4" opacity=".8"/>';
      }
    }

    hoverSnaps = [];
    if (appData && appData.sparam && Object.keys(appData.sparam.data || {}).length) {
      var sp = appData.sparam;
      var spKeys = Object.keys(sp.data).sort(function (a, b) { return Number(a) - Number(b); });
      var spNames = ["S11", "S21", "S12", "S22"];
      for (var sni = 0; sni < spNames.length; sni++) {
        var sn = spNames[sni];
        if (!state.overlays[sn.toLowerCase()]) continue;
        var spts = [];
        var first = sp.data[spKeys[0]];
        if (!first || !first[sn]) continue;
        for (var ski = 0; ski < spKeys.length; ski++) {
          var raw = sp.data[spKeys[ski]][sn];
          if (!raw) continue;
          var rect = polarToRectangular(raw);
          if (state.overlays.conjugate) rect.imaginary = -rect.imaginary;
          var zsp = reflToZ(rect, sp.settings.zo || 50);
          var p = zNormToGammaPoint(zsp, num(state.settings.zo, 50));
          spts.push(p);
          addHoverSnap(p.x, p.y, zsp, sn + " @" + fmtFreq(Number(spKeys[ski]) / unitConverter[sp.settings.freq_unit]), Number(spKeys[ski]) / unitConverter[sp.settings.freq_unit], SP_COLORS[sn]);
        }
        if (spts.length) html += '<path d="' + pathFromPoints(spts) + '" fill="none" stroke="' + SP_COLORS[sn] + '" stroke-width="1.2" opacity=".9"/>';
      }
    }

    if (appData && appData.sparam && appData.sparam.type === "s2p" && state.overlays.stability) {
      var chosen = sparamAtFrequency(appData.sparam, appData.numericalFrequency);
      if (chosen && chosen.S11 && chosen.S22 && chosen.S12 && chosen.S21) {
        var stab = stabilityCircles(chosen, appData.sparam.settings.zo || 50);
        var stabP = zNormToGammaPoint(stab.center, num(state.settings.zo, 50));
        html += circle(stabP.x, stabP.y, stab.radius * g.R, 'fill="none" stroke="' + colors.red + '" stroke-width="1.1" stroke-dasharray="6,4" opacity=".9"');
      }
    }

    if (appData && appData.sparam && appData.sparam.type === "s2p") {
      var chosenNoise = sparamAtFrequency(appData.sparam, appData.numericalFrequency);
      if (chosenNoise && chosenNoise.S11 && chosenNoise.S22) {
        for (var ni = 0; ni < state.settings.nfCircles.length; ni++) {
          var noiseKeys = Object.keys(appData.sparam.noise || {});
          if (!noiseKeys.length) break;
          var noise = appData.sparam.noise[noiseKeys[Math.floor(noiseKeys.length / 2)]];
          if (!noise) continue;
          var nc = sparamNoiseCircles(noise.fmin, Number(state.settings.nfCircles[ni]), noise.rn / num(state.settings.zo, 50), noise.gamma);
          var ncp = zNormToGammaPoint(nc[0], num(state.settings.zo, 50));
          html += circle(ncp.x, ncp.y, nc[1] * g.R, 'fill="none" stroke="' + colors.cyan + '" stroke-width="1" stroke-dasharray="4,6" opacity=".75"');
        }
        for (var gi = 0; gi < state.settings.gainInCircles.length; gi++) {
          var gain = sparamGainCircles(chosenNoise.S11, appData.sparam.settings.zo || 50, Number(state.settings.gainInCircles[gi]));
          var gp = zNormToGammaPoint(gain.center, num(state.settings.zo, 50));
          html += circle(gp.x, gp.y, gain.radius * g.R, 'fill="none" stroke="' + colors.green + '" stroke-width="1" stroke-dasharray="10,4" opacity=".7"');
        }
        for (var go = 0; go < state.settings.gainOutCircles.length; go++) {
          var gainO = sparamGainCircles(chosenNoise.S22, appData.sparam.settings.zo || 50, Number(state.settings.gainOutCircles[go]));
          var gop = zNormToGammaPoint(gainO.center, num(state.settings.zo, 50));
          html += circle(gop.x, gop.y, gainO.radius * g.R, 'fill="none" stroke="' + colors.orange + '" stroke-width="1" stroke-dasharray="10,4" opacity=".7"');
        }
      }
    }

    if (appData && state.overlays.impedance && appData.multiZResults) {
      var cumulated = 0;
      for (var b = 0; b < appData.multiZResults.length; b++) {
        var block = appData.multiZResults[b];
        var arcs = block.arcs || [];
        for (var tol = 0; tol < arcs.length; tol++) {
          var isNominal = tol === arcs.length - 1;
          for (var dp = 0; dp < arcs[tol].length; dp++) {
            var pts = [];
            for (var pti = 0; pti < arcs[tol][dp].length; pti++) pts.push(zNormToGammaPoint(arcs[tol][dp][pti], num(state.settings.zo, 50)));
            if (!pts.length) continue;
            if (!isNominal) {
              if (dp === arcs[tol].length - 1) html += '<path d="' + pathFromPoints(pts) + '" fill="none" stroke="' + colors.red + '" stroke-width="0.8" opacity=".28"/>';
            } else {
              var color = ARC_COLORS[(dp + cumulated) % ARC_COLORS.length];
              if (pts.length > 1) html += '<path d="' + pathFromPoints(pts) + '" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>';
              var end = pts[pts.length - 1];
              html += circle(end.x, end.y, dp === 0 ? 4.6 : 5.5, 'fill="' + color + '" stroke="' + colors.chartBg + '" stroke-width="1.4"');
              addHoverSnap(end.x, end.y, componentImpedanceAt(dp), "Block " + (dp + 1), null, color);
              if (dp > 0 && dp < 9) html += svgText(end.x + 8, end.y - 6, String(dp), 'font-size="8" fill="' + colors.muted + '"');
            }
          }
        }
        var span = block.ZvsF || [];
        if (span.length) {
          var nominalMap = span[span.length - 1] || {};
          var fkeys = Object.keys(nominalMap).sort(function (a, b) { return Number(a) - Number(b); });
          var spanPts = [];
          for (var fk = 0; fk < fkeys.length; fk++) {
            var zf = nominalMap[fkeys[fk]].z;
            var pp = zNormToGammaPoint(zf, num(state.settings.zo, 50));
            spanPts.push(pp);
            addHoverSnap(pp.x, pp.y, zf, "Sweep", Number(fkeys[fk]), colors.purple);
          }
          if (spanPts.length > 1) html += '<path d="' + pathFromPoints(spanPts) + '" fill="none" stroke="' + colors.purple + '" stroke-width="1.1" opacity=".8"/>';
          for (var ti = 0; ti < span.length - 1; ti++) {
            var tolMap = span[ti] || {};
            var tkeys = Object.keys(tolMap).sort(function (a, b) { return Number(a) - Number(b); });
            var tpts = [];
            for (var tk = 0; tk < tkeys.length; tk++) tpts.push(zNormToGammaPoint(tolMap[tkeys[tk]].z, num(state.settings.zo, 50)));
            if (tpts.length > 1) html += '<path d="' + pathFromPoints(tpts) + '" fill="none" stroke="' + colors.red + '" stroke-width="0.7" opacity=".28"/>';
          }
        }
        cumulated += arcs.length ? arcs[0].length : 0;
      }
      var firstZ = componentImpedanceAt(0);
      var lastZ = componentImpedanceAt(state.circuit.length - 1);
      if (firstZ) {
        var fp = zNormToGammaPoint(firstZ, num(state.settings.zo, 50));
        html += circle(fp.x, fp.y, 7.5, 'fill="none" stroke="' + colors.orange + '" stroke-width="2"');
      }
      if (lastZ) {
        var lp = zNormToGammaPoint(lastZ, num(state.settings.zo, 50));
        html += circle(lp.x, lp.y, 8, 'fill="none" stroke="' + colors.blue + '" stroke-width="2.2"');
        addHoverSnap(lp.x, lp.y, lastZ, "Input", appData.numericalFrequency, colors.blue);
      }
    }
    for (var mi = 0; mi < state.settings.zMarkers.length; mi++) {
      var zm = state.settings.zMarkers[mi];
      var zp = zNormToGammaPoint({ real: Number(zm[0]), imaginary: Number(zm[1]) }, num(state.settings.zo, 50));
      html += circle(zp.x, zp.y, 5, 'fill="none" stroke="' + colors.red + '" stroke-width="1.8"');
      html += svgText(zp.x + 8, zp.y + 3, "MK" + (mi + 1), 'font-size="8" fill="' + colors.red + '"');
      addHoverSnap(zp.x, zp.y, { real: Number(zm[0]), imaginary: Number(zm[1]) }, "Marker " + (mi + 1), null, colors.red);
    }
    svg.innerHTML = html;
    // Re-append hover overlay after redraw
    if (hoverOverlay && hoverOverlay.parentNode !== svg) {
      svg.appendChild(hoverOverlay);
    }
  }

  function addHoverSnap(x, y, z, label, frequency, color) {
    if (!z || !isFinite(x) || !isFinite(y)) return;
    hoverSnaps.push({ x: x, y: y, z: z, label: label, frequency: frequency, color: color });
  }

  function bindChartHover() {
    var svg = $("#smithSvg");
    var tip = $("#smithTip");
    if (!svg || !tip) return;

    var g = smithGeometry();
    var colors = {
      cyan: cssVar("--sc-cyan", "#22d3ee"),
      orange: cssVar("--sc-orange", "#f5a524"),
      accent: cssVar("--accent", "#e5e793"),
      chartBg: cssVar("--sc-chart-bg", "#111309")
    };

    // Create overlay for crosshair circles
    hoverOverlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
    hoverOverlay.setAttribute("id", "hoverOverlay");
    hoverOverlay.style.pointerEvents = "none";
    svg.appendChild(hoverOverlay);

    svg.addEventListener("mousemove", function (event) {
      var point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      var ctm = svg.getScreenCTM();
      if (!ctm) return;
      var p = point.matrixTransform(ctm.inverse());

      // Check if point is within chart
      var g = smithGeometry();
      var dx = p.x - g.cx;
      var dy = p.y - g.cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > g.R) {
        hoverOverlay.innerHTML = "";
        hoverZ = null;
        tip.classList.add("hidden");
        return;
      }

      // Convert point to reflection coefficient
      var gamma = { real: dx / g.R, imaginary: -dy / g.R };

      // Convert to normalized impedance
      var zNorm = reflToZ(gamma, 1);
      var r = zNorm.real;
      var x = zNorm.imaginary;

      if (r < 0 || !isFinite(r) || !isFinite(x)) {
        hoverOverlay.innerHTML = "";
        hoverZ = null;
        tip.classList.add("hidden");
        return;
      }

      hoverZ = { real: r, imaginary: x };

      // Use actual impedance for labels (normalized * Z0)
      var zo = appData ? appData.settings.zo : 50;
      var rActual = r * zo;
      var xActual = x * zo;

      // Draw constant-resistance circle
      var rCircleCx = g.cx + g.R * r / (1 + r);
      var rCircleCy = g.cy;
      var rCircleR = g.R / (1 + r);
      var rCircleHtml = circle(rCircleCx, rCircleCy, rCircleR,
        'fill="none" stroke="' + colors.cyan + '" stroke-width="1.5" stroke-dasharray="6,3" opacity=".85"');

      // Draw constant-reactance arc (full circle clipped)
      var xCircleCx = g.cx + g.R;
      var xCircleCy = g.cy - g.R / x;
      var xCircleR = g.R / Math.abs(x);
      var xArcHtml = circle(xCircleCx, xCircleCy, xCircleR,
        'fill="none" stroke="' + colors.orange + '" stroke-width="1.5" stroke-dasharray="6,3" opacity=".85" clip-path="url(#scClip)"');

      // Draw intersection point marker
      var markerHtml = circle(p.x, p.y, 6,
        'fill="rgba(229,231,147,.9)" stroke="#111309" stroke-width="2"');

      // Draw coordinate labels
      var rLabel = rActual.toFixed(2);
      var xLabel = xActual >= 0 ? '+' + xActual.toFixed(2) : xActual.toFixed(2);
      var labelHtml = '<text x="' + (p.x + 12) + '" y="' + (p.y - 12) + '" font-size="11px" fill="#E5E793" text-anchor="start" dominant-baseline="auto">' +
        'R=' + rLabel + 'Ω' +
        '</text>' +
        '<text x="' + (p.x + 12) + '" y="' + (p.y - 0) + '" font-size="11px" fill="#F5A524" text-anchor="start" dominant-baseline="middle">' +
        'X=' + (x >= 0 ? '+' : '') + xLabel + 'Ω' +
        '</text>';

      hoverOverlay.innerHTML = rCircleHtml + xArcHtml + markerHtml + labelHtml;

      // Update tooltip
      var best = null;
      var bestDist = 12;
      for (var i = 0; i < hoverSnaps.length; i++) {
        var s = hoverSnaps[i];
        var d = Math.sqrt(Math.pow(s.x - p.x, 2) + Math.pow(s.y - p.y, 2));
        if (d < bestDist) { bestDist = d; best = s; }
      }
      if (best) {
        tip.classList.remove("hidden");
        tip.innerHTML = '<b>' + esc(best.label) + "</b><br>" + fmtZ(best.z) + (best.frequency != null ? "<br><span>" + fmtFreq(best.frequency) + "</span>" : "");
      } else {
        tip.classList.add("hidden");
      }
    });
    svg.addEventListener("mouseleave", function () {
      hoverOverlay.innerHTML = "";
      hoverZ = null;
      tip.classList.add("hidden");
    });
  }

  function renderPlots() {
    var root = $("#plots");
    if (!root || !appData) return;
    for (var i = 0; i < plotInstances.length; i++) {
      try { plotInstances[i].destroy(); } catch (e) {}
    }
    plotInstances = [];
    var nominal = nominalSpan();
    var freqs = Object.keys(nominal).sort(function (a, b) { return Number(a) - Number(b); });
    var unit = appData.settings.frequencyUnit;
    var x = freqs.map(function (f) { return Number(f) / unitConverter[unit]; });
    var zm = [];
    var za = [];
    var s11db = [];
    var s11ang = [];
    var s21db = [];
    for (var i2 = 0; i2 < freqs.length; i2++) {
      var z = nominal[freqs[i2]].z;
      var polar = rectangularToPolar(z);
      zm.push(polar.magnitude);
      za.push(polar.angle);
      var gg = gammaFromZ(z, appData.settings.zo);
      var gm = Math.sqrt(gg.real * gg.real + gg.imaginary * gg.imaginary);
      s11db.push(20 * Math.log10(gm));
      s11ang.push(rectangularToPolar(gg).angle);
      s21db.push(20 * Math.log10(Math.sqrt(Math.max(0, 1 - gm * gm))));
    }
    var cards = [
      { id: "z", title: "Impedance |Z| and phase", data: [x, zm, za], series: [
        { label: "|Z| (\u03a9)", stroke: cssVar("--sc-blue", "#60a5fa"), width: 2, scale: "y" },
        { label: "\u2220Z (\u00b0)", stroke: cssVar("--sc-orange", "#f5a524"), width: 1.5, scale: "y2" }
      ], axes: [{ label: "Frequency (" + unit + ")" }, { label: "|Z| (\u03a9)" }, { label: "\u2220Z (\u00b0)", side: 1 }] },
      { id: "s11", title: "Input reflection S11", data: [x, s11db, s11ang], series: [
        { label: "|S11| (dB)", stroke: cssVar("--sc-blue", "#60a5fa"), width: 2, scale: "y" },
        { label: "\u2220S11 (\u00b0)", stroke: cssVar("--sc-red", "#f87171"), width: 1.5, scale: "y2" }
      ], axes: [{ label: "Frequency (" + unit + ")" }, { label: "|S11| (dB)" }, { label: "\u2220S11 (\u00b0)", side: 1 }] },
      { id: "s21", title: "Transmission S21 (lossless estimate)", data: [x, s21db], series: [
        { label: "|S21| (dB)", stroke: cssVar("--sc-green", "#4ade80"), width: 2, scale: "y" }
      ], axes: [{ label: "Frequency (" + unit + ")" }, { label: "|S21| (dB)" }] }
    ];
    if (appData.sparam && Object.keys(appData.sparam.data || {}).length) {
      var sp = appData.sparam;
      var spf = Object.keys(sp.data).sort(function (a, b) { return Number(a) - Number(b); });
      var rawX = spf.map(function (f) { return Number(f) / unitConverter[unit]; });
      var rawSeries = [];
      var rawData = [rawX];
      var names = ["S11", "S21", "S12", "S22"];
      for (var si = 0; si < names.length; si++) {
        var name = names[si];
        if (!state.overlays[name.toLowerCase()]) continue;
        var vals = [];
        for (var fi = 0; fi < spf.length; fi++) {
          var sd = sp.data[spf[fi]][name];
          if (!sd) { vals.push(null); continue; }
          vals.push(20 * Math.log10(sd.magnitude));
        }
        rawSeries.push({ label: name + " (dB)", stroke: SP_COLORS[name], width: 1.8, scale: "y" });
        rawData.push(vals);
      }
      if (rawSeries.length) cards.push({ id: "raw", title: "Measured S-parameters", data: rawData, series: rawSeries, axes: [{ label: "Frequency (" + unit + ")" }, { label: "Magnitude (dB)" }] });
      if (appData.RefIn && appData.RefIn.length) {
        var rkeys = Object.keys(appData.RefIn[0]).sort(function (a, b) { return Number(a) - Number(b); });
        var rdb = [];
        var rang = [];
        for (var rk = 0; rk < rkeys.length; rk++) {
          rdb.push(20 * Math.log10(appData.RefIn[0][rkeys[rk]].magnitude));
          rang.push(appData.RefIn[0][rkeys[rk]].angle);
        }
        cards.push({ id: "refin", title: "S11 at reference plane", data: [rkeys.map(function (f) { return Number(f) / unitConverter[unit]; }), rdb, rang], series: [
          { label: "|S11| (dB)", stroke: cssVar("--sc-blue", "#60a5fa"), width: 2, scale: "y" },
          { label: "\u2220S11 (\u00b0)", stroke: cssVar("--sc-red", "#f87171"), width: 1.5, scale: "y2" }
        ], axes: [{ label: "Frequency (" + unit + ")" }, { label: "|S11| (dB)" }, { label: "\u2220S11 (\u00b0)", side: 1 }] });
      }
      if (appData.gainArray && appData.gainArray.length) {
        var gain = appData.gainArray[appData.gainArray.length - 1];
        var gkeys = Object.keys(gain).sort(function (a, b) { return Number(a) - Number(b); });
        cards.push({ id: "gain", title: "Transducer gain", data: [gkeys.map(function (f) { return Number(f) / unitConverter[unit]; }), gkeys.map(function (f) { return 10 * Math.log10(gain[f]); })], series: [
          { label: "Gain (dB)", stroke: cssVar("--sc-green", "#4ade80"), width: 2, scale: "y" }
        ], axes: [{ label: "Frequency (" + unit + ")" }, { label: "Gain (dB)" }] });
      }
      if (appData.noiseArray && appData.noiseArray.length) {
        var noise = appData.noiseArray[appData.noiseArray.length - 1];
        var nkeys = Object.keys(noise).sort(function (a, b) { return Number(a) - Number(b); });
        cards.push({ id: "noise", title: "Noise figure", data: [nkeys.map(function (f) { return Number(f) / unitConverter[unit]; }), nkeys.map(function (f) { return 10 * Math.log10(noise[f]); })], series: [
          { label: "NF (dB)", stroke: cssVar("--sc-cyan", "#22d3ee"), width: 2, scale: "y" }
        ], axes: [{ label: "Frequency (" + unit + ")" }, { label: "NF (dB)" }] });
      }
    }
    var hasSweep = x.length > 1;
    var html = "";
    for (var ci = 0; ci < cards.length; ci++) {
      html += '<div class="sc-plot" data-plot="' + cards[ci].id + '"><h3>' + esc(cards[ci].title) + '</h3><div class="sc-uplot" id="plot-' + cards[ci].id + '"></div></div>';
    }
    root.innerHTML = html;
    $("#plotRange").textContent = "f\u2080 " + fmtFreq(appData.settings.frequency) + " \u00b7 span \u00b1" + state.settings.fSpan + " " + state.settings.fSpanUnit + " \u00b7 " + freqs.length + " points";
    if (!hasSweep) {
      for (var e = 0; e < cards.length; e++) {
        var box = $("#plot-" + cards[e].id);
        if (box) box.innerHTML = '<div class="sc-plot-empty">Set a non-zero frequency span to see the frequency response.</div>';
      }
      return;
    }
    if (!window.uPlot) {
      for (var u = 0; u < cards.length; u++) {
        var ub = $("#plot-" + cards[u].id);
        if (ub) ub.innerHTML = '<div class="sc-plot-empty">uPlot could not be loaded from the CDN.</div>';
      }
      return;
    }
    for (var pi = 0; pi < cards.length; pi++) {
      try { plotInstances.push(createUplot(cards[pi])); } catch (err) { console.error(err); }
    }
  }

  function createUplot(card) {
    var box = $("#plot-" + card.id);
    if (!box) return null;
    var width = Math.max(200, box.clientWidth || 300);
    var grid = cssVar("--sc-grid-soft", "rgba(229,231,147,.1)");
    var muted = cssVar("--muted", "#9fa191");
    var text = cssVar("--text", "#eef0e0");
    var opts = {
      width: width,
      height: 158,
      padding: [8, 9, 2, 2],
      cursor: { drag: { x: true, y: false } },
      legend: { show: card.series.length > 1, live: true },
      scales: { x: { time: false }, y: { auto: true }, y2: { auto: true } },
      axes: [
        { stroke: muted, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, font: "10px Segoe UI", labelFont: "10px Segoe UI", labelSize: 16, label: card.axes[0].label },
        { stroke: muted, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, font: "10px Segoe UI", labelFont: "10px Segoe UI", labelSize: 16, label: card.axes[1].label, scale: "y" }
      ],
      series: [{ label: "Frequency" }].concat(card.series.map(function (s) { return Object.assign({}, s, { points: { show: false } }); }))
    };
    if (card.axes[2]) opts.axes.push({ stroke: muted, grid: { show: false }, ticks: { stroke: grid }, font: "10px Segoe UI", labelFont: "10px Segoe UI", labelSize: 16, label: card.axes[2].label, scale: "y2", side: 1 });
    return new window.uPlot(opts, card.data, box);
  }

  function renderDocs() {
    var tutorials = [
      { h: "Shunt capacitor", p: "A shunt capacitor adds positive susceptance. On the Smith chart the impedance moves along a constant-conductance arc toward the lower half of the chart. Use it to rotate a load toward the generator without changing the real part of admittance." },
      { h: "Series inductor", p: "A series inductor adds positive reactance. The load impedance moves clockwise along a constant-resistance circle. Series elements are useful when the load resistance is below the system impedance." },
      { h: "Matching example", p: "The example chain on this page is a 50 ohm black box, a 0.85 nH series inductor, and a 1.3 pF shunt capacitor at 2.44 GHz. It is a convenient starting point for a narrowband match." },
      { h: "Tolerance analysis", p: "Enter a component tolerance percentage and the chart will show the nominal arc plus the upper and lower tolerance arcs. The frequency plots also draw the tolerance envelopes." },
      { h: "S-parameter data", p: "A Touchstone .s1p file replaces the load with measured input impedance. A .s2p file adds a two-port block and a termination; use it for gain, stability, noise, and gain-circle overlays." },
      { h: "Reading the chart", p: "The centre is the reference impedance. The left edge is a short, the right edge is an open, the upper half is inductive, and the lower half is capacitive. VSWR circles are centred on the chart centre." }
    ];
    var th = "";
    for (var i = 0; i < tutorials.length; i++) th += "<h3>" + esc(tutorials[i].h) + "</h3><p>" + esc(tutorials[i].p) + "</p>";
    $("#tutorialsBody").innerHTML = th + '<p>Attribution: tutorial structure and behaviour are modelled on onlinesmithchart.com by Will Kelsey (CC BY 4.0).</p>';

    var equations = [
      ["Reflection coefficient", "\u0393 = (Z - Z\u2080) / (Z + Z\u2080)"],
      ["Impedance from reflection", "Z = Z\u2080 (1 + \u0393) / (1 - \u0393)"],
      ["VSWR", "VSWR = (1 + |\u0393|) / (1 - |\u0393|)"],
      ["Return loss", "RL = -20 log\u2081\u2080 |\u0393|"],
      ["Series capacitor", "X_C = -1 / (2\u03c0fC)"],
      ["Series inductor", "X_L = 2\u03c0fL"],
      ["Transmission line", "Z_in = Z\u2080 (Z_L + jZ\u2080 tan \u03b2l) / (Z\u2080 + jZ_L tan \u03b2l)"],
      ["Propagation constant", "\u03b2 = 2\u03c0f / c, with length scaled by \u221a\u03b5eff"],
      ["Parallel RLC input impedance", "Z = 1 / (1/R + 1/(j\u03c9L) + j\u03c9C)"],
      ["3 dB bandwidth", "BW = f_high - f_low at S21 = S21(max) - 3 dB"],
      ["Noise circle", "N_i = (F - F_min)|1 + \u0393_opt|\u00b2 / (4R_n)"],
      ["Operating gain circle", "G_S = (1 - |\u0393_S|\u00b2) / |1 - S11\u0393_S|\u00b2"]
    ];
    var eh = "";
    for (var j = 0; j < equations.length; j++) eh += '<div class="sc-eq-label">' + esc(equations[j][0]) + '</div><div class="eq">' + esc(equations[j][1]) + "</div>";
    $("#equationsBody").innerHTML = eh;

    var releases = [
      ["Current", ["Full Smith chart rendering with constant-resistance and constant-reactance circles.", "Cascaded component editor with URL-compatible circuit encoding.", "Frequency sweep plots with tolerance envelopes, S11/S21, gain, and noise.", "Touchstone .s1p and .s2p parsing, VSWR/Q/noise/gain circles, and custom Z(f) tables.", "RF Tools light and dark themes, responsive side-by-side or stacked layout."]],
      ["Compatibility", ["Circuit URLs from onlinesmithchart.com are accepted.", "Component names and parameter order match the upstream URL format.", "S-parameter URLs longer than 1000 characters are treated as too long, matching the reference limit."]],
      ["Attribution", ["Original tool and interaction design: Will Kelsey, onlinesmithchart.com.", "Source licence: Creative Commons Attribution 4.0 International.", "RF Tools implementation: frontend-only HTML, CSS, and JavaScript."]]
    ];
    var rh = "";
    for (var r = 0; r < releases.length; r++) {
      rh += "<h3>" + esc(releases[r][0]) + "</h3><ul>";
      for (var k = 0; k < releases[r][1].length; k++) rh += "<li>" + esc(releases[r][1][k]) + "</li>";
      rh += "</ul>";
    }
    $("#releaseBody").innerHTML = rh;
  }

  function openModal(content) {
    var backdrop = $("#modalBackdrop");
    var box = $("#modalBox");
    box.innerHTML = content;
    backdrop.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    refreshIcons();
  }
  function closeModal() {
    $("#modalBackdrop").classList.add("hidden");
    $("#modalBox").innerHTML = "";
    document.body.style.overflow = "";
  }
  function modalHeader(title, subtitle) {
    return '<button class="sc-modal-close" type="button" data-modal-close aria-label="Close"><i data-lucide="x"></i></button>' +
      "<h3>" + esc(title) + "</h3>" + (subtitle ? '<p class="sc-modal-sub">' + esc(subtitle) + "</p>" : "");
  }

  function openGraphSettings() {
    var resistance = state.graph.resistance.join(", ");
    var reactance = state.graph.reactance.join(", ");
    var html = modalHeader("Graph settings", "Control grid circles and chart overlays.") +
      '<div class="sc-settings-grid">' +
        '<div class="sc-setting"><label>Resistance circles</label><input class="sc-input" id="graphResistance" value="' + esc(resistance) + '"></div>' +
        '<div class="sc-setting"><label>Reactance circles</label><input class="sc-input" id="graphReactance" value="' + esc(reactance) + '"></div>' +
      "</div>" +
      '<div class="sc-check-grid">' +
        '<label><input type="checkbox" data-graph-check="impedance"' + (state.overlays.impedance ? " checked" : "") + "> Show Z arcs</label>" +
        '<label><input type="checkbox" data-graph-check="ideal"' + (state.overlays.ideal ? " checked" : "") + "> Ideal component markers</label>" +
        '<label><input type="checkbox" data-graph-check="s11"' + (state.overlays.s11 ? " checked" : "") + "> S11</label>" +
        '<label><input type="checkbox" data-graph-check="s21"' + (state.overlays.s21 ? " checked" : "") + "> S21</label>" +
        '<label><input type="checkbox" data-graph-check="s12"' + (state.overlays.s12 ? " checked" : "") + "> S12</label>" +
        '<label><input type="checkbox" data-graph-check="s22"' + (state.overlays.s22 ? " checked" : "") + "> S22</label>" +
        '<label><input type="checkbox" data-graph-check="stability"' + (state.overlays.stability ? " checked" : "") + "> Stability circles</label>" +
        '<label><input type="checkbox" data-graph-check="conjugate"' + (state.overlays.conjugate ? " checked" : "") + "> Conjugate S-parameters</label>" +
      "</div>" +
      '<p class="sc-modal-note">Values may be comma or space separated. Zero is allowed for resistance; the short and open points remain visible.</p>' +
      '<div class="sc-modal-actions"><button class="btn" type="button" data-modal-close>Cancel</button><button class="btn primary" type="button" id="graphSave">Save settings</button></div>';
    openModal(html);
    $("#graphSave").addEventListener("click", function () {
      var rr = $("#graphResistance").value.split(/[,\s]+/).map(Number).filter(function (v) { return isFinite(v) && v >= 0; });
      var xx = $("#graphReactance").value.split(/[,\s]+/).map(Number).filter(function (v) { return isFinite(v); });
      if (rr.length) state.graph.resistance = rr;
      if (xx.length) state.graph.reactance = xx;
      $$("[data-graph-check]").forEach(function (input) { state.overlays[input.getAttribute("data-graph-check")] = input.checked; });
      closeModal();
      refresh();
    });
  }

  function customTableText(value) {
    var keys = Object.keys(value || {}).map(Number).sort(function (a, b) { return a - b; });
    return keys.map(function (k) { return k + ", " + value[k].real + ", " + value[k].imaginary; }).join("\n");
  }
  function parseCustomTable(text) {
    var lines = text.split(/\r?\n/);
    var out = {};
    var last = -Infinity;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (/[^0-9,eE\s\-+.]/.test(line)) return { error: "Only numbers, commas, and signs are allowed." };
      var parts = line.split(/[,\s]+/).filter(function (x) { return x !== ""; });
      if (parts.length !== 3) return { error: "Each line needs frequency, real, and imaginary values." };
      var f = Number(parts[0]);
      var re = Number(parts[1]);
      var im = Number(parts[2]);
      if (![f, re, im].every(isFinite)) return { error: "A value on line " + (i + 1) + " is not a number." };
      if (f <= last) return { error: "Frequencies must increase on every line." };
      last = f;
      out[f] = { real: re, imaginary: im };
    }
    if (!Object.keys(out).length) return { error: "Add at least one frequency point." };
    return { value: out };
  }
  function openCustomModal(index) {
    var c = state.circuit[index];
    if (!c || c.name !== "custom") return;
    var html = modalHeader("Custom impedance Z(f)", "One point per line: frequency in Hz, resistance, reactance.") +
      '<textarea class="sc-input sc-textarea" id="customText" rows="8" spellcheck="false">' + esc(customTableText(c.value)) + "</textarea>" +
      '<div class="sc-settings-grid" style="margin-top:10px"><div class="sc-setting"><label>Interpolation</label><select class="sc-select" id="customInterp">' +
        '<option value="linear"' + (c.interpolation === "linear" ? " selected" : "") + ">Linear</option>" +
        '<option value="sah"' + (c.interpolation === "sah" ? " selected" : "") + ">Sample and hold</option>" +
      "</select></div></div>" +
      '<p class="sc-modal-note" id="customStatus">' + Object.keys(c.value || {}).length + " points loaded.</p>" +
      '<div class="sc-modal-actions"><button class="btn" type="button" data-modal-close>Cancel</button><button class="btn primary" type="button" id="customSave">Save</button></div>';
    openModal(html);
    $("#customSave").addEventListener("click", function () {
      var parsed = parseCustomTable($("#customText").value);
      if (parsed.error) { $("#customStatus").textContent = parsed.error; return; }
      c.value = parsed.value;
      c.interpolation = $("#customInterp").value;
      closeModal();
      refresh();
    });
  }

  var s2pExample = "# GHz S MA R 50\n0.8 0.44 -157.6 4.725 84.3 0 0 0.339 -51.8\n1.4 0.533 176.6 2.800 64.5 0 0 0.604 -58.3\n2.0 0.439 159.6 2.057 49.2 0 0 0.294 -68.1\n! Noise parameters\n1.4 1.6 0.5 130 0.4";
  var s1pExample = "# MHz S RI R 50\n200.217864 0.468046844 -0.716237902\n205.133607 0.356939613 -0.815402686\n210.049352 0.227947369 -0.881349921\n215.272330 0.08556845 -0.901367306\n220.188074 -0.040296394 -0.882605373\n225.103818 -0.154826939 -0.826501727\n230.019564 -0.233549714 -0.72003293";

  function openSparamModal(index) {
    var c = state.circuit[index];
    if (!c) return;
    var raw = c.raw || "";
    var html = modalHeader("S-parameter file", "Paste Touchstone data, or choose a .s1p / .s2p file.") +
      '<div class="sc-sparam-tools"><button class="btn sm" type="button" id="loadS2p">Load s2p example</button><button class="btn sm" type="button" id="loadS1p">Load s1p example</button><label class="sc-file-drop">Choose file<input type="file" id="sparamFile" accept=".s1p,.s2p,.txt,text/plain"></label></div>' +
      '<textarea class="sc-input sc-textarea" id="sparamText" rows="10" spellcheck="false" placeholder="# GHz S MA R 50&#10;2.44 0.1 -45 0.95 10 0.02 5 0.12 -30">' + esc(raw) + "</textarea>" +
      '<p class="sc-modal-note" id="sparamStatus"></p>' +
      '<div class="sc-modal-actions"><button class="btn" type="button" data-modal-close>Cancel</button>' + (raw ? '<button class="btn" type="button" id="sparamRemove">Remove block</button>' : "") + '<button class="btn primary" type="button" id="sparamSave">Apply</button></div>';
    openModal(html);
    function status() {
      var text = $("#sparamText").value.trim();
      if (!text) { $("#sparamStatus").textContent = "Add a Touchstone header and at least one data line."; return null; }
      var parsed = parseTouchstoneFile(text);
      if (parsed.error) $("#sparamStatus").textContent = parsed.error;
      else $("#sparamStatus").textContent = parsed.type.toUpperCase() + " \u00b7 " + Object.keys(parsed.data).length + " points \u00b7 " + parsed.settings.freq_unit + " \u00b7 " + parsed.settings.format;
      return parsed;
    }
    status();
    $("#sparamText").addEventListener("input", status);
    $("#loadS2p").addEventListener("click", function () { $("#sparamText").value = s2pExample; status(); });
    $("#loadS1p").addEventListener("click", function () { $("#sparamText").value = s1pExample; status(); });
    $("#sparamFile").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { $("#sparamText").value = String(reader.result || ""); status(); };
      reader.readAsText(file);
    });
    $("#sparamSave").addEventListener("click", function () {
      var parsed = status();
      if (!parsed || parsed.error) return;
      applySparam(index, parsed, $("#sparamText").value);
    });
    var remove = $("#sparamRemove");
    if (remove) remove.addEventListener("click", function () { removeSparam(index); });
  }

  function applySparam(index, parsed, raw) {
    var current = state.circuit[index];
    if (!current) return;
    if (parsed.type === "s1p") {
      var blackBox = null;
      var loadTerm = null;
      for (var i = 0; i < state.circuit.length; i++) {
        if (state.circuit[i].name === "blackBox") blackBox = state.circuit[i];
        if (state.circuit[i].name === "loadTerm") loadTerm = state.circuit[i];
      }
      var middle = state.circuit.filter(function (c) { return c.name !== "blackBox" && c.name !== "loadTerm" && c.name !== "sparam"; });
      if (index > 0) middle = middle.reverse();
      var load = loadTerm ? deepClone(loadTerm) : Object.assign({}, circuitComponents.loadTerm.default, {
        name: "loadTerm",
        real: blackBox ? blackBox.real : 50,
        imaginary: blackBox ? blackBox.imaginary : 0,
        tolerance: blackBox && blackBox.tolerance ? blackBox.tolerance : 0
      });
      state.circuit = [Object.assign({}, parsed, { name: "sparam", raw: raw })].concat(middle, [load]);
    } else {
      state.circuit[index] = Object.assign({}, parsed, { name: "sparam", raw: raw });
      if (parsed.type === "s2p" && state.circuit[state.circuit.length - 1].name !== "loadTerm") state.circuit.push(Object.assign({}, circuitComponents.loadTerm.default, { name: "loadTerm" }));
      if (parsed.type === "s2p" && index < state.circuit.length - 1 && state.circuit[state.circuit.length - 1].name !== "loadTerm") state.circuit.push(Object.assign({}, circuitComponents.loadTerm.default, { name: "loadTerm" }));
    }
    var keys = Object.keys(parsed.data).map(Number).sort(function (a, b) { return a - b; });
    if (keys.length) {
      var mid = keys[Math.floor(keys.length / 2)];
      var fMin = keys[0];
      var fMax = keys[keys.length - 1];
      state.settings.frequencyUnit = parsed.settings.freq_unit;
      state.settings.fSpanUnit = parsed.settings.freq_unit;
      state.settings.frequency = mid / unitConverter[parsed.settings.freq_unit];
      state.settings.fSpan = 2 * Math.max(mid - fMin, fMax - mid) / unitConverter[parsed.settings.freq_unit];
    }
    closeModal();
    setCircuitAlert("");
    refresh();
    showToast("S-parameter data applied.");
  }

  function removeSparam(index) {
    var removed = state.circuit[index];
    if (!removed) return;
    if (removed.type === "s1p") {
      var loadTerm = null;
      var blackBox = null;
      for (var i = 0; i < state.circuit.length; i++) {
        if (state.circuit[i].name === "loadTerm") loadTerm = state.circuit[i];
        if (state.circuit[i].name === "blackBox") blackBox = state.circuit[i];
      }
      var middle = state.circuit.filter(function (c) { return c.name !== "sparam" && c.name !== "loadTerm" && c.type !== "s1p"; }).reverse();
      state.circuit = [Object.assign({}, circuitComponents.blackBox.default, {
        name: "blackBox",
        real: loadTerm ? loadTerm.real : (blackBox ? blackBox.real : 50),
        imaginary: loadTerm ? loadTerm.imaginary : 0,
        tolerance: loadTerm && loadTerm.tolerance ? loadTerm.tolerance : 0
      })].concat(middle);
    } else {
      state.circuit.splice(index, 1);
      if (state.circuit.length && state.circuit[state.circuit.length - 1].name === "loadTerm") state.circuit.pop();
    }
    closeModal();
    refresh();
  }

  function openAutoCalcModal() {
    var html = modalHeader("Auto calculate impedance", "Enter a series RLC load at the current frequency.") +
      '<div class="sc-settings-grid">' +
        '<div class="sc-setting"><label>Resistance R</label><input class="sc-input" id="autoR" type="number" step="any" value="50"><span class="unit">\u03a9</span></div>' +
        '<div class="sc-setting"><label>Inductance L</label><input class="sc-input" id="autoL" type="number" step="any" value="0"><span class="unit">nH</span></div>' +
        '<div class="sc-setting"><label>Capacitance C</label><input class="sc-input" id="autoC" type="number" step="any" value="0"><span class="unit">pF</span></div>' +
        '<div class="sc-setting"><label>Frequency</label><input class="sc-input" id="autoF" type="number" step="any" value="' + esc(state.settings.frequency) + '"><span class="unit">' + esc(state.settings.frequencyUnit) + "</span></div>" +
      "</div>" +
      '<p class="sc-modal-note">The result replaces the first black box load. Use zero L or C to omit that element.</p>' +
      '<div class="sc-modal-actions"><button class="btn" type="button" data-modal-close>Cancel</button><button class="btn primary" type="button" id="autoSave">Set load</button></div>';
    openModal(html);
    $("#autoSave").addEventListener("click", function () {
      var R = num($("#autoR").value, 50);
      var L = num($("#autoL").value, 0) * 1e-9;
      var C = num($("#autoC").value, 0) * 1e-12;
      var f = num($("#autoF").value, state.settings.frequency) * unitConverter[state.settings.frequencyUnit];
      var w = 2 * Math.PI * f;
      var x = (L ? w * L : 0) - (C ? 1 / (w * C) : 0);
      var target = null;
      for (var i = 0; i < state.circuit.length; i++) if (state.circuit[i].name === "blackBox") { target = state.circuit[i]; break; }
      if (!target) {
        target = Object.assign({}, circuitComponents.blackBox.default, { name: "blackBox" });
        state.circuit.unshift(target);
      }
      target.real = R;
      target.imaginary = x;
      closeModal();
      refresh();
      showToast("Black box load updated to " + fmtZ({ real: R, imaginary: x }) + ".");
    });
  }

  function openCircleDialog(listKey, label, unit) {
    var html = modalHeader("Add " + label, "A numeric value will be added as a chart overlay.") +
      '<div class="sc-setting"><label>' + esc(label) + (unit ? " (" + esc(unit) + ")" : "") + '</label><input class="sc-input" id="circleValue" type="number" step="any" placeholder="0"></div>' +
      '<div class="sc-modal-actions"><button class="btn" type="button" data-modal-close>Cancel</button><button class="btn primary" type="button" id="circleSave">Add</button></div>';
    openModal(html);
    setTimeout(function () { var el = $("#circleValue"); if (el) el.focus(); }, 20);
    $("#circleSave").addEventListener("click", function () {
      var value = Number($("#circleValue").value);
      if (!isFinite(value)) { showToast("Enter a numeric value."); return; }
      state.settings[listKey].push(value);
      closeModal();
      refresh();
    });
  }

  function openZMarkerDialog() {
    var html = modalHeader("Add impedance marker", "The marker uses absolute ohms.") +
      '<div class="sc-settings-grid"><div class="sc-setting"><label>Resistance R</label><input class="sc-input" id="markerR" type="number" step="any" value="25"><span class="unit">\u03a9</span></div><div class="sc-setting"><label>Reactance X</label><input class="sc-input" id="markerX" type="number" step="any" value="0"><span class="unit">\u03a9</span></div></div>' +
      '<div class="sc-modal-actions"><button class="btn" type="button" data-modal-close>Cancel</button><button class="btn primary" type="button" id="markerSave">Add marker</button></div>';
    openModal(html);
    $("#markerSave").addEventListener("click", function () {
      var r = Number($("#markerR").value);
      var x = Number($("#markerX").value);
      if (![r, x].every(isFinite)) { showToast("Enter numeric R and X values."); return; }
      state.settings.zMarkers.push([r, x]);
      closeModal();
      refresh();
    });
  }

  function saveSvg() {
    var svg = $("#smithSvg");
    if (!svg) return;
    var clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("width", "720");
    clone.setAttribute("height", "720");
    var source = new XMLSerializer().serializeToString(clone);
    downloadBlob(new Blob([source], { type: "image/svg+xml;charset=utf-8" }), "smith-chart.svg");
  }

  function savePng() {
    var svg = $("#smithSvg");
    if (!svg) return;
    var clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("width", "720");
    clone.setAttribute("height", "720");
    var source = new XMLSerializer().serializeToString(clone);
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = 1440;
      canvas.height = 1440;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = cssVar("--sc-chart-bg", "#111309");
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) { if (blob) downloadBlob(blob, "smith-chart.png"); }, "image/png");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
  }

  function copyLink() {
    var url = location.origin + location.pathname + "?circuit=" + encodeURIComponent(generateCircuitUrl());
    try { history.replaceState(null, "", url); } catch (e) {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { showToast("Smith Chart link copied."); }, function () { window.prompt("Copy this link:", url); });
    } else {
      window.prompt("Copy this link:", url);
    }
  }

  function setCircuitAlert(message) {
    var el = $("#circuitAlert");
    if (!el) return;
    if (message) { el.textContent = message; el.classList.remove("hidden"); }
    else { el.textContent = ""; el.classList.add("hidden"); }
  }

  function refresh(options) {
    options = options || {};
    normalizeCircuit();
    try {
      compute();
      setCircuitAlert("");
    } catch (err) {
      console.error(err);
      setCircuitAlert("Calculation error: " + (err && err.message ? err.message : String(err)));
      return;
    }
    if (options.skipEditor) updateCircuitReadouts();
    else renderCircuit();
    if (!options.skipSettings) renderSettings();
    renderResults();
    drawSmith();
    renderPlots();
    updateComponentCount();
    refreshIcons();
  }

  function addComponent(name) {
    var def = circuitComponents[name];
    if (!def || name === "blackBox") return;
    var component = deepClone(def.default);
    component.name = name;
    state.circuit.push(component);
    refresh();
    if (name === "custom") openCustomModal(state.circuit.length - 1);
    if (name === "sparam") openSparamModal(state.circuit.length - 1);
    showToast(def.label + " added.");
  }

  function moveComponent(index, delta) {
    if (isFixedComponent(index)) return;
    var target = index + delta;
    if (target < 0 || target >= state.circuit.length || isFixedComponent(target)) return;
    var item = state.circuit.splice(index, 1)[0];
    state.circuit.splice(target, 0, item);
    refresh();
  }

  function removeComponent(index) {
    if (index < 0 || index >= state.circuit.length || isFixedComponent(index)) return;
    state.circuit.splice(index, 1);
    refresh();
  }

  function updateFieldFromInput(input) {
    var index = Number(input.getAttribute("data-index"));
    var c = state.circuit[index];
    if (!c) return;
    var unitField = input.getAttribute("data-unitfield");
    if (unitField) {
      c[unitField] = input.value;
      refresh();
      return;
    }
    var field = input.getAttribute("data-field");
    if (field) {
      c[field] = parseInput(input.value);
      refresh({ skipEditor: true, skipSettings: true });
    }
  }

  function bindEvents() {
    $("#componentPalette").addEventListener("click", function (event) {
      var btn = event.target.closest("[data-add]");
      if (btn) addComponent(btn.getAttribute("data-add"));
    });

    $("#circuitRows").addEventListener("input", function (event) {
      var input = event.target;
      if (input.matches("[data-field], [data-unitfield]")) updateFieldFromInput(input);
    });
    $("#circuitRows").addEventListener("change", function (event) {
      var input = event.target;
      if (input.matches("[data-field], [data-unitfield]")) {
        updateFieldFromInput(input);
      }
    });
    $("#circuitRows").addEventListener("click", function (event) {
      var btn = event.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var index = Number(btn.getAttribute("data-index"));
      if (action === "remove") removeComponent(index);
      else if (action === "move-up") moveComponent(index, -1);
      else if (action === "move-down") moveComponent(index, 1);
      else if (action === "edit-custom") openCustomModal(index);
      else if (action === "edit-sparam") openSparamModal(index);
    });
    $("#circuitRows").addEventListener("dragstart", function (event) {
      var item = event.target.closest(".sc-block");
      if (!item) return;
      dragIndex = Number(item.getAttribute("data-index"));
      if (isFixedComponent(dragIndex)) { dragIndex = -1; event.preventDefault(); return; }
      item.classList.add("dragging");
      try { event.dataTransfer.setData("text/plain", String(dragIndex)); } catch (e) {}
    });
    $("#circuitRows").addEventListener("dragend", function (event) {
      var item = event.target.closest(".sc-block");
      if (item) item.classList.remove("dragging");
      $$(".sc-block").forEach(function (el) { el.classList.remove("drag-over"); });
    });
    $("#circuitRows").addEventListener("dragover", function (event) {
      var item = event.target.closest(".sc-block");
      if (!item) return;
      event.preventDefault();
      $$(".sc-block").forEach(function (el) { el.classList.remove("drag-over"); });
      if (!isFixedComponent(Number(item.getAttribute("data-index")))) item.classList.add("drag-over");
    });
    $("#circuitRows").addEventListener("drop", function (event) {
      var item = event.target.closest(".sc-block");
      if (!item) return;
      event.preventDefault();
      var target = Number(item.getAttribute("data-index"));
      if (dragIndex < 0 || isFixedComponent(dragIndex) || isFixedComponent(target) || dragIndex === target) { dragIndex = -1; return; }
      var moved = state.circuit.splice(dragIndex, 1)[0];
      state.circuit.splice(target, 0, moved);
      dragIndex = -1;
      refresh();
    });

    $("#clearCircuitBtn").addEventListener("click", function () {
      state.circuit = [Object.assign({}, circuitComponents.blackBox.default, { name: "blackBox" })];
      refresh();
    });
    $("#resetCircuitBtn").addEventListener("click", function () {
      state.circuit = readCircuitFromUrl();
      state.settings = { zo: 50, frequency: 2440, frequencyUnit: "MHz", fSpan: 0, fSpanUnit: "MHz", fRes: 10, zMarkers: [], vswrCircles: [], qCircles: [], nfCircles: [], gainInCircles: [], gainOutCircles: [] };
      refresh();
      showToast("Example circuit restored.");
    });

    $("#settingsPanel").addEventListener("input", function (event) {
      var input = event.target;
      if (input.hasAttribute("data-setting")) {
        state.settings[input.getAttribute("data-setting")] = parseInput(input.value);
        refresh({ skipEditor: true, skipSettings: true });
      } else if (input.hasAttribute("data-marker-list")) {
        var list = state.settings[input.getAttribute("data-marker-list")];
        var idx = Number(input.getAttribute("data-index"));
        var field = input.getAttribute("data-marker-field");
        if (list && list[idx] != null) {
          if (field === "real") list[idx][0] = Number(input.value);
          else if (field === "imaginary") list[idx][1] = Number(input.value);
        }
        refresh({ skipEditor: true, skipSettings: true });
      }
    });
    $("#settingsPanel").addEventListener("change", function (event) {
      var input = event.target;
      if (input.hasAttribute("data-setting-unit")) {
        state.settings[input.getAttribute("data-setting-unit")] = input.value;
        refresh();
      } else if (input.hasAttribute("data-toggle")) {
        state.overlays[input.getAttribute("data-toggle")] = input.checked;
        refresh();
      }
    });
    $("#settingsPanel").addEventListener("click", function (event) {
      var btn = event.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var listKey = btn.getAttribute("data-list");
      var index = Number(btn.getAttribute("data-index"));
      if (action === "add-zmarker") openZMarkerDialog();
      else if (action === "add-circle") {
        var labels = { vswrCircles: "VSWR circle", qCircles: "Q circle", nfCircles: "noise figure", gainInCircles: "input gain", gainOutCircles: "output gain" };
        openCircleDialog(listKey, labels[listKey] || "circle", listKey.indexOf("Gain") >= 0 ? "dB" : "");
      } else if (action === "remove-marker") { state.settings[listKey].splice(index, 1); refresh(); }
      else if (action === "remove-circle") { state.settings[listKey].splice(index, 1); refresh(); }
      else if (action === "add-custom") addComponent("custom");
      else if (action === "import-sparam") {
        var idx = -1;
        for (var i = 0; i < state.circuit.length; i++) if (state.circuit[i].name === "sparam") { idx = i; break; }
        if (idx === -1) {
          var component = deepClone(circuitComponents.sparam.default);
          component.name = "sparam";
          state.circuit.push(component);
          idx = state.circuit.length - 1;
          refresh();
        }
        openSparamModal(idx);
      } else if (action === "auto-calc") openAutoCalcModal();
      else if (action === "graph-settings") openGraphSettings();
    });

    $$(".sc-overlay-bar input[data-overlay]").forEach(function (input) {
      input.addEventListener("change", function () {
        state.overlays[input.getAttribute("data-overlay")] = input.checked;
        refresh();
      });
    });
    $("#graphSettingsBtn").addEventListener("click", openGraphSettings);

    $$(".sc-layout-toggle button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.layout = btn.getAttribute("data-layout");
        $("#workspace").setAttribute("data-layout", state.layout);
        $$(".sc-layout-toggle button").forEach(function (b) { b.classList.toggle("active", b === btn); });
        try { localStorage.setItem("smith-layout", state.layout); } catch (e) {}
        setTimeout(renderPlots, 30);
      });
    });

    $("#copyLinkBtn").addEventListener("click", function (event) { event.preventDefault(); copyLink(); });
    $("#saveSvgBtn").addEventListener("click", saveSvg);
    $("#savePngBtn").addEventListener("click", savePng);

    $("#modalBackdrop").addEventListener("click", function (event) {
      if (event.target === $("#modalBackdrop") || event.target.closest("[data-modal-close]")) closeModal();
    });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") closeModal(); });
    window.addEventListener("resize", debounce(renderPlots, 180));
  }

  function init() {
    state.circuit = readCircuitFromUrl();
    try {
      var savedLayout = localStorage.getItem("smith-layout");
      if (savedLayout === "stack" || savedLayout === "side") state.layout = savedLayout;
    } catch (e) {}
    $("#workspace").setAttribute("data-layout", state.layout);
    $$(".sc-layout-toggle button").forEach(function (btn) { btn.classList.toggle("active", btn.getAttribute("data-layout") === state.layout); });
    renderPalette();
    renderDocs();
    bindEvents();
    bindChartHover();
    refresh();
    window.SmithChartApp = {
      state: state,
      refresh: refresh,
      compute: compute,
      parseTouchstoneFile: parseTouchstoneFile,
      generateCircuitUrl: generateCircuitUrl,
      getAppData: function () { return appData; }
    };
  }

  init();
})();
