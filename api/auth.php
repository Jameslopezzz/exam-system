<?php
require_once __DIR__ . '/bootstrap.php';
$action = $_GET['action'] ?? '';

if ($action === 'catalog') {   // public: departments + programs for the sign-up form
    $pdo = db();
    json_out(['departments' => $pdo->query('SELECT id, code, name FROM departments ORDER BY code')->fetchAll(),
              'programs' => $pdo->query('SELECT id, department_id, code, name FROM programs ORDER BY code')->fetchAll(),
              'year_levels' => YEAR_LEVELS]);
}

if ($action === 'me') {
    run_school_year_rollover();
    $u = current_user();
    if (!$u) json_out(['error' => 'Not signed in.'], 401);
    json_out(['user' => $u]);
}

require_post();

if ($action === 'login') {
    $d = body();
    $acct = trim((string)($d['account_no'] ?? ''));
    $pass = (string)($d['password'] ?? '');
    if ($acct === '' || $pass === '') json_out(['error' => 'Enter your account number and PIN.'], 422);

    // Simple brute-force throttle: 5 failures per session -> 30s lock.
    $_SESSION['fails'] = $_SESSION['fails'] ?? 0;
    if (($_SESSION['lock_until'] ?? 0) > time()) json_out(['error' => 'Too many attempts. Try again shortly.'], 429);

    $st = db()->prepare('SELECT u.*, d.code AS dept_code FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.account_no = ?');
    $st->execute([$acct]);
    $u = $st->fetch();
    if (!$u || !password_verify($pass, $u['password_hash'])) {
        if (++$_SESSION['fails'] >= 5) { $_SESSION['lock_until'] = time() + 30; $_SESSION['fails'] = 0; }
        json_out(['error' => 'Invalid account number or PIN.'], 401);
    }
    // Credentials are correct - now tell the person why they cannot get in.
    if ($u['approval_status'] === 'pending') json_out(['error' => 'Your account is waiting for administrator approval. Please try again later.'], 403);
    if ($u['approval_status'] === 'rejected') json_out(['error' => 'Your sign-up request was rejected. Please contact the administrator.'], 403);
    if (!(int)$u['is_active']) json_out(['error' => 'This account is disabled. Please contact the administrator.'], 403);
    run_school_year_rollover();
    session_regenerate_id(true);
    $_SESSION['fails'] = 0;
    $_SESSION['user'] = ['id' => (int)$u['id'], 'account_no' => $u['account_no'],
                         'name' => $u['full_name'], 'section' => $u['section'], 'role' => $u['role'],
                         'department' => $u['dept_code']];
    $home = ['student' => 'student-dashboard.html', 'professor' => 'professor-dashboard.html', 'admin' => 'admin-dashboard.html'][$u['role']];
    json_out(['user' => $_SESSION['user'], 'redirect' => $home]);
}

if ($action === 'signup') {
    // Students and professors can request an account; an admin must approve it before it works.
    $d = body();
    $role = (string)($d['role'] ?? '');
    $acct = trim((string)($d['account_no'] ?? ''));
    $name = trim((string)($d['full_name'] ?? ''));
    $pass = (string)($d['password'] ?? '');
    if (!in_array($role, ['student', 'professor'], true)) json_out(['error' => 'Choose whether you are a student or a professor.'], 422);
    if (!preg_match('/^[A-Za-z0-9_-]{3,30}$/', $acct)) json_out(['error' => 'Account number must be 3-30 letters, numbers, dash or underscore.'], 422);
    if ($name === '' || strlen($name) > 120) json_out(['error' => 'Enter your full name.'], 422);
    if (strlen($pass) < 6) json_out(['error' => 'PIN must be at least 6 characters.'], 422);
    if ($pass !== (string)($d['confirm_password'] ?? '')) json_out(['error' => 'The two PINs do not match.'], 422);
    $aff = validate_affiliation($role, $d);
    if (is_string($aff)) json_out(['error' => $aff], 422);

    $pdo = db();
    $dup = $pdo->prepare('SELECT 1 FROM users WHERE account_no = ?');
    $dup->execute([$acct]);
    $reject = ['error' => 'Request rejected: an account with this account number already exists.', 'rejected' => true];
    if ($dup->fetch()) json_out($reject, 409);
    try {
        $pdo->prepare('INSERT INTO users (account_no, full_name, section, role, department_id, program_id, year_level, approval_status, password_hash)
                       VALUES (?,?,?,?,?,?,?,\'pending\',?)')
            ->execute([$acct, cut($name, 120), $role === 'student' ? (cut(trim((string)($d['section'] ?? '')), 30) ?: null) : null,
                       $role, $aff[0], $aff[1], $aff[2], password_hash($pass, PASSWORD_DEFAULT)]);
    } catch (PDOException $e) { json_out($reject, 409); }   // lost a race with another sign-up
    json_out(['ok' => true, 'message' => 'Sign-up submitted. You can sign in once an administrator approves your account.']);
}

if ($action === 'change_pin') {
    $u = require_role('student', 'professor', 'admin');
    $d = body();
    $cur = (string)($d['current_password'] ?? '');
    $new = (string)($d['new_password'] ?? '');
    if (strlen($new) < 6) json_out(['error' => 'The new PIN must be at least 6 characters.'], 422);
    if ($new !== (string)($d['confirm_password'] ?? '')) json_out(['error' => 'The two new PINs do not match.'], 422);
    $st = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
    $st->execute([$u['id']]);
    $hash = $st->fetchColumn();
    if (!$hash || !password_verify($cur, $hash)) json_out(['error' => 'Your current PIN is incorrect.'], 403);
    if (hash_equals($cur, $new)) json_out(['error' => 'Choose a PIN that is different from the current one.'], 422);
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    json_out(['ok' => true, 'message' => 'Your PIN was changed.']);
}

if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    json_out(['ok' => true]);
}

json_out(['error' => 'Unknown action.'], 400);
