import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG = window.APP_CONFIG;
// 로그인 정보는 탭을 닫으면 지워지는 sessionStorage에만 둔다 (공용 PC 대비)
const sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { storage: window.sessionStorage, persistSession: true },
});

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const show = (el, on = true) => el.classList.toggle("hidden", !on);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) : "");
const studentEmail = (no) => `${String(no).trim()}@${CFG.STUDENT_EMAIL_DOMAIN}`;
const CRISIS_RE = /(죽고\s*싶|자살|자해|사라지고\s*싶|살기\s*싫)/;
const TOPICS = ["취업", "학업", "진로", "학교생활", "교우관계", "기타"];
const REQUIRED = 3; // 한 학기 의무 상담 횟수

// 상담 분야 안내 (첫 화면, 학생 화면, 신청서에 함께 쓴다)
const AREAS = {
  취업: { icon: "💼", text: "물리치료사로 어디에서 일하고 싶은지(병원, 재활센터, 요양기관, 스포츠·지역사회 등), 실습기관과 취업처 정보, 이력서와 면접 준비, 국가시험 이후의 계획이 궁금할 때 상담을 받을 수 있습니다." },
  학업: { icon: "📚", text: "공부한 만큼 성적이 나오지 않거나 집중이 잘 되지 않을 때, 시험을 앞두고 불안과 긴장이 커서 힘들 때, 해부학처럼 공부할 양이 많은 과목의 학습 방법을 찾고 싶을 때 도움을 받을 수 있습니다." },
  진로: { icon: "🧭", text: "물리치료학이 나와 맞는지 확신이 서지 않거나, 앞으로의 방향(전공심화·대학원 진학, 관심 있는 전문 분야 등)을 정하기 어려울 때 나의 적성과 흥미를 함께 살펴볼 수 있습니다." },
  학교생활: { icon: "🏫", text: "대학 생활이나 기숙사·자취 생활에 적응하기 어려울 때, 시간 관리와 아르바이트·학업의 균형이 고민될 때, 장학금·휴학·복학 같은 학사 절차가 궁금할 때 상담을 받을 수 있습니다." },
  교우관계: { icon: "🤝", text: "새로운 환경에서 친구를 사귀기 어렵거나, 동기·선후배와의 관계, 조별 과제와 실습에서 생긴 갈등 때문에 마음이 불편할 때 함께 이야기할 수 있습니다." },
  기타: { icon: "💬", text: "위 분야에 딱 맞지 않는 고민도 괜찮습니다. 건강, 경제적 어려움, 가족이나 이성 관계, 성격에 대한 고민 등 무엇이든 편하게 신청하세요. 필요하면 학생상담센터 전문 상담으로 연결해 드립니다." },
};
const CENTER_AREAS = [
  ["가정", "가족 사이의 갈등이나 집안에 생긴 어려운 일 때문에 마음이 힘들 때"],
  ["이성관계", "연애 관계가 어렵고 힘들게 느껴지거나, 관계에 지나치게 매달리게 되어 괴로울 때"],
  ["성격", "소심함이나 수줍음 때문에 생활이 불편하거나, 내 성격이 마음에 들지 않아 더 성숙해지고 싶을 때"],
  ["성 상담", "성에 관한 궁금증이나 정체감의 혼란이 있을 때, 성폭력·성희롱으로 어려움을 겪을 때 (피해가 있었다면 학생상담센터나 전문 기관에 바로 도움을 요청하세요)"],
];
function renderAreas() {
  const html = TOPICS.map((t) => `<div class="area"><div class="area-head"><span class="area-icon">${AREAS[t].icon}</span><b>${t}</b></div><p>${AREAS[t].text}</p></div>`).join("");
  $("#area-list-intro").innerHTML = html;
  $("#area-list-student").innerHTML = html;
  $("#area-list-center").innerHTML = CENTER_AREAS.map(([t, d]) => `<div class="area center"><div class="area-head"><b>${t}</b></div><p>${d}</p></div>`).join("");
  const sel = $('#form-request [name="topic"]');
  const desc = () => ($("#topic-desc").textContent = AREAS[sel.value]?.text || "");
  sel.addEventListener("change", desc);
  desc();
}
renderAreas();
const IDLE_MIN = 20;

let me = null; // cs_profiles 행
let centerPhone = "";

const centerHTML = () => centerPhone
  ? `${esc(CFG.COUNSEL_CENTER)} <a href="tel:${esc(centerPhone.replace(/[^0-9]/g, ""))}">${esc(centerPhone)}</a>`
  : esc(CFG.COUNSEL_CENTER);

const crisisHTML = () => `
  <strong>혼자 견디지 않아도 됩니다.</strong><br />
  지금 많이 힘들다면 바로 도움을 요청해 주세요.<br />
  · 자살예방상담전화 <a href="tel:109"><b>109</b></a> (24시간)<br />
  · 정신건강위기상담 <a href="tel:15770199">1577-0199</a><br />
  · ${centerHTML()}<br />
  · 위급한 상황이면 <a href="tel:119">119</a> 또는 <a href="tel:112">112</a><br />
  교수님도 이 내용을 확인하고 빨리 연락드릴게요.`;

// ---------- 자동 로그아웃 ----------
let idleTimer = null;
function resetIdle() {
  clearTimeout(idleTimer);
  if (!me) return;
  idleTimer = setTimeout(async () => {
    sessionStorage.setItem("logout-msg", `${IDLE_MIN}분 동안 사용하지 않아 안전을 위해 자동으로 로그아웃했습니다.`);
    await sb.auth.signOut();
    location.reload();
  }, IDLE_MIN * 60 * 1000);
}
["click", "keydown", "touchstart", "scroll", "mousemove"].forEach((ev) =>
  window.addEventListener(ev, resetIdle, { passive: true }));

// ---------- 시작 ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin(sessionStorage.getItem("logout-msg") || "");
  sessionStorage.removeItem("logout-msg");
  const { data, error } = await sb.from("cs_profiles").select("*").eq("id", session.user.id).single();
  if (error || !data) { await sb.auth.signOut(); return showLogin("사용자 정보를 찾을 수 없습니다. 다시 로그인해 주세요."); }
  me = data;
  resetIdle();
  loadSettings();
  $("#who").innerHTML = `${esc(me.name)}${me.role === "admin" ? " 교수님" : ` (${esc(me.student_no)})`} <button id="logout" class="link">로그아웃</button>`;
  $("#logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
  show($("#view-login"), false);
  show($("#intro-top"), false);
  show($("#intro-areas"), false);
  if (me.role === "admin") {
    show($("#help-bar"), false);
    show($("#view-admin"));
    loadAdmin("dashboard");
  } else if (!me.consent_at) {
    show($("#view-consent"));
  } else {
    show($("#view-student"));
    loadStudent();
  }
}

function showLogin(msg = "") {
  $("#who").innerHTML = "";
  show($("#intro-top"));
  show($("#intro-areas"));
  show($("#view-login"));
  $("#login-msg").textContent = msg;
}

async function loadSettings() {
  const { data } = await sb.from("cs_settings").select("*");
  centerPhone = (data || []).find((r) => r.key === "center_phone")?.value || "";
  $("#help-center").innerHTML = centerHTML();
  if ($("#form-settings")) $("#form-settings").center_phone.value = centerPhone;
}

// ---------- 개인정보 동의 ----------
$("#consent-yes").onclick = async () => {
  const { error } = await sb.rpc("cs_give_consent");
  if (error) return ($("#consent-msg").textContent = "저장하지 못했습니다: " + error.message);
  me.consent_at = new Date().toISOString();
  show($("#view-consent"), false);
  show($("#view-student"));
  loadStudent();
};
$("#consent-no").onclick = async () => {
  if (!confirm("동의하지 않으면 웹앱을 사용할 수 없습니다. 로그아웃할까요?\n교수님 연구실로 직접 찾아와 상담을 받을 수 있습니다.")) return;
  await sb.auth.signOut();
  location.reload();
};

// ---------- 로그인 / 가입 ----------
$$("#view-login .tab").forEach((b) => (b.onclick = () => {
  $$("#view-login .tab").forEach((x) => x.classList.toggle("active", x === b));
  $$("#view-login .tabpane").forEach((p) => show(p, p.id === `form-${b.dataset.tab}`));
  $("#login-msg").textContent = "";
}));

$("#form-student-login").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await sb.auth.signInWithPassword({ email: studentEmail(f.get("student_no")), password: f.get("code") });
  if (error) return ($("#login-msg").textContent = /invalid/i.test(error.message) ? "학번 또는 접속 코드가 맞지 않습니다." : "로그인할 수 없습니다: " + error.message);
  boot();
};

$("#form-student-signup").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const no = String(f.get("student_no")).trim();
  const msg = (t) => ($("#login-msg").textContent = t);
  if (!/^\d{4,12}$/.test(no)) return msg("학번은 숫자로 입력해 주세요.");
  if (f.get("code") !== f.get("code2")) return msg("접속 코드가 서로 다릅니다.");
  const { data: info, error: le } = await sb.rpc("cs_roster_lookup", { p_student_no: no });
  if (le) return msg("학번을 확인하지 못했습니다: " + le.message);
  if (!info?.found) return msg("1학년 명단에 없는 학번입니다. 학번을 다시 확인하거나 교수님께 문의하세요.");
  if (info.registered) return msg("이미 가입된 학번입니다. 학생 로그인으로 들어가세요.");
  if (!confirm(`${info.masked_name} 학생이 맞나요?\n학번 ${no}\n\n이 학번으로 가입합니다.`)) return;
  const { error } = await sb.auth.signUp({
    email: studentEmail(no),
    password: f.get("code"),
    options: { data: { app: "counsel", student_no: no } },
  });
  if (error) {
    return msg(/registered|exists/i.test(error.message) ? "이미 가입된 학번입니다. 학생 로그인으로 들어가세요." : "가입 중 문제가 생겼습니다: " + error.message);
  }
  boot();
};

$("#form-admin-login").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") });
  if (error) return ($("#login-msg").textContent = /invalid/i.test(error.message) ? "이메일 또는 비밀번호가 맞지 않습니다." : "로그인할 수 없습니다: " + error.message);
  boot();
};

// ---------- 학생 화면 ----------
async function loadStudent() {
  const { data: slots } = await sb.rpc("cs_available_slots");
  const sel = $("#slot-select");
  sel.innerHTML = (slots || []).map((s) => `<option value="${s.id}">${fmt(s.starts_at)} (${s.duration_min}분)</option>`).join("");
  show($("#no-slot"), !slots?.length);
  sel.disabled = !slots?.length;
  loadMyRequests();
  loadPublicQuestions();
  loadMyProgress();
  loadMyFeedback();
  watchFeedback();
}

// 이번 학기 의무 상담 진행 상황
async function loadMyProgress() {
  const sem = semesterStart();
  const { data: n } = await sb.rpc("cs_my_counsel_count", { p_since: sem.start });
  const cnt = n || 0;
  $("#my-sem-title").textContent = `${sem.label} 상담`;
  $("#my-count").textContent = `${cnt} / ${REQUIRED}회`;
  $("#my-count").classList.toggle("done", cnt >= REQUIRED);
  $("#my-dots").innerHTML = Array.from({ length: Math.max(REQUIRED, cnt) }, (_, i) => `<span class="dot ${i < cnt ? "on" : ""}"></span>`).join("");
  $("#my-count-msg").textContent = cnt >= REQUIRED
    ? "이번 학기 의무 상담을 모두 마쳤습니다. 더 필요하면 언제든 신청하세요."
    : `이번 학기에는 지도교수 상담을 ${REQUIRED}번 받아야 합니다. ${REQUIRED - cnt}번 남았습니다.`;
}

// 교수님 피드백 (분야별)
let fbTopic = "";
let myFeedback = [];
async function loadMyFeedback() {
  const { data } = await sb.from("cs_feedback").select("*").order("created_at", { ascending: false });
  myFeedback = data || [];
  const unread = myFeedback.filter((f) => !f.read_at).length;
  show($("#fb-new"), unread > 0);
  $("#fb-new").textContent = `새 피드백 ${unread}`;
  const counts = Object.fromEntries(TOPICS.map((t) => [t, myFeedback.filter((f) => f.topic === t).length]));
  $("#fb-filter").innerHTML = [["", `전체 ${myFeedback.length}`], ...TOPICS.map((t) => [t, `${t} ${counts[t]}`])]
    .map(([v, l]) => `<button type="button" class="chip-btn ${fbTopic === v ? "active" : ""}" data-fbt="${v}">${l}</button>`).join("");
  $$("[data-fbt]").forEach((b) => (b.onclick = () => { fbTopic = b.dataset.fbt; loadMyFeedback(); }));
  const list = myFeedback.filter((f) => !fbTopic || f.topic === fbTopic);
  $("#my-feedback").innerHTML = list.length ? list.map((f) => `
    <div class="item fb-item ${f.read_at ? "" : "unread"}">
      <div class="row between"><span><span class="badge topic">${esc(f.topic)}</span>${f.read_at ? "" : `<span class="badge new">새</span>`}</span>
        <span class="hint">${new Date(f.created_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</span></div>
      <p>${esc(f.content)}</p>
    </div>`).join("")
    : `<p class="hint">${fbTopic ? `${esc(fbTopic)} 분야 피드백이 아직 없습니다.` : "상담을 마치면 교수님 피드백이 여기에 바로 나타납니다."}</p>`;
  if (unread) setTimeout(() => sb.rpc("cs_mark_feedback_read"), 4000); // 화면에 보인 뒤 읽음 처리
}

let fbChannel = null;
function watchFeedback() {
  if (fbChannel) return;
  fbChannel = sb.channel("my-feedback")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "cs_feedback", filter: `student_id=eq.${me.id}` }, () => {
      toast("교수님 피드백이 새로 도착했습니다.");
      loadMyFeedback();
      loadMyProgress();
      loadMyRequests();
    })
    .subscribe();
}

function toast(text) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function updateCrisisBox() {
  const f = $("#form-request");
  const hit = CRISIS_RE.test(f.concern.value) || f.querySelector('[name="worry_level"]:checked')?.value === "5";
  $("#crisis-live").innerHTML = hit ? crisisHTML() : "";
  show($("#crisis-live"), hit);
}
$("#concern").addEventListener("input", updateCrisisBox);
$$('[name="worry_level"]').forEach((r) => r.addEventListener("change", updateCrisisBox));

$("#form-request").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const row = {
    student_id: me.id,
    slot_id: Number(f.get("slot_id")),
    mode: f.get("mode"),
    topic: f.get("topic"),
    concern: f.get("concern"),
    worry_level: Number(f.get("worry_level")),
    satisfaction: Number(f.get("satisfaction")),
    wish: f.get("wish"),
  };
  const { error } = await sb.from("cs_requests").insert(row);
  if (error) {
    $("#request-msg").textContent = /duplicate|unique/i.test(error.message)
      ? "방금 다른 학생이 그 시간을 신청했습니다. 다른 시간을 골라 주세요."
      : "신청 중 문제가 생겼습니다: " + error.message;
    return loadStudent();
  }
  $("#request-msg").textContent = "신청했습니다. 교수님이 확정하면 상태가 바뀝니다.";
  const keepCrisis = CRISIS_RE.test(row.concern || "") || row.worry_level === 5;
  e.target.reset();
  $('#form-request [name="topic"]').dispatchEvent(new Event("change"));
  show($("#crisis-live"), keepCrisis);
  loadStudent();
};

async function loadMyRequests() {
  const { data, error } = await sb.from("cs_requests").select("*, slots:cs_slots(starts_at, duration_min)").order("created_at", { ascending: false });
  const box = $("#my-requests");
  if (error) return (box.textContent = error.message);
  if (!data.length) return (box.innerHTML = `<p class="hint">아직 신청한 상담이 없습니다.</p>`);
  box.innerHTML = data.map((r) => `
    <div class="item">
      <div class="row between">
        <b>${r.slots ? fmt(r.slots.starts_at) : "시간 미정"} · ${esc(r.mode)} · ${esc(r.topic)}</b>
        <span class="badge s-${esc(r.status)}">${esc(r.status)}</span>
      </div>
      ${r.public_summary ? `<p class="summary"><b>교수님 상담 요약·과제</b><br />${esc(r.public_summary)}</p>` : ""}
      ${r.status === "대기" ? `<button class="small" data-cancel="${r.id}">신청 취소</button>` : ""}
    </div>`).join("");
  $$("[data-cancel]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm("이 신청을 취소할까요?")) return;
    const { error } = await sb.from("cs_requests").update({ status: "취소" }).eq("id", b.dataset.cancel);
    if (error) alert(error.message);
    loadStudent();
  }));
}

// 익명 질문 (학생)
$("#form-question").onsubmit = async (e) => {
  e.preventDefault();
  const content = String(new FormData(e.target).get("content")).trim();
  if (content.length < 2) return;
  const { error } = await sb.from("cs_questions").insert({ content });
  if (error) return ($("#question-msg").textContent = "보내지 못했습니다: " + error.message);
  $("#question-msg").textContent = "익명으로 보냈습니다. 답변이 달리면 아래 목록에 보입니다.";
  e.target.reset();
  if (CRISIS_RE.test(content)) { $("#question-msg").innerHTML = `<div class="crisis">${crisisHTML()}</div>`; }
};

async function loadPublicQuestions() {
  const { data } = await sb.from("cs_questions").select("content, answer, answered_at").order("answered_at", { ascending: false }).limit(30);
  const box = $("#public-questions");
  box.innerHTML = data?.length
    ? `<h3>답변한 질문</h3>` + data.map((q) => `<div class="item"><p><b>Q.</b> ${esc(q.content)}</p><p class="summary"><b>A.</b> ${esc(q.answer)}</p></div>`).join("")
    : "";
}

// ---------- 교수 화면 ----------
$$("#view-admin .tab").forEach((b) => (b.onclick = () => loadAdmin(b.dataset.admin)));

// 반(A/B) 구분: 명단(cs_roster)의 class 값을 학번으로 찾아 쓴다
let classFilter = "";
let CMAP = {};
let curPane = "dashboard";
const CLASS_NAME = { A: "A반", B: "B반" };
const inClass = (no) => !classFilter || CMAP[no] === classFilter;
const classTag = (no) => (CMAP[no] ? `<span class="badge cls-${CMAP[no]}">${CLASS_NAME[CMAP[no]]}</span>` : "");
async function refreshClassMap() {
  const { data } = await sb.from("cs_roster").select("student_no, class");
  CMAP = Object.fromEntries((data || []).map((r) => [r.student_no, r.class]));
}
$$("#class-filter button").forEach((b) => (b.onclick = () => {
  classFilter = b.dataset.class;
  $$("#class-filter button").forEach((x) => x.classList.toggle("active", x === b));
  loadAdmin(curPane);
}));

async function loadAdmin(pane) {
  curPane = pane;
  $$("#view-admin .tab").forEach((x) => x.classList.toggle("active", x.dataset.admin === pane));
  $$(".adminpane").forEach((p) => show(p, p.id === `admin-${pane}`));
  await refreshClassMap();
  ({ dashboard: loadDashboard, requests: loadRequests, slots: loadSlots, students: loadStudents, followup: loadFollowup, questions: loadQuestions, roster: loadRoster })[pane]();
}

function semesterStart() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  if (m >= 9) return { start: `${y}-09-01`, label: `${y}년 2학기` };
  if (m >= 3) return { start: `${y}-03-01`, label: `${y}년 1학기` };
  return { start: `${y - 1}-09-01`, label: `${y - 1}년 2학기·겨울방학` };
}

const worryBadge = (w) => (w ? `<span class="badge ${w >= 5 ? "w-5" : w >= 4 ? "w-4" : ""}">고민 ${w}/5</span>` : "");

// 대시보드
async function loadDashboard() {
  const sem = semesterStart();
  const now = new Date(), week = new Date(now.getTime() + 7 * 864e5);
  const [{ data: reqs }, { data: students }, { data: notes }, { count: qCount }] = await Promise.all([
    sb.from("cs_requests").select("*, profiles:cs_profiles(name, student_no), slots:cs_slots(starts_at, duration_min)").in("status", ["대기", "확정"]),
    sb.from("cs_profiles").select("id, name, student_no").eq("role", "student").order("student_no"),
    sb.from("cs_notes").select("student_id, counsel_date").gte("counsel_date", sem.start),
    sb.from("cs_questions").select("id", { count: "exact", head: true }).is("answer", null),
  ]);
  const open = (reqs || []).filter((r) => inClass(r.profiles?.student_no));
  const studentsIn = (students || []).filter((s) => inClass(s.student_no));
  const alerts = open.filter((r) => r.crisis_flag || (r.worry_level || 0) >= 4)
    .sort((a, b) => (b.crisis_flag - a.crisis_flag) || ((b.worry_level || 0) - (a.worry_level || 0)));
  const upcoming = open.filter((r) => r.slots && new Date(r.slots.starts_at) >= now && new Date(r.slots.starts_at) <= week)
    .sort((a, b) => new Date(a.slots.starts_at) - new Date(b.slots.starts_at));
  const semCnt = {};
  (notes || []).forEach((n) => (semCnt[n.student_id] = (semCnt[n.student_id] || 0) + 1));
  const none = studentsIn.filter((s) => (semCnt[s.id] || 0) < REQUIRED)
    .sort((a, b) => (semCnt[a.id] || 0) - (semCnt[b.id] || 0));
  const doneN = studentsIn.length - none.length;
  const pending = open.filter((r) => r.status === "대기").length;

  $("#dash-stats").innerHTML = [
    ["확정 대기 신청", pending, "requests"],
    ["주의 학생", alerts.length, "requests", alerts.length ? "warn" : ""],
    ["7일 내 상담", upcoming.length, "slots"],
    ["답변 안 한 질문", qCount || 0, "questions"],
    [`의무 ${REQUIRED}회 완료 학생`, `${doneN}/${studentsIn.length}`, "students"],
  ].map(([t, n, go, cls]) => `<button class="stat ${cls || ""}" data-go="${go}"><b>${n}</b><span>${t}</span></button>`).join("");
  $$("[data-go]").forEach((b) => (b.onclick = () => loadAdmin(b.dataset.go)));

  $("#dash-alerts").innerHTML = alerts.length ? alerts.map((r) => `
    <div class="item ${r.crisis_flag ? "flag" : "attn"}">
      <div class="row between"><b>${esc(r.profiles?.name)} (${esc(r.profiles?.student_no)}) ${classTag(r.profiles?.student_no)}</b>
        <span>${worryBadge(r.worry_level)}<span class="badge s-${esc(r.status)}">${esc(r.status)}</span></span></div>
      ${r.crisis_flag ? `<p class="crisis-tag">⚠ 위기 신호가 있습니다. 상담 일정과 관계없이 먼저 연락해 주세요.</p>` : ""}
      <p>${esc(r.topic)} · ${r.slots ? fmt(r.slots.starts_at) : "시간 미정"}</p>
      <p class="hint">${esc(r.concern) || "-"}</p>
    </div>`).join("") : `<p class="hint">지금 주의가 필요한 신청이 없습니다.</p>`;

  $("#dash-week").innerHTML = upcoming.length ? `<table><tbody>${upcoming.map((r) => `
    <tr><td>${fmt(r.slots.starts_at)}</td><td>${esc(r.profiles?.name)} ${classTag(r.profiles?.student_no)}</td><td>${esc(r.mode)} · ${esc(r.topic)}</td>
    <td><span class="badge s-${esc(r.status)}">${esc(r.status)}</span></td></tr>`).join("")}</tbody></table>`
    : `<p class="hint">앞으로 7일 안에 잡힌 상담이 없습니다.</p>`;

  $("#dash-sem").textContent = `(${sem.label}, ${none.length}명)`;
  $("#dash-none").innerHTML = !studentsIn.length ? `<p class="hint">가입한 학생이 없습니다.</p>`
    : none.length ? `<div class="chips">${none.map((s) => `<span class="chip">${esc(s.name)} <b class="cnt c${semCnt[s.id] || 0}">${semCnt[s.id] || 0}/${REQUIRED}</b> <small>${CMAP[s.student_no] ? CLASS_NAME[CMAP[s.student_no]] : ""}</small></span>`).join("")}</div>`
    : `<p class="hint">모든 학생이 이번 학기 의무 상담 ${REQUIRED}회를 마쳤습니다.</p>`;
}

$("#status-filter").onchange = () => loadRequests();

async function loadRequests() {
  const status = $("#status-filter").value;
  let q = sb.from("cs_requests").select("*, profiles:cs_profiles(name, student_no), slots:cs_slots(starts_at, duration_min)").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data: all, error } = await q;
  const box = $("#request-list");
  if (error) return (box.textContent = error.message);
  const data = all.filter((r) => inClass(r.profiles?.student_no));
  if (!data.length) return (box.innerHTML = `<p class="hint">해당하는 신청이 없습니다.</p>`);
  box.innerHTML = data.map((r) => `
    <div class="item ${r.crisis_flag ? "flag" : (r.worry_level || 0) >= 4 ? "attn" : ""}">
      <div class="row between">
        <b>${esc(r.profiles?.name)} (${esc(r.profiles?.student_no)}) ${classTag(r.profiles?.student_no)}</b>
        <span>${worryBadge(r.worry_level)}<span class="badge s-${esc(r.status)}">${esc(r.status)}</span></span>
      </div>
      ${r.crisis_flag ? `<p class="crisis-tag">⚠ 위기 신호가 있습니다. 먼저 연락해 주세요.</p>` : ""}
      <p>${r.slots ? fmt(r.slots.starts_at) + ` (${r.slots.duration_min}분)` : "시간 미정"} · ${esc(r.mode)} · ${esc(r.topic)}</p>
      <dl>
        <dt>요즘 고민</dt><dd>${esc(r.concern) || "-"}</dd>
        <dt>고민 크기</dt><dd>${r.worry_level ?? "-"} / 5</dd>
        <dt>학교생활 만족도</dt><dd>${r.satisfaction ?? "-"} / 5</dd>
        <dt>바라는 점</dt><dd>${esc(r.wish) || "-"}</dd>
      </dl>
      <div class="row end">
        ${r.status === "대기" ? `<button class="small primary" data-act="확정" data-id="${r.id}">확정</button>` : ""}
        ${["대기", "확정"].includes(r.status) ? `<button class="small" data-act="취소" data-id="${r.id}">취소</button>` : ""}
        ${r.status !== "취소" ? `<button class="small" data-note="${r.id}">${r.status === "완료" ? "일지 추가" : "일지 작성·완료"}</button>` : ""}
      </div>
    </div>`).join("");
  $$("[data-act]", box).forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from("cs_requests").update({ status: b.dataset.act }).eq("id", b.dataset.id);
    if (error) alert(error.message);
    loadRequests();
  }));
  $$("[data-note]", box).forEach((b) => (b.onclick = () => openNote(data.find((r) => String(r.id) === b.dataset.note))));
}

// 상담 일지 + 분야별 피드백
// noteCtx: { request: 신청 행 또는 null, student: { id, name, student_no } }
let noteCtx = null;
function renderFbFields(checked) {
  $("#fb-topics").innerHTML = TOPICS.map((t) => `
    <label class="chip-check"><input type="checkbox" value="${t}" ${checked.includes(t) ? "checked" : ""} /> ${t}</label>`).join("");
  const draw = () => {
    const keep = Object.fromEntries($$("#fb-fields textarea").map((x) => [x.dataset.topic, x.value]));
    const on = $$("#fb-topics input:checked").map((x) => x.value);
    $("#fb-fields").innerHTML = on.map((t) => `
      <label class="public">${t} 피드백<textarea rows="3" data-topic="${t}" placeholder="${t} 분야에 대해 학생에게 전할 내용">${esc(keep[t] || "")}</textarea></label>`).join("")
      || `<p class="hint">피드백을 보낼 분야를 하나 이상 고르세요.</p>`;
  };
  $$("#fb-topics input").forEach((x) => (x.onchange = draw));
  $("#fb-fields").innerHTML = "";
  draw();
}
function openNote(r, student) {
  noteCtx = { request: r || null, student: student || { id: r.student_id, name: r.profiles?.name, student_no: r.profiles?.student_no } };
  const f = $("#form-note");
  f.reset();
  f.counsel_date.value = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const topic = TOPICS.includes(r?.topic) ? r.topic : "기타";
  f.topic.value = topic;
  renderFbFields([topic]);
  const s = noteCtx.student;
  $("#note-student").textContent = `${s.name} (${s.student_no}) ${CMAP[s.student_no] ? CLASS_NAME[CMAP[s.student_no]] : ""}` + (r?.slots ? ` · ${fmt(r.slots.starts_at)}` : " · 신청 없이 진행한 상담");
  $("#note-msg").textContent = "";
  $("#note-dialog").showModal();
}
$("#note-cancel").onclick = () => $("#note-dialog").close();
$("#form-note").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const fbs = $$("#fb-fields textarea").map((x) => ({ topic: x.dataset.topic, content: x.value.trim() })).filter((x) => x.content);
  if (!fbs.length && !confirm("학생에게 보낼 피드백이 비어 있습니다. 피드백 없이 상담 기록만 저장할까요?")) return;
  const req = noteCtx.request;
  const note = {
    request_id: req?.id ?? null,
    student_id: noteCtx.student.id,
    counsel_date: f.get("counsel_date"),
    topic: f.get("topic"),
    content: f.get("content"),
    opinion: f.get("opinion"),
    private_memo: f.get("private_memo"),
    followup: f.get("followup"),
    needs_followup: f.get("needs_followup") === "on",
    next_date: f.get("next_date") || null,
  };
  const { data: saved, error } = await sb.from("cs_notes").insert(note).select("id").single();
  if (error) return ($("#note-msg").textContent = error.message);
  if (fbs.length) {
    const { error: ef } = await sb.from("cs_feedback").insert(fbs.map((x) => ({
      ...x, note_id: saved.id, request_id: req?.id ?? null, student_id: noteCtx.student.id })));
    if (ef) return ($("#note-msg").textContent = "기록은 저장했지만 피드백을 보내지 못했습니다: " + ef.message);
  }
  if (req && req.status !== "완료") {
    const { error: e2 } = await sb.from("cs_requests").update({ status: "완료" }).eq("id", req.id);
    if (e2) return ($("#note-msg").textContent = e2.message);
  }
  $("#note-dialog").close();
  toast(fbs.length ? `저장했습니다. ${noteCtx.student.name} 학생에게 피드백 ${fbs.length}건이 바로 전달됐습니다.` : "상담 기록을 저장했습니다.");
  if (curPane === "students") showHistory(noteCtx.student); else loadAdmin(curPane);
};

// 상담 시간
$("#form-slot").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const start = new Date(f.get("starts_at")); // 브라우저(한국) 시간 기준
  const repeat = Math.max(1, Number(f.get("repeat") || 1));
  const rows = Array.from({ length: repeat }, (_, i) => ({
    starts_at: new Date(start.getTime() + i * 7 * 864e5).toISOString(),
    duration_min: Number(f.get("duration")),
  }));
  const { error } = await sb.from("cs_slots").insert(rows);
  $("#slot-msg").textContent = error ? error.message : `${rows.length}개의 상담 시간을 열었습니다.`;
  loadSlots();
};

async function loadSlots() {
  const { data, error } = await sb.from("cs_slots")
    .select("*, requests:cs_requests(status, profiles:cs_profiles(name))")
    .gte("starts_at", new Date().toISOString()).order("starts_at");
  const box = $("#slot-list");
  if (error) return (box.textContent = error.message);
  if (!data.length) return (box.innerHTML = `<p class="hint">열려 있는 상담 시간이 없습니다.</p>`);
  box.innerHTML = data.map((s) => {
    const active = (s.requests || []).find((r) => ["대기", "확정"].includes(r.status));
    return `<div class="item row between">
      <span>${fmt(s.starts_at)} (${s.duration_min}분)
        ${active ? `<span class="badge s-${active.status}">${esc(active.profiles?.name)} ${active.status}</span>` : s.is_open ? `<span class="badge open">열림</span>` : `<span class="badge">닫힘</span>`}
      </span>
      <span>
        ${active ? "" : `<button class="small" data-toggle="${s.id}" data-open="${s.is_open}">${s.is_open ? "닫기" : "열기"}</button>
        <button class="small" data-del="${s.id}">삭제</button>`}
      </span></div>`;
  }).join("");
  $$("[data-toggle]", box).forEach((b) => (b.onclick = async () => {
    await sb.from("cs_slots").update({ is_open: b.dataset.open !== "true" }).eq("id", b.dataset.toggle);
    loadSlots();
  }));
  $$("[data-del]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm("이 시간을 삭제할까요?")) return;
    await sb.from("cs_slots").delete().eq("id", b.dataset.del);
    loadSlots();
  }));
}

// 학생별 이력
async function loadStudents() {
  const sem = semesterStart();
  $("#semester-label").textContent = `(${sem.label} 상담 횟수)`;
  const [{ data: allStudents }, { data: notes }] = await Promise.all([
    sb.from("cs_profiles").select("*").eq("role", "student").order("student_no"),
    sb.from("cs_notes").select("student_id, counsel_date"),
  ]);
  const students = (allStudents || []).filter((s) => inClass(s.student_no))
    .sort((a, b) => (CMAP[a.student_no] || "Z").localeCompare(CMAP[b.student_no] || "Z") || a.student_no.localeCompare(b.student_no));
  const count = {}, total = {};
  (notes || []).forEach((n) => {
    total[n.student_id] = (total[n.student_id] || 0) + 1;
    if (n.counsel_date >= sem.start) count[n.student_id] = (count[n.student_id] || 0) + 1;
  });
  const box = $("#student-list");
  if (!students?.length) return (box.innerHTML = `<p class="hint">가입한 학생이 없습니다.</p>`);
  box.innerHTML = `<table><thead><tr><th>반</th><th>학번</th><th>이름</th><th>이번 학기</th><th>전체</th><th></th></tr></thead><tbody>
    ${students.map((s) => `<tr><td>${classTag(s.student_no)}</td><td>${esc(s.student_no)}</td><td>${esc(s.name)}</td><td><b class="cnt ${(count[s.id] || 0) >= REQUIRED ? "ok" : "c" + (count[s.id] || 0)}">${count[s.id] || 0}/${REQUIRED}회</b></td><td>${total[s.id] || 0}회</td>
      <td><button class="small" data-hist="${s.id}">보기</button></td></tr>`).join("")}
  </tbody></table>`;
  $$("[data-hist]", box).forEach((b) => (b.onclick = () => showHistory(students.find((s) => s.id === b.dataset.hist))));
}

async function showHistory(s) {
  const sem = semesterStart();
  const [{ data }, { data: reqs }, { data: fbs }] = await Promise.all([
    sb.from("cs_notes").select("*").eq("student_id", s.id).order("counsel_date", { ascending: false }),
    sb.from("cs_requests").select("created_at, topic, concern, worry_level, crisis_flag").eq("student_id", s.id).order("created_at", { ascending: false }),
    sb.from("cs_feedback").select("*").eq("student_id", s.id).order("created_at", { ascending: false }),
  ]);
  const fbByNote = {};
  (fbs || []).forEach((f) => (fbByNote[f.note_id] ||= []).push(f));
  const semN = (data || []).filter((n) => n.counsel_date >= sem.start).length;
  const box = $("#student-detail");
  show(box);
  box.innerHTML = `<div class="row between"><h2>${esc(s.name)} (${esc(s.student_no)}) ${classTag(s.student_no)} 상담 이력</h2>
      <button class="small primary" id="add-note">상담 기록·피드백 추가</button></div>
    <p class="hint">${sem.label} 상담 <b class="cnt ${semN >= REQUIRED ? "ok" : "c" + semN}">${semN}/${REQUIRED}회</b> · 개인정보 동의: ${s.consent_at ? new Date(s.consent_at).toLocaleDateString("ko-KR") : "아직 안 함"}</p>
    <h3>상담 일지와 보낸 피드백</h3>` +
    (data?.length ? data.map((n) => noteHTML(n, fbByNote[n.id] || [])).join("") : `<p class="hint">상담 일지가 없습니다.</p>`) +
    `<h3>사전 질문지 응답</h3>` +
    (reqs?.length ? reqs.map((r) => `<div class="item ${r.crisis_flag ? "flag" : ""}"><b>${new Date(r.created_at).toLocaleDateString("ko-KR")} · ${esc(r.topic)}</b> ${worryBadge(r.worry_level)}<p>${esc(r.concern) || "-"}</p></div>`).join("") : `<p class="hint">응답이 없습니다.</p>`);
  $("#add-note").onclick = () => openNote(null, s);
  $$("[data-fbdel]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm("이 피드백을 삭제할까요? 학생 화면에서도 사라집니다.")) return;
    await sb.from("cs_feedback").delete().eq("id", b.dataset.fbdel);
    showHistory(s);
  }));
  box.scrollIntoView({ behavior: "smooth" });
}

const noteHTML = (n, fbs = []) => `
  <div class="item">
    <b>${fmtDate(n.counsel_date)} · ${esc(n.topic)}</b>
    ${fbs.map((f) => `<div class="fb-sent"><span class="badge topic">${esc(f.topic)}</span> <span class="hint">${f.read_at ? "학생 확인함" : "학생 미확인"}</span>
      <button class="small link-btn" data-fbdel="${f.id}">삭제</button><p>${esc(f.content)}</p></div>`).join("")}
    <dl>
      <dt>상담 내용</dt><dd>${esc(n.content) || "-"}</dd>
      <dt>교수 의견</dt><dd>${esc(n.opinion) || "-"}</dd>
      <dt>교수 메모</dt><dd class="private">${esc(n.private_memo) || "-"}</dd>
      <dt>후속 조치</dt><dd>${esc(n.followup) || "-"}${n.next_date ? ` (다음 상담 ${fmtDate(n.next_date)})` : ""}</dd>
    </dl>
  </div>`;

// CSV 내보내기
function downloadCSV(name, rows) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

$("#export-summary").onclick = async () => {
  const sem = semesterStart();
  const [{ data: students }, { data: notes }] = await Promise.all([
    sb.from("cs_profiles").select("id, name, student_no").eq("role", "student").order("student_no"),
    sb.from("cs_notes").select("student_id, counsel_date, topic"),
  ]);
  const topicOf = (t) => (TOPICS.includes(t) ? t : "기타");
  const rows = [["반", "학번", "이름", `${sem.label} 상담`, `의무 ${REQUIRED}회 충족`, "전체 상담", ...TOPICS.map((t) => `${t}(전체)`)]];
  (students || []).filter((s) => inClass(s.student_no)).forEach((s) => {
    const mine = (notes || []).filter((n) => n.student_id === s.id);
    rows.push([CLASS_NAME[CMAP[s.student_no]] || "", s.student_no, s.name, mine.filter((n) => n.counsel_date >= sem.start).length,
      mine.filter((n) => n.counsel_date >= sem.start).length >= REQUIRED ? "충족" : "미달", mine.length,
      ...TOPICS.map((t) => mine.filter((n) => topicOf(n.topic) === t).length)]);
  });
  downloadCSV(`상담횟수_${classFilter ? CLASS_NAME[classFilter] + "_" : ""}${today()}.csv`, rows);
};

$("#export-notes").onclick = async () => {
  const withPrivate = $("#export-private").checked;
  if (withPrivate && !confirm("교수 메모가 포함된 파일입니다. 외부로 보내지 말고 안전하게 보관해 주세요. 내려받을까요?")) return;
  const [{ data, error }, { data: fbs }] = await Promise.all([
    sb.from("cs_notes").select("*, profiles:cs_profiles(name, student_no)").order("counsel_date"),
    sb.from("cs_feedback").select("note_id, topic, content"),
  ]);
  if (error) return alert(error.message);
  const fbText = {};
  (fbs || []).forEach((f) => (fbText[f.note_id] = (fbText[f.note_id] ? fbText[f.note_id] + "\n" : "") + `[${f.topic}] ${f.content}`));
  const head = ["상담일", "반", "학번", "이름", "분야", "상담 내용", "교수 의견", ...(withPrivate ? ["교수 메모"] : []), "학생 피드백", "후속 조치", "다음 상담 예정일"];
  const rows = [head, ...(data || []).filter((n) => inClass(n.profiles?.student_no)).map((n) => [n.counsel_date,
    CLASS_NAME[CMAP[n.profiles?.student_no]] || "", n.profiles?.student_no, n.profiles?.name, n.topic, n.content, n.opinion,
    ...(withPrivate ? [n.private_memo] : []), fbText[n.id] || "", n.followup, n.next_date])];
  downloadCSV(`상담기록_${classFilter ? CLASS_NAME[classFilter] + "_" : ""}${today()}.csv`, rows);
};

// 후속 조치
async function loadFollowup() {
  const { data: all, error } = await sb.from("cs_notes").select("*, profiles:cs_profiles(name, student_no)").eq("needs_followup", true).order("next_date", { ascending: true, nullsFirst: false });
  const box = $("#followup-list");
  if (error) return (box.textContent = error.message);
  const data = all.filter((n) => inClass(n.profiles?.student_no));
  if (!data.length) return (box.innerHTML = `<p class="hint">후속 조치가 필요한 학생이 없습니다.</p>`);
  box.innerHTML = data.map((n) => `
    <div class="item">
      <div class="row between">
        <b>${esc(n.profiles?.name)} (${esc(n.profiles?.student_no)}) ${classTag(n.profiles?.student_no)}</b>
        <span>${n.next_date ? "다음 상담 " + fmtDate(n.next_date) : "날짜 미정"}</span>
      </div>
      <p>${esc(n.followup) || "-"}</p>
      <button class="small" data-done="${n.id}">조치 완료</button>
    </div>`).join("");
  $$("[data-done]", box).forEach((b) => (b.onclick = async () => {
    await sb.from("cs_notes").update({ needs_followup: false }).eq("id", b.dataset.done);
    loadFollowup();
  }));
}

// 익명 질문 (교수)
async function loadQuestions() {
  const { data, error } = await sb.from("cs_questions").select("*").order("created_at", { ascending: false });
  const box = $("#question-list");
  if (error) return (box.textContent = error.message);
  if (!data.length) return (box.innerHTML = `<p class="hint">아직 들어온 질문이 없습니다.</p>`);
  box.innerHTML = data.map((q) => `
    <div class="item ${q.crisis_flag ? "flag" : ""}">
      <div class="row between"><span class="hint">${new Date(q.created_at).toLocaleString("ko-KR")}</span>
        <span class="badge ${q.answer ? "s-완료" : "s-대기"}">${q.answer ? "답변함" : "답변 전"}</span></div>
      ${q.crisis_flag ? `<p class="crisis-tag">⚠ 위기 표현이 있습니다. 익명이라 개인 연락은 어려우니, 답변에 도움 연락처를 꼭 넣어 주세요.</p>` : ""}
      <p><b>Q.</b> ${esc(q.content)}</p>
      <textarea rows="3" data-ans="${q.id}" placeholder="답변">${esc(q.answer)}</textarea>
      <div class="row end">
        <label class="check"><input type="checkbox" data-pub="${q.id}" ${q.is_public ? "checked" : ""} /> 학생들에게 공개</label>
        <button class="small primary" data-save="${q.id}">답변 저장</button>
        <button class="small" data-qdel="${q.id}">삭제</button>
      </div>
    </div>`).join("");
  $$("[data-save]", box).forEach((b) => (b.onclick = async () => {
    const id = b.dataset.save;
    const answer = $(`[data-ans="${id}"]`, box).value.trim() || null;
    const { error } = await sb.from("cs_questions").update({ answer, is_public: $(`[data-pub="${id}"]`, box).checked, answered_at: answer ? new Date().toISOString() : null }).eq("id", id);
    if (error) alert(error.message);
    loadQuestions();
  }));
  $$("[data-qdel]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm("이 질문을 삭제할까요?")) return;
    await sb.from("cs_questions").delete().eq("id", b.dataset.qdel);
    loadQuestions();
  }));
}

// 연락처 설정
$("#form-settings").onsubmit = async (e) => {
  e.preventDefault();
  const value = String(new FormData(e.target).get("center_phone")).trim();
  const { error } = await sb.from("cs_settings").upsert({ key: "center_phone", value });
  $("#settings-msg").textContent = error ? error.message : "저장했습니다. 학생 화면 하단과 위기 안내에 표시됩니다.";
  if (!error) loadSettings();
};

// 학생 명단
$("#form-roster").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const defClass = fd.get("class");
  const rows = [], bad = [];
  String(fd.get("list")).split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t) return;
    const m = t.match(/^(?:\d{1,3}[\s,\t]+)?(\d{6,12})[\s,\t]+(.+?)(?:[\s,\t]+([AaBb])(?:반)?)?$/);
    if (m) rows.push({ student_no: m[1], name: m[2].replace(/[\s,\t]+/g, " ").trim(), class: (m[3] || defClass).toUpperCase() });
    else bad.push(t);
  });
  if (!rows.length) return ($("#roster-msg").textContent = "추가할 줄이 없습니다. \"학번 이름\" 형식으로 적어 주세요.");
  const { error } = await sb.from("cs_roster").upsert(rows, { onConflict: "student_no" });
  const nA = rows.filter((r) => r.class === "A").length;
  $("#roster-msg").textContent = error ? error.message
    : `${rows.length}명을 명단에 넣었습니다 (A반 ${nA}명, B반 ${rows.length - nA}명).` + (bad.length ? ` 형식이 맞지 않아 뺀 줄: ${bad.join(" / ")}` : "");
  if (!error) e.target.reset();
  loadRoster();
};

async function loadRoster() {
  const [{ data: roster, error }, { data: profs }] = await Promise.all([
    sb.from("cs_roster").select("*").order("student_no"),
    sb.from("cs_profiles").select("student_no").eq("role", "student"),
  ]);
  const box = $("#roster-list");
  if (error) return (box.textContent = error.message);
  const joined = new Set((profs || []).map((p) => p.student_no));
  const list = roster.filter((r) => !classFilter || r.class === classFilter)
    .sort((a, b) => (a.class || "Z").localeCompare(b.class || "Z") || a.student_no.localeCompare(b.student_no));
  const cnt = (c) => roster.filter((r) => r.class === c).length;
  const nJoined = list.filter((r) => joined.has(r.student_no)).length;
  $("#roster-count").textContent = `(A반 ${cnt("A")}명 · B반 ${cnt("B")}명${roster.some((r) => !r.class) ? ` · 반 미지정 ${roster.filter((r) => !r.class).length}명` : ""} / 보이는 ${list.length}명 중 ${nJoined}명 가입)`;
  if (!list.length) return (box.innerHTML = `<p class="hint">아직 등록된 학생이 없습니다.</p>`);
  box.innerHTML = `<table><thead><tr><th>반</th><th>학번</th><th>이름</th><th>가입</th><th></th></tr></thead><tbody>
    ${list.map((r) => `<tr>
      <td><select class="cls-select" data-rcls="${esc(r.student_no)}">
        <option value="" ${r.class ? "" : "selected"}>-</option>
        <option value="A" ${r.class === "A" ? "selected" : ""}>A반</option>
        <option value="B" ${r.class === "B" ? "selected" : ""}>B반</option></select></td>
      <td>${esc(r.student_no)}</td><td>${esc(r.name)}</td>
      <td>${joined.has(r.student_no) ? `<span class="badge s-확정">가입함</span>` : `<span class="badge">미가입</span>`}</td>
      <td>${joined.has(r.student_no) ? "" : `<button class="small" data-rdel="${esc(r.student_no)}">삭제</button>`}</td></tr>`).join("")}
  </tbody></table>`;
  $$("[data-rcls]", box).forEach((s) => (s.onchange = async () => {
    const { error } = await sb.from("cs_roster").update({ class: s.value || null }).eq("student_no", s.dataset.rcls);
    $("#roster-msg").textContent = error ? error.message : `${s.dataset.rcls} 학생을 ${s.value ? CLASS_NAME[s.value] : "반 미지정"}으로 바꿨습니다.`;
    await refreshClassMap();
    loadRoster();
  }));
  $$("[data-rdel]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm(`${b.dataset.rdel} 학생을 명단에서 뺄까요?`)) return;
    await sb.from("cs_roster").delete().eq("student_no", b.dataset.rdel);
    loadRoster();
  }));
}

boot();
