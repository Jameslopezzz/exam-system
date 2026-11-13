<?php
// Admin: account manager (list, create, edit, approve / reject sign-ups, enable-disable, reset PIN, delete).
require_once __DIR__ . '/bootstrap.php';
$me = require_role('admin');
$pdo = db();
$action = $_GET['action'] ?? 'list';

if ($action === 'list') {
    run_school_year_rollover();
    $users = $pdo->query("SELECT u.id, u.account_no, u.full_name, u.section, u.role, u.department_id, u.program_id, u.year_level,
                                 u.graduated, u.approval_status, u.is_active, u.created_at,
                                 d.code AS dept_code, p.code AS program_code
                          FROM users u
                          LEFT JOIN departments d ON d.id = u.department_id
                          LEFT JOIN programs p ON p.id = u.program_id
                          ORDER BY FIELD(u.approval_status,'pending','approved','rejected'), u.role, u.full_name")->fetchAll();
    json_out(['users' => $users]);
}

require_post();
$d = body();

/** Validate the fields shared by create + update. Returns [account_no, name, role, section, dept, prog, year] or exits. */
function account_fields(array $d): array {
    $acct = trim((string)($d['account_no'] ?? '')); $name = trim((string)($d['full_name'] ?? ''));
    $role = (string)($d['role'] ?? '');
    if ($acct === '' || $name === '' || !in_array($role, ['student', 'professor', 'admin'], true)) json_out(['error' => 'Account number, name and role are required.'], 422);
    if (!preg_match('/^[A-Za-z0-9_-]{3,30}$/', $acct)) json_out(['error' => 'Account number must be 3-30 letters, numbers, dash or underscore.'], 422);
    $aff = validate_affiliation($role, $d);
    if (is_string($aff)) json_out(['error' => $aff], 422);
    $section = $role === 'student' ? (cut(trim((string)($d['section'] ?? '')), 30) ?: null) : null;
    return [$acct, cut($name, 120), $role, $section, $aff[0], $aff[1], $aff[2]];
}

if ($action === 'create') {
    [$acct, $name, $role, $section, $dept, $prog, $year] = account_fields($d);
    $pass = (string)($d['password'] ?? '');
    if (strlen($pass) < 6) json_out(['error' => 'PIN must be at least 6 characters.'], 422);
    try {
        $pdo->prepare("INSERT INTO users (account_no, full_name, section, role, department_id, program_id, year_level, approval_status, password_hash)
                       VALUES (?,?,?,?,?,?,?,'approved',?)")
            ->execute([$acct, $name, $section, $role, $dept, $prog, $year, password_hash($pass, PASSWORD_DEFAULT)]);
    } catch (PDOException $e) { json_out(['error' => 'That account number already exists.'], 409); }
    json_out(['ok' => true]);
}

if ($action === 'update') {
    $id = (int)($d['id'] ?? 0);
    $st = $pdo->prepare('SELECT id, role FROM users WHERE id = ?'); $st->execute([$id]);
    $cur = $st->fetch();
    if (!$cur) json_out(['error' => 'Account not found.'], 404);
    [$acct, $name, $role, $section, $dept, $prog, $year] = account_fields($d);
    if ($id === $me['id'] && $role !== 'admin') json_out(['error' => 'You cannot remove your own admin role.'], 422);
    $graduated = $role === 'student' ? (int)!empty($d['graduated']) : 0;
    try {
        $pdo->prepare('UPDATE users SET account_no=?, full_name=?, section=?, role=?, department_id=?, program_id=?, year_level=?, graduated=? WHERE id=?')
            ->execute([$acct, $name, $section, $role, $dept, $prog, $year, $graduated, $id]);
    } catch (PDOException $e) { json_out(['error' => 'Another account already uses that account number.'], 409); }
    if ($id === $me['id']) { $_SESSION['user']['account_no'] = $acct; $_SESSION['user']['name'] = $name; }
    json_out(['ok' => true]);
}

if ($action === 'approve' || $action === 'reject') {
    $id = (int)($d['id'] ?? 0);
    $new = $action === 'approve' ? 'approved' : 'rejected';
    $st = $pdo->prepare("UPDATE users SET approval_status = ? WHERE id = ? AND approval_status = 'pending'");
    $st->execute([$new, $id]);
    if ($st->rowCount() === 0) json_out(['error' => 'That request is no longer pending.'], 409);
    json_out(['ok' => true]);
}

if ($action === 'toggle') {
    $id = (int)($d['id'] ?? 0);
    if ($id === $me['id']) json_out(['error' => 'You cannot disable your own account.'], 422);
    $pdo->prepare('UPDATE users SET is_active = 1 - is_active WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

if ($action === 'reset_pin') {
    $pass = (string)($d['password'] ?? '');
    if (strlen($pass) < 6) json_out(['error' => 'PIN must be at least 6 characters.'], 422);
    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), (int)($d['id'] ?? 0)]);
    json_out(['ok' => true]);
}

if ($action === 'delete') {   // only sign-up requests that were never approved
    $st = $pdo->prepare("DELETE FROM users WHERE id = ? AND approval_status IN ('pending','rejected')");
    $st->execute([(int)($d['id'] ?? 0)]);
    if ($st->rowCount() === 0) json_out(['error' => 'Only pending or rejected requests can be deleted. Disable the account instead.'], 422);
    json_out(['ok' => true]);
}
json_out(['error' => 'Unknown action.'], 400);
