<?php
// Aggregated data for the Reports module charts (JSON).
require_once __DIR__ . '/bootstrap.php';
$u = require_role('professor', 'admin');
$pdo = db();

$examId = (int)($_GET['exam_id'] ?? 0);
if (!$examId) {
    $st = $pdo->prepare("SELECT id FROM exams WHERE (? = 'admin' OR professor_id = ?) ORDER BY (status='available') DESC, id DESC LIMIT 1");
    $st->execute([$u['role'], $u['id']]);
    $examId = (int)$st->fetchColumn();
}
$ex = $pdo->prepare("SELECT id, code, title, professor_id FROM exams WHERE id = ?");
$ex->execute([$examId]);
$exam = $ex->fetch();
if (!$exam || ($u['role'] !== 'admin' && (int)$exam['professor_id'] !== $u['id'])) json_out(['exam' => null, 'students' => []]);

$st = $pdo->prepare("SELECT u.full_name AS name, u.account_no AS studentNo, u.section, s.mode, s.auto_score, s.essay_score, s.max_score, s.progress,
    (SELECT COUNT(*) FROM violations v WHERE v.submission_id = s.id) AS violations,
    (SELECT CONCAT(v.label, ' · ', DATE_FORMAT(v.occurred_at, '%l:%i %p')) FROM violations v WHERE v.submission_id = s.id ORDER BY v.id DESC LIMIT 1) AS lastFlag
    FROM submissions s JOIN users u ON u.id = s.student_id WHERE s.exam_id = ? ORDER BY u.full_name");
$st->execute([$examId]);
$rows = $st->fetchAll();

$pcts = [];
$students = [];
foreach ($rows as $r) {
    $done = $r['mode'] !== 'in-progress';
    $pct = $done && (int)$r['max_score'] > 0 ? round((($r['auto_score'] + (int)$r['essay_score']) / $r['max_score']) * 100) : null;
    if ($pct !== null) $pcts[] = $pct;
    $students[] = ['name' => $r['name'], 'studentNo' => $r['studentNo'], 'section' => $r['section'], 'progress' => (int)$r['progress'],
        'violations' => (int)$r['violations'], 'lastFlag' => $r['lastFlag'] ?: '—', 'score' => $pct,
        'status' => $r['mode'] === 'auto' ? 'auto-submitted' : ($r['mode'] === 'manual' ? 'submitted' : 'in-progress')];
}
$bins = ['0-59' => 0, '60-69' => 0, '70-79' => 0, '80-89' => 0, '90-100' => 0];
foreach ($pcts as $p) { $k = $p < 60 ? '0-59' : ($p < 70 ? '60-69' : ($p < 80 ? '70-79' : ($p < 90 ? '80-89' : '90-100'))); $bins[$k]++; }

$vt = $pdo->prepare("SELECT v.type_id, COUNT(*) c FROM violations v JOIN submissions s ON s.id = v.submission_id WHERE s.exam_id = ? GROUP BY v.type_id");
$vt->execute([$examId]);
$labels = ['face-angle' => 'Face angle', 'eye-gaze' => 'Eye gaze', 'multiple-faces' => 'Multiple faces', 'no-face' => 'No face',
           'copy-paste' => 'Copy / paste', 'tab-switch' => 'Tab switch'];
$byType = array_map(fn($r) => ['label' => $labels[$r['type_id']] ?? $r['type_id'], 'value' => (int)$r['c']], $vt->fetchAll());

json_out(['exam' => $exam, 'students' => $students, 'scoreBins' => $bins, 'violationsByType' => $byType,
    'stats' => ['average' => $pcts ? round(array_sum($pcts) / count($pcts)) : null,
                'passingRate' => $pcts ? round(count(array_filter($pcts, fn($p) => $p >= 75)) / count($pcts) * 100) : null,
                'lowest' => $pcts ? min($pcts) : null, 'totalViolations' => array_sum(array_column($students, 'violations'))]]);
