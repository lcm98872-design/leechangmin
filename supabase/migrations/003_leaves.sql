-- 휴학 정보: 지난 휴학 학기 수, 앞으로 휴학할 학기
alter table plans add column if not exists past_leaves int not null default 0 check (past_leaves between 0 and 20);
alter table plans add column if not exists leave_terms text[] not null default '{}';
