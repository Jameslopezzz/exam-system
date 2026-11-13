<?php
// Shared helpers: PDO connection, session, JSON I/O, role guard.
require_once __DIR__ . '/config.php';

// Never print PHP warnings into the JSON the pages read (XAMPP has display_errors on by default).
ini_set('display_errors', '0');
error_reporting(E_ALL);

// Any uncaught error is answered as JSON, so the page can show what went wrong instead of silently failing.
set_exception_handler(function (Throwable $e) {
    error_log('[exam-system] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
    exit;
});

session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
session_start();

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER, DB_PASS,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                 PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                 PDO::ATTR_EMULATE_PREPARES => false]
            );
        } catch (PDOException $e) {
            json_out(['error' => 'Database connection failed. Check api/config.php and that MySQL is running.'], 500);
        }
        ensure_schema($pdo);
    }
    return $pdo;
}

/**
 * Upgrades an older database in place (exam sections, re-open support), so nobody has to remember to import
 * sql/migrate_v3.sql. Every step checks first, so it is safe to run on any version and as often as needed.
 */
function ensure_schema(PDO $pdo): void {
    if (!empty($_SESSION['schema_v3'])) return;
    try {
        $has = function (string $table, string $column) use ($pdo): bool {
            $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
            $st->execute([$table, $column]);
            return (bool)$st->fetchColumn();
        };
        // Create a table with its foreign key; if the key cannot be added on this server, create it without.
        $create = function (string $sql, string $fk) use ($pdo): void {
            try { $pdo->exec($sql . ', ' . $fk . ') ENGINE=InnoDB'); }
            catch (PDOException $e) { $pdo->exec($sql . ') ENGINE=InnoDB'); }
        };
        $create('CREATE TABLE IF NOT EXISTS exam_sections (exam_id INT NOT NULL, section VARCHAR(30) NOT NULL, PRIMARY KEY (exam_id, section)',
                'FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE');
        if (!$has('submissions', 'reopen_count')) $pdo->exec('ALTER TABLE submissions ADD COLUMN reopen_count INT NOT NULL DEFAULT 0');
        if (!$has('submissions', 'reopened_at'))  $pdo->exec('ALTER TABLE submissions ADD COLUMN reopened_at DATETIME NULL');
        $create("CREATE TABLE IF NOT EXISTS violation_history (id INT AUTO_INCREMENT PRIMARY KEY, submission_id INT NOT NULL, attempt INT NOT NULL,
                 type_id VARCHAR(30) NOT NULL, label VARCHAR(150) NOT NULL, severity ENUM('medium','high','critical') NOT NULL DEFAULT 'medium',
                 occurred_at TIMESTAMP NULL",
                'FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE');
        $_SESSION['schema_v3'] = true;
    } catch (Throwable $e) {
        error_log('[exam-system] automatic schema upgrade failed: ' . $e->getMessage());
    }
}

function json_out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    $d = json_decode($raw ?: '[]', true);
    return is_array($d) ? $d : [];
}

function current_user(): ?array {
    return $_SESSION['user'] ?? null;
}

/** Require a logged-in user with one of the given roles. */
function require_role(string ...$roles): array {
    $u = current_user();
    if (!$u) json_out(['error' => 'Not signed in.'], 401);
    if ($roles && !in_array($u['role'], $roles, true)) json_out(['error' => 'Access denied.'], 403);
    return $u;
}

/** Same-origin check for state-changing requests (basic CSRF defence). */
function require_post(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'POST required.'], 405);
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== ($_SERVER['SERVER_NAME'] ?? '')) {
        json_out(['error' => 'Bad origin.'], 403);
    }
}

function violation_severity(string $typeId): string {
    return ['multiple-faces' => 'critical', 'face-angle' => 'high', 'eye-gaze' => 'high',
            'tab-switch' => 'high', 'no-face' => 'medium', 'copy-paste' => 'medium'][$typeId] ?? 'medium';
}

/** Finalise a submission: grade multiple-choice, store answers. Safe to call twice. */
function finalize_submission(int $subId, int $examId, array $answers, string $mode): array {
    $pdo = db();
    $sub = $pdo->prepare('SELECT * FROM submissions WHERE id = ?');
    $sub->execute([$subId]);
    $s = $sub->fetch();
    if (!$s) return ['error' => 'No submission'];
    if ($s['mode'] !== 'in-progress') return ['score' => (int)$s['auto_score'], 'max' => (int)$s['max_score'], 'mode' => $s['mode']];

    $qs = $pdo->prepare('SELECT * FROM questions WHERE exam_id = ?');
    $qs->execute([$examId]);
    $total = 0; $score = 0; $answered = 0;
    $pdo->beginTransaction();
    $ins = $pdo->prepare('INSERT INTO answers (submission_id, question_id, answer_text, is_correct, points_earned)
                          VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE answer_text=VALUES(answer_text),
                          is_correct=VALUES(is_correct), points_earned=VALUES(points_earned)');
    foreach ($qs->fetchAll() as $q) {
        $total += (int)$q['points'];
        $a = $answers[$q['id']] ?? null;
        $a = is_string($a) ? trim($a) : null;
        if ($a !== null && $a !== '') $answered++;
        $correct = null; $pts = 0;
        if ($q['type'] === 'multiple-choice' && $q['correct_answer'] !== null && $a !== null) {
            $correct = hash_equals((string)$q['correct_answer'], $a) ? 1 : 0;
            $pts = $correct ? (int)$q['points'] : 0;
            $score += $pts;
        }
        $ins->execute([$subId, $q['id'], $a, $correct, $pts]);
    }
    $upd = $pdo->prepare('UPDATE submissions SET submitted_at = NOW(), mode = ?, auto_score = ?, max_score = ?, progress = 100 WHERE id = ?');
    $upd->execute([$mode, $score, $total, $subId]);
    $pdo->commit();
    return ['score' => $score, 'max' => $total, 'mode' => $mode, 'answered' => $answered];
}

/** Truncate text safely (works even if the mbstring extension is disabled). */
function cut(string $s, int $n): string {
    return function_exists('mb_substr') ? mb_substr($s, 0, $n) : substr($s, 0, $n);
}

// ---------------------------------------------------------------------
// Departments / programs / year levels / school-year rollover
// ---------------------------------------------------------------------
const YEAR_LEVELS = ['First Year', 'Second Year', 'Third Year', 'Fourth Year', 'Fifth Year', 'Irregular'];

/**
 * Validate the department / program / year level that goes with a role.
 * Returns [department_id, program_id, year_level] or a string error message.
 * admin: nothing. professor: department. student: department + program (inside that department) + year level.
 */
function validate_affiliation(string $role, array $d) {
    if ($role === 'admin') return [null, null, null];
    $pdo = db();
    $dept = (int)($d['department_id'] ?? 0);
    $st = $pdo->prepare('SELECT id FROM departments WHERE id = ?');
    $st->execute([$dept]);
    if (!$st->fetch()) return 'Select a department.';
    if ($role === 'professor') return [$dept, null, null];

    $prog = (int)($d['program_id'] ?? 0);
    $st = $pdo->prepare('SELECT id FROM programs WHERE id = ? AND department_id = ?');
    $st->execute([$prog, $dept]);
    if (!$st->fetch()) return 'Select a course that belongs to the chosen department.';
    $year = (string)($d['year_level'] ?? '');
    if (!in_array($year, YEAR_LEVELS, true)) return 'Select the student\'s year level.';
    return [$dept, $prog, $year];
}

/** Make the school year that covers today the current one (only one is current). */
function refresh_current_school_year(): void {
    $pdo = db();
    $today = date('Y-m-d');
    $st = $pdo->prepare('SELECT id FROM school_years WHERE start_date <= ? AND end_date >= ? ORDER BY start_date DESC LIMIT 1');
    $st->execute([$today, $today]);
    $id = $st->fetchColumn();
    $pdo->exec('UPDATE school_years SET is_current = 0');
    if ($id) $pdo->prepare('UPDATE school_years SET is_current = 1 WHERE id = ?')->execute([$id]);
}

/** Advance every active student one year level for one school year (runs once per school year). */
function promote_students_for(int $schoolYearId): int {
    $pdo = db();
    $pdo->beginTransaction();
    // Claim it first so two requests can never promote the same school year twice.
    $claim = $pdo->prepare('UPDATE school_years SET promoted = 1, promoted_at = NOW() WHERE id = ? AND promoted = 0');
    $claim->execute([$schoolYearId]);
    if ($claim->rowCount() === 0) { $pdo->rollBack(); return 0; }

    // Students already in the last year of their program are marked graduated (year level stays).
    $pdo->exec("UPDATE users u JOIN programs p ON p.id = u.program_id
                SET u.graduated = 1
                WHERE u.role = 'student' AND u.approval_status = 'approved' AND u.graduated = 0
                  AND u.year_level = ELT(p.years, 'First Year','Second Year','Third Year','Fourth Year','Fifth Year')");
    // Everyone else moves up one year. Irregular students are never changed automatically.
    $n = $pdo->exec("UPDATE users
                SET year_level = ELT(FIELD(year_level,'First Year','Second Year','Third Year','Fourth Year') + 1,
                                     'First Year','Second Year','Third Year','Fourth Year','Fifth Year')
                WHERE role = 'student' AND approval_status = 'approved' AND graduated = 0
                  AND year_level IN ('First Year','Second Year','Third Year','Fourth Year')");
    $pdo->commit();
    return (int)$n;
}

/** Called on login / admin requests: if a school year has ended, promote students automatically. */
function run_school_year_rollover(): void {
    try {
        $pdo = db();
        $st = $pdo->prepare('SELECT id FROM school_years WHERE promoted = 0 AND end_date < ? ORDER BY end_date');
        $st->execute([date('Y-m-d')]);
        $ids = $st->fetchAll(PDO::FETCH_COLUMN);
        if (!$ids) return;
        foreach ($ids as $id) promote_students_for((int)$id);
        refresh_current_school_year();
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    }
}
