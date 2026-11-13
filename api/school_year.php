<?php
// Admin: school years. When a school year's end date passes, students are moved up one year level automatically.
require_once __DIR__ . '/bootstrap.php';
require_role('admin');
$pdo = db();
$action = $_GET['action'] ?? 'list';

if ($action === 'list') {
    run_school_year_rollover();
    json_out(['school_years' => $pdo->query('SELECT * FROM school_years ORDER BY start_date DESC')->fetchAll(), 'today' => date('Y-m-d')]);
}

require_post();
$d = body();

if ($action === 'create') {
    $label = trim((string)($d['label'] ?? '')); $s = (string)($d['start_date'] ?? ''); $e = (string)($d['end_date'] ?? '');
    if (!preg_match('/^\d{4}-\d{4}$/', $label)) json_out(['error' => 'Label must look like 2026-2027.'], 422);
    $ds = DateTime::createFromFormat('Y-m-d', $s); $de = DateTime::createFromFormat('Y-m-d', $e);
    if (!$ds || !$de || $ds->format('Y-m-d') !== $s || $de->format('Y-m-d') !== $e) json_out(['error' => 'Enter valid start and end dates.'], 422);
    if ($e <= $s) json_out(['error' => 'The end date must be after the start date.'], 422);
    // A school year that is already over is recorded as history: it must not promote students retroactively.
    $historical = $e < date('Y-m-d') ? 1 : 0;
    try { $pdo->prepare('INSERT INTO school_years (label, start_date, end_date, promoted) VALUES (?,?,?,?)')->execute([$label, $s, $e, $historical]); }
    catch (PDOException $ex) { json_out(['error' => 'That school year already exists.'], 409); }
    refresh_current_school_year();
    json_out(['ok' => true, 'historical' => (bool)$historical]);
}

if ($action === 'end_now') {   // close the current school year today and promote students right away
    $id = (int)($d['id'] ?? 0);
    $st = $pdo->prepare('SELECT * FROM school_years WHERE id = ?'); $st->execute([$id]);
    $sy = $st->fetch();
    if (!$sy) json_out(['error' => 'School year not found.'], 404);
    if ($sy['promoted']) json_out(['error' => 'Students were already promoted for this school year.'], 409);
    $today = date('Y-m-d');
    if ($sy['start_date'] > $today) json_out(['error' => 'This school year has not started yet.'], 422);
    $pdo->prepare('UPDATE school_years SET end_date = LEAST(end_date, ?) WHERE id = ?')->execute([$today, $id]);
    $n = promote_students_for($id);
    refresh_current_school_year();
    json_out(['ok' => true, 'promoted' => $n]);
}

if ($action === 'delete') {
    $st = $pdo->prepare('DELETE FROM school_years WHERE id = ? AND is_current = 0');
    $st->execute([(int)($d['id'] ?? 0)]);
    if ($st->rowCount() === 0) json_out(['error' => 'The current school year cannot be deleted.'], 422);
    json_out(['ok' => true]);
}
json_out(['error' => 'Unknown action.'], 400);
