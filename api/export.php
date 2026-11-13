<?php
// CSV export (opens directly in Excel). ?exam_id=1&type=scores|violations
require_once __DIR__ . '/bootstrap.php';
$u = require_role('professor', 'admin');
$pdo = db();

$examId = (int)($_GET['exam_id'] ?? 0);
$type = ($_GET['type'] ?? 'scores') === 'violations' ? 'violations' : 'scores';
$ex = $pdo->prepare('SELECT id, code, title, professor_id FROM exams WHERE id = ?');
$ex->execute([$examId]);
$exam = $ex->fetch();
if (!$exam || ($u['role'] !== 'admin' && (int)$exam['professor_id'] !== $u['id'])) { http_response_code(404); exit('Exam not found.'); }

/** Neutralise spreadsheet formula injection (cells starting with = + - @). */
function cell($v): string {
    $v = (string)($v ?? '');
    return ($v !== '' && strpbrk($v[0], "=+-@\t\r") !== false) ? "'" . $v : $v;
}

$slug = preg_replace('/[^A-Za-z0-9_-]+/', '_', $exam['code'] . '_' . $exam['title']);
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $slug . '_' . $type . '_' . date('Ymd_His') . '.csv"');
$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF");   // UTF-8 BOM so Excel reads accents correctly

if ($type === 'scores') {
    fputcsv($out, ['Account No', 'Student', 'Section', 'Status', 'MCQ Score', 'Essay Score', 'Total', 'Max Score', 'Percent', 'Violations', 'Last Flag', 'Submitted At']);
    $st = $pdo->prepare("SELECT u.account_no, u.full_name, u.section, s.mode, s.auto_score, s.essay_score, s.max_score, s.submitted_at,
        (SELECT COUNT(*) FROM violations v WHERE v.submission_id = s.id) AS vc,
        (SELECT v.label FROM violations v WHERE v.submission_id = s.id ORDER BY v.id DESC LIMIT 1) AS lastflag
        FROM submissions s JOIN users u ON u.id = s.student_id WHERE s.exam_id = ? ORDER BY u.full_name");
    $st->execute([$examId]);
    foreach ($st->fetchAll() as $r) {
        $done = $r['mode'] !== 'in-progress';
        $total = $r['auto_score'] + (int)$r['essay_score'];
        fputcsv($out, [cell($r['account_no']), cell($r['full_name']), cell($r['section']),
            $r['mode'] === 'auto' ? 'Auto-submitted' : ($done ? 'Submitted' : 'In progress'),
            $r['auto_score'], $r['essay_score'] ?? 'Pending', $done ? $total : '', $r['max_score'],
            $done && $r['max_score'] ? round($total / $r['max_score'] * 100, 1) . '%' : '', $r['vc'], cell($r['lastflag']), $r['submitted_at']]);
    }
} else {
    fputcsv($out, ['Account No', 'Student', 'Section', 'Violation', 'Severity', 'Date/Time']);
    $st = $pdo->prepare("SELECT u.account_no, u.full_name, u.section, v.label, v.severity, v.occurred_at
        FROM violations v JOIN submissions s ON s.id = v.submission_id JOIN users u ON u.id = s.student_id
        WHERE s.exam_id = ? ORDER BY v.occurred_at");
    $st->execute([$examId]);
    foreach ($st->fetchAll() as $r) {
        fputcsv($out, [cell($r['account_no']), cell($r['full_name']), cell($r['section']), cell($r['label']), $r['severity'], $r['occurred_at']]);
    }
}
fclose($out);
