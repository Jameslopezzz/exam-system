<?php
require_once __DIR__ . '/bootstrap.php';
require_post();
$u = require_role('student');
$d = body();
$examId = (int)($d['exam_id'] ?? 0);

$st = db()->prepare('SELECT s.id FROM submissions s WHERE s.exam_id = ? AND s.student_id = ?');
$st->execute([$examId, $u['id']]);
$s = $st->fetch();
if (!$s) json_out(['error' => 'No exam session found.'], 404);

$mode = ($d['mode'] ?? 'manual') === 'auto' ? 'auto' : 'manual';
$answers = is_array($d['answers'] ?? null) ? $d['answers'] : [];
json_out(finalize_submission((int)$s['id'], $examId, $answers, $mode));
