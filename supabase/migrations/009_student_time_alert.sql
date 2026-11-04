-- 009: 학생이 상담 날짜·시간을 직접 정함 + 새 신청 실시간 알림
alter table public.cs_requests add column if not exists preferred_at timestamptz;

-- 학생이 정한 시간은 지금 이후, 60일 이내만
create or replace function public.cs_check_preferred()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.preferred_at is not null and not public.cs_is_admin()
     and (new.preferred_at < now() or new.preferred_at > now() + interval '60 days') then
    raise exception '희망 시간은 지금 이후 60일 안에서 골라 주세요.';
  end if;
  return new;
end;
$$;
drop trigger if exists cs_before_request_preferred on public.cs_requests;
create trigger cs_before_request_preferred before insert on public.cs_requests
  for each row execute function public.cs_check_preferred();

-- 교수 화면 실시간 알림 (권한 규칙 그대로 적용: 교수만 남의 신청을 받음)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cs_requests') then
    alter publication supabase_realtime add table public.cs_requests;
  end if;
end $$;
