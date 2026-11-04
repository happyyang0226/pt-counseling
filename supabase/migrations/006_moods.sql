-- 006: 학생 홈의 "오늘 기분" (하루 1개, 다시 누르면 바뀜). 1점은 교수 화면에 관심 표시.
create table if not exists public.cs_moods (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.cs_profiles(id) on delete cascade,
  mood int not null check (mood between 1 and 5),
  mood_date date not null default (now() at time zone 'Asia/Seoul')::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  checked_at timestamptz,                -- 교수가 확인한 때
  unique (student_id, mood_date)
);
alter table public.cs_moods enable row level security;
drop policy if exists cs_moods_select on public.cs_moods;
create policy cs_moods_select on public.cs_moods for select
  using (student_id = auth.uid() or public.cs_is_admin());
drop policy if exists cs_moods_admin_update on public.cs_moods;
create policy cs_moods_admin_update on public.cs_moods for update
  using (public.cs_is_admin()) with check (public.cs_is_admin());

-- 학생은 이 함수로만 오늘 기분을 저장 (본인 것만, 하루 1개)
create or replace function public.cs_set_mood(p_mood int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists (select 1 from public.cs_profiles where id = auth.uid() and role = 'student') then
    raise exception '학생만 기분을 남길 수 있습니다.';
  end if;
  if p_mood not between 1 and 5 then raise exception '1~5 사이로 골라 주세요.'; end if;
  insert into public.cs_moods (student_id, mood) values (auth.uid(), p_mood)
  on conflict (student_id, mood_date) do update set mood = excluded.mood, updated_at = now(), checked_at = null;
end;
$$;
revoke execute on function public.cs_set_mood(int) from public, anon;
grant execute on function public.cs_set_mood(int) to authenticated;
