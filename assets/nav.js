(function () {
  "use strict";

  var path = location.pathname.replace(/\\/g, "/");
  var inApp = /\/app\//.test(path);
  var base = inApp ? "../" : "./";
  var page = (document.body && document.body.dataset.page) || "home";

  var links = [
    { id: "home",       href: base + "index.html",                icon: "home",   label: "Home" },
    { id: "attenuator", href: base + "app/rf-attenuator.html",    icon: "gauge",  label: "RF Attenuator" },
    { id: "lc-filter",  href: base + "app/lc-filter.html",        icon: "filter", label: "RF LC Filter" },
    { id: "inductor",   href: base + "app/toroid-inductor.html",  icon: "magnet", label: "Inductor Calc" }
  ];

  var menuHtml = links.map(function (l) {
    return '<a class="nav-link' + (l.id === page ? " active" : "") + '" href="' + l.href + '">' +
      '<i data-lucide="' + l.icon + '"></i>' + l.label + "</a>";
  }).join("");

  var header = document.createElement("header");
  header.className = "navbar";
  header.innerHTML =
    '<div class="nav-inner">' +
      '<a class="nav-brand" href="' + base + 'index.html">' +
        '<span class="brand-ico"><i data-lucide="radio-tower"></i></span><b>RF Tools</b>' +
      "</a>" +
      '<button class="nav-toggle" id="navToggle" aria-label="Menu"><i data-lucide="menu"></i></button>' +
      '<nav class="nav-menu" id="navMenu">' + menuHtml +
        '<div class="nav-actions">' +
          '<button class="theme-btn" id="themeBtn"><i data-lucide="' + themeIcon() + '"></i><span>Theme</span></button>' +
        "</div>" +
      "</nav>" +
    "</div>";

  document.body.insertBefore(header, document.body.firstChild);

  var toggle = document.getElementById("navToggle");
  var menu = document.getElementById("navMenu");
  if (toggle) toggle.addEventListener("click", function () { menu.classList.toggle("open"); });

  var btn = document.getElementById("themeBtn");
  btn.addEventListener("click", function () {
    var html = document.documentElement;
    var toDark = html.dataset.theme !== "dark";
    html.dataset.theme = toDark ? "dark" : "light";
    try { localStorage.setItem("rf-theme", html.dataset.theme); } catch (e) {}
    btn.innerHTML = '<i data-lucide="' + themeIcon() + '"></i><span>Theme</span>';
    if (window.lucide) lucide.createIcons();
  });

  function themeIcon() {
    return document.documentElement.dataset.theme === "dark" ? "sun" : "moon";
  }

  if (window.lucide) lucide.createIcons();
})();
