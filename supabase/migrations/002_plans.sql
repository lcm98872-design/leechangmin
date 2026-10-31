-- 계획 저장 테이블 (기존 plans / plan_courses 를 새 구조로 교체)
-- Supabase SQL Editor 에 붙여 넣고 Run. 교육과정 데이터는 그대로 둔다.

drop table if exists plan_courses, plan_items, plans cascade;

create table plans (
  id              int generated always as identity primary key,
  code            text not null unique,            -- 불러오기 코드 (추측하기 어려운 무작위 12자리)
  major_id        int  not null references majors(id),
  admission_year  int  not null,
  current_term    text not null check (current_term ~ '^\d{4}-[12]$'),
  target_term     text not null check (target_term ~ '^\d{4}-[12]$'),
  max_credits     int  not null check (max_credits between 3 and 30),
  interests       int[] not null default '{}',     -- 듣고 싶은 교양 (course id)
  status          text not null default '작성 중'
                  check (status in ('작성 중','자동 검사 통과','계획 확정','이수 결과 반영')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 과목 한 줄 = 이수 완료 / 수강 중 / 계획(과목 또는 빈 칸)
create table plan_items (
  id            int generated always as identity primary key,
  plan_id       int  not null references plans(id) on delete cascade,
  status        text not null check (status in ('completed','in_progress','planned')),
  term          text check (term ~ '^\d{4}-[12]$'),
  course_id     int  references courses(id),
  slot_type     text check (slot_type in ('전공선택','교양선택','자유선택')),
  slot_credits  int  check (slot_credits between 1 and 30),
  check ((course_id is not null) <> (slot_type is not null)),
  check (slot_type is null or (status = 'planned' and slot_credits is not null))
);
create index plan_items_plan_id on plan_items(plan_id);

-- 웹(publishable key)에서는 직접 읽고 쓸 수 없다. 서버가 secret key 로만 접근한다.
alter table plans      enable row level security;
alter table plan_items enable row level security;
