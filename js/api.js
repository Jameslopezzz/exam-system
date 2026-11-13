/* =========================================================
   API client + session guard.
   Pages declare <body data-role="student"> (or "professor,admin").
   Anyone not signed in with that role is sent back to index.html.
   ========================================================= */

var API = (function () {
  function request(method, path, data) {
    var opts = { method: method, credentials: "same-origin", headers: {} };
    if (data !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(data);
    }
    return fetch("api/" + path, opts).then(function (res) {
      return res.text().then(function (txt) {
        var json = null, badBody = false;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { badBody = true; }
        // A page that is not JSON (e.g. a PHP error printed as HTML) must never look like a success.
        if (res.ok && badBody) {
          var shown = txt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
          var bad = new Error("The server sent an unexpected reply" + (shown ? ": " + shown : ".") + " Check the PHP / MySQL error log.");
          bad.status = 502;
          throw bad;
        }
        if (!res.ok) {
          var err = new Error((json && json.error) || "Request failed (" + res.status + ")");
          err.status = res.status; err.data = json;
          throw err;
        }
        return json;
      });
    });
  }
  return {
    get: function (path) { return request("GET", path); },
    post: function (path, data) { return request("POST", path, data || {}); }
  };
})();

var Session = {
  user: null,
  home: { student: "student-dashboard.html", professor: "professor-dashboard.html", admin: "admin-dashboard.html" },

  guard: function (roles) {
    return API.get("auth.php?action=me").then(function (r) {
      Session.user = r.user;
      if (roles.indexOf(r.user.role) === -1) {
        window.location.replace(Session.home[r.user.role] || "index.html");
        return new Promise(function () {});          // stop the page from continuing
      }
      document.documentElement.style.visibility = "";
      Session.decorate();
      return r.user;
    }).catch(function (e) {
      if (e.status === 401 || e.status === 403) window.location.replace("index.html");
      else document.documentElement.style.visibility = "";
      return new Promise(function () {});
    });
  },

  roleLabel: { student: "Student", professor: "Professor", admin: "Administrator" },

  /* Menu used by pages that ask for it with <nav class="nav" data-auto-nav> (the shared profile page). */
  navLinks: {
    student: [["student-dashboard.html", "Dashboard"], ["student-exam-dashboard.html", "My Exams"], ["student-results.html", "Results"], ["student-guidelines.html", "Guidelines"]],
    professor: [["professor-dashboard.html", "Dashboard"], ["professor-monitoring.html", "Live Monitoring"], ["professor-exam-creation.html", "Exam Builder"], ["professor-reports.html", "Reports"]],
    admin: [["admin-dashboard.html", "Admin Console"], ["professor-dashboard.html", "Exams"], ["professor-monitoring.html", "Live Monitoring"], ["professor-exam-creation.html", "Exam Builder"], ["professor-reports.html", "Reports"]]
  },

  initials: function (name) {
    var words = String(name || "?").replace(/\b(prof|dr|engr|atty|mr|ms|mrs)\.?\s/gi, "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    var a = words[0].charAt(0), b = words.length > 1 ? words[words.length - 1].charAt(0) : "";
    return (a + b).toUpperCase();
  },

  /* Name in the header, the account menu (profile / dark mode / sign out) and working sign-out buttons. */
  decorate: function () {
    var u = Session.user;
    var names = document.querySelectorAll("[data-user-name]");
    for (var i = 0; i < names.length; i++) names[i].textContent = u.name;

    var nav = document.querySelector(".nav");
    if (nav && nav.hasAttribute("data-auto-nav")) {
      nav.innerHTML = (Session.navLinks[u.role] || []).map(function (l) {
        return '<a href="' + l[0] + '">' + l[1] + "</a>";
      }).join("");
      if (window.markActiveNav) window.markActiveNav();
    }
    // Admins have full access: add a way back to the console on the professor pages.
    if (u.role === "admin" && nav && !nav.querySelector("a[href='admin-dashboard.html']")) {
      var a = document.createElement("a"); a.href = "admin-dashboard.html"; a.textContent = "Admin Console";
      nav.insertBefore(a, nav.firstChild);
    }

    var box = document.querySelector(".user-box");
    if (box) Session.buildAccountMenu(box);

    // Every sign-out control (menu item, profile page button, legacy link) ends the session.
    var outs = document.querySelectorAll("[data-signout], a.signout");
    for (var j = 0; j < outs.length; j++) {
      outs[j].addEventListener("click", function (e) {
        e.preventDefault();
        API.post("auth.php?action=logout").then(function () { window.location.href = "index.html"; });
      });
    }
    if (window.Theme) window.Theme.sync();
  },

  buildAccountMenu: function (box) {
    var u = Session.user;
    var role = Session.roleLabel[u.role] || u.role;
    var here = (window.location.pathname.split("/").pop() || "").toLowerCase();
    box.className = "user-menu";
    box.innerHTML =
      '<button type="button" class="user-menu__btn" aria-haspopup="true" aria-expanded="false" aria-controls="userMenuPanel">' +
        '<span class="avatar" aria-hidden="true">' + esc(Session.initials(u.name)) + "</span>" +
        '<span class="user-menu__who"><span class="user-box__name" data-user-name>' + esc(u.name) + "</span>" +
        '<span class="user-box__role">' + esc(role) + "</span></span>" +
        '<svg class="user-menu__caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>' +
      "</button>" +
      '<div class="user-menu__panel" id="userMenuPanel" role="menu" hidden>' +
        '<div class="user-menu__head"><strong>' + esc(u.name) + "</strong><span>" + esc(u.account_no) + " · " + esc(role) + "</span></div>" +
        '<a class="user-menu__item" role="menuitem" href="profile.html"' + (here === "profile.html" ? ' aria-current="page"' : "") + "><span>My profile</span></a>" +
        '<button type="button" class="user-menu__item" role="menuitem" data-theme-toggle aria-pressed="false"><span>Dark mode</span><span class="switch" aria-hidden="true"></span></button>' +
        '<button type="button" class="user-menu__item user-menu__item--danger" role="menuitem" data-signout><span>Sign out</span></button>' +
      "</div>";

    var btn = box.querySelector(".user-menu__btn"), panel = box.querySelector(".user-menu__panel");
    function setOpen(open) {
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(panel.hidden); });
    document.addEventListener("click", function (e) { if (!box.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) { setOpen(false); btn.focus(); }
    });
  },

  /* Resolves with the user once the guard passes; page scripts wait on this. */
  ready: null
};

(function () {
  var role = document.body && document.body.getAttribute("data-role");
  if (!role) return;
  document.documentElement.style.visibility = "hidden";
  Session.ready = Session.guard(role.split(","));
})();
