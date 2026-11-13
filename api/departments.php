<?php
// Admin: departments, their programs, and the professors / students in each department.
require_once __DIR__ . '/bootstrap.php';
require_role('admin');
$pdo = db();
$action = $_GET['action'] ?? 'list';

if ($action === 'list') {
    $depts = $pdo->query("SELECT d.id, d.code, d.name,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'professor' AND u.approval_status = 'approved') AS professors,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'student'   AND u.approval_status = 'approved') AS students
        FROM departments d ORDER BY d.code")->fetchAll();
    $progs = $pdo->query("SELECT p.id, p.department_id, p.code, p.name, p.years,
        (SELECT COUNT(*) FROM users u WHERE u.program_id = p.id) AS students FROM programs p ORDER BY p.code")->fetchAll();
    json_out(['departments' => $depts, 'programs' => $progs]);
}

if ($action === 'professors') {   // every professor in one department
    $st = $pdo->prepare("SELECT id, account_no, full_name, is_active, approval_status,
        (SELECT COUNT(*) FROM exams e WHERE e.professor_id = users.id) AS exams
        FROM users WHERE role = 'professor' AND department_id = ? ORDER BY full_name");
    $st->execute([(int)($_GET['department_id'] ?? 0)]);
    json_out(['professors' => $st->fetchAll()]);
}

require_post();
$d = body();
$code = strtoupper(trim((string)($d['code'] ?? '')));
$name = trim((string)($d['name'] ?? ''));

function check_code_name(string $code, string $name): void {
    if (!preg_match('/^[A-Z0-9_-]{2,20}$/', $code)) json_out(['error' => 'Code must be 2-20 letters or numbers (e.g. CITCS).'], 422);
    if ($name === '' || strlen($name) > 150) json_out(['error' => 'Enter a name.'], 422);
}

if ($action === 'create_department') {
    check_code_name($code, $name);
    try { $pdo->prepare('INSERT INTO departments (code, name) VALUES (?,?)')->execute([$code, $name]); }
    catch (PDOException $e) { json_out(['error' => 'A department with that code already exists.'], 409); }
    json_out(['ok' => true]);
}
if ($action === 'update_department') {
    check_code_name($code, $name);
    try { $pdo->prepare('UPDATE departments SET code = ?, name = ? WHERE id = ?')->execute([$code, $name, (int)($d['id'] ?? 0)]); }
    catch (PDOException $e) { json_out(['error' => 'A department with that code already exists.'], 409); }
    json_out(['ok' => true]);
}
if ($action === 'delete_department') {
    try { $pdo->prepare('DELETE FROM departments WHERE id = ?')->execute([(int)($d['id'] ?? 0)]); }
    catch (PDOException $e) { json_out(['error' => 'This department still has programs or accounts. Remove or move them first.'], 409); }
    json_out(['ok' => true]);
}
if ($action === 'create_program') {
    check_code_name($code, $name);
    $years = max(1, min(5, (int)($d['years'] ?? 4)));
    try { $pdo->prepare('INSERT INTO programs (department_id, code, name, years) VALUES (?,?,?,?)')->execute([(int)($d['department_id'] ?? 0), $code, $name, $years]); }
    catch (PDOException $e) { json_out(['error' => 'That program code already exists (or the department is invalid).'], 409); }
    json_out(['ok' => true]);
}
if ($action === 'delete_program') {
    try { $pdo->prepare('DELETE FROM programs WHERE id = ?')->execute([(int)($d['id'] ?? 0)]); }
    catch (PDOException $e) { json_out(['error' => 'Students are still enrolled in this program.'], 409); }
    json_out(['ok' => true]);
}
json_out(['error' => 'Unknown action.'], 400);
