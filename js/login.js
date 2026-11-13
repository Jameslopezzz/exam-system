document.addEventListener("DOMContentLoaded", function () {
  // Already signed in? Skip the form.
  API.get("auth.php?action=me").then(function (r) {
    window.location.replace(Session.home[r.user.role]);
  }).catch(function () {});

  var form = document.getElementById("loginForm");
  var err = document.getElementById("loginError");
  var btn = document.getElementById("loginBtn");
  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    btn.disabled = true; btn.textContent = "Signing in…";
    API.post("auth.php?action=login", {
      account_no: document.getElementById("username").value.trim(),
      password: document.getElementById("password").value
    }).then(function (r) {
      window.location.href = r.redirect;
    }).catch(function (e2) {
      err.textContent = e2.message;
      btn.disabled = false; btn.textContent = "Sign in";
    });
  });

  /* ---------- Sign-up (needs admin approval) ---------- */
  var loginView = document.getElementById("loginView");
  var signupView = document.getElementById("signupView");
  var suForm = document.getElementById("signupForm");
  var msg = document.getElementById("signupMsg");
  var sBtn = document.getElementById("signupBtn");
  var role = document.getElementById("suRole");
  var dept = document.getElementById("suDept");
  var prog = document.getElementById("suProg");
  var year = document.getElementById("suYear");
  if (!suForm) return;

  function show(which) {
    loginView.hidden = which !== "login";
    signupView.hidden = which !== "signup";
  }
  function setMsg(text, ok) { msg.textContent = text; msg.style.color = ok ? "var(--success)" : "var(--destructive)"; }
  function syncRole() {
    var student = role.value === "student";
    [].forEach.call(document.querySelectorAll(".su-student"), function (n) { n.hidden = !student; });
    prog.required = year.required = student;
  }

  document.getElementById("showSignup").addEventListener("click", function (e) {
    e.preventDefault(); show("signup");
    Catalog.load().then(function () { Catalog.link(dept, prog); Catalog.fillYears(year); syncRole(); })
      .catch(function () { setMsg("Could not load departments. Is the server running?", false); });
  });
  document.getElementById("showLogin").addEventListener("click", function (e) { e.preventDefault(); show("login"); });
  role.addEventListener("change", syncRole);

  suForm.addEventListener("submit", function (e) {
    e.preventDefault();
    setMsg("", true);
    var p1 = document.getElementById("suPass").value, p2 = document.getElementById("suPass2").value;
    if (p1.length < 6) return setMsg("PIN must be at least 6 characters.", false);
    if (p1 !== p2) return setMsg("The two PINs do not match.", false);
    sBtn.disabled = true; sBtn.textContent = "Submitting…";
    API.post("auth.php?action=signup", {
      role: role.value,
      account_no: document.getElementById("suAcct").value.trim(),
      full_name: document.getElementById("suName").value.trim(),
      department_id: dept.value,
      program_id: role.value === "student" ? prog.value : null,
      year_level: role.value === "student" ? year.value : null,
      section: document.getElementById("suSection").value.trim(),
      password: p1, confirm_password: p2
    }).then(function (r) {
      suForm.reset(); syncRole(); Catalog.link(dept, prog);
      setMsg(r.message, true);
    }).catch(function (e2) { setMsg(e2.message, false); })
      .then(function () { sBtn.disabled = false; sBtn.textContent = "Submit for approval"; });
  });
});
