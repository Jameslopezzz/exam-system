-- =====================================================================
-- Upgrade an EXISTING exam_system database (keeps your users, exams and results).
-- Fresh installs do not need this - schema.sql already includes everything.
-- =====================================================================
USE exam_system;

CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(150) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS programs (
  id INT AUTO_INCREMENT PRIMARY KEY, department_id INT NOT NULL, code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL, years TINYINT NOT NULL DEFAULT 4,
  FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS school_years (
  id INT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(20) NOT NULL UNIQUE, start_date DATE NOT NULL, end_date DATE NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0, promoted TINYINT(1) NOT NULL DEFAULT 0, promoted_at DATETIME NULL
) ENGINE=InnoDB;

ALTER TABLE users
  ADD COLUMN department_id INT NULL AFTER role,
  ADD COLUMN program_id INT NULL AFTER department_id,
  ADD COLUMN year_level VARCHAR(20) NULL AFTER program_id,
  ADD COLUMN graduated TINYINT(1) NOT NULL DEFAULT 0 AFTER year_level,
  ADD COLUMN approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved' AFTER graduated,
  ADD FOREIGN KEY (department_id) REFERENCES departments(id),
  ADD FOREIGN KEY (program_id) REFERENCES programs(id);

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

-- Existing accounts stay approved. Assign each professor / student a department (and the student a course + year)
-- from Admin Console > Accounts > Edit.
