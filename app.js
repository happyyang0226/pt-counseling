import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG = window.APP_CONFIG;
const sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const show = (el, on = true) => el.classList.toggle("hidden", !on);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) : "");
const studentEmail = (no) => `${String(no).trim()}@${CFG.STUDENT_EMAIL_DOMAIN}`;
const CRISIS_RE = /(죽고\s*싶|자살|자해|사라지고\s*싶|살기\s*싫)/;

const crisisHTML = () => `
  <strong>혼자 견디지 않아도 됩니다.</strong><br />
  지금 많이 힘들다면 바로 도움을 요청해 주세요.<br />
  · 정신건강 위기상담전화 <a href="tel:109"><b>109</b></a> (24시간)<br />
  · ${esc(CFG.COUNSEL_CENTER)}<br />
  · 위급한 상황이면 <a href="tel:119">119</a> 또는 <a href="tel:112">112</a><br />
  교수님도 이 내용을 확인하고 빨리 연락드릴게요.`;

let me = null; // profiles 행

// ---------- 시작 ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  const { data, error } = await sb.from("cs_profiles").select("*").eq("id", session.user.id).single();
  if (error || !data) { await sb.auth.signOut(); return showLogin("사용자 정보를 찾을 수 없습니다. 다시 로그인해 주세요."); }
  me = data;
  $("#who").innerHTML = `${esc(me.name)}${me.role === "admin" ? " 교수님" : ` (${esc(me.student_no)})`} <button id="logout" class="link">로그아웃</button>`;
  $("#logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
  show($("#view-login"), false);
  if (me.role === "admin") { show($("#view-admin")); loadAdmin("requests"); }
  else { show($("#view-student")); loadStudent(); }
}

function showLogin(msg = "") {
  $("#who").innerHTML = "";
  show($("#view-login"));
  $("#login-msg").textContent = msg;
}

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
  if (error) return ($("#login-msg").textContent = "학번 또는 접속 코드가 맞지 않습니다.");
  boot();
};

$("#form-student-signup").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const no = String(f.get("student_no")).trim();
  if (!/^\d{4,12}$/.test(no)) return ($("#login-msg").textContent = "학번은 숫자로 입력해 주세요.");
  if (f.get("code") !== f.get("code2")) return ($("#login-msg").textContent = "접속 코드가 서로 다릅니다.");
  const { error } = await sb.auth.signUp({
    email: studentEmail(no),
    password: f.get("code"),
    options: { data: { app: "counsel", student_no: no, name: String(f.get("name")).trim() } },
  });
  if (error) {
    const m = /registered|exists/i.test(error.message) ? "이미 가입된 학번입니다. 로그인해 주세요." : "가입 중 문제가 생겼습니다: " + error.message;
    return ($("#login-msg").textContent = m);
  }
  boot();
};

$("#form-admin-login").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") });
  if (error) return ($("#login-msg").textContent = "이메일 또는 비밀번호가 맞지 않습니다.");
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
}

$("#concern").addEventListener("input", (e) => {
  const hit = CRISIS_RE.test(e.target.value);
  $("#crisis-live").innerHTML = hit ? crisisHTML() : "";
  show($("#crisis-live"), hit);
});

$("#form-request").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const row = {
    student_id: me.id,
    slot_id: Number(f.get("slot_id")),
    mode: f.get("mode"),
    topic: f.get("topic"),
    concern: f.get("concern"),
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
  e.target.reset();
  show($("#crisis-live"), CRISIS_RE.test(row.concern || ""));
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
      ${r.public_summary ? `<p class="summary"><b>교수님 상담 요약</b><br />${esc(r.public_summary)}</p>` : ""}
      ${r.status === "대기" ? `<button class="small" data-cancel="${r.id}">신청 취소</button>` : ""}
    </div>`).join("");
  $$("[data-cancel]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm("이 신청을 취소할까요?")) return;
    const { error } = await sb.from("cs_requests").update({ status: "취소" }).eq("id", b.dataset.cancel);
    if (error) alert(error.message);
    loadStudent();
  }));
}

// ---------- 교수 화면 ----------
$$("#view-admin .tab").forEach((b) => (b.onclick = () => loadAdmin(b.dataset.admin)));

function loadAdmin(pane) {
  $$("#view-admin .tab").forEach((x) => x.classList.toggle("active", x.dataset.admin === pane));
  $$(".adminpane").forEach((p) => show(p, p.id === `admin-${pane}`));
  ({ requests: loadRequests, slots: loadSlots, students: loadStudents, followup: loadFollowup })[pane]();
}

$("#status-filter").onchange = () => loadRequests();

async function loadRequests() {
  const status = $("#status-filter").value;
  let q = sb.from("cs_requests").select("*, profiles:cs_profiles(name, student_no), slots:cs_slots(starts_at, duration_min)").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  const box = $("#request-list");
  if (error) return (box.textContent = error.message);
  if (!data.length) return (box.innerHTML = `<p class="hint">해당하는 신청이 없습니다.</p>`);
  box.innerHTML = data.map((r) => `
    <div class="item ${r.crisis_flag ? "flag" : ""}">
      <div class="row between">
        <b>${esc(r.profiles?.name)} (${esc(r.profiles?.student_no)})</b>
        <span class="badge s-${esc(r.status)}">${esc(r.status)}</span>
      </div>
      ${r.crisis_flag ? `<p class="crisis-tag">⚠ 위기 표현이 있습니다. 먼저 연락해 주세요.</p>` : ""}
      <p>${r.slots ? fmt(r.slots.starts_at) + ` (${r.slots.duration_min}분)` : "시간 미정"} · ${esc(r.mode)} · ${esc(r.topic)}</p>
      <dl>
        <dt>요즘 고민</dt><dd>${esc(r.concern) || "-"}</dd>
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

// 상담 일지
let noteReq = null;
function openNote(r) {
  noteReq = r;
  const f = $("#form-note");
  f.reset();
  f.counsel_date.value = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  f.topic.value = r.topic;
  f.public_summary.value = r.public_summary || "";
  $("#note-student").textContent = `${r.profiles?.name} (${r.profiles?.student_no}) · ${r.slots ? fmt(r.slots.starts_at) : ""}`;
  $("#note-msg").textContent = "";
  $("#note-dialog").showModal();
}
$("#note-cancel").onclick = () => $("#note-dialog").close();
$("#form-note").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const note = {
    request_id: noteReq.id,
    student_id: noteReq.student_id,
    counsel_date: f.get("counsel_date"),
    topic: f.get("topic"),
    content: f.get("content"),
    opinion: f.get("opinion"),
    private_memo: f.get("private_memo"),
    followup: f.get("followup"),
    needs_followup: f.get("needs_followup") === "on",
    next_date: f.get("next_date") || null,
  };
  const { error } = await sb.from("cs_notes").insert(note);
  if (error) return ($("#note-msg").textContent = error.message);
  const { error: e2 } = await sb.from("cs_requests").update({ status: "완료", public_summary: f.get("public_summary") || null }).eq("id", noteReq.id);
  if (e2) return ($("#note-msg").textContent = e2.message);
  $("#note-dialog").close();
  loadRequests();
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
function semesterStart() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  if (m >= 9) return { start: `${y}-09-01`, label: `${y}년 2학기` };
  if (m >= 3) return { start: `${y}-03-01`, label: `${y}년 1학기` };
  return { start: `${y - 1}-09-01`, label: `${y - 1}년 2학기·겨울방학` };
}

async function loadStudents() {
  const sem = semesterStart();
  $("#semester-label").textContent = `(${sem.label} 상담 횟수)`;
  const [{ data: students }, { data: notes }] = await Promise.all([
    sb.from("cs_profiles").select("*").eq("role", "student").order("student_no"),
    sb.from("cs_notes").select("student_id, counsel_date"),
  ]);
  const count = {}, total = {};
  (notes || []).forEach((n) => {
    total[n.student_id] = (total[n.student_id] || 0) + 1;
    if (n.counsel_date >= sem.start) count[n.student_id] = (count[n.student_id] || 0) + 1;
  });
  const box = $("#student-list");
  if (!students?.length) return (box.innerHTML = `<p class="hint">가입한 학생이 없습니다.</p>`);
  box.innerHTML = `<table><thead><tr><th>학번</th><th>이름</th><th>이번 학기</th><th>전체</th><th></th></tr></thead><tbody>
    ${students.map((s) => `<tr><td>${esc(s.student_no)}</td><td>${esc(s.name)}</td><td>${count[s.id] || 0}회</td><td>${total[s.id] || 0}회</td>
      <td><button class="small" data-hist="${s.id}">보기</button></td></tr>`).join("")}
  </tbody></table>`;
  $$("[data-hist]", box).forEach((b) => (b.onclick = () => showHistory(students.find((s) => s.id === b.dataset.hist))));
}

async function showHistory(s) {
  const { data } = await sb.from("cs_notes").select("*").eq("student_id", s.id).order("counsel_date", { ascending: false });
  const box = $("#student-detail");
  show(box);
  box.innerHTML = `<h2>${esc(s.name)} (${esc(s.student_no)}) 상담 이력</h2>` + (data?.length ? data.map(noteHTML).join("") : `<p class="hint">상담 일지가 없습니다.</p>`);
  box.scrollIntoView({ behavior: "smooth" });
}

const noteHTML = (n) => `
  <div class="item">
    <b>${fmtDate(n.counsel_date)} · ${esc(n.topic)}</b>
    <dl>
      <dt>상담 내용</dt><dd>${esc(n.content) || "-"}</dd>
      <dt>교수 의견</dt><dd>${esc(n.opinion) || "-"}</dd>
      <dt>교수 메모</dt><dd class="private">${esc(n.private_memo) || "-"}</dd>
      <dt>후속 조치</dt><dd>${esc(n.followup) || "-"}${n.next_date ? ` (다음 상담 ${fmtDate(n.next_date)})` : ""}</dd>
    </dl>
  </div>`;

// 후속 조치
async function loadFollowup() {
  const { data, error } = await sb.from("cs_notes").select("*, profiles:cs_profiles(name, student_no)").eq("needs_followup", true).order("next_date", { ascending: true, nullsFirst: false });
  const box = $("#followup-list");
  if (error) return (box.textContent = error.message);
  if (!data.length) return (box.innerHTML = `<p class="hint">후속 조치가 필요한 학생이 없습니다.</p>`);
  box.innerHTML = data.map((n) => `
    <div class="item">
      <div class="row between">
        <b>${esc(n.profiles?.name)} (${esc(n.profiles?.student_no)})</b>
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

boot();
