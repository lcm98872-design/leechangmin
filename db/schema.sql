-- 수강 계획 관리 서비스 DB 스키마 (초안)

-- ── 학교 데이터 (교육과정 안내서에서 가져옴) ─────────────────────
CREATE TABLE majors (
  id          INTEGER PRIMARY KEY,
  department  TEXT NOT NULL,              -- 학부: 시스템경영·안전공학부
  name        TEXT NOT NULL UNIQUE        -- 전공: 산업경영공학전공
);

CREATE TABLE grad_requirements (
  major_id              INTEGER PRIMARY KEY REFERENCES majors(id),
  total_credits         INTEGER NOT NULL, -- 졸업소요학점 132
  general_required      INTEGER NOT NULL, -- 교양필수 9
  general_total         INTEGER NOT NULL, -- 교양계 40
  major_core            INTEGER NOT NULL, -- 전공공통·필수 36
  major_elective        INTEGER NOT NULL, -- 전공선택 9
  major_basic_total     INTEGER NOT NULL, -- 일반전공계 45
  major_advanced        INTEGER NOT NULL, -- 심화전공 36
  free_elective         INTEGER NOT NULL, -- 자유선택 11
  source                TEXT
);

CREATE TABLE courses (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  credits   INTEGER NOT NULL,
  lecture_h INTEGER,
  lab_h     INTEGER,
  kind      TEXT NOT NULL CHECK (kind IN ('major','general')),
  UNIQUE (name, kind, credits, lecture_h, lab_h)
);

-- 같은 과목이라도 전공마다 이수구분·권장학기가 다르다 (예: 데이터베이스응용)
CREATE TABLE major_courses (
  major_id    INTEGER NOT NULL REFERENCES majors(id),
  course_id   INTEGER NOT NULL REFERENCES courses(id),
  category    TEXT NOT NULL CHECK (category IN ('전공공통','전공필수','전공선택')),
  year        INTEGER NOT NULL,           -- 권장 학년
  semesters   TEXT NOT NULL,              -- '1' / '2' / '1,2'
  source      TEXT,
  PRIMARY KEY (major_id, course_id)
);

CREATE TABLE general_courses (
  course_id       INTEGER PRIMARY KEY REFERENCES courses(id),
  category        TEXT NOT NULL CHECK (category IN ('필수교양','균형교양')),
  competency      TEXT,                   -- 핵심역량 6개 중 하나
  area            TEXT,                   -- 인간문화 / 사회역사 / 자연과학기술
  required_group  TEXT,                   -- 필수교양 택1 묶음 (예: 글로벌외국어)
  note            TEXT
);

-- ── 사용자 데이터 (프로세스) ───────────────────────────────────
CREATE TABLE plans (
  id               INTEGER PRIMARY KEY,
  nickname         TEXT NOT NULL,
  major_id         INTEGER NOT NULL REFERENCES majors(id),
  admission_year   INTEGER NOT NULL,
  max_credits      INTEGER NOT NULL DEFAULT 18,  -- 학기당 최대 학점 (사용자 입력)
  double_major     INTEGER NOT NULL DEFAULT 0,   -- 1이면 심화전공 대신 복수전공
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 과목 하나가 계획 → 신청 → 이수로 흘러가는 상태를 기록
CREATE TABLE plan_courses (
  id           INTEGER PRIMARY KEY,
  plan_id      INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  course_id    INTEGER NOT NULL REFERENCES courses(id),
  term         TEXT NOT NULL,             -- '2027-1'
  status       TEXT NOT NULL DEFAULT 'planned'
               CHECK (status IN ('planned','registered','failed','completed','retake')),
  replaced_by  INTEGER REFERENCES plan_courses(id), -- 신청 실패 시 대체한 과목
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
