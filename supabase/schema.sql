-- 물리치료학과 지도교수 상담 웹앱 — Supabase 데이터베이스 설정
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run 하면 됩니다.

-- 1) 사용자 정보 (학생 / 교수)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_no text unique,
  name text not null,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

-- 2) 교수가 열어 둔 상담 가능 시간
create table if not exists public.slots (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  duration_min int not null default 30,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) 학생 상담 신청 + 사전 질문지
create table if not exists public.requests (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  slot_id bigint references public.slots(id) on delete set null,
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
create unique index if not exists one_active_request_per_slot
  on public.requests(slot_id) where status in ('대기','확정');

-- 4) 상담 일지 (교수만 볼 수 있음 — 교수 메모 포함)
create table if not exists public.notes (
  id bigint generated always as identity primary key,
  request_id bigint references public.requests(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
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
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 가입하면 자동으로 profiles 행 만들기 (역할은 항상 student)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, student_no, name)
  values (new.id, new.raw_user_meta_data->>'student_no', coalesce(new.raw_user_meta_data->>'name','이름없음'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 학생이 신청할 때: 위기 단어 자동 표시, 상태는 항상 '대기'로 시작
create or replace function public.prepare_request()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() then
    new.status := '대기';
    new.public_summary := null;
  end if;
  new.crisis_flag := coalesce(new.concern,'') ~ '(죽고\s*싶|자살|자해|사라지고\s*싶|살기\s*싫)';
  return new;
end;
$$;

drop trigger if exists before_request_insert on public.requests;
create trigger before_request_insert before insert on public.requests
  for each row execute function public.prepare_request();

-- 학생은 '대기' 신청을 '취소'로만 바꿀 수 있음
create or replace function public.guard_request_update()
returns trigger language plpgsql as $$
begin
  if public.is_admin() then return new; end if;
  if old.status = '대기' and new.status = '취소'
     and new.slot_id is not distinct from old.slot_id
     and new.public_summary is not distinct from old.public_summary then
    return new;
  end if;
  raise exception '학생은 대기 중인 신청을 취소하는 것만 할 수 있습니다.';
end;
$$;

drop trigger if exists before_request_update on public.requests;
create trigger before_request_update before update on public.requests
  for each row execute function public.guard_request_update();

-- 행 수준 보안(RLS) 켜기
alter table public.profiles enable row level security;
alter table public.slots    enable row level security;
alter table public.requests enable row level security;
alter table public.notes    enable row level security;

-- profiles: 본인 또는 교수만 보기, 수정은 교수만
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update
  using (public.is_admin());

-- slots: 로그인한 사람은 보기, 관리는 교수만
drop policy if exists slots_select on public.slots;
create policy slots_select on public.slots for select
  using (auth.uid() is not null);
drop policy if exists slots_admin_all on public.slots;
create policy slots_admin_all on public.slots for all
  using (public.is_admin()) with check (public.is_admin());

-- requests: 학생은 자기 것만 보기·신청·취소, 교수는 전체
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests for select
  using (student_id = auth.uid() or public.is_admin());
drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests for insert
  with check (student_id = auth.uid() or public.is_admin());
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests for update
  using (student_id = auth.uid() or public.is_admin());
drop policy if exists requests_admin_delete on public.requests;
create policy requests_admin_delete on public.requests for delete
  using (public.is_admin());

-- notes: 교수만 (학생에게는 절대 보이지 않음)
drop policy if exists notes_admin_all on public.notes;
create policy notes_admin_all on public.notes for all
  using (public.is_admin()) with check (public.is_admin());

-- 학생이 볼 수 있는 열린 시간 (이미 신청된 시간은 빼고)
create or replace function public.available_slots()
returns setof public.slots language sql stable security definer set search_path = public as $$
  select s.* from public.slots s
  where s.is_open and s.starts_at > now()
    and not exists (select 1 from public.requests r
                    where r.slot_id = s.id and r.status in ('대기','확정'))
  order by s.starts_at;
$$;
grant execute on function public.available_slots() to authenticated;

-- ※ 교수 계정 만들기: 웹앱에서 교수 이메일로 가입한 뒤 아래 줄의 이메일을 바꿔 실행
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'ptyang@scjc.ac.kr');
