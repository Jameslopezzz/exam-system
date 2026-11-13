/* =========================================================
   Live monitoring grid. Polls api/monitor.php every 3 seconds:
   student progress, violations, online/ping status and the alert
   feed. Supports "Send warning" and "Force submit".
   ========================================================= */

(function () {
  var selectedId = null;
  var students = [];
  var threshold = 3;
  var examId = new URLSearchParams(window.location.search).get("exam_id") || "";

  function visibleStudents() {
    var searchInput = el("monitorSearch");
    var statusSelect = el("monitorStatus");
    var term = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var status = statusSelect ? statusSelect.value : "all";

    return students.filter(function (s) {
      var matchesTerm =
        !term ||
        s.name.toLowerCase().indexOf(term) !== -1 ||
        s.studentNo.toLowerCase().indexOf(term) !== -1 ||
        String(s.section || "").toLowerCase().indexOf(term) !== -1;
      return matchesTerm && (status === "all" || s.status === status);
    });
  }

  function netText(s) {
    if (s.status === "submitted" || s.status === "auto-submitted") return "Finished";
    if (!s.online) return "Offline";
    return "Online" + (s.pingMs !== null ? " · " + s.pingMs + " ms" : "");
  }

  function tileHtml(s) {
    return (
      '<button type="button" class="monitor-tile' + (s.id === selectedId ? " is-selected" : "") +
      '" data-student="' + esc(s.id) + '">' +
      '<div class="monitor-tile__feed">' + esc(netText(s)) +
      (s.online ? '<span class="live-pill"><span class="dot"></span> LIVE</span>' : "") +
      (s.status === "auto-submitted" ? '<span class="auto-pill">AUTO-SUBMITTED</span>' : "") +
      "</div>" +
      '<div class="monitor-tile__body">' +
      '<p class="monitor-tile__name">' + esc(s.name) + "</p>" +
      '<p class="text-xs muted">' + esc(s.studentNo) + " · " + esc(s.section || "") + "</p>" +
      '<div class="progress"><div class="progress__bar" style="width:' + s.progress + '%"></div></div>' +
      '<div class="monitor-tile__foot">' +
      '<span class="badge badge--' + esc(s.status) + '">' + esc(s.status.replace("-", " ")) + "</span>" +
      '<span class="' + (s.violations ? "danger" : "muted") + '" style="font-weight:700">' +
      esc(s.violations) + "/" + threshold + "</span>" +
      "</div></div></button>"
    );
  }

  function findStudent(id) {
    for (var i = 0; i < students.length; i++) if (students[i].id === id) return students[i];
    return students[0] || null;
  }

  function renderDetail() {
    var s = findStudent(selectedId);
    if (!s) return;
    if (el("detailName")) el("detailName").textContent = s.name;
    if (el("detailMeta")) el("detailMeta").textContent = s.studentNo + " · " + (s.section || "");
    if (el("detailProgress")) el("detailProgress").textContent = s.progress + "%";
    if (el("detailViolations")) el("detailViolations").textContent = s.violations + "/" + threshold;
    if (el("detailFlag")) el("detailFlag").textContent = s.lastFlag;
  }

  function renderModal() {
    var s = findStudent(selectedId);
    var body = el("studentModalBody");
    if (!body || !s) return;
    var live = s.status === "in-progress" || s.status === "flagged";
    body.innerHTML =
      '<h3 class="mt-6">' + esc(s.name) + "</h3>" +
      '<p class="text-xs muted">' + esc(s.studentNo) + " · " + esc(s.section || "") + " · " + esc(s.exam) + "</p>" +
      '<dl class="detail-list">' +
      "<div><dt>Progress</dt><dd>" + esc(s.progress) + "%</dd></div>" +
      "<div><dt>Violations</dt><dd>" + esc(s.violations) + "/" + threshold + "</dd></div>" +
      '<div><dt>Status</dt><dd class="capitalize">' + esc(s.status.replace("-", " ")) + "</dd></div>" +
      "<div><dt>Connection</dt><dd>" + esc(netText(s)) + "</dd></div>" +
      "<div><dt>Last flag</dt><dd>" + esc(s.lastFlag) + "</dd></div>" +
      (s.reopened ? "<div><dt>Re-opened</dt><dd>" + esc(s.reopened) + (s.reopened === 1 ? " time" : " times") + "</dd></div>" : "") +
      "</dl>" +
      '<div class="btn-row mt-6">' +
      '<button type="button" class="btn btn--primary" id="btnWarn"' + (live ? "" : " disabled") + ">Send warning</button>" +
      '<button type="button" class="btn btn--danger" id="btnForce"' + (live ? "" : " disabled") + ">Force submit</button>" +
      "</div>" +
      (s.status === "auto-submitted"
        ? '<div class="reopen-box mt-6">' +
          '<p class="text-sm"><b>This exam was auto-submitted.</b> Re-opening gives ' + esc(s.name) + " a fresh attempt with the full exam time. " +
          "The earlier answers are cleared and the violations move to the audit history.</p>" +
          '<button type="button" class="btn btn--gold" id="btnReopen">Re-open exam for this student</button></div>'
        : "");

    var warn = el("btnWarn"), force = el("btnForce"), reopen = el("btnReopen");
    if (reopen) reopen.addEventListener("click", function () {
      if (!window.confirm("Re-open the exam for " + s.name + "?\n\nThey can start again with the full time and a clean violation count. Their previous answers are cleared; the old violations stay in the history.")) return;
      reopen.disabled = true;
      API.post("monitor.php", { action: "reopen", submission_id: s.id })
        .then(function () { closeModal("studentModal"); refresh(); })
        .catch(function (e) { reopen.disabled = false; window.alert(e.message); });
    });
    if (warn) warn.addEventListener("click", function () {
      var msg = window.prompt("Warning message to show the student:", "Please keep your eyes on the screen and stay on the exam page.");
      if (!msg) return;
      API.post("monitor.php", { action: "warn", submission_id: s.id, message: msg })
        .then(function () { window.alert("Warning sent. It appears on the student's screen within a few seconds."); })
        .catch(function (e) { window.alert(e.message); });
    });
    if (force) force.addEventListener("click", function () {
      if (!window.confirm("Force-submit " + s.name + "'s exam now? This cannot be undone.")) return;
      API.post("monitor.php", { action: "force_submit", submission_id: s.id })
        .then(function () { closeModal("studentModal"); refresh(); })
        .catch(function (e) { window.alert(e.message); });
    });
  }

  function renderGrid() {
    var grid = el("monitorGrid");
    if (!grid) return;

    var rows = visibleStudents();
    grid.innerHTML = rows.length
      ? rows.map(tileHtml).join("")
      : '<p class="muted text-sm">' + (students.length ? "No examinee matches this search." : "No students have started this exam yet.") + "</p>";

    var tiles = grid.querySelectorAll("[data-student]");
    for (var i = 0; i < tiles.length; i++) {
      (function (tile) {
        tile.addEventListener("click", function () {
          selectedId = Number(tile.getAttribute("data-student"));
          renderGrid(); renderDetail(); renderModal();
          openModal("studentModal");
        });
      })(tiles[i]);
    }
  }

  function renderAlerts(alerts) {
    var feed = el("monitorAlerts");
    if (!feed) return;
    feed.innerHTML = alerts.length ? alerts.map(function (a) {
      return (
        '<li class="alert-item">' +
        '<p class="alert-item__name">' + esc(a.student) + "</p>" +
        '<p class="alert-item__meta">' + esc(a.type) + "</p>" +
        '<p class="alert-item__time">' + esc(a.time) + "</p></li>"
      );
    }).join("") : '<li class="muted text-sm">No alerts yet.</li>';
  }

  function refresh() {
    return API.get("monitor.php" + (examId ? "?exam_id=" + encodeURIComponent(examId) : "")).then(function (r) {
      students = r.students;
      if (r.exam) {
        threshold = Number(r.exam.violation_threshold);
        var sel = el("monitorExam");
        if (sel && sel.value !== String(r.exam.id)) sel.value = String(r.exam.id);
        if (el("monitorSubtitle")) el("monitorSubtitle").textContent = r.exam.code + " " + r.exam.title + " · " + r.exam.status + " · auto-submit at " + threshold + " violations";
      } else if (el("monitorSubtitle")) {
        el("monitorSubtitle").textContent = "No examination selected.";
      }
      if (selectedId === null && students.length) selectedId = students[0].id;
      renderGrid(); renderDetail(); renderAlerts(r.alerts);
      if (!el("studentModal") || el("studentModal").hidden) return;
      renderModal();
    }).catch(function () {});
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!el("monitorGrid")) return;
    var search = el("monitorSearch");
    if (search) search.addEventListener("input", renderGrid);
    var status = el("monitorStatus");
    if (status) status.addEventListener("change", renderGrid);

    var examSel = el("monitorExam");
    if (examSel) examSel.addEventListener("change", function () {
      examId = examSel.value; selectedId = null; students = [];
      refresh();
    });

    Session.ready.then(function () {
      if (examSel) API.get("exam.php?action=list").then(function (r) {
        examSel.innerHTML = r.exams.length ? r.exams.slice().reverse().map(function (e) {
          return '<option value="' + esc(e.id) + '">' + esc(e.code) + " · " + esc(e.title) + " (" + esc(e.status) + ")</option>";
        }).join("") : '<option value="">No examinations</option>';
        if (examId) examSel.value = examId;
      }).catch(function () {});
      refresh();
      window.setInterval(refresh, 3000);
    });
  });
})();
