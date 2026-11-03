-- 물리치료학과 지도교수 상담 웹앱 — Supabase 데이터베이스 설정
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run 하면 됩니다.

-- 다른 웹앱과 같은 Supabase 프로젝트를 함께 쓰므로 모든 이름 앞에 cs_ 를 붙였습니다.

-- 1) 사용자 정보 (학생 / 교수)
create table if not exists public.cs_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_no text unique,
  name text not null,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

-- 2) 교수가 열어 둔 상담 가능 시간
create table if not exists public.cs_slots (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  duration_min int not null default 30,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) 학생 상담 신청 + 사전 질문지
create table if not exists public.cs_requests (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.cs_profiles(id) on delete cascade,
  slot_id bigint references public.cs_slots(id) on delete set null,
  mode text not null check (mode in ('대면','온라인')),
  topic text not null check (topic in ('학업','진로','학교생활','대인관계','기타')),
  concern text,
  satisfaction int check (satisfaction between 1 and 5),
  wish text,
  crisis_flag boolean not null default false,
  status text not null default '대기' check (status in ('대기','확정','완료','취소')),
  public_summary text,            -- 학생에게 공개하는 상담 요약
  created_at timestamptz not null default now()
);

-- 같은 시간에 두 명이 동시에 신청하지 못하게
create unique index if not exists cs_one_active_request_per_slot
  on public.cs_requests(slot_id) where status in ('대기','확정');

-- 4) 상담 일지 (교수만 볼 수 있음 — 교수 메모 포함)
create table if not exists public.cs_notes (
  id bigint generated always as identity primary key,
  request_id bigint references public.cs_requests(id) on delete set null,
  student_id uuid not null references public.cs_profiles(id) on delete cascade,
  counsel_date date not null default current_date,
  topic text,
  content text,
  opinion text,
  private_memo text,
  followup text,
  needs_followup boolean not null default false,
  next_date date,
  created_at timestamptz not null default now()
);

-- 교수 여부 확인 함수
create or replace function public.cs_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cs_profiles where id = auth.uid() and role = 'admin');
$$;

-- 가입하면 자동으로 profiles 행 만들기 (역할은 항상 student)
create or replace function public.cs_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data->>'app','') <> 'counsel' then return new; end if;
  insert into public.cs_profiles (id, student_no, name)
  values (new.id, new.raw_user_meta_data->>'student_no', coalesce(new.raw_user_meta_data->>'name','이름없음'));
  return new;
end;
$$;

drop trigger if exists cs_on_auth_user_created on auth.users;
create trigger cs_on_auth_user_created after insert on auth.users
  for each row execute function public.cs_handle_new_user();

-- 학생이 신청할 때: 위기 단어 자동 표시, 상태는 항상 '대기'로 시작
create or replace function public.cs_prepare_request()
returns trigger language plpgsql as $$
begin
  if not public.cs_is_admin() then
    new.status := '대기';
    new.public_summary := null;
  end if;
  new.crisis_flag := coalesce(new.concern,'') ~ '(죽고\s*싶|자살|자해|사라지고\s*싶|살기\s*싫)';
  return new;
end;
$$;

drop trigger if exists cs_before_request_insert on public.cs_requests;
create trigger cs_before_request_insert before insert on public.cs_requests
  for each row execute function public.cs_prepare_request();

-- 학생은 '대기' 신청을 '취소'로만 바꿀 수 있음
create or replace function public.cs_guard_request_update()
returns trigger language plpgsql as $$
begin
  if public.cs_is_admin() then return new; end if;
  if old.status = '대기' and new.status = '취소'
     and new.slot_id is not distinct from old.slot_id
     and new.public_summary is not distinct from old.public_summary then
    return new;
  end if;
  raise exception '학생은 대기 중인 신청을 취소하는 것만 할 수 있습니다.';
end;
$$;

drop trigger if exists cs_before_request_update on public.cs_requests;
create trigger cs_before_request_update before update on public.cs_requests
  for each row execute function public.cs_guard_request_update();

-- 행 수준 보안(RLS) 켜기
alter table public.cs_profiles enable row level security;
alter table public.cs_slots    enable row level security;
alter table public.cs_requests enable row level security;
alter table public.cs_notes    enable row level security;

-- profiles: 본인 또는 교수만 보기, 수정은 교수만
drop policy if exists cs_profiles_select on public.cs_profiles;
create policy cs_profiles_select on public.cs_profiles for select
  using (id = auth.uid() or public.cs_is_admin());
drop policy if exists cs_profiles_admin_update on public.cs_profiles;
create policy cs_profiles_admin_update on public.cs_profiles for update
  using (public.cs_is_admin());

-- slots: 로그인한 사람은 보기, 관리는 교수만
drop policy if exists cs_slots_select on public.cs_slots;
create policy cs_slots_select on public.cs_slots for select
  using (auth.uid() is not null);
drop policy if exists cs_slots_admin_all on public.cs_slots;
create policy cs_slots_admin_all on public.cs_slots for all
  using (public.cs_is_admin()) with check (public.cs_is_admin());

-- requests: 학생은 자기 것만 보기·신청·취소, 교수는 전체
drop policy if exists cs_requests_select on public.cs_requests;
create policy cs_requests_select on public.cs_requests for select
  using (student_id = auth.uid() or public.cs_is_admin());
drop policy if exists cs_requests_insert on public.cs_requests;
create policy cs_requests_insert on public.cs_requests for insert
  with check (student_id = auth.uid() or public.cs_is_admin());
drop policy if exists cs_requests_update on public.cs_requests;
create policy cs_requests_update on public.cs_requests for update
  using (student_id = auth.uid() or public.cs_is_admin());
drop policy if exists cs_requests_admin_delete on public.cs_requests;
create policy cs_requests_admin_delete on public.cs_requests for delete
  using (public.cs_is_admin());

-- notes: 교수만 (학생에게는 절대 보이지 않음)
drop policy if exists cs_notes_admin_all on public.cs_notes;
create policy cs_notes_admin_all on public.cs_notes for all
  using (public.cs_is_admin()) with check (public.cs_is_admin());

-- 학생이 볼 수 있는 열린 시간 (이미 신청된 시간은 빼고)
create or replace function public.cs_available_slots()
returns setof public.cs_slots language sql stable security definer set search_path = public as $$
  select s.* from public.cs_slots s
  where s.is_open and s.starts_at > now()
    and not exists (select 1 from public.cs_requests r
                    where r.slot_id = s.id and r.status in ('대기','확정'))
  order by s.starts_at;
$$;
grant execute on function public.cs_available_slots() to authenticated;

-- ※ 교수 계정: 이미 있는 Supabase 로그인 계정(이메일)을 교수로 등록
-- insert into public.cs_profiles (id, name, role)
--   select id, '양회송', 'admin' from auth.users where email = '교수이메일'
--   on conflict (id) do update set role = 'admin';

-- 5) 1학년 학생 명단 (명단에 있는 학번만 가입 가능)
create table if not exists public.cs_roster (
  student_no text primary key,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.cs_roster enable row level security;
drop policy if exists cs_roster_admin_all on public.cs_roster;
create policy cs_roster_admin_all on public.cs_roster for all
  using (public.cs_is_admin()) with check (public.cs_is_admin());

-- 가입 전에 학번 확인 (이름은 가운데 글자를 가려서 돌려줌)
create or replace function public.cs_roster_lookup(p_student_no text)
returns json language sql stable security definer set search_path = public as $$
  select case
    when r.student_no is null then json_build_object('found', false)
    else json_build_object(
      'found', true,
      'masked_name', case when char_length(r.name) <= 1 then r.name
                          when char_length(r.name) = 2 then left(r.name,1) || '*'
                          else left(r.name,1) || repeat('*', char_length(r.name)-2) || right(r.name,1) end,
      'registered', exists (select 1 from public.cs_profiles p where p.student_no = r.student_no))
  end
  from (select 1) d left join public.cs_roster r on r.student_no = trim(p_student_no);
$$;
grant execute on function public.cs_roster_lookup(text) to anon, authenticated;

-- 가입 시 명단 확인 + 이름은 명단에서 가져오기
create or replace function public.cs_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if coalesce(new.raw_user_meta_data->>'app','') <> 'counsel' then return new; end if;
  select name into v_name from public.cs_roster where student_no = new.raw_user_meta_data->>'student_no';
  if v_name is null then
    raise exception '학생 명단에 없는 학번입니다.';
  end if;
  insert into public.cs_profiles (id, student_no, name)
  values (new.id, new.raw_user_meta_data->>'student_no', v_name);
  return new;
end;
$$;

-- 명단에 반(A/B) 추가
alter table public.cs_roster add column if not exists class text check (class in ('A','B'));

-- ============================================================
-- 2026-11-03 업그레이드: 개인정보 동의, 고민 척도, 익명 질문함, 연락처 설정
-- ============================================================
alter table public.cs_profiles add column if not exists consent_at timestamptz;
alter table public.cs_requests add column if not exists worry_level int check (worry_level between 1 and 5);

alter table public.cs_requests drop constraint if exists cs_requests_topic_check;
alter table public.cs_requests add constraint cs_requests_topic_check check (topic = any (array[
 '학교생활 적응','학업·성적','진로·국가고시','대인관계','경제·장학','건강·심리','기타',
 '학업','진로','학교생활']));

create or replace function public.cs_give_consent()
returns timestamptz language sql security definer set search_path = public as $$
  update public.cs_profiles set consent_at = now() where id = auth.uid() returning consent_at;
$$;
revoke all on function public.cs_give_consent() from public, anon;
grant execute on function public.cs_give_consent() to authenticated;

-- 고민 척도 5점도 위기 신호로 표시
create or replace function public.cs_prepare_request()
returns trigger language plpgsql as $function$
begin
  if not public.cs_is_admin() then
    new.status := '대기';
    new.public_summary := null;
  end if;
  new.crisis_flag := coalesce(new.concern,'') ~ '(죽고\s*싶|자살|자해|사라지고\s*싶|살기\s*싫)'
                     or coalesce(new.worry_level,0) = 5;
  return new;
end;
$function$;

-- 익명 질문함: 작성자 정보를 저장하지 않는다
create table if not exists public.cs_questions (
  id bigint generated always as identity primary key,
  content text not null check (char_length(content) between 2 and 1000),
  answer text,
  is_public boolean not null default true,
  crisis_flag boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
alter table public.cs_questions enable row level security;
create policy cs_questions_admin_all on public.cs_questions for all to authenticated
  using (public.cs_is_admin()) with check (public.cs_is_admin());
create policy cs_questions_student_insert on public.cs_questions for insert to authenticated
  with check (exists (select 1 from public.cs_profiles where id = auth.uid()) and answer is null);
create policy cs_questions_student_select on public.cs_questions for select to authenticated
  using (answer is not null and is_public and exists (select 1 from public.cs_profiles where id = auth.uid()));

create or replace function public.cs_prepare_question()
returns trigger language plpgsql as $$
begin
  if not public.cs_is_admin() then new.answer := null; new.answered_at := null; new.is_public := true; end if;
  new.crisis_flag := coalesce(new.content,'') ~ '(죽고\s*싶|자살|자해|사라지고\s*싶|살기\s*싫)';
  return new;
end; $$;
create trigger cs_questions_prepare before insert on public.cs_questions
  for each row execute function public.cs_prepare_question();

-- 학생 화면 연락처 등 설정값
create table if not exists public.cs_settings (key text primary key, value text not null);
alter table public.cs_settings enable row level security;
create policy cs_settings_read on public.cs_settings for select to authenticated using (true);
create policy cs_settings_admin_all on public.cs_settings for all to authenticated
  using (public.cs_is_admin()) with check (public.cs_is_admin());
insert into public.cs_settings(key, value) values ('center_phone', '') on conflict do nothing;
