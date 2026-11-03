# 물리치료학과 지도교수 상담 웹앱

학생이 상담을 신청하고 사전 질문지를 작성하면, 지도교수가 일정 확정, 상담 일지, 후속 조치를 관리하는 웹앱입니다.

- 구성: HTML + JavaScript (빌드 없음) · GitHub · Vercel · Supabase
- 파일
  - `index.html` 화면 구성
  - `app.js` 동작 (로그인, 신청, 일지 등)
  - `style.css` 디자인 (모바일 대응)
  - `config.js` Supabase 연결 정보
  - `supabase/schema.sql` 데이터베이스 표와 보안 설정

## 1. Supabase 설정

1. supabase.com 에서 새 프로젝트를 만든다. (Region: Northeast Asia (Seoul))
2. SQL Editor 에 `supabase/schema.sql` 전체를 붙여 넣고 Run 한다.
3. Authentication > Sign In / Providers > Email 에서 **Confirm email 을 끈다.**
   (학생은 학번으로 로그인하므로 이메일 확인 메일을 받을 수 없음)
4. Authentication > Users > Add user 로 교수 계정을 만든다. (이메일·비밀번호, Auto Confirm 체크)
5. SQL Editor 에서 교수 권한을 준다.
   ```sql
   update public.profiles set role = 'admin', name = '양회송'
   where id = (select id from auth.users where email = '교수이메일');
   ```
6. Project Settings > API 에서 Project URL 과 anon public 키를 복사해 `config.js` 에 넣는다.

## 2. Vercel 배포

1. vercel.com 에 GitHub 계정으로 로그인한다.
2. Add New > Project > `pt-counseling-app` 저장소 Import
3. Framework Preset: Other, 그대로 Deploy
4. 이후 GitHub 에 커밋하면 자동으로 다시 배포된다.

## 3. 사용 방법

- 학생: 학번·이름·접속 코드(6자 이상)로 가입 → 상담 신청 → 내 상담 내역 확인
- 교수: 교수 탭에서 로그인 → 상담 시간 열기 → 신청 확정 → 일지 작성·완료 → 학생별 이력, 후속 조치 확인

## 보안

- 학생은 자기 신청만 보고, 대기 중인 신청을 취소하는 것만 할 수 있다.
- 상담 일지(교수 메모 포함)는 교수만 볼 수 있다. 학생에게는 "공개 요약"만 보인다.
- 고민 내용에 위기 표현이 있으면 학생 화면에 109 위기상담전화 안내가 뜨고, 교수 화면에 경고 표시가 붙는다.
- service_role 키는 절대 코드에 넣지 않는다.
