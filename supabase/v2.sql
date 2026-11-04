-- 상담 웹앱 2차 고도화 (schema.sql 다음에 실행)
-- 분야 7개, 고민의 크기, 학생 공개분 분리, 반복 상담 시간, 익명 질문함, 개인정보 동의, 반

-- 1) 사용자: 반, 개인정보 동의
alter table public.cs_profiles add column if not exists class text;
alter table public.cs_profiles add column if not exists consent_at timestamptz;
alter table public.cs_profiles add column if not exists consent_version text;

-- 가입할 때 반도 명단에서 가져오기
create or replace function public.cs_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_class text;
begin
  if coalesce(new.raw_user_meta_data->>'app','') <> 'counsel' then return new; end if;
  select name, class into v_name, v_class from public.cs_roster where student_no = new.raw_user_meta_data->>'student_no';
  if v_name is null then
    raise exception '학생 명단에 없는 학번입니다.';
  end if;
  insert into public.cs_profiles (id, student_no, name, class)
  values (new.id, new.raw_user_meta_data->>'student_no', v_name, v_class);
  return new;
end;
$$;

-- 학생 본인의 개인정보 동의 기록
create or replace function public.cs_give_consent(p_version text)
returns void language sql security definer set search_path = public as $$
  update public.cs_profiles set consent_at = now(), consent_version = p_version where id = auth.uid();
$$;
revoke execute on function public.cs_give_consent(text) from public, anon;
grant execute on function public.cs_give_consent(text) to authenticated;

-- 2) 상담 신청: 분야 7개, 고민의 크기 1~5
alter table public.cs_requests drop constraint if exists cs_requests_topic_check;
alter table public.cs_requests add constraint cs_requests_topic_check
  check (topic in ('학교생활 적응','학업·성적','진로·국가고시','대인관계','경제·장학','건강·심리','기타'));
alter table public.cs_requests add column if not exists worry_level int check (worry_level between 1 and 5);

-- 위기 표시: 자해·자살 관련 표현 또는 고민의 크기 5
create or replace function public.cs_is_crisis_text(t text)
returns boolean language sql immutable as $$
  select coalesce(t,'') ~ '(죽고\s*싶|죽을\s*것\s*같|자살|자해|극단적|사라지고\s*싶|살기\s*싫|살고\s*싶지\s*않|목숨|손목|뛰어내리)';
$$;

create or replace function public.cs_prepare_request()
returns trigger language plpgsql as $$
begin
  if not public.cs_is_admin() then
    new.status := '대기';
    new.public_summary := null;
  end if;
  new.crisis_flag := public.cs_is_crisis_text(new.concern) or coalesce(new.worry_level,0) >= 5;
  return new;
end;
$$;

-- 3) 상담 기록: 신청 없이 교수가 바로 쓰는 정기 상담도 가능 (request_id 비워도 됨)
--    분야는 topic 칸을 그대로 사용
-- 학생에게 공개하는 요약·과제는 별도 표 (교수 전용 메모와 완전히 분리)
create table if not exists public.cs_note_shares (
  note_id bigint primary key references public.cs_notes(id) on delete cascade,
  student_id uuid not null references public.cs_profiles(id) on delete cascade,
  summary text,
  task text,
  created_at timestamptz not null default now()
);
alter table public.cs_note_shares enable row level security;
drop policy if exists cs_note_shares_select on public.cs_note_shares;
create policy cs_note_shares_select on public.cs_note_shares for select
  using (student_id = auth.uid() or public.cs_is_admin());
drop policy if exists cs_note_shares_admin_all on public.cs_note_shares;
create policy cs_note_shares_admin_all on public.cs_note_shares for all
  using (public.cs_is_admin()) with check (public.cs_is_admin());

-- 4) 반복 상담 시간 규칙
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

-- 규칙대로 상담 시간 만들기 (한국 시간 기준, 이미 있는 시간은 건너뜀)
create or replace function public.cs_generate_slots(p_rule_id bigint)
returns int language plpgsql security definer set search_path = public as $$
declare r public.cs_slot_rules; d date; t time; n int := 0;
begin
  if not public.cs_is_admin() then raise exception '교수만 할 수 있습니다.'; end if;
  select * into r from public.cs_slot_rules where id = p_rule_id;
  if r.id is null then raise exception '규칙을 찾을 수 없습니다.'; end if;
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

-- 5) 익명 질문함: 쓴 사람을 저장하지 않음
create table if not exists public.cs_anon_questions (
  id bigint generated always as identity primary key,
  body text not null check (char_length(body) between 2 and 500),
  answer text,
  answered_at timestamptz,
  is_public boolean not null default false,
  crisis_flag boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.cs_anon_questions enable row level security;
drop policy if exists cs_anon_select on public.cs_anon_questions;
create policy cs_anon_select on public.cs_anon_questions for select
  using (public.cs_is_admin() or (is_public and auth.uid() is not null));
drop policy if exists cs_anon_admin_all on public.cs_anon_questions;
create policy cs_anon_admin_all on public.cs_anon_questions for all
  using (public.cs_is_admin()) with check (public.cs_is_admin());

-- 학생은 이 함수로만 질문을 남김 (누가 썼는지 저장하지 않음)
create or replace function public.cs_ask_anon(p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  insert into public.cs_anon_questions (body, crisis_flag)
  values (trim(p_body), public.cs_is_crisis_text(p_body));
end;
$$;
revoke execute on function public.cs_ask_anon(text) from public, anon;
grant execute on function public.cs_ask_anon(text) to authenticated;

-- 6) 졸업생 기록 삭제 (교수만): 명단과 계정, 상담 기록을 함께 지움
create or replace function public.cs_purge_students(p_student_nos text[])
returns int language plpgsql security definer set search_path = public, auth as $$
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

-- 학생 공개분에 상담 날짜·분야도 함께 (학생은 cs_notes를 볼 수 없으므로)
alter table public.cs_note_shares add column if not exists counsel_date date;
alter table public.cs_note_shares add column if not exists topic text;
