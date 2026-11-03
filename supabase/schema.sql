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

-- 보안 점검 보완
alter function public.cs_prepare_request() set search_path = public;
alter function public.cs_guard_request_update() set search_path = public;
alter function public.cs_prepare_question() set search_path = public;
revoke execute on function public.cs_handle_new_user() from anon, authenticated, public;

-- ============================================================
-- 2026-11-03: 상담 분야 변경, 분야별 피드백, 학기당 의무 상담 3회
-- ============================================================
alter table public.cs_requests drop constraint if exists cs_requests_topic_check;
alter table public.cs_requests add constraint cs_requests_topic_check check (topic = any (array[
 '취업','학업','진로','학교생활','교우관계','기타',
 '학교생활 적응','학업·성적','진로·국가고시','대인관계','경제·장학','건강·심리']));

create table if not exists public.cs_feedback (
  id bigint generated always as identity primary key,
  note_id bigint references public.cs_notes(id) on delete cascade,
  request_id bigint references public.cs_requests(id) on delete set null,
  student_id uuid not null references public.cs_profiles(id) on delete cascade,
  topic text not null check (topic in ('취업','학업','진로','학교생활','교우관계','기타')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists cs_feedback_student_idx on public.cs_feedback(student_id, created_at desc);
alter table public.cs_feedback enable row level security;
create policy cs_feedback_admin_all on public.cs_feedback for all to authenticated
  using (public.cs_is_admin()) with check (public.cs_is_admin());
create policy cs_feedback_student_select on public.cs_feedback for select to authenticated
  using (student_id = auth.uid());

create or replace function public.cs_mark_feedback_read()
returns void language sql security definer set search_path = public as $$
  update public.cs_feedback set read_at = now() where student_id = auth.uid() and read_at is null;
$$;
revoke all on function public.cs_mark_feedback_read() from public, anon;
grant execute on function public.cs_mark_feedback_read() to authenticated;

create or replace function public.cs_my_counsel_count(p_since date)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.cs_notes where student_id = auth.uid() and counsel_date >= p_since;
$$;
revoke all on function public.cs_my_counsel_count(date) from public, anon;
grant execute on function public.cs_my_counsel_count(date) to authenticated;

alter publication supabase_realtime add table public.cs_feedback;

-- ============================================================
-- 2026-11-03: 단계별 선택형 상담 신청 (분야 → 고민 → 상담 준비하기 → 방식·시간 → 확인)
-- 화면 문구와 별개로 항목마다 고유 ID를 두고, 서버에서 ID를 검증한다.
-- ============================================================
create table if not exists public.cs_items (
  id text primary key,
  kind text not null check (kind in ('area','concern','common','first','since','impact','help','mode')),
  area_id text,
  label text not null,
  hint text,
  icon text,
  sort int not null default 0,
  active boolean not null default true
);
alter table public.cs_items enable row level security;
create policy cs_items_read on public.cs_items for select to anon, authenticated using (true);
create policy cs_items_admin_all on public.cs_items for all to authenticated
  using (public.cs_is_admin()) with check (public.cs_is_admin());

insert into public.cs_items(id, kind, area_id, label, hint, icon, sort) values
 ('study','area',null,'공부·성적','공부 방법, 시험, 성적 고민','📚',1),
 ('career','area',null,'진로·취업','하고 싶은 일, 전공, 취업 준비','🧭',2),
 ('school','area',null,'학교생활','적응, 출석, 실습, 휴학 고민','🏫',3),
 ('relation','area',null,'친구·대인관계','친구, 선후배, 가족, 연애','🤝',4),
 ('mind','area',null,'마음·스트레스','스트레스, 불안, 의욕, 잠','💬',5),
 ('life','area',null,'경제·생활','등록금, 장학금, 아르바이트, 자취','🏠',6),
 ('unsure','area',null,'잘 모르겠어요','무엇부터 말할지 몰라도 괜찮아요','❔',7),
 ('study.focus','concern','study','공부에 집중하기 어려워요',null,null,1),
 ('study.method','concern','study','어떻게 공부해야 할지 모르겠어요',null,null,2),
 ('study.exam','concern','study','시험이 부담돼요',null,null,3),
 ('study.grade','concern','study','성적이 기대보다 낮아요',null,null,4),
 ('study.practice','concern','study','과제나 실습을 따라가기 어려워요',null,null,5),
 ('study.fit','concern','study','전공 공부가 저와 맞는지 고민돼요',null,null,6),
 ('career.unknown','concern','career','무엇을 하고 싶은지 모르겠어요',null,null,1),
 ('career.job','concern','career','제게 맞는 직업을 찾고 싶어요',null,null,2),
 ('career.major','concern','career','전공을 계속할지 고민돼요',null,null,3),
 ('career.start','concern','career','취업 준비를 어떻게 시작할지 모르겠어요',null,null,4),
 ('career.cert','concern','career','자격증 준비가 고민돼요',null,null,5),
 ('career.resume','concern','career','이력서나 면접 준비에 도움이 필요해요',null,null,6),
 ('school.adapt','concern','school','학교에 적응하기 어려워요',null,null,1),
 ('school.burden','concern','school','학교에 가는 것이 부담스러워요',null,null,2),
 ('school.attend','concern','school','출석이나 시간 관리가 어려워요',null,null,3),
 ('school.clinical','concern','school','실습 생활이 걱정돼요',null,null,4),
 ('school.leave','concern','school','휴학이나 복학을 고민하고 있어요',null,null,5),
 ('school.continue','concern','school','학업을 계속할지 고민돼요',null,null,6),
 ('relation.make','concern','relation','친구를 사귀기 어려워요',null,null,1),
 ('relation.conflict','concern','relation','친구와 갈등이 있어요',null,null,2),
 ('relation.seniors','concern','relation','선후배와 지내기 어려워요',null,null,3),
 ('relation.professor','concern','relation','교수님과 이야기하기 어려워요',null,null,4),
 ('relation.family','concern','relation','가족과 갈등이 있어요',null,null,5),
 ('relation.dating','concern','relation','연애 관계로 고민하고 있어요',null,null,6),
 ('mind.stress','concern','mind','요즘 스트레스가 많아요',null,null,1),
 ('mind.anxiety','concern','mind','걱정이 많고 불안해요',null,null,2),
 ('mind.mood','concern','mind','기분이 가라앉거나 의욕이 없어요',null,null,3),
 ('mind.confidence','concern','mind','자신감이 떨어졌어요',null,null,4),
 ('mind.emotion','concern','mind','감정을 조절하기 어려워요',null,null,5),
 ('mind.sleep','concern','mind','잠이나 생활 리듬이 흐트러졌어요',null,null,6),
 ('life.tuition','concern','life','등록금이나 생활비가 부담돼요',null,null,1),
 ('life.scholarship','concern','life','장학금이나 지원제도를 알고 싶어요',null,null,2),
 ('life.parttime','concern','life','아르바이트와 공부를 병행하기 어려워요',null,null,3),
 ('life.housing','concern','life','기숙사나 자취 생활이 고민돼요',null,null,4),
 ('life.commute','concern','life','통학이 힘들어요',null,null,5),
 ('life.health','concern','life','건강이나 생활습관이 고민돼요',null,null,6),
 ('unsure.mixed','concern','unsure','여러 고민이 섞여 있어요',null,null,1),
 ('unsure.explain','concern','unsure','무엇이 힘든지 설명하기 어려워요',null,null,2),
 ('unsure.listen','concern','unsure','누군가 제 이야기를 들어줬으면 해요',null,null,3),
 ('unsure.organize','concern','unsure','상담하면서 함께 정리하고 싶어요',null,null,4),
 ('common.other','common',null,'여기에 없는 고민이 있어요',null,null,1),
 ('common.later','common',null,'자세한 이야기는 상담 때 할게요',null,null,2),
 ('first.later','first',null,'상담하면서 정할게요',null,null,1),
 ('since.1w','since',null,'최근 1주 이내',null,null,1),
 ('since.1m','since',null,'1개월 이내',null,null,2),
 ('since.3m','since',null,'3개월 이내',null,null,3),
 ('since.over3m','since',null,'3개월 이상',null,null,4),
 ('since.unsure','since',null,'잘 모르겠어요',null,null,5),
 ('since.later','since',null,'상담 때 이야기할게요',null,null,6),
 ('impact.none','impact',null,'거의 영향이 없어요',null,null,1),
 ('impact.little','impact',null,'조금 영향을 줘요',null,null,2),
 ('impact.some','impact',null,'어느 정도 영향을 줘요',null,null,3),
 ('impact.much','impact',null,'많이 영향을 줘요',null,null,4),
 ('impact.very','impact',null,'매우 많이 영향을 줘요',null,null,5),
 ('impact.later','impact',null,'상담 때 이야기할게요',null,null,6),
 ('help.listen','help',null,'제 이야기를 들어주셨으면 해요',null,null,1),
 ('help.organize','help',null,'고민을 함께 정리하고 싶어요',null,null,2),
 ('help.solve','help',null,'해결 방법을 함께 찾고 싶어요',null,null,3),
 ('help.info','help',null,'필요한 정보나 지원을 알고 싶어요',null,null,4),
 ('help.unsure','help',null,'아직 잘 모르겠어요',null,null,5),
 ('mode.offline','mode',null,'만나서 이야기하고 싶어요','대면',null,1),
 ('mode.online','mode',null,'비대면으로 이야기하고 싶어요','온라인',null,2),
 ('mode.either','mode',null,'어느 쪽이든 괜찮아요','어느 쪽이든',null,3)
on conflict (id) do update set kind=excluded.kind, area_id=excluded.area_id, label=excluded.label, hint=excluded.hint, icon=excluded.icon, sort=excluded.sort;

alter table public.cs_requests
  add column if not exists area_id text references public.cs_items(id),
  add column if not exists concern_ids text[] not null default '{}',
  add column if not exists first_concern_id text,
  add column if not exists other_concern text check (char_length(other_concern) <= 500),
  add column if not exists since_id text references public.cs_items(id),
  add column if not exists impact_id text references public.cs_items(id),
  add column if not exists help_ids text[] not null default '{}',
  add column if not exists mode_id text references public.cs_items(id),
  add column if not exists client_token uuid unique;   -- 같은 신청이 두 번 저장되지 않게
alter table public.cs_requests add constraint cs_requests_concern_len check (char_length(concern) <= 2000);
alter table public.cs_requests drop constraint if exists cs_requests_mode_check;
alter table public.cs_requests add constraint cs_requests_mode_check check (mode in ('대면','온라인','어느 쪽이든'));
alter table public.cs_requests drop constraint if exists cs_requests_topic_check;
alter table public.cs_requests add constraint cs_requests_topic_check check (topic = any (array[
 '공부·성적','진로·취업','학교생활','친구·대인관계','마음·스트레스','경제·생활','잘 모르겠어요',
 '취업','학업','진로','교우관계','기타','학교생활 적응','학업·성적','진로·국가고시','대인관계','경제·장학','건강·심리']));

-- 서버 검증: ID가 사전에 있고 종류가 맞는지 확인, 표시용 topic/mode는 서버가 채운다.
-- crisis_flag는 학생이 직접 쓴 글의 표현만 보고 표시한다(선택 응답으로 위험도를 판정하지 않음).
create or replace function public.cs_prepare_request()
returns trigger language plpgsql set search_path = public as $function$
declare v_bad text;
begin
  if not public.cs_is_admin() then
    new.status := '대기';
    new.public_summary := null;
  end if;
  if new.area_id is not null then
    if not exists (select 1 from cs_items where id = new.area_id and kind = 'area') then
      raise exception '알 수 없는 상담분야입니다.'; end if;
    select string_agg(c, ',') into v_bad from unnest(new.concern_ids) c
      where not exists (select 1 from cs_items i where i.id = c and i.kind in ('concern','common'));
    if v_bad is not null then raise exception '알 수 없는 고민 항목입니다: %', v_bad; end if;
    if new.first_concern_id is not null and new.first_concern_id <> 'first.later'
       and not (new.first_concern_id = any(new.concern_ids)) then
      raise exception '먼저 이야기할 고민은 선택한 고민 중에서 골라야 합니다.'; end if;
    if new.since_id is not null and not exists (select 1 from cs_items where id = new.since_id and kind = 'since') then
      raise exception '알 수 없는 응답입니다(시작 시기).'; end if;
    if new.impact_id is not null and not exists (select 1 from cs_items where id = new.impact_id and kind = 'impact') then
      raise exception '알 수 없는 응답입니다(영향 정도).'; end if;
    select string_agg(h, ',') into v_bad from unnest(new.help_ids) h
      where not exists (select 1 from cs_items i where i.id = h and i.kind = 'help');
    if v_bad is not null then raise exception '알 수 없는 응답입니다(원하는 도움): %', v_bad; end if;
    if new.mode_id is null or not exists (select 1 from cs_items where id = new.mode_id and kind = 'mode') then
      raise exception '상담 방식을 골라 주세요.'; end if;
    new.topic := (select label from cs_items where id = new.area_id);
    new.mode := (select hint from cs_items where id = new.mode_id);
  end if;
  new.crisis_flag := (coalesce(new.concern,'') || ' ' || coalesce(new.other_concern,'')) ~ '(죽고\s*싶|자살|자해|사라지고\s*싶|살기\s*싫)';
  return new;
end;
$function$;

create or replace function public.cs_guard_request_update()
returns trigger language plpgsql set search_path = public as $function$
begin
  if public.cs_is_admin() then return new; end if;
  if old.status = '대기' and new.status = '취소'
     and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
    return new;
  end if;
  raise exception '학생은 대기 중인 신청을 취소하는 것만 할 수 있습니다.';
end;
$function$;

alter table public.cs_feedback drop constraint if exists cs_feedback_topic_check;
alter table public.cs_feedback add constraint cs_feedback_topic_check check (topic in (
 '공부·성적','진로·취업','학교생활','친구·대인관계','마음·스트레스','경제·생활','잘 모르겠어요',
 '취업','학업','진로','교우관계','기타'));

create or replace function public.cs_my_info()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('name', p.name, 'student_no', p.student_no, 'class', r.class)
  from cs_profiles p left join cs_roster r on r.student_no = p.student_no where p.id = auth.uid();
$$;
revoke all on function public.cs_my_info() from public, anon;
grant execute on function public.cs_my_info() to authenticated;

-- ============================================================
-- 2026-11-03: 첫 화면 분야 카드에서 시작한 신청 기록 (교수 확인용)
-- cs_prepare_request()에 entry_area_id 검증 한 줄이 추가됨:
--   if new.entry_area_id is not null and not exists (select 1 from cs_items where id = new.entry_area_id and kind = 'area')
--   then raise exception '알 수 없는 시작 분야입니다.'; end if;
-- ============================================================
alter table public.cs_requests add column if not exists entry_area_id text references public.cs_items(id);
