begin;
-- No public access. Server-only throttle persists across Vercel instances.
create table public.cs_code_attempts(key text primary key,window_start timestamptz not null,attempts integer not null);
alter table public.cs_code_attempts enable row level security;
revoke all on public.cs_code_attempts from public,anon,authenticated;
create function public.cs_code_limit(p_key text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if p_key !~ '^[a-f0-9]{64}$' then return false;end if;
 insert into public.cs_code_attempts as a values(p_key,now(),1)
 on conflict(key) do update set
 attempts=case when a.window_start<now()-interval '10 minutes' then 1 else a.attempts+1 end,
 window_start=case when a.window_start<now()-interval '10 minutes' then now() else a.window_start end
 returning attempts into n;
 return n<=5;
end $$;
revoke all on function public.cs_code_limit(text) from public,anon,authenticated;
grant execute on function public.cs_code_limit(text) to service_role;
commit;

begin;
create table public.cs_code_requests(
 student_no text primary key check(student_no ~ '^[0-9]{4,12}$'),
 status text not null default 'pending' check(status in ('pending','issuing','issued')),
 issuing_at timestamptz
);
alter table public.cs_code_requests enable row level security;
revoke all on public.cs_code_requests from public,anon,authenticated;
grant select on public.cs_code_requests to authenticated;
grant all on public.cs_code_requests to service_role;
create policy staff_code_requests on public.cs_code_requests for select to authenticated using(public.cs_is_admin());
create function public.cs_code_claim(p_student_no text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 insert into public.cs_code_requests(student_no) values(p_student_no) on conflict do nothing;
 update public.cs_code_requests set status='issuing',issuing_at=now()
 where student_no=p_student_no and (status<>'issuing' or issuing_at<now()-interval '5 minutes');
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.cs_code_claim(text) from public,anon,authenticated;
grant execute on function public.cs_code_claim(text) to service_role;
commit;

create or replace function public.cs_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if coalesce(new.raw_user_meta_data->>'app','') <> 'counsel' then return new; end if;
  if coalesce(new.raw_app_meta_data->>'cs_code_issued','false')<>'true' then raise exception '교수의 본인 확인 후 코드를 발급받아 주세요.';end if;
  select name into v_name from public.cs_roster where student_no = new.raw_user_meta_data->>'student_no';
  if v_name is null then
    raise exception '학생 명단에 없는 학번입니다.';
  end if;
  insert into public.cs_profiles (id, student_no, name)
  values (new.id, new.raw_user_meta_data->>'student_no', v_name);
  return new;
end;
$$;

-- A repeated request queues a reissue without interrupting a live issuance.
create function public.cs_code_request(p_student_no text) returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.cs_code_requests as r(student_no) values(p_student_no)
 on conflict(student_no) do update set status=case when r.status='issuing' then 'issuing' else 'pending' end;
$$;
revoke all on function public.cs_code_request(text) from public,anon,authenticated;
grant execute on function public.cs_code_request(text) to service_role;
