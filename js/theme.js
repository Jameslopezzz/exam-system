/* =========================================================
   Light / dark theme. Loaded in <head> of every page so the saved
   choice is applied before the first paint (no white flash).
   Stored in localStorage ("exam-theme"); with no saved choice the
   operating-system preference is used.
   Any element with [data-theme-toggle] flips the theme (works for
   elements added later, e.g. the account menu).
   ========================================================= */
(function () {
  var KEY = "exam-theme";
  var root = document.documentElement;

  function saved() {
    try { var v = window.localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : null; } catch (e) { return null; }
  }
  function systemDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function current() { return saved() || (systemDark() ? "dark" : "light"); }

  var SUN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function sync(theme) {
    var toggles = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < toggles.length; i++) {
      var t = toggles[i], dark = theme === "dark";
      t.setAttribute("aria-pressed", dark ? "true" : "false");
      if (t.classList.contains("theme-btn")) {
        t.innerHTML = dark ? SUN : MOON;
        t.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
        t.title = dark ? "Switch to light mode" : "Switch to dark mode";
      }
    }
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    sync(theme);
  }

  function set(theme) {
    try { window.localStorage.setItem(KEY, theme); } catch (e) { /* private mode: still works for this page */ }
    apply(theme);
  }

  apply(current());

  window.Theme = {
    current: function () { return root.getAttribute("data-theme") || current(); },
    set: set,
    toggle: function () { set(window.Theme.current() === "dark" ? "light" : "dark"); },
    sync: function () { sync(window.Theme.current()); }
  };

  /* Follow the OS setting live, unless the person chose a theme themselves. */
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () { if (!saved()) apply(current()); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-theme-toggle]") : null;
    if (!t) return;
    e.preventDefault();
    window.Theme.toggle();
  });

  document.addEventListener("DOMContentLoaded", function () {
    /* Pages with no account menu get a small toggle of their own. */
    function addButton(parent, className, before) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "theme-btn " + className; b.setAttribute("data-theme-toggle", "");
      if (before && parent.firstChild) parent.insertBefore(b, parent.firstChild); else parent.appendChild(b);
    }
    var examBar = document.querySelector(".exam-header__right");
    if (examBar) addButton(examBar, "theme-btn--header", true);          // exam page
    else if (document.querySelector(".portal")) addButton(document.body, "theme-btn--fab", false);   // sign-in page
    sync(window.Theme.current());
  });
})();
