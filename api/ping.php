<?php
// GET  -> tiny response used by the browser to measure latency (network status bar).
// POST -> heartbeat: stores latency/progress/draft answers, returns instructor warning or forced-submit flag.
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(['t' => microtime(true)]);

require_post();
$u = require_role('student');
$d = body();
$pdo = db();

$st = $pdo->prepare('SELECT id, mode, pending_warning FROM submissions WHERE exam_id = ? AND student_id = ?');
$st->execute([(int)($d['exam_id'] ?? 0), $u['id']]);
$s = $st->fetch();
if (!$s) json_out(['error' => 'No session'], 404);
if ($s['mode'] !== 'in-progress') json_out(['forced' => true, 'mode' => $s['mode']]);

$draft = is_array($d['answers'] ?? null) ? json_encode($d['answers']) : null;
$pdo->prepare('UPDATE submissions SET last_ping = NOW(), last_ping_ms = ?, progress = ?, pending_warning = NULL,
               draft_json = COALESCE(?, draft_json) WHERE id = ?')
    ->execute([isset($d['ms']) ? (int)$d['ms'] : null, max(0, min(99, (int)($d['progress'] ?? 0))), $draft, $s['id']]);

json_out(['forced' => false, 'warning' => $s['pending_warning']]);
