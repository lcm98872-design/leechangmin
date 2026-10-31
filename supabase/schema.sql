-- 수강 계획 관리 서비스 스키마 (Supabase / PostgreSQL)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 Run. 그다음 seed.sql 실행.

drop table if exists plan_courses, plans, general_courses, major_courses, courses, grad_requirements, majors cascade;

-- ── 학교 데이터 ──────────────────────────────────────────────
create table majors (
  id          int generated always as identity primary key,
  department  text not null,
  name        text not null unique
);

create table grad_requirements (
  major_id           int primary key references majors(id),
  total_credits      int not null,   -- 졸업소요학점
  general_required   int not null,   -- 교양필수
  general_total      int not null,   -- 교양계
  major_core         int not null,   -- 전공공통·필수
  major_elective     int not null,   -- 전공선택
  major_basic_total  int not null,   -- 일반전공계
  major_advanced     int not null,   -- 심화전공
  free_elective      int not null,   -- 자유선택
  source             text
);

create table courses (
  id         int generated always as identity primary key,
  name       text not null,
  credits    int  not null,
  lecture_h  int  not null,
  lab_h      int  not null,
  kind       text not null check (kind in ('major','general')),
  unique (name, kind, credits, lecture_h, lab_h)
);

-- 같은 과목이라도 전공마다 이수구분·권장학기가 다르다
create table major_courses (
  major_id   int  not null references majors(id),
  course_id  int  not null references courses(id),
  category   text not null check (category in ('전공공통','전공필수','전공선택')),
  year       int  not null,
  semesters  text not null,          -- '1' / '2' / '1,2'
  source     text,
  primary key (major_id, course_id)
);

create table general_courses (
  course_id       int primary key references courses(id),
  category        text not null check (category in ('필수교양','균형교양')),
  competency      text,
  area            text,
  required_group  text,
  note            text
);

-- ── 사용자 데이터 (계획 → 신청 → 이수 프로세스) ─────────────────
create table plans (
  id              int generated always as identity primary key,
  nickname        text not null,
  major_id        int  not null references majors(id),
  admission_year  int  not null,
  max_credits     int  not null default 18 check (max_credits between 1 and 30),
  double_major    boolean not null default false,
  created_at      timestamptz not null default now()
);

create table plan_courses (
  id           int generated always as identity primary key,
  plan_id      int  not null references plans(id) on delete cascade,
  course_id    int  not null references courses(id),
  term         text not null,        -- '2027-1'
  status       text not null default 'planned'
               check (status in ('planned','registered','failed','completed','retake')),
  replaced_by  int  references plan_courses(id),
  updated_at   timestamptz not null default now()
);

-- ── 접근 권한: 학교 데이터는 누구나 읽기만 가능 ───────────────────
alter table majors            enable row level security;
alter table grad_requirements enable row level security;
alter table courses           enable row level security;
alter table major_courses     enable row level security;
alter table general_courses   enable row level security;
alter table plans             enable row level security;
alter table plan_courses      enable row level security;

create policy "read" on majors            for select using (true);
create policy "read" on grad_requirements for select using (true);
create policy "read" on courses           for select using (true);
create policy "read" on major_courses     for select using (true);
create policy "read" on general_courses   for select using (true);
-- plans / plan_courses 정책은 계획 저장 기능을 만들 때 추가한다
