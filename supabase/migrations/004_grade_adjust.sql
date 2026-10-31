-- 지난 휴학 학기 수에 음수 허용 (편입·조기 진급처럼 학년이 입학년도보다 높은 경우의 보정값)
alter table plans drop constraint if exists plans_past_leaves_check;
alter table plans add constraint plans_past_leaves_check check (past_leaves between -8 and 20);
