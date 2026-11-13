<?php
// Violation Logger + Submission Engine: logs each flagged event and force-submits at the threshold.
require_once __DIR__ . '/bootstrap.php';
require_post();
$u = require_role('student');
$d = body();
$pdo = db();

$st = $pdo->prepare("SELECT s.id, s.exam_id, e.violation_threshold FROM submissions s JOIN exams e ON e.id = s.exam_id
                     WHERE s.exam_id = ? AND s.student_id = ? AND s.mode = 'in-progress'");
$st->execute([(int)($d['exam_id'] ?? 0), $u['id']]);
$s = $st->fetch();
if (!$s) json_out(['error' => 'No active exam session.', 'closed' => true], 409);

$allowed = ['face-angle', 'eye-gaze', 'multiple-faces', 'no-face', 'copy-paste', 'tab-switch'];
$type = in_array($d['type_id'] ?? '', $allowed, true) ? $d['type_id'] : 'copy-paste';
$label = cut(trim((string)($d['label'] ?? $type)), 150);

$pdo->prepare('INSERT INTO violations (submission_id, type_id, label, severity) VALUES (?,?,?,?)')
    ->execute([$s['id'], $type, $label, violation_severity($type)]);
$cnt = $pdo->prepare('SELECT COUNT(*) FROM violations WHERE submission_id = ?');
$cnt->execute([$s['id']]);
$count = (int)$cnt->fetchColumn();

$auto = false; $result = null;
if ($count >= (int)$s['violation_threshold']) {
    $answers = is_array($d['answers'] ?? null) ? $d['answers'] : [];
    $result = finalize_submission((int)$s['id'], (int)$s['exam_id'], $answers, 'auto');
    $auto = true;
}
json_out(['count' => $count, 'threshold' => (int)$s['violation_threshold'], 'auto_submitted' => $auto, 'result' => $result]);
