/* =========================================================
   Profile page: account information for everyone, plus
     professor -> exams they created (draft / scheduled / available / closed)
     student   -> their examinations (available, upcoming, completed ...)
     admin     -> system-wide information
   Data comes from api/profile.php.
   ========================================================= */

(function () {
  var ROLE_LABEL = { student: "Student", professor: "Professor", admin: "Administrator" };
  var data = null;

  function fmtDate(v, withTime) {
    if (!v) return "";
    var d = new Date(String(v).replace(" ", "T"));
    if (isNaN(d.getTime())) return String(v);
    try {
      return d.toLocaleString([], withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
    } catch (e) { return d.toDateString(); }
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }
  function badge(kind, text) { return '<span class="badge badge--' + esc(kind) + '">' + esc(text) + "</span>"; }
  function kv(rows) {
    return rows.filter(function (r) { return r[1] !== null && r[1] !== undefined && r[1] !== ""; }).map(function (r) {
      return "<div><dt>" + esc(r[0]) + "</dt><dd>" + (r[2] ? r[1] : esc(r[1])) + "</dd></div>";
    }).join("");
  }
  function stat(label, value, tone, filter) {
    var inner = '<p class="stat__label">' + esc(label) + '</p><p class="stat__value' + (tone ? " is-" + tone : "") + '">' + esc(value) + "</p>";
    return filter
      ? '<button type="button" class="stat stat--link" data-filter-jump="' + esc(filter) + '">' + inner + "</button>"
      : '<div class="stat">' + inner + "</div>";
  }
  function sectionTags(list) {
    return list && list.length ? list.map(function (x) { return '<span class="tag">' + esc(x) + "</span>"; }).join("") : '<span class="tag tag--all">All sections</span>';
  }

  /* ---------------- account (common to all roles) ---------------- */

  function renderAccount(a) {
    el("heroAvatar").textContent = Session.initials(a.name);
    el("heroName").textContent = a.name;
    var bits = [a.account_no];
    if (a.department) bits.push(a.department.code);
    if (a.program) bits.push(a.program.code);
    if (a.year_level) bits.push(a.year_level);
    if (a.section) bits.push(a.section);
    el("heroMeta").textContent = bits.join(" · ");
    el("heroBadges").innerHTML = badge("closed", ROLE_LABEL[a.role] || a.role) +
      badge(a.status === "Active" || a.status === "Graduated" ? "available" : "scheduled", a.status);
    el("profileSubtitle").textContent = a.role === "professor" ? "Your account and the examinations you created."
      : a.role === "student" ? "Your account and your examinations."
      : "Your account and an overview of the whole system.";

    var rows = [["Full name", a.name], ["Account number", a.account_no], ["Role", ROLE_LABEL[a.role] || a.role], ["Status", a.status]];
    if (a.department) rows.push(["Department", a.department.code + "<small>" + esc(a.department.name) + "</small>", true]);
    if (a.role === "student") {
      if (a.program) rows.push(["Course", a.program.code + "<small>" + esc(a.program.name) + "</small>", true]);
      rows.push(["Year level", a.year_level]);
      rows.push(["Section", a.section || "—"]);
    }
    if (a.role === "admin") rows.push(["Access", "Full system access"]);
    rows.push(["Member since", fmtDate(a.member_since)]);
    el("accountInfo").innerHTML = kv(rows);
  }

  /* ---------------- professor ---------------- */

  var EXAM_FILTERS = ["all", "draft", "scheduled", "available", "closed"];

  function renderProfessor(d) {
    var c = d.counts;
    el("profileMain").innerHTML =
      '<div class="grid grid--stats">' +
      stat("Draft", c.draft, "", "draft") + stat("Scheduled", c.scheduled, "", "scheduled") +
      stat("Available", c.available, "success", "available") + stat("Closed", c.closed, "", "closed") +
      "</div>" +
      '<section class="card"><header class="card__header"><h2>Examinations I created</h2>' +
      '<a class="card__link" href="professor-exam-creation.html">Open Exam Builder</a></header>' +
      '<div class="card__body">' +
      '<div class="chip-row" id="examChips" style="margin-bottom:1rem">' +
      EXAM_FILTERS.map(function (f) {
        var n = f === "all" ? d.exams.length : c[f];
        return '<button type="button" class="chip' + (f === "all" ? " is-active" : "") + '" data-filter="' + f + '">' + (f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)) + " (" + n + ")</button>";
      }).join("") +
      "</div>" +
      '<ul class="divided" id="examList"></ul></div></section>';
    wireFilters(function (f) { drawProfessorExams(d.exams, f); }, "all");
    drawProfessorExams(d.exams, "all");
  }

  function drawProfessorExams(exams, filter) {
    var rows = exams.filter(function (e) { return filter === "all" || e.status === filter; });
    el("examList").innerHTML = rows.length ? rows.map(function (e) {
      var subs = Number(e.submissions), autos = Number(e.auto_submitted);
      return '<li class="profile-exam"><div class="profile-exam__main">' +
        '<p class="profile-exam__title">' + esc(e.code) + " · " + esc(e.title) + badge(e.status, e.status) + "</p>" +
        '<p class="text-xs muted profile-exam__meta">' + esc(e.subject) + " · " + esc(e.duration_minutes) + " min · " + plural(Number(e.items), "item") +
        (e.scheduled_at ? " · scheduled " + esc(fmtDate(e.scheduled_at, true)) : "") + "</p>" +
        '<p class="text-xs profile-exam__meta"><span class="muted">Sections:</span> ' + sectionTags(e.sections) + "</p>" +
        '<p class="text-xs muted profile-exam__meta">' + plural(subs, "submission") + (autos ? " · " + autos + " auto-submitted" : "") + " · created " + esc(fmtDate(e.created_at)) + "</p>" +
        '</div><div class="profile-exam__side">' +
        '<a class="btn btn--outline btn--sm" href="professor-monitoring.html?exam_id=' + esc(e.id) + '">Monitor</a>' +
        '<a class="btn btn--outline btn--sm" href="professor-reports.html">Reports</a>' +
        "</div></li>";
    }).join("") : '<li class="empty">' + (filter === "all" ? "You have not created any examinations yet." : "No " + filter + " examinations.") +
      ' <a class="card__link" href="professor-exam-creation.html">Create one</a></li>';
  }

  /* ---------------- student ---------------- */

  var STATE_LABEL = { available: "Available", "in-progress": "In progress", upcoming: "Upcoming", completed: "Completed", "auto-submitted": "Auto-submitted", missed: "Closed" };
  var STUDENT_FILTERS = [["all", "All"], ["available", "Available"], ["upcoming", "Upcoming"], ["completed", "Completed"], ["closed", "Closed"]];

  function studentMatches(e, f) {
    if (f === "all") return true;
    if (f === "available") return e.state === "available" || e.state === "in-progress";
    if (f === "upcoming") return e.state === "upcoming";
    if (f === "completed") return e.state === "completed" || e.state === "auto-submitted";
    if (f === "closed") return e.state === "missed";
    return true;
  }

  function renderStudent(d) {
    var c = d.counts;
    el("profileMain").innerHTML =
      '<div class="grid grid--stats">' +
      stat("Available now", c.available, "success", "available") + stat("Upcoming", c.upcoming, "", "upcoming") +
      stat("Completed", c.completed, "", "completed") + stat("Violations recorded", c.violations, c.violations ? "danger" : "") +
      "</div>" +
      '<section class="card"><header class="card__header"><h2>My examinations</h2>' +
      '<a class="card__link" href="student-results.html">View all results</a></header>' +
      '<div class="card__body">' +
      '<div class="chip-row" id="examChips" style="margin-bottom:1rem">' +
      STUDENT_FILTERS.map(function (f) {
        var n = d.exams.filter(function (e) { return studentMatches(e, f[0]); }).length;
        return '<button type="button" class="chip' + (f[0] === "all" ? " is-active" : "") + '" data-filter="' + f[0] + '">' + f[1] + " (" + n + ")</button>";
      }).join("") +
      "</div>" +
      '<ul class="divided" id="examList"></ul></div></section>';
    wireFilters(function (f) { drawStudentExams(d.exams, f); }, "all");
    drawStudentExams(d.exams, "all");
  }

  function drawStudentExams(exams, filter) {
    var rows = exams.filter(function (e) { return studentMatches(e, filter); });
    el("examList").innerHTML = rows.length ? rows.map(function (e) {
      var right = "";
      if (e.state === "available") right = '<a class="btn btn--primary btn--sm" href="student-exam.html?exam=' + esc(e.id) + '">Start exam</a>';
      else if (e.state === "in-progress") right = '<a class="btn btn--primary btn--sm" href="student-exam.html?exam=' + esc(e.id) + '">Resume exam</a>';
      else if (e.score) {
        var pct = e.score.max ? Math.round(e.score.points / e.score.max * 100) : 0;
        right = '<span class="score-pill" title="' + (e.score.essays_pending ? "Essay questions are still being graded" : "") + '">' + esc(e.score.points) + " / " + esc(e.score.max) + " · " + pct + "%</span>";
      }
      var when = e.state === "completed" || e.state === "auto-submitted"
        ? "submitted " + fmtDate(e.submitted_at, true)
        : e.scheduled_at ? "scheduled " + fmtDate(e.scheduled_at, true) : (e.state === "available" ? "open now" : "date to be announced");
      return '<li class="profile-exam"><div class="profile-exam__main">' +
        '<p class="profile-exam__title">' + esc(e.code) + " · " + esc(e.title) + badge(e.state, STATE_LABEL[e.state] || e.state) + "</p>" +
        '<p class="text-xs muted profile-exam__meta">' + esc(e.subject) + " · " + esc(e.professor) + "</p>" +
        '<p class="text-xs muted profile-exam__meta">' + esc(e.duration_minutes) + " min · " + plural(e.items, "item") + " · " + esc(when) +
        (e.violations ? ' · <span class="danger">' + plural(e.violations, "violation") + "</span>" : "") + "</p>" +
        '</div><div class="profile-exam__side">' + right + "</div></li>";
    }).join("") : '<li class="empty">' + (filter === "all" ? "No examinations have been assigned to your section yet." : "Nothing in this list.") + "</li>";
  }

  /* ---------------- admin ---------------- */

  function renderAdmin(d) {
    var o = d.overview;
    var sy = o.school_year ? o.school_year.label + "<small>" + esc(fmtDate(o.school_year.start_date)) + " – " + esc(fmtDate(o.school_year.end_date)) + "</small>" : "None set";
    el("profileMain").innerHTML =
      '<div class="grid grid--stats">' +
      stat("Active accounts", o.accounts.total) + stat("Pending approvals", o.pending, o.pending ? "danger" : "") +
      stat("Examinations", o.exams.total) + stat("Violations recorded", o.violations) +
      "</div>" +
      '<div class="grid grid--halves">' +
      '<section class="card"><header class="card__header"><h2>Accounts</h2><a class="card__link" href="admin-dashboard.html">Admin Console</a></header>' +
      '<div class="card__body"><dl class="kv">' + kv([
        ["Students", o.accounts.student], ["Professors", o.accounts.professor], ["Administrators", o.accounts.admin],
        ["Graduated students", o.graduated], ["Disabled accounts", o.disabled], ["Pending sign-ups", o.pending], ["Rejected sign-ups", o.rejected]
      ]) + "</dl></div></section>" +
      '<section class="card"><header class="card__header"><h2>Examinations</h2><a class="card__link" href="professor-dashboard.html">Open exams</a></header>' +
      '<div class="card__body"><dl class="kv">' + kv([
        ["Draft", o.exams.draft], ["Scheduled", o.exams.scheduled], ["Available", o.exams.available], ["Closed", o.exams.closed],
        ["Submissions", o.submissions], ["Taking an exam now", o.in_progress], ["Auto-submitted", o.auto_submitted]
      ]) + "</dl></div></section>" +
      "</div>" +
      '<section class="card"><header class="card__header"><h2>System</h2></header><div class="card__body"><dl class="kv">' +
      kv([["Current school year", sy, true], ["Departments", o.departments], ["Programs / courses", o.programs]]) + "</dl></div></section>" +

      '<section class="card"><header class="card__header"><h2>Departments</h2></header><div class="card__body"><div class="scroll-x"><table class="table">' +
      "<thead><tr><th>Code</th><th>Name</th><th>Professors</th><th>Students</th></tr></thead><tbody>" +
      (d.departments.length ? d.departments.map(function (x) {
        return "<tr><td><b>" + esc(x.code) + "</b></td><td>" + esc(x.name) + "</td><td>" + esc(x.professors) + "</td><td>" + esc(x.students) + "</td></tr>";
      }).join("") : '<tr><td colspan="4" class="muted">No departments.</td></tr>') + "</tbody></table></div></div></section>" +

      '<section class="card"><header class="card__header"><h2>Recent examinations</h2></header><div class="card__body"><div class="scroll-x"><table class="table">' +
      "<thead><tr><th>Exam</th><th>Professor</th><th>Status</th><th>Submissions</th></tr></thead><tbody>" +
      (d.recent_exams.length ? d.recent_exams.map(function (x) {
        return "<tr><td><b>" + esc(x.code) + "</b> · " + esc(x.title) + "</td><td>" + esc(x.professor) + "</td><td>" + badge(x.status, x.status) + "</td><td>" + esc(x.submissions) + "</td></tr>";
      }).join("") : '<tr><td colspan="4" class="muted">No examinations yet.</td></tr>') + "</tbody></table></div></div></section>" +

      '<section class="card"><header class="card__header"><h2>Recent accounts</h2></header><div class="card__body"><div class="scroll-x"><table class="table">' +
      "<thead><tr><th>Account</th><th>Name</th><th>Role</th><th>Department</th><th>Status</th><th>Created</th></tr></thead><tbody>" +
      d.recent_accounts.map(function (x) {
        var st = x.approval_status === "approved" ? "Approved" : x.approval_status === "pending" ? "Pending" : "Rejected";
        return "<tr><td>" + esc(x.account_no) + "</td><td>" + esc(x.full_name) + '</td><td class="capitalize">' + esc(x.role) + "</td><td>" + esc(x.dept_code || "—") + "</td><td>" +
          badge(x.approval_status === "approved" ? "available" : x.approval_status === "pending" ? "scheduled" : "auto-submitted", st) + '</td><td class="muted">' + esc(fmtDate(x.created_at)) + "</td></tr>";
      }).join("") + "</tbody></table></div></div></section>";
  }

  /* ---------------- shared wiring ---------------- */

  function wireFilters(draw, initial) {
    var chips = document.querySelectorAll("#examChips [data-filter]");
    function pick(f) {
      for (var i = 0; i < chips.length; i++) chips[i].classList.toggle("is-active", chips[i].getAttribute("data-filter") === f);
      draw(f);
    }
    for (var i = 0; i < chips.length; i++) {
      (function (chip) { chip.addEventListener("click", function () { pick(chip.getAttribute("data-filter")); }); })(chips[i]);
    }
    var jumps = document.querySelectorAll("[data-filter-jump]");
    for (var j = 0; j < jumps.length; j++) {
      (function (b) {
        b.addEventListener("click", function () {
          pick(b.getAttribute("data-filter-jump"));
          var target = el("examChips"); if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      })(jumps[j]);
    }
    pick(initial);
  }

  function wirePinForm() {
    var form = el("pinForm"), msg = el("pinMsg"), btn = el("pinBtn");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      function say(text, ok) { msg.textContent = text; msg.style.color = ok ? "var(--success)" : "var(--destructive)"; }
      var cur = el("pinCurrent").value, n1 = el("pinNew").value, n2 = el("pinConfirm").value;
      if (n1.length < 6) return say("The new PIN must be at least 6 characters.", false);
      if (n1 !== n2) return say("The two new PINs do not match.", false);
      btn.disabled = true; btn.textContent = "Updating…"; say("", true);
      API.post("auth.php?action=change_pin", { current_password: cur, new_password: n1, confirm_password: n2 })
        .then(function (r) { form.reset(); say(r.message || "Your PIN was changed.", true); })
        .catch(function (err) { say(err.message, false); })
        .then(function () { btn.disabled = false; btn.textContent = "Update PIN"; });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wirePinForm();
    Session.ready.then(function () { return API.get("profile.php"); }).then(function (d) {
      if (!d || !d.account) throw new Error("The server did not return your profile.");
      data = d;
      renderAccount(d.account);
      if (d.account.role === "professor") renderProfessor(d);
      else if (d.account.role === "student") renderStudent(d);
      else renderAdmin(d);
    }).catch(function (e) {
      var n = el("profileError"); n.hidden = false; n.textContent = e.message || "Could not load your profile.";
      el("profileMain").innerHTML = "";
    });
  });
})();
