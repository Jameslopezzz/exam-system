<?php
// Exam delivery for students + exam creation for professors.
require_once __DIR__ . '/bootstrap.php';
$action = $_GET['action'] ?? '';
$pdo = db();

/** Clean a list of section names: trimmed, unique, max 30 chars, max 50 sections. */
function clean_sections($raw): array {
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $v) {
        $v = cut(trim((string)$v), 30);
        if ($v !== '' && !in_array(strtolower($v), array_map('strtolower', $out), true)) $out[] = $v;
        if (count($out) >= 50) break;
    }
    return $out;
}

/** True when this student's section may take the exam (exams with no section rows are open to everyone). */
function section_allowed(PDO $pdo, int $examId, ?string $section): bool {
    $st = $pdo->prepare('SELECT COUNT(*) AS total, SUM(section = ?) AS mine FROM exam_sections WHERE exam_id = ?');
    $st->execute([(string)$section, $examId]);
    $r = $st->fetch();
    return (int)$r['total'] === 0 || (int)$r['mine'] > 0;
}

function student_section(PDO $pdo, int $userId): ?string {
    $st = $pdo->prepare('SELECT section FROM users WHERE id = ?');
    $st->execute([$userId]);
    $v = $st->fetchColumn();
    return ($v === false || $v === '') ? null : $v;
}

/* ---- Student: list exams with their own submission state ---- */
if ($action === 'list') {
    $u = require_role('student', 'professor', 'admin');
    if ($u['role'] === 'student') {
        $mySection = (string)student_section($pdo, (int)$u['id']);
        $st = $pdo->prepare("SELECT e.id, e.code, e.title, e.subject, e.duration_minutes, e.status, e.scheduled_at,
              p.full_name AS professor, (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS items,
              s.mode AS sub_mode, s.auto_score, s.max_score,
              (SELECT COUNT(*) FROM violations v WHERE v.submission_id = s.id) AS violations
            FROM exams e JOIN users p ON p.id = e.professor_id
            LEFT JOIN submissions s ON s.exam_id = e.id AND s.student_id = ?
            WHERE e.status <> 'draft'
              AND (NOT EXISTS (SELECT 1 FROM exam_sections es WHERE es.exam_id = e.id)
                   OR EXISTS (SELECT 1 FROM exam_sections es WHERE es.exam_id = e.id AND es.section = ?))
            ORDER BY e.id");
        $st->execute([$u['id'], $mySection]);
    } else {
        $st = $pdo->prepare("SELECT e.*, p.full_name AS professor,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS items,
              (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id) AS submissions,
              (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id AND s.mode = 'auto') AS auto_submitted,
              (SELECT GROUP_CONCAT(es.section ORDER BY es.section SEPARATOR '|') FROM exam_sections es WHERE es.exam_id = e.id) AS sections
            FROM exams e JOIN users p ON p.id = e.professor_id
            WHERE (? = 'admin' OR e.professor_id = ?) ORDER BY e.id");
        $st->execute([$u['role'], $u['id']]);
    }
    $rows = $st->fetchAll();
    if ($u['role'] !== 'student') {
        foreach ($rows as &$r) $r['sections'] = $r['sections'] !== null && $r['sections'] !== '' ? explode('|', $r['sections']) : [];
        unset($r);
    }
    json_out(['exams' => $rows]);
}

/* ---- Professor: sections that can be picked while creating an exam ---- */
if ($action === 'sections') {
    $u = require_role('professor', 'admin');
    $rows = $pdo->query("SELECT u.section, COUNT(*) AS students, GROUP_CONCAT(DISTINCT d.code ORDER BY d.code SEPARATOR ', ') AS departments
        FROM users u LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.role = 'student' AND u.approval_status = 'approved' AND u.is_active = 1 AND u.graduated = 0
          AND u.section IS NOT NULL AND u.section <> ''
        GROUP BY u.section ORDER BY u.section")->fetchAll();
    json_out(['sections' => $rows]);
}

/* ---- Student: start/resume exam. Correct answers are never sent. ---- */
if ($action === 'start') {
    $u = require_role('student');
    $id = (int)($_GET['id'] ?? 0);
    $ex = $pdo->prepare('SELECT * FROM exams WHERE id = ?');
    $ex->execute([$id]);
    $e = $ex->fetch();
    if (!$e || $e['status'] !== 'available') json_out(['error' => 'This examination is not open.'], 403);
    if (!section_allowed($pdo, $id, student_section($pdo, (int)$u['id']))) json_out(['error' => 'This examination is not available for your section.'], 403);

    $sub = $pdo->prepare('SELECT * FROM submissions WHERE exam_id = ? AND student_id = ?');
    $sub->execute([$id, $u['id']]);
    $s = $sub->fetch();
    if ($s && $s['mode'] !== 'in-progress') json_out(['error' => 'You have already submitted this examination.'], 409);
    if (!$s) {
        $pdo->prepare('INSERT INTO submissions (exam_id, student_id, started_at, last_ping) VALUES (?,?,NOW(),NOW())')->execute([$id, $u['id']]);
        $subId = (int)$pdo->lastInsertId();
        $started = time();
    } else {
        $subId = (int)$s['id'];
        $started = strtotime($s['started_at']);
    }
    $remaining = max(0, $e['duration_minutes'] * 60 - (time() - $started));

    $qs = $pdo->prepare('SELECT id, type, prompt, points, choices_json, media_json FROM questions WHERE exam_id = ? ORDER BY position');
    $qs->execute([$id]);
    $questions = array_map(function ($q) {
        return ['id' => (string)$q['id'], 'type' => $q['type'], 'prompt' => $q['prompt'], 'points' => (int)$q['points'],
                'choices' => $q['choices_json'] ? json_decode($q['choices_json'], true) : null,
                'media' => $q['media_json'] ? json_decode($q['media_json'], true) : null];
    }, $qs->fetchAll());

    $vc = $pdo->prepare('SELECT type_id AS typeId, label, DATE_FORMAT(occurred_at, "%h:%i:%s %p") AS time FROM violations WHERE submission_id = ? ORDER BY id');
    $vc->execute([$subId]);

    json_out(['submission_id' => $subId, 'draft' => (object)($s && $s['draft_json'] ? json_decode($s['draft_json'], true) : []), 'secondsLeft' => $remaining, 'violations' => $vc->fetchAll(),
        'exam' => ['id' => (int)$e['id'], 'code' => $e['code'], 'title' => $e['title'], 'subject' => $e['subject'],
                   'durationMinutes' => (int)$e['duration_minutes'], 'threshold' => (int)$e['violation_threshold'],
                   'rules' => ['faceAngle' => (bool)$e['detect_face_angle'], 'eyeGaze' => (bool)$e['detect_eye_gaze'],
                               'multiFace' => (bool)$e['detect_multi_face'], 'copyPaste' => (bool)$e['block_copy_paste'],
                               'tabSwitch' => (bool)$e['detect_tab_switch'], 'requireCamera' => (bool)$e['require_camera']],
                   'questions' => $questions]]);
}

/* ---- Professor: create exam with questions ---- */
if ($action === 'save') {
    require_post();
    $u = require_role('professor', 'admin');
    $d = body();
    $title = trim((string)($d['title'] ?? ''));
    $code  = trim((string)($d['code'] ?? ''));
    $qs    = $d['questions'] ?? [];
    if ($title === '' || $code === '') json_out(['error' => 'Title and subject code are required.'], 422);
    $thr = max(1, min(20, (int)($d['threshold'] ?? 3)));
    $dur = max(1, min(600, (int)($d['duration'] ?? 45)));
    $status = in_array($d['status'] ?? '', ['draft', 'scheduled', 'available'], true) ? $d['status'] : 'draft';
    $r = $d['rules'] ?? [];
    $b = fn($k) => empty($r) || !empty($r[$k]) ? 1 : 0;
    $sections = clean_sections($d['sections'] ?? []);

    $pdo->beginTransaction();
    $pdo->prepare('INSERT INTO exams (code,title,subject,professor_id,duration_minutes,violation_threshold,status,scheduled_at,
        detect_face_angle,detect_eye_gaze,detect_multi_face,block_copy_paste,detect_tab_switch,require_camera)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$code, $title, trim((string)($d['subject'] ?? $title)), $u['id'], $dur, $thr, $status,
                   !empty($d['schedule']) ? date('Y-m-d H:i:s', strtotime($d['schedule'])) : null,
                   $b('faceAngle'), $b('eyeGaze'), $b('multiFace'), $b('copyPaste'), $b('tabSwitch'), $b('requireCamera')]);
    $eid = (int)$pdo->lastInsertId();
    $ins = $pdo->prepare('INSERT INTO questions (exam_id,position,type,prompt,points,choices_json,correct_answer,media_json) VALUES (?,?,?,?,?,?,?,?)');
    foreach ($qs as $i => $q) {
        $type = ($q['type'] ?? '') === 'essay' ? 'essay' : 'multiple-choice';
        $choices = $type === 'multiple-choice' ? array_values(array_filter(array_map('trim', $q['choices'] ?? []), 'strlen')) : null;
        if ($type === 'multiple-choice' && count(array_unique(array_map('strtolower', $choices))) < count($choices)) { $pdo->rollBack(); json_out(['error' => 'Question ' . ($i + 1) . ' has two choices with the same text. Every choice must be different.'], 422); }
        if ($type === 'multiple-choice' && count($choices) < 2) { $pdo->rollBack(); json_out(['error' => 'Question ' . ($i + 1) . ' needs at least two choices.'], 422); }
        $ins->execute([$eid, $i + 1, $type, trim((string)($q['prompt'] ?? '')), max(1, (int)($q['points'] ?? 1)),
                       $choices ? json_encode($choices) : null, $type === 'multiple-choice' ? ($q['correct'] ?? null) : null,
                       !empty($q['media']) ? json_encode($q['media']) : null]);
    }
    $insSec = $pdo->prepare('INSERT INTO exam_sections (exam_id, section) VALUES (?, ?)');
    foreach ($sections as $sec) $insSec->execute([$eid, $sec]);
    $pdo->commit();
    json_out(['id' => $eid]);
}

if ($action === 'set_status') {
    require_post();
    $u = require_role('professor', 'admin');
    $d = body();
    if (!in_array($d['status'] ?? '', ['draft', 'scheduled', 'available', 'closed'], true)) json_out(['error' => 'Bad status'], 422);
    $pdo->prepare('UPDATE exams SET status = ? WHERE id = ? AND (? = "admin" OR professor_id = ?)')
        ->execute([$d['status'], (int)($d['id'] ?? 0), $u['role'], $u['id']]);
    json_out(['ok' => true]);
}

/* ---- Professor: change which sections may take an exam (empty list = all sections) ---- */
if ($action === 'set_sections') {
    require_post();
    $u = require_role('professor', 'admin');
    $d = body();
    $id = (int)($d['id'] ?? 0);
    $own = $pdo->prepare('SELECT 1 FROM exams WHERE id = ? AND (? = "admin" OR professor_id = ?)');
    $own->execute([$id, $u['role'], $u['id']]);
    if (!$own->fetchColumn()) json_out(['error' => 'Examination not found.'], 404);
    $sections = clean_sections($d['sections'] ?? []);
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM exam_sections WHERE exam_id = ?')->execute([$id]);
    $ins = $pdo->prepare('INSERT INTO exam_sections (exam_id, section) VALUES (?, ?)');
    foreach ($sections as $sec) $ins->execute([$id, $sec]);
    $pdo->commit();
    json_out(['ok' => true, 'sections' => $sections]);
}

/* ---- Professor: delete an exam (questions, submissions, answers and violations go with it) ---- */
if ($action === 'delete') {
    require_post();
    $u = require_role('professor', 'admin');
    $d = body();
    $id = (int)($d['id'] ?? 0);
    $st = $pdo->prepare('SELECT id, code, title FROM exams WHERE id = ? AND (? = "admin" OR professor_id = ?)');
    $st->execute([$id, $u['role'], $u['id']]);
    $exam = $st->fetch();
    if (!$exam) json_out(['error' => 'Examination not found.'], 404);
    $cnt = $pdo->prepare('SELECT COUNT(*) FROM submissions WHERE exam_id = ?');
    $cnt->execute([$id]);
    $subs = (int)$cnt->fetchColumn();
    $pdo->prepare('DELETE FROM exam_sections WHERE exam_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM exams WHERE id = ?')->execute([$id]);   // ON DELETE CASCADE removes everything attached to it
    json_out(['ok' => true, 'deleted_submissions' => $subs]);
}

json_out(['error' => 'Unknown action.'], 400);
