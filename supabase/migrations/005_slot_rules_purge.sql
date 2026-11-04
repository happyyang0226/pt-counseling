-- 005: 요일·시간 반복 규칙으로 상담 시간 자동 생성 + 졸업생 기록 일괄 삭제
-- 기존 표와 데이터는 바꾸지 않고 추가만 합니다.

-- 1) 반복 규칙
create table if not exists public.cs_slot_rules (
  id bigint generated always as identity primary key,
  weekday int not null check (weekday between 0 and 6),   -- 0=일 1=월 … 6=토
  start_time time not null,
  end_time time not null,
  duration_min int not null default 30 check (duration_min between 10 and 120),
  valid_from date not null,
  valid_to date not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (valid_to >= valid_from)
);
alter table public.cs_slot_rules enable row level security;
drop policy if exists cs_slot_rules_admin_all on public.cs_slot_rules;
create policy cs_slot_rules_admin_all on public.cs_slot_rules for all
  using (public.cs_is_admin()) with check (public.cs_is_admin());

alter table public.cs_slots add column if not exists rule_id bigint references public.cs_slot_rules(id) on delete set null;
create unique index if not exists cs_slots_unique_start on public.cs_slots(starts_at);

-- 규칙대로 상담 시간 만들기 (한국 시간 기준, 이미 있는 시간은 건너뜀). 만든 개수를 돌려줌
create or replace function public.cs_generate_slots(p_rule_id bigint)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.cs_slot_rules; d date; t time; n int := 0;
begin
  if not public.cs_is_admin() then raise exception '교수만 할 수 있습니다.'; end if;
  select * into r from public.cs_slot_rules where id = p_rule_id;
  if r.id is null then raise exception '규칙을 찾을 수 없습니다.'; end if;
  if r.valid_to - r.valid_from > 200 then raise exception '기간은 200일 이내로 정해 주세요.'; end if;
  d := r.valid_from;
  while d <= r.valid_to loop
    if extract(dow from d) = r.weekday then
      t := r.start_time;
      while t + make_interval(mins => r.duration_min) <= r.end_time loop
        insert into public.cs_slots (starts_at, duration_min, rule_id)
        values ((d + t) at time zone 'Asia/Seoul', r.duration_min, r.id)
        on conflict (starts_at) do nothing;
        if found then n := n + 1; end if;
        t := t + make_interval(mins => r.duration_min);
      end loop;
    end if;
    d := d + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.cs_generate_slots(bigint) from public, anon;
grant execute on function public.cs_generate_slots(bigint) to authenticated;

-- 2) 졸업생 기록 일괄 삭제 (교수만)
-- 계정을 지우면 cs_profiles → 신청·상담 기록·피드백이 함께 지워짐(외래키 cascade). 명단에서도 뺌.
-- 익명 질문(cs_questions)은 누가 썼는지 모르므로 건드리지 않음.
create or replace function public.cs_purge_students(p_student_nos text[])
returns int language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare n int;
begin
  if not public.cs_is_admin() then raise exception '교수만 할 수 있습니다.'; end if;
  delete from auth.users u using public.cs_profiles p
   where p.id = u.id and p.role = 'student' and p.student_no = any(p_student_nos);
  get diagnostics n = row_count;
  delete from public.cs_roster where student_no = any(p_student_nos);
  return n;
end;
$$;
revoke execute on function public.cs_purge_students(text[]) from public, anon;
grant execute on function public.cs_purge_students(text[]) to authenticated;
