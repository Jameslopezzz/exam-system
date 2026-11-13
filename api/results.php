<?php
// Student's own results history.
require_once __DIR__ . '/bootstrap.php';
$u = require_role('student');
$st = db()->prepare("SELECT e.code, e.title, DATE_FORMAT(s.submitted_at, '%b %e, %Y') AS date, s.auto_score, s.essay_score, s.max_score, s.mode,
    (SELECT COUNT(*) FROM violations v WHERE v.submission_id = s.id) AS violations
    FROM submissions s JOIN exams e ON e.id = s.exam_id WHERE s.student_id = ? AND s.mode <> 'in-progress' ORDER BY s.submitted_at DESC");
$st->execute([$u['id']]);
$rows = array_map(function ($r) {
    $pending = $r['essay_score'] === null;
    $points = (int)$r['auto_score'] + (int)$r['essay_score'];
    $max = (int)$r['max_score'];
    return ['code' => $r['code'], 'title' => $r['title'], 'date' => $r['date'],
            'points' => $points, 'max' => $max, 'percent' => $max > 0 ? round($points / $max * 100) : null,
            'score' => $points . ' / ' . $max . ($pending ? ' (essays pending)' : ''),
            'violations' => (int)$r['violations'],
            'remark' => $r['mode'] === 'auto' ? 'Auto-submitted' : ((int)$r['violations'] ? 'Warned' : 'Clean')];
}, $st->fetchAll());
json_out(['results' => $rows]);
