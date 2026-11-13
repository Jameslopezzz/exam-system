-- =====================================================================
-- Upgrade an EXISTING exam_system database to v3 (keeps all data):
--   * exam sections (professor chooses which sections can take an exam)
--   * re-open an auto-submitted exam (with a violation audit trail)
-- Fresh installs do not need this - schema.sql already includes everything.
-- =====================================================================
USE exam_system;

CREATE TABLE IF NOT EXISTS exam_sections (
  exam_id INT NOT NULL,
  section VARCHAR(30) NOT NULL,
  PRIMARY KEY (exam_id, section),
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE submissions
  ADD COLUMN reopen_count INT NOT NULL DEFAULT 0 AFTER draft_json,
  ADD COLUMN reopened_at DATETIME NULL AFTER reopen_count;

CREATE TABLE IF NOT EXISTS violation_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  attempt       INT NOT NULL,
  type_id       VARCHAR(30)  NOT NULL,
  label         VARCHAR(150) NOT NULL,
  severity      ENUM('medium','high','critical') NOT NULL DEFAULT 'medium',
  occurred_at   TIMESTAMP NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Existing exams have no section rows, so they stay open to every section (same behaviour as before).
