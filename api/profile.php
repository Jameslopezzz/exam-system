<?php
// "My profile" for every role: account information + role-specific overview.
//   professor -> the exams they created, grouped by draft / scheduled / available / closed
//   student   -> the examinations they can take, with their status and score
//   admin     -> system-wide information (accounts, approvals, departments, exams, integrity)
require_once __DIR__ . '/bootstrap.php';
$me = require_role('student', 'professor', 'admin');
$pdo = db();

$st = $pdo->prepare('SELECT u.id, u.account_no, u.full_name, u.section, u.role, u.year_level, u.graduated, u.approval_status,
                            u.is_active, u.created_at, d.code AS dept_code, d.name AS dept_name,
                            p.code AS program_code, p.name AS program_name
                     FROM users u
                     LEFT JOIN departments d ON d.id = u.department_id
                     LEFT JOIN programs p ON p.id = u.program_id
                     WHERE u.id = ?');
$st->execute([$me['id']]);
$u = $st->fetch();
if (!$u) json_out(['error' => 'Account not found.'], 404);

$account = [
    'account_no' => $u['account_no'], 'name' => $u['full_name'], 'role' => $u['role'],
    'department' => $u['dept_code'] ? ['code' => $u['dept_code'], 'name' => $u['dept_name']] : null,
    'program' => $u['program_code'] ? ['code' => $u['program_code'], 'name' => $u['program_name']] : null,
    'year_level' => $u['year_level'], 'section' => $u['section'], 'graduated' => (bool)$u['graduated'],
    'status' => !(int)$u['is_active'] ? 'Disabled' : ($u['approval_status'] === 'approved' ? ($u['graduated'] ? 'Graduated' : 'Active') : ucfirst($u['approval_status'])),
    'member_since' => $u['created_at'],
];
$out = ['account' => $account];

/* ------------------------------ professor ------------------------------ */
if ($u['role'] === 'professor') {
    $ex = $pdo->prepare("SELECT e.id, e.code, e.title, e.subject, e.status, e.scheduled_at, e.duration_minutes, e.violation_threshold, e.created_at,
          (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS items,
          (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id) AS submissions,
          (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id AND s.mode = 'auto') AS auto_submitted,
          (SELECT GROUP_CONCAT(es.section ORDER BY es.section SEPARATOR '|') FROM exam_sections es WHERE es.exam_id = e.id) AS sections
        FROM exams e WHERE e.professor_id = ? ORDER BY e.created_at DESC, e.id DESC");
    $ex->execute([$u['id']]);
    $exams = $ex->fetchAll();
    $counts = ['draft' => 0, 'scheduled' => 0, 'available' => 0, 'closed' => 0];
    foreach ($exams as &$e) {
        $counts[$e['status']]++;
        $e['sections'] = $e['sections'] !== null && $e['sections'] !== '' ? explode('|', $e['sections']) : [];
    }
    unset($e);
    $out['exams'] = $exams;
    $out['counts'] = $counts;
}

/* ------------------------------- student ------------------------------- */
if ($u['role'] === 'student') {
    $ex = $pdo->prepare("SELECT e.id, e.code, e.title, e.subject, e.status, e.scheduled_at, e.duration_minutes, pr.full_name AS professor,
          (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS items,
          s.mode AS sub_mode, s.auto_score, s.essay_score, s.max_score, s.submitted_at,
          (SELECT COUNT(*) FROM violations v WHERE v.submission_id = s.id) AS violations
        FROM exams e JOIN users pr ON pr.id = e.professor_id
        LEFT JOIN submissions s ON s.exam_id = e.id AND s.student_id = ?
        WHERE e.status <> 'draft'
          AND (NOT EXISTS (SELECT 1 FROM exam_sections es WHERE es.exam_id = e.id)
               OR EXISTS (SELECT 1 FROM exam_sections es WHERE es.exam_id = e.id AND es.section = ?))
        ORDER BY e.id DESC");
    $ex->execute([$u['id'], (string)$u['section']]);
    $counts = ['available' => 0, 'upcoming' => 0, 'in_progress' => 0, 'completed' => 0, 'auto_submitted' => 0, 'violations' => 0];
    $exams = [];
    foreach ($ex->fetchAll() as $e) {
        $done = $e['sub_mode'] !== null && $e['sub_mode'] !== 'in-progress';
        $state = $done ? ($e['sub_mode'] === 'auto' ? 'auto-submitted' : 'completed')
               : ($e['sub_mode'] === 'in-progress' ? 'in-progress'
               : ($e['status'] === 'available' ? 'available' : ($e['status'] === 'closed' ? 'missed' : 'upcoming')));
        if ($state === 'available') $counts['available']++;
        if ($state === 'upcoming') $counts['upcoming']++;
        if ($state === 'in-progress') { $counts['in_progress']++; $counts['available']++; }
        if ($done) $counts['completed']++;
        if ($state === 'auto-submitted') $counts['auto_submitted']++;
        $counts['violations'] += (int)$e['violations'];
        $score = null;
        if ($done && (int)$e['max_score'] > 0) {
            $score = ['points' => (int)$e['auto_score'] + (int)$e['essay_score'], 'max' => (int)$e['max_score'], 'essays_pending' => $e['essay_score'] === null];
        }
        $exams[] = ['id' => (int)$e['id'], 'code' => $e['code'], 'title' => $e['title'], 'subject' => $e['subject'], 'professor' => $e['professor'],
                    'duration_minutes' => (int)$e['duration_minutes'], 'items' => (int)$e['items'], 'scheduled_at' => $e['scheduled_at'],
                    'state' => $state, 'violations' => (int)$e['violations'], 'score' => $score, 'submitted_at' => $e['submitted_at']];
    }
    $out['exams'] = $exams;
    $out['counts'] = $counts;
}

/* -------------------------------- admin -------------------------------- */
if ($u['role'] === 'admin') {
    $one = fn(string $sql) => (int)$pdo->query($sql)->fetchColumn();
    $roles = ['student' => 0, 'professor' => 0, 'admin' => 0];
    foreach ($pdo->query("SELECT role, COUNT(*) c FROM users WHERE approval_status = 'approved' GROUP BY role")->fetchAll() as $r) $roles[$r['role']] = (int)$r['c'];
    $examStatus = ['draft' => 0, 'scheduled' => 0, 'available' => 0, 'closed' => 0];
    foreach ($pdo->query('SELECT status, COUNT(*) c FROM exams GROUP BY status')->fetchAll() as $r) $examStatus[$r['status']] = (int)$r['c'];
    $sy = $pdo->query('SELECT label, start_date, end_date FROM school_years WHERE is_current = 1 LIMIT 1')->fetch();

    $out['overview'] = [
        'accounts' => $roles + ['total' => array_sum($roles)],
        'disabled' => $one('SELECT COUNT(*) FROM users WHERE is_active = 0'),
        'pending' => $one("SELECT COUNT(*) FROM users WHERE approval_status = 'pending'"),
        'rejected' => $one("SELECT COUNT(*) FROM users WHERE approval_status = 'rejected'"),
        'graduated' => $one('SELECT COUNT(*) FROM users WHERE graduated = 1'),
        'departments' => $one('SELECT COUNT(*) FROM departments'),
        'programs' => $one('SELECT COUNT(*) FROM programs'),
        'exams' => $examStatus + ['total' => array_sum($examStatus)],
        'submissions' => $one('SELECT COUNT(*) FROM submissions'),
        'in_progress' => $one("SELECT COUNT(*) FROM submissions WHERE mode = 'in-progress'"),
        'auto_submitted' => $one("SELECT COUNT(*) FROM submissions WHERE mode = 'auto'"),
        'violations' => $one('SELECT COUNT(*) FROM violations'),
        'school_year' => $sy ?: null,
    ];
    $out['departments'] = $pdo->query("SELECT d.code, d.name,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'professor' AND u.approval_status = 'approved') AS professors,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'student' AND u.approval_status = 'approved') AS students
        FROM departments d ORDER BY d.code")->fetchAll();
    $out['recent_exams'] = $pdo->query("SELECT e.id, e.code, e.title, e.status, pr.full_name AS professor,
        (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id) AS submissions
        FROM exams e JOIN users pr ON pr.id = e.professor_id ORDER BY e.created_at DESC, e.id DESC LIMIT 8")->fetchAll();
    $out['recent_accounts'] = $pdo->query("SELECT u.account_no, u.full_name, u.role, u.approval_status, u.created_at, d.code AS dept_code
        FROM users u LEFT JOIN departments d ON d.id = u.department_id ORDER BY u.created_at DESC, u.id DESC LIMIT 8")->fetchAll();
}

json_out($out);
