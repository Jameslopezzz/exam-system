# EXAM System - PHP / MySQL / face-api.js build

## 1. Setup (XAMPP)
1. Copy this folder to `C:\xampp\htdocs\exam-system` and start **Apache** + **MySQL** in the XAMPP control panel.
2. Open http://localhost/phpmyadmin -> **Import** -> choose `sql/schema.sql` -> Go.
3. Import `sql/seed.sql` the same way (demo accounts + the IT 401 exam with its answer key).
   *Upgrading an older install?* Import `sql/migrate_v2.sql` instead of `schema.sql` - it keeps your data.
4. If your MySQL root has a password, edit `api/config.php`.
5. Open **http://localhost/exam-system/** (use `localhost`, not a file:// path - the camera and sessions need http).

Demo accounts (PIN for all: `password` - change them from the Admin page):

| Role | Account No |
|---|---|
| Admin | ADMIN01 |
| Professor | PROF001 |
| Student | 23151159, 23151250, 23151223, 23151216, 23151179 |

## 2. What was added
| Area | Files |
|---|---|
| Database | `sql/schema.sql`, `sql/seed.sql` (users, exams, questions, submissions, answers, violations) |
| Login + roles | `api/auth.php`, `js/api.js` (page guard), `js/login.js`, bcrypt hashes, session, 5-try lockout |
| Face + gaze detection | `js/detection.js`, `js/vendor/face-api.js`, `models/` (bundled, works offline) |
| Violation logger / auto-submit | `api/violation.php` (server counts strikes and force-submits at the threshold) |
| Auto-grading | `api/submit.php` + `finalize_submission()` in `api/bootstrap.php` |
| Live monitor | `api/monitor.php` (poll every 3 s, Send warning, Force submit) |
| Network status bar | `api/ping.php` + header indicator in `student-exam.html` |
| Reports + CSV export | `api/report.php`, `api/export.php` (scores and violation log), `professor-reports.html` |
| Exam Builder | saves exams with rules, threshold and answer keys (`api/exam.php?action=save`) |
| Student/User manager | `admin-dashboard.html`, `api/users.php` |

## 2b. Admin console, departments, sign-up approval, school years
| Feature | Where |
|---|---|
| Admin has full access (accounts, departments, school years, and all professor pages: exams, monitoring, builder, reports) | `admin-dashboard.html` + menu |
| Departments (CITCS, CAS, CBA, CCJ, COA preloaded) with their programs; admin sees every professor per department | Admin Console > Departments, `api/departments.php` |
| Sign-up for students / professors; stays *pending* until an admin approves it | `index.html` > "Create an account", Admin Console > Approvals |
| Existing account number -> sign-up is rejected automatically | `api/auth.php?action=signup` (also guarded by the UNIQUE key) |
| Account forms: department for professors; department + course + year level (First, Second, Third, Fourth, Fifth, Irregular) for students | sign-up page and Admin > New account |
| Admin can edit any account (name, number, role, department, course, year), plus disable / reset PIN | Admin Console > Accounts > Edit |
| School years: when the end date passes, every approved student moves up one year level once. Irregular students are skipped; students already in their program's last year are marked *Graduated* | Admin Console > School Year, `api/school_year.php` |

Notes:
- The promotion runs automatically the next time anyone signs in or the admin opens the console after the end date (no cron job needed). *End now & promote* does it on demand.
- A school year added with an end date already in the past is stored as history and does **not** promote students.
- Only *pending / rejected* sign-up requests can be deleted; approved accounts are disabled instead.
- Admins cannot take part in exams, so the student pages remain student-only.

## 2c. Profile, exam sections, delete / re-open exams, dark mode (v3)
*Upgrading?* Nothing to import: the app adds the new tables/columns to an older database automatically the first time anyone signs in (`ensure_schema()` in `api/bootstrap.php`). `sql/migrate_v3.sql` is kept only for manual upgrades. Fresh installs: `schema.sql` already has everything.

| Feature | Where |
|---|---|
| **My Profile** for every role - click your name in the header > *My profile* (also has Sign out, Change PIN and the dark-mode switch) | `profile.html`, `js/profile.js`, `api/profile.php` |
| Professor profile: account info + every exam they created, grouped **Draft / Scheduled / Available / Closed** | profile page |
| Student profile: account info + their examinations (available, upcoming, completed, auto-submitted, closed) with scores and violations | profile page |
| Admin profile: account info + system overview (accounts, approvals, exams, submissions, violations, departments, school year, recent exams/accounts) | profile page |
| Change PIN (asks for the current PIN) | `api/auth.php?action=change_pin` |
| **Sections per exam**: while creating an exam choose *All sections* or only selected ones (pick existing sections or type a new one). Students outside the chosen sections cannot see or start the exam. A **Sections** button on each exam edits it later | Exam Builder, `exam_sections` table, `api/exam.php` |
| **Delete exam** (red button on each exam; asks for confirmation; removes questions, submissions, answers and violations) | Exam Builder, `api/exam.php?action=delete` |
| **Re-open an auto-submitted exam**: Live Monitoring > click the student > *Re-open exam for this student*. The student gets a fresh attempt with the full time; old answers are cleared and old violations are kept in `violation_history`. The exam must be *Available* | `api/monitor.php` (action `reopen`) |
| Live Monitoring now has an exam selector (also reachable via the *Monitor* button in the Exam Builder) | `professor-monitoring.html` |
| **Dark mode**: switch in the account menu / profile page (toggle button on the sign-in and exam pages). Remembered per device; follows the OS setting until you choose | `js/theme.js`, `css/style.css` |

Notes:
- An exam with no section rows is open to every section (same as before).
- Sections come from the free-text *Section* field of student accounts (e.g. `BSIT-4F`).
- Also fixed: `.btn--primary` was never defined in the CSS, so primary buttons looked unstyled.

## 3. Detection notes (tune during alpha testing)
- All analysis runs in the student's browser; no video is uploaded.
- The first ~5 seconds are **calibration** (student looks at the screen). Later head-turn / gaze are compared with that baseline.
- A condition must last 2.5 s (4 s for "no face") and each type has a 10 s cooldown. Constants are at the top of `js/detection.js`.
- Eye gaze is estimated from the iris position inside each eye contour, so it needs a reasonably lit, front-facing webcam. Expect false positives with glasses glare or very low light.
- Demo without a camera: open `student-exam.html?exam=1&demo=1` to show manual trigger buttons.

## 4. Known limits
- Essay questions are stored but there is no grading screen yet; the Percent column treats pending essays as 0.
- The monitor shows connection status and flags, not a live video feed (that needs WebRTC/streaming).
- Question media in the builder accepts picture/video links only (no file upload). Tables/charts exist only in the seeded exam.
- Change all demo PINs and the DB password before real use, and serve over HTTPS in production.
