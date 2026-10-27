"use strict";

/* =========================================================================
   Toroid Inductor — 3D winding preview (three.js ES module)
   Renders the selected core at true OD/ID/ht proportions plus the winding as
   a 3D spring path: each turn follows the core's elliptical cross-section
   (through the bore, over the outside), turns distributed evenly around the
   ring. Displayed turns are capped for legibility; excess is noted.
   Loads three.js from CDN; degrades gracefully when offline/blocked.
   Communicates with the classic toroid-inductor.js via window.ToroidViz and
   the window.__toroidVizPending hand-off (module loads after classic scripts).
   ========================================================================= */

(function () {
  var box = document.getElementById("vizBox");
  var cap = document.getElementById("vizCap");
  if (!box) return;

  var MAX_SHOW = 36;          // turns rendered when the calculation says more
  var PER_TURN = 24;         // samples per winding turn

  var API = { ready: false, update: function () {} };
  window.ToroidViz = API;
  var pending = null;
  var buildRef = null;   // bound to main()'s build() once the scene exists
  API.update = function (d) { if (API.ready && buildRef) buildRef(d); else pending = d; };

  (async function main() {
    let THREE, OrbitControls;
    try {
      THREE = await import("three");
      ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
    } catch (e) {
      box.innerHTML = '<div class="viz-fallback">3D preview unavailable — three.js could not be loaded (offline or blocked).</div>';
      return;
    }

    /* ---------------------------------------------------- scene skeleton */
    var boxW = box.clientWidth || 600, boxH = box.clientHeight || 320;
    var scene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(38, boxW / boxH, 0.1, 2000);
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(boxW, boxH);
    box.appendChild(renderer.domElement);

    var ctrl = new OrbitControls(cam, renderer.domElement);
    ctrl.enableDamping = true; ctrl.dampingFactor = 0.08; ctrl.enablePan = false;
    ctrl.autoRotate = true; ctrl.autoRotateSpeed = 1.2;
    var spinTimer = null;
    ctrl.addEventListener("start", function () {
      ctrl.autoRotate = false; if (spinTimer) clearTimeout(spinTimer);
    });
    ctrl.addEventListener("end", function () {
      spinTimer = setTimeout(function () { ctrl.autoRotate = true; }, 2500);
    });

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3d2a, 0.95));
    var dl = new THREE.DirectionalLight(0xffffff, 0.75); dl.position.set(6, -4, 9); scene.add(dl);
    var dl2 = new THREE.DirectionalLight(0xffffff, 0.25); dl2.position.set(-7, 5, -6); scene.add(dl2);

    var world = new THREE.Group(); scene.add(world);

    var coreMat = new THREE.MeshStandardMaterial({ color: 0x6f4a2c, roughness: 0.85, metalness: 0.05 });
    var wireMat = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.38, metalness: 0.85 });
    var wireOverMat = new THREE.MeshStandardMaterial({ color: 0xd9b84a, roughness: 0.42, metalness: 0.55 });

    function clearWorld() {
      while (world.children.length) {
        var c = world.children.pop();
        if (c.geometry) c.geometry.dispose();
      }
    }

    /* ---------------------------------------------------------- geometry */
    var lastCoreCode = null;
    function build(d) {
      clearWorld();
      var core = d.core, awg = d.awg;

      var Rm = (core.od + core.id) / 4;                 // ring mean radius, mm
      var Tm = Math.max((core.od - core.id) / 4, 0.05); // tube radius (radial half)
      var Hh = core.ht / 2;                              // axial half-height
      var R = core.od / 2;

      /* core: torus, elliptical cross-section scaled so the radial span is
         od-id and the axial span is ht */
      var ferrite = core["class"] === "ferrite";
      coreMat.color.setHex(ferrite ? 0x16161a : 0x6f4a2c);
      coreMat.roughness = ferrite ? 0.55 : 0.85;
      var coreGeo = new THREE.TorusGeometry(Rm, Tm, 40, 120);
      var coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.scale.z = Hh / Tm;
      world.add(coreMesh);

      cam.near = R / 60; cam.far = R * 60;
      cam.updateProjectionMatrix();
      ctrl.minDistance = R * 0.5; ctrl.maxDistance = R * 10;
      if (core.code !== lastCoreCode) {
        lastCoreCode = core.code;
        ctrl.target.set(0, 0, 0);
        cam.position.set(R * 1.5, -R * 2.0, R * 2.4);
        ctrl.update();
      }

      var msg = core.name + " · OD " + core.od + " / ID " + core.id + " / ht " + core.ht + " mm";

      if (d.N == null || !awg) {
        cap.textContent = msg + " — no winding shown: enter a target inductance.";
        return;
      }

      /* winding: spring path. Cross-section angle u (0 = outer surface,
         pi = deepest bore point); ring angle phi advances 2pi/M per turn
         so M turns share the ring evenly, like a real pack */
      var g = awg.ins / 2;                               // wire radius incl. enamel
      var M = Math.min(d.N, MAX_SHOW);
      var outer = Rm + Tm + g;
      var bore = Math.max(Rm - Tm - g, R * 0.02);        // wire can't collapse to axis
      var zamp = Hh + g;
      var S = PER_TURN * M;
      var pts = [];
      for (var i = 0; i < S; i++) {
        var t = i / S * 2 * Math.PI * M;
        var u = t % (2 * Math.PI);
        var phi = t / M;
        var cu = Math.cos(u);
        var r = cu >= 0
          ? Rm + (Tm + g) * cu
          : Rm - (Rm - bore) * (-cu);
        r = Math.max(r, 0.01);
        var z = zamp * Math.sin(u);
        pts.push(new THREE.Vector3(r * Math.cos(phi), r * Math.sin(phi), z));
      }
      var curve = new THREE.CatmullRomCurve3(pts, true);
      var wireGeo = new THREE.TubeGeometry(curve, S, g, 7, true);
      world.add(new THREE.Mesh(wireGeo, d.over ? wireOverMat : wireMat));

      msg += " · " + d.N + " turns"
        + (d.N > MAX_SHOW ? " (preview shows " + MAX_SHOW + ")" : "")
        + " · AWG " + awg.awg + " (Ø" + awg.ins + " mm)";
      if (d.over) msg += " — exceeds packing capacity";
      cap.textContent = msg;
    }

    /* ------------------------------------------------------ plumbing */
    function fit() {
      var w = box.clientWidth || 600, h = box.clientHeight || 320;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(fit).observe(box);
    } else {
      window.addEventListener("resize", fit);
    }

    (function loop() {
      requestAnimationFrame(loop);
      if (!document.hidden) {
        ctrl.update();
        renderer.render(scene, cam);
      }
    })();

    API.ready = true;
    buildRef = build;                 // expose main()'s build() to API.update
    var first = pending || (window.__toroidVizPending || null);
    pending = null;
    if (first) build(first);
  })();
})();
