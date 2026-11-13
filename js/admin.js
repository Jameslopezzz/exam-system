/* Admin console: accounts, sign-up approvals, departments, school years. */
var users = [];
var depts = [];
var programs = [];

function fail(e) { alert(e.message); }
function show(id, on) { var n = el(id); if (n) n.hidden = !on; }

/* ---------- Tabs ---------- */
function openTab(name) {
  ["accounts", "approvals", "departments", "schoolyear"].forEach(function (t) {
    show("tab-" + t, t === name);
  });
  [].forEach.call(document.querySelectorAll(".tab"), function (b) { b.classList.toggle("is-active", b.dataset.tab === name); });
  if (name === "schoolyear") loadSchoolYears();
}

/* ---------- Helpers for role-dependent fields ---------- */
function applyRole(role, prefix) {      // prefix "u" (new account form) or "e" (edit modal)
  var cls = prefix === "u" ? "u" : "e";
  [].forEach.call(document.querySelectorAll("." + cls + "-dept"), function (n) { n.hidden = role === "admin"; });
  [].forEach.call(document.querySelectorAll("." + cls + "-student"), function (n) { n.hidden = role !== "student"; });
}
function pill(text, kind) { return '<span class="pill pill--' + kind + '">' + esc(text) + "</span>"; }
function statusOf(u) {
  if (u.approval_status === "pending") return pill("Pending", "warn");
  if (u.approval_status === "rejected") return pill("Rejected", "bad");
  if (u.is_active != 1) return pill("Disabled", "bad");
  if (u.graduated == 1) return pill("Graduated", "ok");
  return pill("Active", "ok");
}

/* ---------- Load ---------- */
function loadUsers() {
  return API.get("users.php?action=list").then(function (r) {
    users = r.users;
    renderAccounts(); renderApprovals(); renderDepartments();
  }).catch(fail);
}
function loadDepartments() {
  return API.get("departments.php?action=list").then(function (r) {
    depts = r.departments; programs = r.programs;
    renderDepartments();
    fillDeptFilter();
    return Catalog.refresh().then(function () {      // keep the form drop-downs in step with added / renamed departments
      ["uDept", "eDept"].forEach(function (id) { var sel = el(id), v = sel.value; Catalog.fillDepartments(sel); sel.value = v; });
    });
  });
}
function reloadAll() { return Promise.all([loadDepartments(), loadUsers()]); }

/* ---------- Accounts ---------- */
function fillDeptFilter() {
  var sel = el("fDept"), cur = sel.value;
  sel.innerHTML = '<option value="">All departments</option>' + depts.map(function (d) { return '<option value="' + d.id + '">' + esc(d.code) + "</option>"; }).join("");
  sel.value = cur;
}
function renderAccounts() {
  var role = el("fRole").value, dept = el("fDept").value, q = el("fSearch").value.trim().toLowerCase();
  var rows = users.filter(function (u) {
    if (u.approval_status !== "approved") return false;
    if (role && u.role !== role) return false;
    if (dept && String(u.department_id) !== dept) return false;
    if (q && (u.full_name + " " + u.account_no).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
  el("userBody").innerHTML = rows.map(function (u) {
    return "<tr><td>" + esc(u.account_no) + "</td><td>" + esc(u.full_name) + "</td><td>" + esc(u.role) + "</td>" +
      "<td>" + esc(u.dept_code || "—") + "</td><td>" + esc(u.program_code || "—") + "</td>" +
      "<td>" + esc(u.year_level || "—") + (u.section ? " <span class='muted'>(" + esc(u.section) + ")</span>" : "") + "</td>" +
      "<td>" + statusOf(u) + "</td><td class='row-actions'>" +
      "<button class='btn btn--outline btn--sm' data-edit='" + u.id + "'>Edit</button> " +
      "<button class='btn btn--outline btn--sm' data-toggle='" + u.id + "'>" + (u.is_active == 1 ? "Disable" : "Enable") + "</button> " +
      "<button class='btn btn--outline btn--sm' data-reset='" + u.id + "'>Reset PIN</button></td></tr>";
  }).join("") || "<tr><td colspan='8' class='muted'>No accounts match.</td></tr>";
}

/* ---------- Approvals ---------- */
function renderApprovals() {
  var pending = users.filter(function (u) { return u.approval_status === "pending"; });
  var rejected = users.filter(function (u) { return u.approval_status === "rejected"; });
  var c = el("pendingCount"); c.textContent = pending.length; c.hidden = pending.length === 0;
  el("reqBody").innerHTML = pending.map(function (u) {
    return "<tr><td>" + esc(u.account_no) + "</td><td>" + esc(u.full_name) + "</td><td>" + esc(u.role) + "</td><td>" + esc(u.dept_code || "—") +
      "</td><td>" + esc(u.program_code || "—") + "</td><td>" + esc(u.year_level || "—") + "</td><td class='muted'>" + esc(u.created_at) + "</td>" +
      "<td class='row-actions'><button class='btn btn--primary btn--sm' data-approve='" + u.id + "'>Approve</button> " +
      "<button class='btn btn--danger btn--sm' data-reject='" + u.id + "'>Reject</button></td></tr>";
  }).join("");
  show("reqEmpty", pending.length === 0);
  el("rejBody").innerHTML = rejected.map(function (u) {
    return "<tr><td>" + esc(u.account_no) + "</td><td>" + esc(u.full_name) + "</td><td>" + esc(u.role) + "</td><td>" + esc(u.dept_code || "—") +
      "</td><td class='row-actions'><button class='btn btn--outline btn--sm' data-approve='" + u.id + "'>Approve anyway</button> " +
      "<button class='btn btn--danger btn--sm' data-del='" + u.id + "'>Delete</button></td></tr>";
  }).join("");
  show("rejEmpty", rejected.length === 0);
}

/* ---------- Departments ---------- */
function renderDepartments() {
  el("deptList").innerHTML = depts.map(function (d) {
    var progs = programs.filter(function (p) { return p.department_id == d.id; });
    var profs = users.filter(function (u) { return u.role === "professor" && u.department_id == d.id && u.approval_status === "approved"; });
    return '<section class="card dept-card"><div class="card__body">' +
      '<div class="dept-head"><div><h2 style="margin:0">' + esc(d.code) + ' <span class="muted" style="font-weight:400;font-size:.95rem">' + esc(d.name) + '</span></h2>' +
      '<p class="muted text-sm">' + profs.length + " professor(s) · " + d.students + " student(s)</p></div>" +
      '<div class="btn-row"><button class="btn btn--outline btn--sm" data-dedit="' + d.id + '">Edit</button>' +
      '<button class="btn btn--danger btn--sm" data-ddel="' + d.id + '">Delete</button></div></div>' +
      '<div class="dept-body"><div><h3>Professors</h3><ul class="plain-list">' +
      (profs.map(function (p) { return "<li><span>" + esc(p.full_name) + ' <span class="muted">' + esc(p.account_no) + "</span></span>" + (p.is_active == 1 ? "" : pill("Disabled", "bad")) + "</li>"; }).join("") || '<li class="muted">No professors yet.</li>') +
      '</ul></div><div><h3>Programs</h3><ul class="plain-list">' +
      (progs.map(function (p) { return "<li><span><b>" + esc(p.code) + "</b> " + esc(p.name) + ' <span class="muted">(' + p.years + " yrs, " + p.students + ' students)</span></span><button class="btn btn--danger btn--sm" data-pdel="' + p.id + '">Remove</button></li>'; }).join("") || '<li class="muted">No programs yet.</li>') +
      '</ul><form class="form-grid" data-progform="' + d.id + '" style="margin-top:.6rem;grid-template-columns:90px 1fr 70px auto">' +
      '<input class="input" name="code" placeholder="Code" maxlength="20" required /><input class="input" name="name" placeholder="Program name" required />' +
      '<input class="input" name="years" type="number" min="1" max="5" value="4" title="Years" /><button class="btn btn--outline btn--sm" type="submit">Add</button></form>' +
      "</div></div></div></section>";
  }).join("") || '<p class="muted">No departments yet.</p>';
}

/* ---------- School years ---------- */
function loadSchoolYears() {
  API.get("school_year.php?action=list").then(function (r) {
    el("syBody").innerHTML = r.school_years.map(function (s) {
      var status = s.is_current == 1 ? pill("Current", "ok") : (s.promoted == 1 ? pill("Ended · students promoted", "warn") : pill(s.start_date > r.today ? "Upcoming" : "Open", "warn"));
      var actions = "";
      if (s.promoted != 1 && s.start_date <= r.today) actions += "<button class='btn btn--outline btn--sm' data-syend='" + s.id + "'>End now &amp; promote</button> ";
      if (s.is_current != 1) actions += "<button class='btn btn--danger btn--sm' data-sydel='" + s.id + "'>Delete</button>";
      return "<tr><td><b>" + esc(s.label) + "</b></td><td>" + esc(s.start_date) + "</td><td>" + esc(s.end_date) + "</td><td>" + status + "</td><td class='row-actions'>" + actions + "</td></tr>";
    }).join("") || "<tr><td colspan='5' class='muted'>No school years yet.</td></tr>";
    loadUsers();   // promotion may have changed year levels
  }).catch(fail);
}

/* ---------- Edit modal ---------- */
function openEdit(id) {
  var u = users.filter(function (x) { return x.id == id; })[0];
  if (!u) return;
  el("eRole").value = u.role; el("eAcct").value = u.account_no; el("eName").value = u.full_name;
  el("eDept").value = u.department_id || "";
  Catalog.fillPrograms(el("eProg"), u.department_id || "");
  el("eProg").value = u.program_id || ""; el("eYear").value = u.year_level || "";
  el("eSection").value = u.section || ""; el("eGrad").checked = u.graduated == 1;
  el("eNote").textContent = ""; el("editForm").dataset.id = u.id;
  applyRole(u.role, "e"); openModal("editModal");
}

/* ---------- Wiring ---------- */
document.addEventListener("DOMContentLoaded", function () {
  Session.ready.then(function () {
    Catalog.load().then(function () {
      Catalog.link(el("uDept"), el("uProg")); Catalog.fillYears(el("uYear"));
      Catalog.link(el("eDept"), el("eProg")); Catalog.fillYears(el("eYear"));
      applyRole("student", "u");
    });
    reloadAll();

    [].forEach.call(document.querySelectorAll(".tab"), function (b) { b.onclick = function () { openTab(b.dataset.tab); }; });
    el("uRole").onchange = function () { applyRole(this.value, "u"); };
    el("eRole").onchange = function () { applyRole(this.value, "e"); };
    ["fRole", "fDept"].forEach(function (id) { el(id).onchange = renderAccounts; });
    el("fSearch").oninput = renderAccounts;

    el("userForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var role = el("uRole").value;
      API.post("users.php?action=create", {
        role: role, account_no: el("uAcct").value.trim(), full_name: el("uName").value.trim(),
        department_id: el("uDept").value, program_id: el("uProg").value, year_level: el("uYear").value,
        section: el("uSection").value.trim(), password: el("uPass").value
      }).then(function () { el("uNote").style.color = ""; el("uNote").textContent = "Account created."; el("userForm").reset(); Catalog.link(el("uDept"), el("uProg")); applyRole("student", "u"); loadDepartments(); loadUsers(); })
        .catch(function (e2) { el("uNote").style.color = "var(--destructive)"; el("uNote").textContent = e2.message; });
    });

    el("editForm").addEventListener("submit", function (e) {
      e.preventDefault();
      API.post("users.php?action=update", {
        id: +this.dataset.id, role: el("eRole").value, account_no: el("eAcct").value.trim(), full_name: el("eName").value.trim(),
        department_id: el("eDept").value, program_id: el("eProg").value, year_level: el("eYear").value,
        section: el("eSection").value.trim(), graduated: el("eGrad").checked
      }).then(function () { closeModal("editModal"); loadDepartments(); loadUsers(); })
        .catch(function (e2) { el("eNote").textContent = e2.message; });
    });

    el("deptForm").addEventListener("submit", function (e) {
      e.preventDefault();
      API.post("departments.php?action=create_department", { code: el("dCode").value, name: el("dName").value.trim() })
        .then(function () { el("dNote").style.color = ""; el("dNote").textContent = "Department added."; el("deptForm").reset(); loadDepartments(); })
        .catch(function (e2) { el("dNote").style.color = "var(--destructive)"; el("dNote").textContent = e2.message; });
    });

    el("syForm").addEventListener("submit", function (e) {
      e.preventDefault();
      API.post("school_year.php?action=create", { label: el("syLabel").value.trim(), start_date: el("syStart").value, end_date: el("syEnd").value })
        .then(function (r) { el("syNote").style.color = ""; el("syNote").textContent = r.historical ? "Added as a past school year (no promotion)." : "School year added."; el("syForm").reset(); loadSchoolYears(); })
        .catch(function (e2) { el("syNote").style.color = "var(--destructive)"; el("syNote").textContent = e2.message; });
    });

    // One click handler for every row button (the tables are re-rendered often).
    document.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var d = b.dataset;
      if (d.edit) return openEdit(d.edit);
      if (d.toggle) return API.post("users.php?action=toggle", { id: +d.toggle }).then(loadUsers).catch(fail);
      if (d.reset) {
        var p = prompt("New PIN (min 6 characters):"); if (!p) return;
        return API.post("users.php?action=reset_pin", { id: +d.reset, password: p }).then(function () { alert("PIN updated."); }).catch(fail);
      }
      if (d.approve) return API.post("users.php?action=approve", { id: +d.approve }).then(loadUsers).catch(function (er) { fail(er); loadUsers(); });
      if (d.reject) return API.post("users.php?action=reject", { id: +d.reject }).then(loadUsers).catch(function (er) { fail(er); loadUsers(); });
      if (d.del) { if (confirm("Delete this request permanently?")) API.post("users.php?action=delete", { id: +d.del }).then(loadUsers).catch(fail); return; }
      if (d.dedit) {
        var dep = depts.filter(function (x) { return x.id == d.dedit; })[0];
        var code = prompt("Department code:", dep.code); if (!code) return;
        var name = prompt("Department name:", dep.name); if (!name) return;
        return API.post("departments.php?action=update_department", { id: +d.dedit, code: code, name: name }).then(reloadAll).catch(fail);
      }
      if (d.ddel) { if (confirm("Delete this department?")) API.post("departments.php?action=delete_department", { id: +d.ddel }).then(reloadAll).catch(fail); return; }
      if (d.pdel) { if (confirm("Remove this program?")) API.post("departments.php?action=delete_program", { id: +d.pdel }).then(reloadAll).catch(fail); return; }
      if (d.syend) { if (confirm("End this school year today and move all students up one year level now? This cannot be undone.")) API.post("school_year.php?action=end_now", { id: +d.syend }).then(function (r) { alert(r.promoted + " student(s) promoted."); loadSchoolYears(); }).catch(fail); return; }
      if (d.sydel) { if (confirm("Delete this school year?")) API.post("school_year.php?action=delete", { id: +d.sydel }).then(loadSchoolYears).catch(fail); return; }
    });
    document.addEventListener("submit", function (e) {
      var f = e.target; if (!f.dataset || !f.dataset.progform) return;
      e.preventDefault();
      API.post("departments.php?action=create_program", { department_id: +f.dataset.progform, code: f.code.value, name: f.name.value.trim(), years: +f.years.value })
        .then(reloadAll).catch(fail);
    });
  });
});
