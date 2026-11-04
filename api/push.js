// 새 상담 신청 푸시 알림 보내기 (Supabase 데이터베이스가 신청 저장 직후 호출)
// 비밀값(PUSH_SECRET)이 맞을 때만 보냄. 보낼 기기 목록과 문구는 데이터베이스가 함께 넘겨줌.
import webpush from "web-push";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.PUSH_SECRET || req.headers["x-push-secret"] !== process.env.PUSH_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { title, body, url, tag, urgent, subscriptions = [] } = req.body || {};
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://pt-counseling.vercel.app",
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ title, body, url: url || "/", tag, urgent: !!urgent });
  const results = await Promise.all(subscriptions.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
        { TTL: 60 * 60 * 24, urgency: urgent ? "high" : "normal" });
      return { endpoint: s.endpoint, ok: true };
    } catch (e) {
      return { endpoint: s.endpoint, ok: false, status: e.statusCode || 0 };
    }
  }));
  return res.status(200).json({ sent: results.filter((r) => r.ok).length, gone: results.filter((r) => [404, 410].includes(r.status)).map((r) => r.endpoint), results });
}
