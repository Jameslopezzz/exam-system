<?php
// Database settings - XAMPP defaults (root, empty password).
// Can be overridden with environment variables EXAM_DB_HOST / _NAME / _USER / _PASS.
define('DB_HOST', getenv('EXAM_DB_HOST') ?: '127.0.0.1');
define('DB_NAME', getenv('EXAM_DB_NAME') ?: 'exam_system');
define('DB_USER', getenv('EXAM_DB_USER') ?: 'root');
define('DB_PASS', getenv('EXAM_DB_PASS') !== false ? getenv('EXAM_DB_PASS') : '');
