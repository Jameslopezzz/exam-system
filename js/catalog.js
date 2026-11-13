/* Departments / programs / year levels for the account forms (sign-up page and admin page). */
var Catalog = (function () {
  var data = null;

  function load() {
    if (data) return Promise.resolve(data);
    return API.get("auth.php?action=catalog").then(function (r) { data = r; return r; });
  }
  function opts(items, placeholder) {
    return '<option value="">' + esc(placeholder) + "</option>" + items.map(function (i) {
      return '<option value="' + esc(i.value) + '">' + esc(i.label) + "</option>";
    }).join("");
  }
  function fillDepartments(select) {
    select.innerHTML = opts(data.departments.map(function (d) { return { value: d.id, label: d.code + " - " + d.name }; }), "Select department");
  }
  function fillPrograms(select, deptId) {
    var list = data.programs.filter(function (p) { return String(p.department_id) === String(deptId); });
    select.innerHTML = opts(list.map(function (p) { return { value: p.id, label: p.code + " - " + p.name }; }),
      deptId ? "Select course" : "Select a department first");
    select.disabled = !deptId;
  }
  function fillYears(select) {
    select.innerHTML = opts(data.year_levels.map(function (y) { return { value: y, label: y }; }), "Select year level");
  }
  /* Wire a department select to a program select so the courses always match the department. */
  function link(deptSel, progSel) {
    fillDepartments(deptSel);
    fillPrograms(progSel, "");
    deptSel.addEventListener("change", function () { fillPrograms(progSel, deptSel.value); });
  }
  return { load: load, link: link, fillYears: fillYears, fillPrograms: fillPrograms, fillDepartments: fillDepartments, refresh: function () { data = null; return load(); } };
})();
