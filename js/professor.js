/* =========================================================
   Professor pages: dashboard, exam builder, reports (all API-driven)
   ========================================================= */

function alertItemHtml(a) {
  return (
    '<li class="alert-item alert-item--' + esc(a.severity) + '">' +
    '<p class="alert-item__name">' + esc(a.student) + "</p>" +
    '<p class="alert-item__meta">' + esc(a.type) + "</p>" +
    '<p class="alert-item__time">' + esc(a.time) + "</p>" +
    "</li>"
  );
}

/* ---------- dashboard ---------- */

function renderProfessorDashboard() {
  var roster = el("sessionRoster");
  if (!roster) return;

  function load() {
    API.get("monitor.php").then(function (r) {
      var list = r.students;
      if (el("statTaking")) el("statTaking").textContent = String(list.filter(function (s) { return s.status === "in-progress" || s.status === "flagged"; }).length);
      if (el("statFlagged")) el("statFlagged").textContent = String(list.filter(function (s) { return s.violations > 0; }).length);
      if (el("statAuto")) el("statAuto").textContent = String(list.filter(function (s) { return s.status === "auto-submitted"; }).length);
      if (el("statDone")) el("statDone").textContent = String(list.filter(function (s) { return s.status === "submitted" || s.status === "auto-submitted"; }).length);
      if (el("dashSubtitle")) el("dashSubtitle").textContent = r.exam
        ? r.exam.code + " · " + r.exam.title + " · " + r.exam.status
        : "No examination yet. Create one in the Exam Builder.";

      roster.innerHTML = list.length ? list.map(function (s) {
        return (
          '<li class="row-between">' +
          '<div><p style="font-weight:600">' + esc(s.name) + "</p>" +
          '<p class="text-xs muted">' + esc(s.studentNo) + " · " + esc(s.section || "") + "</p></div>" +
          '<div style="display:flex;align-items:center;gap:1rem;font-size:0.75rem">' +
          '<span class="muted">' + esc(s.progress) + "% done</span>" +
          '<span class="' + (s.violations ? "danger" : "muted") + '" style="font-weight:600">' +
          esc(s.violations) + " violation" + (s.violations === 1 ? "" : "s") + "</span>" +
          "</div></li>"
        );
      }).join("") : '<li class="muted text-sm">No active exam sessions.</li>';

      var feed = el("alertFeed");
      if (feed) feed.innerHTML = r.alerts.length ? r.alerts.map(alertItemHtml).join("") : '<li class="muted text-sm">No alerts yet.</li>';
    }).catch(function () {});
  }
  load();
  window.setInterval(load, 5000);
}

/* ---------- section picker (used when creating an exam and when editing its sections) ---------- */

var sectionCatalog = null;   // [{section, students, departments}] - loaded once

function loadSectionCatalog() {
  if (sectionCatalog) return Promise.resolve(sectionCatalog);
  return API.get("exam.php?action=sections").then(function (r) { sectionCatalog = r.sections; return sectionCatalog; })
    .catch(function () { sectionCatalog = []; return sectionCatalog; });
}

var pickerSeq = 0;

/* Builds "All sections / Only selected sections" controls inside `root`. */
function SectionPicker(root) {
  var uid = "secmode" + (++pickerSeq);
  var selected = [];   // section names ticked (includes custom ones)
  var mode = "all";

  root.innerHTML =
    '<div class="section-picker">' +
    '<label class="check"><input type="radio" name="' + uid + '" value="all" checked /> <span>All sections <span class="muted">(every student can take it)</span></span></label>' +
    '<label class="check"><input type="radio" name="' + uid + '" value="selected" /> <span>Only the sections I select</span></label>' +
    '<div class="section-picker__body" hidden>' +
    '<div class="section-picker__list" role="group" aria-label="Sections"></div>' +
    '<div class="section-picker__add"><input class="input" maxlength="30" placeholder="Add a section not listed, e.g. BSIT-4A" aria-label="Add a section" />' +
    '<button type="button" class="btn btn--outline btn--sm">Add</button></div>' +
    "</div></div>";

  var radios = root.querySelectorAll('input[type="radio"]');
  var body = root.querySelector(".section-picker__body");
  var list = root.querySelector(".section-picker__list");
  var addInput = root.querySelector(".section-picker__add input");
  var addBtn = root.querySelector(".section-picker__add button");

  function known() {
    var names = (sectionCatalog || []).map(function (c) { return c.section; });
    selected.forEach(function (n) { if (names.map(function (x) { return x.toLowerCase(); }).indexOf(n.toLowerCase()) === -1) names.push(n); });
    return names;
  }
  function info(name) {
    var c = (sectionCatalog || []).filter(function (x) { return x.section.toLowerCase() === name.toLowerCase(); })[0];
    return c ? c.students + (c.students === 1 ? " student" : " students") : "no students yet";
  }
  function has(name) { return selected.some(function (x) { return x.toLowerCase() === name.toLowerCase(); }); }

  function draw() {
    body.hidden = mode !== "selected";
    var names = known();
    list.innerHTML = names.length ? names.map(function (n) {
      return '<label class="check check--box"><input type="checkbox" value="' + esc(n) + '"' + (has(n) ? " checked" : "") + " /> " +
        "<span>" + esc(n) + ' <span class="muted text-xs">' + esc(info(n)) + "</span></span></label>";
    }).join("") : '<p class="muted text-sm">No sections found yet. Add one below.</p>';
    var boxes = list.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].addEventListener("change", function () {
        var v = this.value;
        selected = selected.filter(function (x) { return x.toLowerCase() !== v.toLowerCase(); });
        if (this.checked) selected.push(v);
      });
    }
  }

  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener("change", function () { mode = this.value; draw(); });
  }
  function addCustom() {
    var v = addInput.value.trim();
    if (!v) return;
    if (!has(v)) selected.push(v);
    addInput.value = "";
    draw();
  }
  addBtn.addEventListener("click", addCustom);
  addInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });

  loadSectionCatalog().then(draw);
  draw();

  return {
    /* names = [] means "all sections" */
    set: function (names) {
      selected = (names || []).slice();
      mode = selected.length ? "selected" : "all";
      for (var j = 0; j < radios.length; j++) radios[j].checked = radios[j].value === mode;
      draw();
    },
    /* [] = all sections, null = "only selected" chosen but nothing ticked */
    get: function () {
      if (mode === "all") return [];
      return selected.length ? selected.slice() : null;
    }
  };
}

/* ---------- exam builder ---------- */

var builderQuestions = [];

function statusOptions(current) {
  return ["draft", "scheduled", "available", "closed"].map(function (s) {
    return '<option value="' + s + '"' + (s === current ? " selected" : "") + ">" + s + "</option>";
  }).join("");
}

function sectionTags(sections) {
  if (!sections || !sections.length) return '<span class="tag tag--all">All sections</span>';
  return sections.map(function (x) { return '<span class="tag">' + esc(x) + "</span>"; }).join("");
}

function renderProfessorExams() {
  var list = el("examManagerList");
  if (!list) return;

  var exams = [];
  var newPicker = el("newExamSections") ? SectionPicker(el("newExamSections")) : null;
  var editPicker = el("editSectionsBox") ? SectionPicker(el("editSectionsBox")) : null;
  var editingId = null;

  function rowHtml(e) {
    var subs = Number(e.submissions) || 0, autos = Number(e.auto_submitted) || 0;
    return (
      '<li class="exam-row">' +
      '<div class="exam-row__main">' +
      '<p class="exam-row__title">' + esc(e.code) + " · " + esc(e.title) + ' <span class="badge badge--' + esc(e.status) + '">' + esc(e.status) + "</span></p>" +
      '<p class="text-xs muted">' + esc(e.duration_minutes) + " min · " + esc(e.items) + " items · threshold " + esc(e.violation_threshold) + " · " +
      subs + " submission" + (subs === 1 ? "" : "s") + (autos ? " (" + autos + " auto-submitted)" : "") + "</p>" +
      '<p class="exam-row__sections text-xs">' + '<span class="muted">Sections:</span> ' + sectionTags(e.sections) + "</p>" +
      "</div>" +
      '<div class="exam-row__actions">' +
      '<select class="select" data-exam-status="' + esc(e.id) + '" aria-label="Status of ' + esc(e.code) + '">' + statusOptions(e.status) + "</select>" +
      '<a class="btn btn--outline btn--sm" href="professor-monitoring.html?exam_id=' + esc(e.id) + '">Monitor</a>' +
      '<button type="button" class="btn btn--outline btn--sm" data-exam-sections="' + esc(e.id) + '">Sections</button>' +
      '<a class="btn btn--outline btn--sm" href="api/export.php?exam_id=' + esc(e.id) + '&type=scores">CSV</a>' +
      '<button type="button" class="btn btn--danger btn--sm" data-exam-delete="' + esc(e.id) + '">Delete</button>' +
      "</div></li>"
    );
  }

  function find(id) { return exams.filter(function (x) { return Number(x.id) === Number(id); })[0]; }

  function load() {
    return API.get("exam.php?action=list").then(function (r) {
      exams = r.exams;
      list.innerHTML = exams.length ? exams.map(rowHtml).join("") : '<li class="muted text-sm">No examinations yet. Click "New examination".</li>';

      var sels = list.querySelectorAll("[data-exam-status]");
      for (var i = 0; i < sels.length; i++) {
        (function (sel) {
          sel.addEventListener("change", function () {
            API.post("exam.php?action=set_status", { id: Number(sel.getAttribute("data-exam-status")), status: sel.value })
              .then(load)
              .catch(function (e) { window.alert(e.message); load(); });
          });
        })(sels[i]);
      }
      var del = list.querySelectorAll("[data-exam-delete]");
      for (var d = 0; d < del.length; d++) {
        (function (btn) { btn.addEventListener("click", function () { deleteExam(find(btn.getAttribute("data-exam-delete"))); }); })(del[d]);
      }
      var secs = list.querySelectorAll("[data-exam-sections]");
      for (var k = 0; k < secs.length; k++) {
        (function (btn) { btn.addEventListener("click", function () { openSections(find(btn.getAttribute("data-exam-sections"))); }); })(secs[k]);
      }
    }).catch(function (e) {
      list.innerHTML = '<li class="danger text-sm">Could not load your examinations: ' + esc(e.message) + "</li>";
    });
  }
  load();

  /* ----- delete ----- */
  function deleteExam(e) {
    if (!e) return;
    var subs = Number(e.submissions) || 0;
    var msg = 'Delete "' + e.code + " · " + e.title + '"?\n\n' +
      "This permanently removes the exam, its " + e.items + " question(s)" +
      (subs ? ", and " + subs + " student submission(s) together with their answers, scores and violation records" : "") + ". This cannot be undone." +
      (e.status === "available" ? "\n\nThe exam is available right now - students taking it will lose their session. To stop it but keep the results, set the status to Closed instead." : "");
    if (!window.confirm(msg)) return;
    API.post("exam.php?action=delete", { id: Number(e.id) })
      .then(load)
      .catch(function (err) { window.alert(err.message); });
  }

  /* ----- edit sections of an existing exam ----- */
  function openSections(e) {
    if (!e || !editPicker) return;
    editingId = e.id;
    el("editSectionsTitle").textContent = e.code + " · " + e.title;
    el("editSectionsNote").hidden = true;
    editPicker.set(e.sections || []);
    openModal("sectionsModal");
  }
  if (el("btnSaveSections")) el("btnSaveSections").addEventListener("click", function () {
    var chosen = editPicker.get();
    var n = el("editSectionsNote");
    if (chosen === null) { n.hidden = false; n.textContent = "Tick at least one section, or choose All sections."; return; }
    API.post("exam.php?action=set_sections", { id: Number(editingId), sections: chosen })
      .then(function () { closeModal("sectionsModal"); return load(); })
      .catch(function (err) { n.hidden = false; n.textContent = err.message; });
  });

  /* ----- create ----- */
  function note(msg, bad) {
    var n = el("builderNote");
    if (!n) return;
    n.hidden = false; n.textContent = msg; n.style.color = bad ? "var(--destructive)" : "";
  }

  function renderQList() {
    el("qCount").textContent = String(builderQuestions.length);
    el("qList").innerHTML = builderQuestions.map(function (q, i) {
      return '<li>' + esc(q.prompt.slice(0, 80)) + (q.prompt.length > 80 ? "…" : "") +
        ' <span class="muted">(' + (q.type === "essay" ? "essay" : "MC") + ", " + q.points + ' pts)</span> ' +
        '<button type="button" class="chip" data-remove-q="' + i + '">remove</button></li>';
    }).join("");
    var rm = el("qList").querySelectorAll("[data-remove-q]");
    for (var i = 0; i < rm.length; i++) {
      (function (b) {
        b.addEventListener("click", function () { builderQuestions.splice(Number(b.getAttribute("data-remove-q")), 1); renderQList(); });
      })(rm[i]);
    }
  }

  var typeSel = el("qType");
  if (typeSel) typeSel.addEventListener("change", function () {
    el("qChoices").style.display = typeSel.value === "essay" ? "none" : "grid";
  });

  var form = el("examBuilderForm");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var prompt = el("qPrompt").value.trim();
    if (!prompt) { note("Write the question prompt first.", true); return; }
    var q = { type: typeSel.value, prompt: prompt, points: Number(el("qPoints").value) || 1 };
    if (q.type === "multiple-choice") {
      var inputs = el("qChoices").querySelectorAll("[data-choice]");
      var correctIdx = Number(el("qChoices").querySelector('input[name="qCorrect"]:checked').value);
      q.choices = []; q.correct = null;
      for (var i = 0; i < inputs.length; i++) {
        var v = inputs[i].value.trim();
        if (!v) continue;
        q.choices.push(v);
        if (i === correctIdx) q.correct = v;
      }
      if (q.choices.length < 2 || q.correct === null) { note("Enter at least two choices and mark one as correct.", true); return; }
      var seen = {}, dup = false;
      q.choices.forEach(function (c) { var k = c.toLowerCase(); if (seen[k]) dup = true; seen[k] = true; });
      if (dup) { note("Two choices have the same text. Every choice must be different.", true); return; }
    }
    var kind = el("qMediaKind").value, src = el("qMediaSrc").value.trim();
    if (kind && src) q.media = { kind: kind, src: src, caption: "", alt: "Question media" };
    builderQuestions.push(q);
    el("qPrompt").value = ""; el("qMediaSrc").value = "";
    var ch = el("qChoices").querySelectorAll("[data-choice]");
    for (var k = 0; k < ch.length; k++) ch[k].value = "";
    renderQList();
    note("Question added (" + builderQuestions.length + " in this exam).");
  });

  function save(status) {
    var title = el("fTitle").value.trim(), code = el("fCode").value.trim();
    if (!title || !code) { note("Title and subject code are required.", true); return; }
    if (!builderQuestions.length) { note("Add at least one question.", true); return; }
    var sections = newPicker ? newPicker.get() : [];
    if (sections === null) { note("Tick at least one section, or choose All sections.", true); return; }
    function on(id) { return !!(el(id) && el(id).checked); }
    API.post("exam.php?action=save", {
      title: title, code: code, subject: el("fSubject").value.trim() || title,
      schedule: el("fSchedule").value, duration: Number(el("fDuration").value) || 45,
      threshold: Number(el("thresholdInput").value) || 3, status: status, sections: sections,
      rules: { requireCamera: on("ruleCamera"), faceAngle: on("ruleAngle"), eyeGaze: on("ruleGaze"),
               multiFace: on("ruleMulti"), copyPaste: on("ruleCopy"), tabSwitch: on("ruleTab") },
      questions: builderQuestions
    }).then(function () {
      builderQuestions = []; renderQList();
      form.reset();
      if (newPicker) newPicker.set([]);
      note("Exam saved as " + status + ".");
      closeModal("examModal");
      return load();
    }).catch(function (e) { note(e.message, true); });
  }
  if (el("btnPublish")) el("btnPublish").addEventListener("click", function () { save("available"); });
  if (el("btnDraft")) el("btnDraft").addEventListener("click", function () { save("draft"); });
}

/* ---------- reports ---------- */

function renderReports() {
  var body = el("reportBody");
  if (!body) return;

  function setExport(id) {
    el("exportScores").href = "api/export.php?exam_id=" + id + "&type=scores";
    el("exportViolations").href = "api/export.php?exam_id=" + id + "&type=violations";
  }

  function draw(r) {
    if (!r.exam) {
      body.innerHTML = '<tr><td colspan="7" class="muted">No data for this exam yet.</td></tr>';
      return;
    }
    setExport(r.exam.id);
    el("reportSubtitle").textContent = r.exam.code + " " + r.exam.title + " · summary and integrity records";
    var st = r.stats;
    el("statAvg").textContent = st.average === null ? "—" : st.average + "%";
    el("statPass").textContent = st.passingRate === null ? "—" : st.passingRate + "%";
    el("statLow").textContent = st.lowest === null ? "—" : st.lowest + "%";
    el("statViol").textContent = String(st.totalViolations);

    el("violationPie").innerHTML = r.violationsByType.length
      ? renderMedia({ kind: "pie-chart", data: r.violationsByType })
      : '<p class="muted text-sm">No violations recorded.</p>';

    var bins = Object.keys(r.scoreBins).map(function (k) { return { label: k, value: r.scoreBins[k] }; });
    el("scoreBars").innerHTML = bins.some(function (b) { return b.value > 0; })
      ? renderMedia({ kind: "bar-chart", data: bins })
      : '<p class="muted text-sm">No graded submissions yet.</p>';

    body.innerHTML = r.students.length ? r.students.map(function (s) {
      return (
        "<tr>" +
        '<td><p style="font-weight:600">' + esc(s.name) + "</p>" +
        '<p class="text-xs muted">' + esc(s.studentNo) + "</p></td>" +
        '<td class="muted">' + esc(s.section || "") + "</td>" +
        "<td>" + esc(s.progress) + "%</td>" +
        '<td class="' + (s.violations ? "danger" : "muted") + '" style="font-weight:600">' + esc(s.violations) + "</td>" +
        '<td class="muted">' + esc(s.lastFlag) + "</td>" +
        "<td>" + (s.score === null ? "—" : esc(s.score) + "%") + "</td>" +
        '<td class="muted capitalize">' + esc(s.status.replace("-", " ")) + "</td>" +
        "</tr>"
      );
    }).join("") : '<tr><td colspan="7" class="muted">No submissions yet.</td></tr>';
  }

  function load(id) {
    API.get("report.php" + (id ? "?exam_id=" + id : "")).then(draw).catch(function (e) {
      body.innerHTML = '<tr><td colspan="7" class="danger">' + esc(e.message) + "</td></tr>";
    });
  }

  API.get("exam.php?action=list").then(function (r) {
    var sel = el("reportExam");
    sel.innerHTML = r.exams.map(function (e) {
      return '<option value="' + esc(e.id) + '">' + esc(e.code) + " · " + esc(e.title) + "</option>";
    }).join("");
    sel.addEventListener("change", function () { load(sel.value); });
    load(sel.value || "");
  });
}

document.addEventListener("DOMContentLoaded", function () {
  Session.ready.then(function () {
    renderProfessorDashboard();
    renderProfessorExams();
    renderReports();
  });
});
