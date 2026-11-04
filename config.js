// ───────────────────────────────────────────────
// 바꿔야 할 설정값은 모두 이 파일에 있습니다.
// ───────────────────────────────────────────────
window.APP_CONFIG = {
  // Supabase 연결 (publishable 키는 공개되어도 괜찮습니다. 보안은 데이터베이스 권한 규칙이 담당)
  SUPABASE_URL: "https://egwwmhmftixjmvrtivfm.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_zz7DgyaZayieo2vKGXhvrw_v6iHfLti",
  STUDENT_EMAIL_DOMAIN: "students.pt-counsel.app",

  // 도움 연락처 (학생 화면 하단에 항상 표시)
  COUNSEL_CENTER_NAME: "청암대학교 학생상담센터",
  COUNSEL_CENTER_PHONE: "",          // ← 번호를 확인해 넣어 주세요. 비워 두면 이름만 보입니다.

  // 운영 설정
  IDLE_MINUTES: 30,                  // 이 시간 동안 사용하지 않으면 자동 로그아웃
  SEMESTER_GOAL: 2,                  // 학기당 정기 상담 목표 횟수
  CONSENT_VERSION: "2026-11",        // 동의서 내용을 바꾸면 이 값을 바꾸세요 (학생에게 다시 동의를 받음)
  RETENTION_TEXT: "졸업 후 1년",
  PROFESSOR_NAME: "양회송 교수",
};
