-- 008: 긴급 안내에 담당교수 전화번호 추가.
-- 교수 개인 번호는 로그인한 사람만 읽을 수 있게 (로그인 전 화면·외부 조회에는 나가지 않음)
drop policy if exists cs_settings_read on public.cs_settings;
create policy cs_settings_read on public.cs_settings for select
  using (key <> 'prof_phone' or auth.uid() is not null);
insert into public.cs_settings (key, value) values ('center_phone', '061-740-7199'), ('prof_phone', '010-9057-7340')
  on conflict (key) do update set value = excluded.value;
