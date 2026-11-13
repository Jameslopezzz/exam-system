-- =====================================================================
-- EXAM System - MySQL schema (run in phpMyAdmin or: mysql -u root < schema.sql)
-- =====================================================================
CREATE DATABASE IF NOT EXISTS exam_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE exam_system;

DROP TABLE IF EXISTS violation_history;
DROP TABLE IF EXISTS violations;
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS exam_sections;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS exams;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS programs;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS school_years;

-- Departments (CITCS, CAS, CBA, CCJ, COA ...) - admin can add more
CREATE TABLE departments (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  code  VARCHAR(20)  NOT NULL UNIQUE,
  name  VARCHAR(150) NOT NULL
) ENGINE=InnoDB;

-- Programs / courses offered by a department; years = length of the program
CREATE TABLE programs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  department_id INT NOT NULL,
  code          VARCHAR(20)  NOT NULL UNIQUE,
  name          VARCHAR(150) NOT NULL,
  years         TINYINT NOT NULL DEFAULT 4,
  FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

-- School years: when end_date passes, students are promoted one year level (once)
CREATE TABLE school_years (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  label      VARCHAR(20) NOT NULL UNIQUE,      -- e.g. 2026-2027
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  promoted   TINYINT(1) NOT NULL DEFAULT 0,    -- 1 once students were advanced for this year
  promoted_at DATETIME NULL
) ENGINE=InnoDB;

-- Users: students, professors, admins (role-based access)
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  account_no    VARCHAR(30)  NOT NULL UNIQUE,
  full_name     VARCHAR(120) NOT NULL,
  section       VARCHAR(30)  NULL,
  role          ENUM('student','professor','admin') NOT NULL,
  department_id INT NULL,                        -- students + professors (admin: none)
  program_id    INT NULL,                        -- students only
  year_level    VARCHAR(20) NULL,                -- students only
  graduated     TINYINT(1)   NOT NULL DEFAULT 0,
  approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  password_hash VARCHAR(255) NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (program_id)    REFERENCES programs(id)
) ENGINE=InnoDB;

-- Exams: configuration set by the instructor
CREATE TABLE exams (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  code               VARCHAR(20)  NOT NULL,
  title              VARCHAR(150) NOT NULL,
  subject            VARCHAR(150) NOT NULL,
  professor_id       INT NOT NULL,
  duration_minutes   INT NOT NULL DEFAULT 45,
  violation_threshold INT NOT NULL DEFAULT 3,
  status             ENUM('draft','scheduled','available','closed') NOT NULL DEFAULT 'draft',
  scheduled_at       DATETIME NULL,
  detect_face_angle  TINYINT(1) NOT NULL DEFAULT 1,
  detect_eye_gaze    TINYINT(1) NOT NULL DEFAULT 1,
  detect_multi_face  TINYINT(1) NOT NULL DEFAULT 1,
  block_copy_paste   TINYINT(1) NOT NULL DEFAULT 1,
  detect_tab_switch  TINYINT(1) NOT NULL DEFAULT 1,
  require_camera     TINYINT(1) NOT NULL DEFAULT 1,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professor_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Questions: media_json holds {kind, src, caption, data, headers, rows}
CREATE TABLE questions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  exam_id        INT NOT NULL,
  position       INT NOT NULL DEFAULT 1,
  type           ENUM('multiple-choice','essay') NOT NULL,
  prompt         TEXT NOT NULL,
  points         INT NOT NULL DEFAULT 1,
  choices_json   TEXT NULL,
  correct_answer VARCHAR(255) NULL,
  media_json     MEDIUMTEXT NULL,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Exam sections: which student sections may take an exam. No rows = every section can take it.
CREATE TABLE exam_sections (
  exam_id INT NOT NULL,
  section VARCHAR(30) NOT NULL,
  PRIMARY KEY (exam_id, section),
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Submissions: one per student per exam
CREATE TABLE submissions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  exam_id       INT NOT NULL,
  student_id    INT NOT NULL,
  started_at    DATETIME NOT NULL,
  submitted_at  DATETIME NULL,
  mode          ENUM('in-progress','manual','auto') NOT NULL DEFAULT 'in-progress',
  progress      INT NOT NULL DEFAULT 0,
  auto_score    INT NOT NULL DEFAULT 0,   -- graded multiple-choice points
  essay_score   INT NULL,                 -- filled in by professor
  max_score     INT NOT NULL DEFAULT 0,
  last_ping     DATETIME NULL,
  last_ping_ms  INT NULL,
  pending_warning VARCHAR(255) NULL,      -- instructor warning delivered on next heartbeat
  draft_json    MEDIUMTEXT NULL,          -- autosaved answers (used for forced submits)
  reopen_count  INT NOT NULL DEFAULT 0,   -- times a professor re-opened this attempt after an auto-submit
  reopened_at   DATETIME NULL,
  UNIQUE KEY uq_exam_student (exam_id, student_id),
  FOREIGN KEY (exam_id)    REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Answers: every student response
CREATE TABLE answers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  question_id   INT NOT NULL,
  answer_text   MEDIUMTEXT NULL,
  is_correct    TINYINT(1) NULL,
  points_earned INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_sub_q (submission_id, question_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id)   REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Violations: audit log with type + timestamp
CREATE TABLE violations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  type_id       VARCHAR(30)  NOT NULL,
  label         VARCHAR(150) NOT NULL,
  severity      ENUM('medium','high','critical') NOT NULL DEFAULT 'medium',
  occurred_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Violation history: violations of an earlier attempt, kept for the audit trail when a professor re-opens an exam
CREATE TABLE violation_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  attempt       INT NOT NULL,
  type_id       VARCHAR(30)  NOT NULL,
  label         VARCHAR(150) NOT NULL,
  severity      ENUM('medium','high','critical') NOT NULL DEFAULT 'medium',
  occurred_at   TIMESTAMP NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Reference data: departments, programs, current school year
-- ---------------------------------------------------------------------
INSERT INTO departments (code, name) VALUES
('CITCS','College of Information Technology and Computer Studies'),
('CAS','College of Arts and Sciences'),
('CBA','College of Business Administration'),
('CCJ','College of Criminal Justice'),
('COA','College of Accountancy');

INSERT INTO programs (department_id, code, name, years) VALUES
((SELECT id FROM departments WHERE code='CITCS'),'BSIT','Bachelor of Science in Information Technology',4),
((SELECT id FROM departments WHERE code='CITCS'),'BSCS','Bachelor of Science in Computer Science',4),
((SELECT id FROM departments WHERE code='CITCS'),'ACT','Associate in Computer Technology',2),
((SELECT id FROM departments WHERE code='CAS'),'BACOM','Bachelor of Arts in Communication',4),
((SELECT id FROM departments WHERE code='CAS'),'BPA','Bachelor of Public Administration',4),
((SELECT id FROM departments WHERE code='CAS'),'BSPSY','Bachelor of Science in Psychology',4),
((SELECT id FROM departments WHERE code='CBA'),'BSBA','Bachelor of Science in Business Administration',4),
((SELECT id FROM departments WHERE code='CCJ'),'BSCRIM','Bachelor of Science in Criminology',4),
((SELECT id FROM departments WHERE code='CCJ'),'BSISM','Bachelor of Science in Industrial Security Management',4),
((SELECT id FROM departments WHERE code='COA'),'BSA','Bachelor of Science in Accountancy',4),
((SELECT id FROM departments WHERE code='COA'),'BSMA','Bachelor of Science in Management Accounting',4);

INSERT INTO school_years (label, start_date, end_date, is_current) VALUES ('2026-2027','2026-08-01','2027-05-31',1);
