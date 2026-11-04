-- 010: 새 상담 신청 웹 푸시 (교수 휴대폰·컴퓨터, 웹앱이 닫혀 있어도)
-- 흐름: 신청 저장 → 이 트리거가 교수 기기 목록과 문구를 담아 Vercel /api/push 호출 → 기기로 푸시
create extension if not exists pg_net with schema extensions;

-- 교수가 등록한 푸시 받을 기기
create table if not exists public.cs_push_subs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now()
);
alter table public.cs_push_subs enable row level security;
drop policy if exists cs_push_subs_admin on public.cs_push_subs;
create policy cs_push_subs_admin on public.cs_push_subs for all
  using (public.cs_is_admin()) with check (public.cs_is_admin());

-- 서버 전용 설정 (학생·교수 화면 어디서도 읽을 수 없음)
create table if not exists public.cs_private (key text primary key, value text not null);
alter table public.cs_private enable row level security;
revoke all on public.cs_private from public, anon, authenticated;
-- push_secret 값은 Vercel 환경변수 PUSH_SECRET 과 같아야 함 (이 파일에는 적지 않음)
insert into public.cs_private (key, value) values ('push_url', 'https://pt-counseling.vercel.app/api/push')
  on conflict (key) do update set value = excluded.value;

create or replace function public.cs_send_push(p_title text, p_body text, p_tag text, p_urgent boolean)
returns bigint language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_url text; v_secret text; v_subs jsonb; v_id bigint;
begin
  select value into v_url from cs_private where key = 'push_url';
  select value into v_secret from cs_private where key = 'push_secret';
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]') into v_subs from cs_push_subs;
  if v_url is null or v_secret is null or jsonb_array_length(v_subs) = 0 then return null; end if;
  select net.http_post(
    url := v_url,
    body := jsonb_build_object('title', p_title, 'body', p_body, 'tag', p_tag, 'urgent', p_urgent, 'url', '/', 'subscriptions', v_subs),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 8000) into v_id;
  return v_id;
end;
$$;
revoke execute on function public.cs_send_push(text, text, text, boolean) from public, anon, authenticated;

-- 신청이 저장되면 푸시 (실패해도 신청 저장은 막지 않음)
create or replace function public.cs_notify_new_request()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text; v_no text; v_area text; v_when text; v_head text;
begin
  begin
    select name, student_no into v_name, v_no from cs_profiles where id = new.student_id;
    select label into v_area from cs_items where id = new.area_id;
    v_when := case when new.preferred_at is not null
      then to_char(new.preferred_at at time zone 'Asia/Seoul', 'MM"월" DD"일" HH24:MI') else '시간 협의' end;
    v_head := case new.risk_grade when 'red' then '🔴 긴급 상담 신청' when 'yellow' then '🟡 새 상담 신청 (관심)' else '새 상담 신청' end;
    perform cs_send_push(v_head,
      format('%s(%s) · %s · %s', coalesce(v_name, '학생'), coalesce(v_no, ''), coalesce(v_area, new.topic, ''), v_when),
      'req-' || new.id, new.risk_grade = 'red');
  exception when others then
    raise warning 'push failed: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists cs_after_request_push on public.cs_requests;
create trigger cs_after_request_push after insert on public.cs_requests
  for each row execute function public.cs_notify_new_request();

-- 교수가 "푸시 시험 보내기"를 누를 때
create or replace function public.cs_push_test()
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.cs_is_admin() then raise exception '교수만 할 수 있습니다.'; end if;
  return cs_send_push('🔔 푸시 알림 시험', '이 알림이 보이면 새 상담 신청 알림이 잘 설정된 거예요.', 'cs-test', false);
end;
$$;
revoke execute on function public.cs_push_test() from public, anon;
grant execute on function public.cs_push_test() to authenticated;
