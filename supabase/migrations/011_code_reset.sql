-- 011: 접속 코드 분실 시 재설정
-- 흐름: 학생이 학번+이름으로 요청 → 교수 휴대폰 푸시 → 교수가 '허용' → 30분 안에 학생이 학번+이름 확인 후 새 코드 설정
-- 안전장치: 허용 30분 유효 · 1회용 · 이름 5번 틀리면 허용 취소 · 재설정 시 기존 로그인 모두 끊김

create table if not exists cs_code_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_no text not null,
  name text not null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid,
  expires_at timestamptz,
  used_at timestamptz,
  fails int not null default 0
);
create index if not exists cs_code_resets_no on cs_code_resets(student_no, requested_at desc);
alter table cs_code_resets enable row level security;
drop policy if exists cs_code_resets_admin on cs_code_resets;
create policy cs_code_resets_admin on cs_code_resets for select using (cs_is_admin());
revoke insert, update, delete on cs_code_resets from anon, authenticated;

create or replace function cs__norm(t text) returns text language sql immutable as
$$ select regexp_replace(coalesce(t,''), '\s', '', 'g') $$;

-- 학생 계정 찾기 (학번 + 이름이 맞아야 함)
create or replace function cs__find_student(p_no text, p_name text) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from cs_profiles p
  where p.role = 'student' and p.student_no = trim(p_no) and cs__norm(p.name) = cs__norm(p_name)
  limit 1
$$;

-- ① 학생: 재설정 요청 → 'requested' | 'approved' | 'not_found'
create or replace function cs_request_code_reset(p_no text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_open cs_code_resets;
begin
  v_uid := cs__find_student(p_no, p_name);
  if v_uid is null then return 'not_found'; end if;

  select * into v_open from cs_code_resets
   where user_id = v_uid and used_at is null
     and (approved_at is null or expires_at > now())
   order by requested_at desc limit 1;

  if found and v_open.approved_at is not null then return 'approved'; end if;
  if found and v_open.requested_at > now() - interval '24 hours' then
    -- 이미 대기 중: 10분이 지났으면 교수에게 한 번 더 알림
    if v_open.requested_at < now() - interval '10 minutes' then
      update cs_code_resets set requested_at = now() where id = v_open.id;
      begin perform cs_send_push('🔑 접속 코드 재설정 요청 (다시)', trim(p_name) || '(' || trim(p_no) || ') 학생이 코드를 잊었어요. 웹앱에서 허용해 주세요.', 'code-reset', false);
      exception when others then null; end;
    end if;
    return 'requested';
  end if;

  insert into cs_code_resets(user_id, student_no, name) values (v_uid, trim(p_no), trim(p_name));
  begin perform cs_send_push('🔑 접속 코드 재설정 요청', trim(p_name) || '(' || trim(p_no) || ') 학생이 코드를 잊었어요. 웹앱에서 허용해 주세요.', 'code-reset', false);
  exception when others then null; end;
  return 'requested';
end $$;

-- ② 학생: 상태 확인 → 'none' | 'requested' | 'approved'
create or replace function cs_code_reset_status(p_no text, p_name text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; r cs_code_resets;
begin
  v_uid := cs__find_student(p_no, p_name);
  if v_uid is null then return 'none'; end if;
  select * into r from cs_code_resets where user_id = v_uid and used_at is null
   order by requested_at desc limit 1;
  if not found then return 'none'; end if;
  if r.approved_at is not null and r.expires_at > now() then return 'approved'; end if;
  if r.approved_at is null and r.requested_at > now() - interval '24 hours' then return 'requested'; end if;
  return 'none';
end $$;

-- ③ 교수: 허용 (30분)
create or replace function cs_approve_code_reset(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not cs_is_admin() then raise exception '교수만 허용할 수 있습니다.'; end if;
  update cs_code_resets set approved_at = now(), approved_by = auth.uid(),
         expires_at = now() + interval '30 minutes', fails = 0
   where id = p_id and used_at is null;
end $$;

-- ③-2 교수: 요청 지우기(거절)
create or replace function cs_dismiss_code_reset(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not cs_is_admin() then raise exception '교수만 할 수 있습니다.'; end if;
  delete from cs_code_resets where id = p_id and used_at is null;
end $$;

-- ④ 학생: 새 코드 설정 (허용된 30분 안에만)
create or replace function cs_reset_code(p_no text, p_name text, p_new text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid; r cs_code_resets;
begin
  if length(coalesce(p_new,'')) < 6 then return 'short'; end if;

  -- 학번으로 허용된 요청을 먼저 찾고, 이름이 틀리면 실패 횟수를 올림
  select c.* into r from cs_code_resets c
   where c.student_no = trim(p_no) and c.used_at is null
     and c.approved_at is not null and c.expires_at > now()
   order by c.approved_at desc limit 1;
  if not found then return 'not_approved'; end if;

  v_uid := cs__find_student(p_no, p_name);
  if v_uid is null or v_uid <> r.user_id then
    update cs_code_resets set fails = fails + 1,
           expires_at = case when fails + 1 >= 5 then now() else expires_at end
     where id = r.id;
    return 'wrong';
  end if;

  update auth.users set encrypted_password = crypt(p_new, gen_salt('bf')), updated_at = now()
   where id = v_uid;
  delete from auth.refresh_tokens where user_id::text = v_uid::text;
  delete from auth.sessions where user_id = v_uid;
  update cs_code_resets set used_at = now() where id = r.id;
  return 'ok';
end $$;

revoke all on function cs__find_student(text, text) from public, anon, authenticated;
revoke all on function cs__norm(text) from public, anon, authenticated;
grant execute on function cs_request_code_reset(text, text) to anon, authenticated;
grant execute on function cs_code_reset_status(text, text) to anon, authenticated;
grant execute on function cs_reset_code(text, text, text) to anon, authenticated;
revoke all on function cs_approve_code_reset(uuid) from public, anon;
revoke all on function cs_dismiss_code_reset(uuid) from public, anon;
grant execute on function cs_approve_code_reset(uuid) to authenticated;
grant execute on function cs_dismiss_code_reset(uuid) to authenticated;

-- 교수 화면에서 새 요청을 바로 보도록
do $$ begin
  alter publication supabase_realtime add table cs_code_resets;
exception when others then null; end $$;
