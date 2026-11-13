<?php
// Live Monitor data for professors + instructor actions (send warning / force submit).
require_once __DIR__ . '/bootstrap.php';
$u = require_role('professor', 'admin');
$pdo = db();

function owns_exam(PDO $pdo, array $u, int $examId): bool {
    if ($u['role'] === 'admin') return true;
    $st = $pdo->prepare('SELECT 1 FROM exams WHERE id = ? AND professor_id = ?');
    $st->execute([$examId, $u['id']]);
    return (bool)$st->fetchColumn();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_post();
    $d = body();
    $st = $pdo->prepare('SELECT * FROM submissions WHERE id = ?');
    $st->execute([(int)($d['submission_id'] ?? 0)]);
    $s = $st->fetch();
    if (!$s || !owns_exam($pdo, $u, (int)$s['exam_id'])) json_out(['error' => 'Not found'], 404);

    if (($d['action'] ?? '') === 'warn') {
        $pdo->prepare("UPDATE submissions SET pending_warning = ? WHERE id = ? AND mode = 'in-progress'")
            ->execute([cut(trim((string)($d['message'] ?? 'Your instructor has issued a warning. Stay on the exam screen.')), 250), $s['id']]);
        json_out(['ok' => true]);
    }
    if (($d['action'] ?? '') === 'force_submit') {
        $answers = $s['draft_json'] ? (json_decode($s['draft_json'], true) ?: []) : [];
        json_out(finalize_submission((int)$s['id'], (int)$s['exam_id'], $answers, 'auto'));
    }
    if (($d['action'] ?? '') === 'reopen') {
        // Give an auto-submitted student a fresh attempt. Their old violations move to violation_history (audit trail).
        if ($s['mode'] !== 'auto') json_out(['error' => 'Only auto-submitted exams can be re-opened.'], 409);
        $ex = $pdo->prepare('SELECT status FROM exams WHERE id = ?');
        $ex->execute([(int)$s['exam_id']]);
        if ($ex->fetchColumn() !== 'available') json_out(['error' => 'Set the examination to Available first, then re-open it for the student.'], 409);
        $pdo->beginTransaction();
        $attempt = (int)$s['reopen_count'] + 1;
        $pdo->prepare('INSERT INTO violation_history (submission_id, attempt, type_id, label, severity, occurred_at)
                       SELECT submission_id, ?, type_id, label, severity, occurred_at FROM violations WHERE submission_id = ?')
            ->execute([$attempt, $s['id']]);
        $pdo->prepare('DELETE FROM violations WHERE submission_id = ?')->execute([$s['id']]);
        $pdo->prepare('DELETE FROM answers WHERE submission_id = ?')->execute([$s['id']]);
        $pdo->prepare("UPDATE submissions SET mode = 'in-progress', started_at = NOW(), submitted_at = NULL, progress = 0,
                       auto_score = 0, essay_score = NULL, max_score = 0, last_ping = NULL, last_ping_ms = NULL,
                       pending_warning = NULL, draft_json = NULL, reopen_count = ?, reopened_at = NOW() WHERE id = ?")
            ->execute([$attempt, $s['id']]);
        $pdo->commit();
        json_out(['ok' => true, 'attempt' => $attempt]);
    }
    json_out(['error' => 'Unknown action'], 400);
}

$examId = (int)($_GET['exam_id'] ?? 0);
if (!$examId) {   // default to the newest exam this user can see
    $st = $pdo->prepare("SELECT id FROM exams WHERE (? = 'admin' OR professor_id = ?) ORDER BY (status = 'available') DESC, (EXISTS (SELECT 1 FROM submissions s WHERE s.exam_id = exams.id)) DESC, id DESC LIMIT 1");
    $st->execute([$u['role'], $u['id']]);
    $examId = (int)$st->fetchColumn();
}
if (!$examId || !owns_exam($pdo, $u, $examId)) json_out(['students' => [], 'alerts' => [], 'exam' => null]);

$ex = $pdo->prepare('SELECT id, code, title, status, violation_threshold FROM exams WHERE id = ?');
$ex->execute([$examId]);
$exam = $ex->fetch();

$st = $pdo->prepare("SELECT s.id, u.full_name AS name, u.account_no AS studentNo, u.section, s.mode, s.progress,
    s.last_ping, s.last_ping_ms, s.reopen_count,
    (SELECT COUNT(*) FROM violations v WHERE v.submission_id = s.id) AS violations,
    (SELECT CONCAT(v.label, ' · ', DATE_FORMAT(v.occurred_at, '%l:%i %p')) FROM violations v WHERE v.submission_id = s.id ORDER BY v.id DESC LIMIT 1) AS lastFlag
    FROM submissions s JOIN users u ON u.id = s.student_id WHERE s.exam_id = ? ORDER BY u.full_name");
$st->execute([$examId]);
$students = array_map(function ($r) use ($exam) {
    $status = $r['mode'] === 'auto' ? 'auto-submitted' : ($r['mode'] === 'manual' ? 'submitted' : ((int)$r['violations'] > 0 ? 'flagged' : 'in-progress'));
    $online = $r['last_ping'] && (time() - strtotime($r['last_ping'])) < 30;
    return ['id' => (int)$r['id'], 'name' => $r['name'], 'studentNo' => $r['studentNo'], 'section' => $r['section'],
            'progress' => (int)$r['progress'], 'violations' => (int)$r['violations'], 'lastFlag' => $r['lastFlag'] ?: '—',
            'status' => $status, 'online' => $online && $r['mode'] === 'in-progress', 'pingMs' => $r['last_ping_ms'] !== null ? (int)$r['last_ping_ms'] : null,
            'reopened' => (int)$r['reopen_count'], 'exam' => $exam['code'] . ' ' . $exam['title']];
}, $st->fetchAll());

$al = $pdo->prepare("SELECT v.id, u.full_name AS student, v.label AS type, v.severity, DATE_FORMAT(v.occurred_at, '%l:%i:%s %p') AS time
    FROM violations v JOIN submissions s ON s.id = v.submission_id JOIN users u ON u.id = s.student_id
    WHERE s.exam_id = ? ORDER BY v.id DESC LIMIT 25");
$al->execute([$examId]);

json_out(['exam' => $exam, 'students' => $students, 'alerts' => $al->fetchAll(), 'server_time' => date('c')]);
