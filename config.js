// Supabase 연결 정보
// Supabase 대시보드 > Project Settings > API 에서 복사해 넣습니다.
// publishable(공개용) 키는 웹페이지에 공개되어도 괜찮은 키입니다. (보안은 RLS가 담당)
// service_role 키는 절대 여기에 넣지 마세요.
window.APP_CONFIG = {
  SUPABASE_URL: "https://egwwmhmftixjmvrtivfm.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_zz7DgyaZayieo2vKGXhvrw_v6iHfLti",
  VAPID_PUBLIC_KEY: "BFEoZUIlv-vtra2zR3IDNbMpm7N2Cjr_9rFZ3B8lJm39W60x4s9O6ll8xQUOfundQZ4srOOco5n-VRHzaGD_Zt8", // 웹 푸시 공개키 (공개돼도 괜찮음)
  STUDENT_EMAIL_DOMAIN: "students.pt-counsel.app",
  COUNSEL_CENTER: "청암대학교 학생상담센터"
};
