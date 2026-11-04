import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ───────── 기본 설정 ─────────
const CFG = window.APP_CONFIG;
// 로그인 정보는 브라우저를 닫으면 지워지는 sessionStorage에만 둔다 (상담 내용은 브라우저에 저장하지 않음)
const sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true },
});

const TOPICS = ["학교생활 적응", "학업·성적", "진로·국가고시", "대인관계", "경제·장학", "건강·심리", "기타"];
const WORRY = { 1: "가벼워요", 2: "조금 신경 쓰여요", 3: "꽤 신경 쓰여요", 4: "많이 무거워요", 5: "혼자 감당하기 힘들어요" };
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const STATUS_LABEL = { 대기: "확인 중", 확정: "확정", 완료: "완료", 취소: "취소" };
const CRISIS_RE = /(죽고\s*싶|죽을\s*것\s*같|자살|자해|극단적|사라지고\s*싶|살기\s*싫|살고\s*싶지\s*않|목숨|손목|뛰어내리)/;

// ───────── 작은 도구 ─────────
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const show = (el, on = true) => el && el.classList.toggle("hidden", !on);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KST = { timeZone: "Asia/Seoul" };
const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", { ...KST, month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
const fmtDate = (d) => (d ? new Date(d + "T00:00:00+09:00").toLocaleDateString("ko-KR", { ...KST, month: "long", day: "numeric", weekday: "short" }) : "");
const todayKST = () => new Date().toLocaleDateString("sv-SE", KST);
const studentEmail = (no) => `${String(no).trim()}@${CFG.STUDENT_EMAIL_DOMAIN}`;
const badge = (st) => `<span class="badge b-${esc(st)}">${esc(STATUS_LABEL[st] || st)}</span>`;
const worryBadge = (w) => (w ? `<span class="badge ${w >= 4 ? "b-high" : ""}">고민 ${w}점</span>` : "");
const classBadge = (c) => (c ? `<span class="badge b-class">${esc(c)}반</span>` : "");
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2600); }
function semester() {
  const now = new Date(new Date().toLocaleString("en-US", KST));
  const y = now.getFullYear(), m = now.getMonth() + 1;
  if (m >= 9) return { start: `${y}-09-01`, end: `${y + 1}-02-28`, label: `${y}년 2학기` };
  if (m >= 3) return { start: `${y}-03-01`, end: `${y}-08-31`, label: `${y}년 1학기` };
  return { start: `${y - 1}-09-01`, end: `${y}-02-28`, label: `${y - 1}년 2학기` };
}
// 수업 기간 끝(기본값): 2학기는 12월 19일, 1학기는 6월 19일
function classEnd() {
  const t = todayKST(), y = t.slice(0, 4), m = Number(t.slice(5, 7));
  const end = m >= 7 ? `${y}-12-19` : m >= 1 && m <= 2 ? `${y}-02-28` : `${y}-06-19`;
  return end > t ? end : t;
}
function weekRangeKST() {
  const t = new Date(todayKST() + "T00:00:00+09:00");
  const dow = (t.getUTCDay() + 6) % 7; // 월=0
  const start = new Date(t.getTime() - dow * 864e5);
  return { start, end: new Date(start.getTime() + 7 * 864e5) };
}
const crisisHTML = () => `
  <strong>지금 많이 힘들다면, 혼자 견디지 않아도 괜찮아요.</strong><br />
  · 자살예방상담전화 <a href="tel:109">109</a> (24시간)<br />
  · 정신건강위기상담 <a href="tel:15770199">1577-0199</a> (24시간)<br />
  · ${esc(CFG.COUNSEL_CENTER_NAME)}${CFG.COUNSEL_CENTER_PHONE ? ` <a href="tel:${esc(CFG.COUNSEL_CENTER_PHONE.replace(/[^0-9]/g, ""))}">${esc(CFG.COUNSEL_CENTER_PHONE)}</a>` : ""}<br />
  · 위급하면 <a href="tel:119">119</a> · <a href="tel:112">112</a><br />
  신청서를 보내 주시면 교수님도 먼저 확인하고 연락드릴게요.`;

function renderHelp(on) {
  const el = $("#help");
  el.innerHTML = `<b>도움이 필요할 때</b>
    <span>${esc(CFG.COUNSEL_CENTER_NAME)}${CFG.COUNSEL_CENTER_PHONE ? ` <a href="tel:${esc(CFG.COUNSEL_CENTER_PHONE.replace(/[^0-9]/g, ""))}">${esc(CFG.COUNSEL_CENTER_PHONE)}</a>` : ""}</span>
    <span>자살예방상담 <a href="tel:109">109</a></span>
    <span>정신건강위기상담 <a href="tel:15770199">1577-0199</a></span>`;
  show(el, on);
  requestAnimationFrame(() => document.documentElement.style.setProperty("--help-h", on ? el.offsetHeight + "px" : "0px"));
}

// ───────── 자동 로그아웃 ─────────
let lastActive = Date.now();
["click", "keydown", "touchstart", "scroll"].forEach((ev) => addEventListener(ev, () => (lastActive = Date.now()), { passive: true }));
setInterval(async () => {
  if (!me) return;
  if (Date.now() - lastActive > CFG.IDLE_MINUTES * 60 * 1000) {
    await sb.auth.signOut();
    me = null;
    showLogin(`${CFG.IDLE_MINUTES}분 동안 사용하지 않아 안전을 위해 로그아웃했어요.`);
  }
}, 30 * 1000);

// ───────── 시작 ─────────
let me = null;
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  const { data, error } = await sb.from("cs_profiles").select("*").eq("id", session.user.id).single();
  if (error || !data) { await sb.auth.signOut(); return showLogin("사용자 정보를 찾지 못했어요. 다시 로그인해 주세요."); }
  me = data;
  lastActive = Date.now();
  $("#who").innerHTML = `${esc(me.name)}${me.role === "admin" ? " 교수님" : ""} <button id="logout" class="link">로그아웃</button>`;
  $("#logout").onclick = async () => { await sb.auth.signOut(); me = null; showLogin("로그아웃했어요."); };
  if (me.role === "admin") { renderHelp(false); return renderAdmin(); }
  renderHelp(true);
  if (!me.consent_at || me.consent_version !== CFG.CONSENT_VERSION) return renderConsent();
  renderStudent();
}

// ───────── 로그인 화면 ─────────
function showLogin(msg = "") {
  $("#who").innerHTML = "";
  renderHelp(true);
  $("#app").innerHTML = `
  <section class="narrow">
    <div class="notice">
      <b>지도교수 상담실에 오신 걸 환영해요.</b><br />
      여기서 ${esc(CFG.PROFESSOR_NAME)}님께 상담을 신청하고, 상담 내용을 다시 볼 수 있어요.
      이 웹앱은 <b>전문 심리상담을 대신하지 않아요.</b> 마음이 많이 힘들 때는 화면 아래 연락처로 바로 연락해 주세요.
    </div>
    <div class="card">
      <div class="tabs" role="tablist">
        <button class="tab active" data-tab="login">학생 로그인</button>
        <button class="tab" data-tab="signup">처음 왔어요 (가입)</button>
        <button class="tab" data-tab="admin">교수</button>
      </div>
      <form id="f-login" class="pane">
        <label>학번<input name="no" required inputmode="numeric" autocomplete="username" /></label>
        <label>접속 코드<input name="code" type="password" required minlength="6" autocomplete="current-password" /></label>
        <button class="primary block" type="submit">로그인</button>
      </form>
      <form id="f-signup" class="pane hidden">
        <p class="hint">학과 명단에 있는 학번이면 가입할 수 있어요. 접속 코드는 내가 직접 정하는 비밀번호예요.</p>
        <label>학번<input name="no" required inputmode="numeric" /></label>
        <label>접속 코드 (6자 이상)<input name="code" type="password" required minlength="6" autocomplete="new-password" /></label>
        <label>접속 코드 한 번 더<input name="code2" type="password" required minlength="6" autocomplete="new-password" /></label>
        <button class="primary block" type="submit">가입하기</button>
      </form>
      <form id="f-admin" class="pane hidden">
        <label>이메일<input name="email" type="email" required autocomplete="username" /></label>
        <label>비밀번호<input name="pw" type="password" required autocomplete="current-password" /></label>
        <button class="primary block" type="submit">교수 로그인</button>
      </form>
      <p id="login-msg" class="msg">${esc(msg)}</p>
    </div>
  </section>`;
  const msgEl = $("#login-msg");
  const say = (t, err = true) => { msgEl.textContent = t; msgEl.classList.toggle("err", err); };
  $$(".tab", $("#app")).forEach((b) => (b.onclick = () => {
    $$(".tab", $("#app")).forEach((x) => x.classList.toggle("active", x === b));
    $$(".pane", $("#app")).forEach((p) => show(p, p.id === `f-${b.dataset.tab}`));
    say("", false);
  }));
  $("#f-login").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await sb.auth.signInWithPassword({ email: studentEmail(f.get("no")), password: f.get("code") });
    if (error) return say(/invalid/i.test(error.message) ? "학번 또는 접속 코드가 맞지 않아요." : "로그인할 수 없어요: " + error.message);
    boot();
  };
  $("#f-signup").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const no = String(f.get("no")).trim();
    if (!/^\d{4,12}$/.test(no)) return say("학번은 숫자로 입력해 주세요.");
    if (f.get("code") !== f.get("code2")) return say("두 접속 코드가 서로 달라요.");
    const { data: info, error: le } = await sb.rpc("cs_roster_lookup", { p_student_no: no });
    if (le) return say("학번을 확인하지 못했어요: " + le.message);
    if (!info?.found) return say("학과 명단에서 이 학번을 찾지 못했어요. 학번을 다시 확인하거나 교수님께 말씀해 주세요.");
    if (info.registered) return say("이미 가입한 학번이에요. 학생 로그인으로 들어가세요.");
    if (!confirm(`${info.masked_name} 학생이 맞나요?\n학번 ${no}`)) return;
    const { error } = await sb.auth.signUp({ email: studentEmail(no), password: f.get("code"), options: { data: { app: "counsel", student_no: no } } });
    if (error) return say(/registered|exists/i.test(error.message) ? "이미 가입한 학번이에요. 학생 로그인으로 들어가세요." : "가입 중 문제가 생겼어요: " + error.message);
    boot();
  };
  $("#f-admin").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("pw") });
    if (error) return say(/invalid/i.test(error.message) ? "이메일 또는 비밀번호가 맞지 않아요." : "로그인할 수 없어요: " + error.message);
    boot();
  };
}

// ───────── 개인정보 동의 ─────────
function renderConsent() {
  $("#app").innerHTML = `
  <section class="card narrow">
    <h1>개인정보 수집·이용 동의</h1>
    <p class="hint">상담을 시작하기 전에 한 번만 확인해 주세요.</p>
    <dl>
      <dt>수집 항목</dt><dd>학번, 이름, 반, 상담 신청 내용(희망 시간, 상담 분야, 고민 내용, 고민의 크기), 상담 기록</dd>
      <dt>이용 목적</dt><dd>지도교수의 학생 지도와 상담 일정·기록 관리</dd>
      <dt>볼 수 있는 사람</dt><dd>지도교수(${esc(CFG.PROFESSOR_NAME)})만 볼 수 있어요. 나는 내 신청 내용과 교수님이 공개한 요약·과제만 볼 수 있어요.</dd>
      <dt>보관 기간</dt><dd>${esc(CFG.RETENTION_TEXT)}까지 보관하고, 그 뒤에는 삭제해요.</dd>
      <dt>동의하지 않으면</dt><dd>동의하지 않아도 괜찮아요. 웹앱 대신 교수 연구실로 직접 찾아와 상담할 수 있어요.</dd>
    </dl>
    <label class="row center" style="gap:10px;color:var(--ink)"><input type="checkbox" id="agree" style="width:24px;min-height:24px;margin:0" /> 위 내용을 읽었고, 개인정보 수집·이용에 동의해요.</label>
    <div class="row end">
      <button id="disagree">동의하지 않아요</button>
      <button id="agree-btn" class="primary" disabled>동의하고 시작하기</button>
    </div>
  </section>`;
  $("#agree").onchange = (e) => ($("#agree-btn").disabled = !e.target.checked);
  $("#disagree").onclick = async () => { await sb.auth.signOut(); me = null; showLogin("동의하지 않으면 웹앱을 쓸 수 없어요. 교수 연구실로 직접 찾아와도 괜찮아요."); };
  $("#agree-btn").onclick = async () => {
    const { error } = await sb.rpc("cs_give_consent", { p_version: CFG.CONSENT_VERSION });
    if (error) return toast("저장하지 못했어요: " + error.message);
    me.consent_at = new Date().toISOString(); me.consent_version = CFG.CONSENT_VERSION;
    renderStudent();
  };
}

// ───────── 학생 화면 ─────────
let sTab = "apply";
function renderStudent() {
  $("#app").innerHTML = `
    <div class="tabs" role="tablist">
      <button class="tab" data-s="apply">상담 신청</button>
      <button class="tab" data-s="mine">내 상담</button>
      <button class="tab" data-s="anon">익명 질문</button>
    </div>
    <div id="s-pane"></div>`;
  $$("[data-s]").forEach((b) => (b.onclick = () => { sTab = b.dataset.s; studentPane(); }));
  studentPane();
}
function studentPane() {
  $$("[data-s]").forEach((b) => b.classList.toggle("active", b.dataset.s === sTab));
  ({ apply: studentApply, mine: studentMine, anon: studentAnon })[sTab]();
}

async function studentApply() {
  const pane = $("#s-pane");
  const { data: slots } = await sb.rpc("cs_available_slots");
  const has = slots?.length;
  pane.innerHTML = `
  <section class="card">
    <h2>상담 신청하기</h2>
    <p class="hint">편하게 적어 주세요. 평가하려는 게 아니라, 상담 시간을 더 잘 쓰기 위해 미리 알고 싶어서예요.</p>
    <form id="f-req">
      <label>희망 날짜·시간
        <select name="slot" required ${has ? "" : "disabled"}>
          ${has ? slots.map((s) => `<option value="${s.id}">${fmt(s.starts_at)} (${s.duration_min}분)</option>`).join("") : `<option>지금 열린 시간이 없어요</option>`}
        </select>
      </label>
      ${has ? "" : `<p class="hint">교수님이 상담 시간을 열면 여기에 보여요. 급한 일이면 연구실로 직접 찾아와도 괜찮아요.</p>`}
      <fieldset><legend>상담 방법</legend>
        <div class="chips">
          <label class="chip-opt"><input type="radio" name="mode" value="대면" checked /><span>만나서 (대면)</span></label>
          <label class="chip-opt"><input type="radio" name="mode" value="온라인" /><span>온라인</span></label>
        </div>
      </fieldset>
      <fieldset><legend>어떤 이야기를 나누고 싶나요?</legend>
        <div class="chips">${TOPICS.map((t, i) => `<label class="chip-opt"><input type="radio" name="topic" value="${t}" ${i === 0 ? "checked" : ""} /><span>${t}</span></label>`).join("")}</div>
      </fieldset>
      <label>요즘 마음에 있는 이야기 (선택)
        <textarea name="concern" id="concern" rows="5" maxlength="2000" placeholder="짧게 적어도 괜찮아요."></textarea>
      </label>
      <fieldset class="scale"><legend>지금 고민의 크기는 어느 정도인가요?</legend>
        <div class="chips">${[1, 2, 3, 4, 5].map((n) => `<label class="chip-opt"><input type="radio" name="worry" value="${n}" ${n === 2 ? "checked" : ""} /><span>${n}<small>${WORRY[n]}</small></span></label>`).join("")}</div>
      </fieldset>
      <div id="crisis-live" class="crisis hidden"></div>
      <button class="primary block" type="submit" ${has ? "" : "disabled"}>신청 보내기</button>
      <p id="req-msg" class="msg"></p>
    </form>
  </section>`;
  const check = () => {
    const f = new FormData($("#f-req"));
    const hit = CRISIS_RE.test(f.get("concern") || "") || f.get("worry") === "5";
    $("#crisis-live").innerHTML = hit ? crisisHTML() : "";
    show($("#crisis-live"), hit);
  };
  $("#f-req").addEventListener("input", check);
  $("#f-req").addEventListener("change", check);
  $("#f-req").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const row = { student_id: me.id, slot_id: Number(f.get("slot")), mode: f.get("mode"), topic: f.get("topic"), concern: f.get("concern") || null, worry_level: Number(f.get("worry")) };
    const { error } = await sb.from("cs_requests").insert(row);
    const m = $("#req-msg");
    if (error) {
      m.classList.add("err");
      m.textContent = /duplicate|unique/i.test(error.message) ? "방금 다른 친구가 그 시간을 신청했어요. 다른 시간을 골라 주세요." : "보내지 못했어요: " + error.message;
      return;
    }
    toast("신청을 보냈어요. 교수님이 확인하면 '확정'으로 바뀌어요.");
    sTab = "mine"; studentPane();
  };
}

async function studentMine() {
  const pane = $("#s-pane");
  const [{ data: reqs }, { data: shares }] = await Promise.all([
    sb.from("cs_requests").select("*, slots:cs_slots(starts_at, duration_min)").order("created_at", { ascending: false }),
    sb.from("cs_note_shares").select("*").order("counsel_date", { ascending: false }),
  ]);
  pane.innerHTML = `
  <section class="card">
    <h2>내 신청</h2>
    ${reqs?.length ? reqs.map((r) => `
      <div class="item">
        <div class="row between"><b>${r.slots ? fmt(r.slots.starts_at) : "시간 미정"}</b>${badge(r.status)}</div>
        <p class="meta">${esc(r.mode)} · ${esc(r.topic)}</p>
        ${r.status === "대기" ? `<button class="small" data-cancel="${r.id}">신청 취소</button>` : ""}
      </div>`).join("") : `<p class="empty">아직 신청한 상담이 없어요.</p>`}
  </section>
  <section class="card">
    <h2>교수님이 남긴 상담 요약과 과제</h2>
    ${shares?.length ? shares.map((s) => `
      <div class="item">
        <p class="meta">${fmtDate(s.counsel_date)} · ${esc(s.topic || "")}</p>
        ${s.summary ? `<p class="summary">${esc(s.summary)}</p>` : ""}
        ${s.task ? `<p><b>다음까지 해 볼 것</b><br />${esc(s.task)}</p>` : ""}
      </div>`).join("") : `<p class="empty">상담을 마치면 여기에 요약이 보여요.</p>`}
  </section>`;
  $$("[data-cancel]", pane).forEach((b) => (b.onclick = async () => {
    if (!confirm("이 신청을 취소할까요?")) return;
    const { error } = await sb.from("cs_requests").update({ status: "취소" }).eq("id", b.dataset.cancel);
    if (error) return toast(error.message);
    toast("취소했어요."); studentMine();
  }));
}

async function studentAnon() {
  const pane = $("#s-pane");
  const { data: qs } = await sb.from("cs_anon_questions").select("id, body, answer, answered_at").eq("is_public", true).order("answered_at", { ascending: false });
  pane.innerHTML = `
  <section class="card">
    <h2>익명 질문함</h2>
    <p class="hint">이름 없이 교수님께 짧은 질문을 남길 수 있어요. 누가 썼는지는 저장되지 않아요. 답을 받고 싶은 개인적인 일은 상담 신청을 이용해 주세요.</p>
    <form id="f-anon">
      <textarea name="body" rows="4" maxlength="500" minlength="2" required placeholder="예: 국가고시 공부는 언제부터 시작하면 좋을까요?"></textarea>
      <div id="anon-crisis" class="crisis hidden"></div>
      <button class="primary block" type="submit" style="margin-top:10px">질문 남기기</button>
    </form>
  </section>
  <section class="card">
    <h2>교수님이 공개한 답변</h2>
    ${qs?.length ? qs.map((q) => `<div class="item"><p><b>Q.</b> ${esc(q.body)}</p><p class="summary"><b>A.</b> ${esc(q.answer)}</p></div>`).join("") : `<p class="empty">아직 공개된 답변이 없어요.</p>`}
  </section>`;
  $("#f-anon").addEventListener("input", (e) => {
    const hit = CRISIS_RE.test(e.target.form?.body?.value || e.target.value || "");
    $("#anon-crisis").innerHTML = hit ? crisisHTML() + "<br />익명 질문은 누가 썼는지 알 수 없어서, 교수님이 먼저 연락드릴 수 없어요. 상담 신청이나 위 전화로 꼭 이야기해 주세요." : "";
    show($("#anon-crisis"), hit);
  });
  $("#f-anon").onsubmit = async (e) => {
    e.preventDefault();
    const body = new FormData(e.target).get("body");
    const { error } = await sb.rpc("cs_ask_anon", { p_body: body });
    if (error) return toast("보내지 못했어요: " + error.message);
    e.target.reset(); show($("#anon-crisis"), false);
    toast("질문을 남겼어요. 답변은 공개되면 아래에 보여요.");
  };
}

// ───────── 교수 화면 ─────────
let aTab = "dash";
const A = {}; // 교수 화면 데이터 캐시 (메모리에만)
async function loadAll() {
  const [p, r, n, s, q, ro] = await Promise.all([
    sb.from("cs_profiles").select("*").eq("role", "student").order("student_no"),
    sb.from("cs_requests").select("*, slots:cs_slots(starts_at, duration_min)").order("created_at", { ascending: false }),
    sb.from("cs_notes").select("*").order("counsel_date", { ascending: false }),
    sb.from("cs_note_shares").select("*"),
    sb.from("cs_anon_questions").select("*").order("created_at", { ascending: false }),
    sb.from("cs_roster").select("*").order("student_no"),
  ]);
  const err = [p, r, n, s, q, ro].find((x) => x.error);
  if (err) toast("일부 자료를 불러오지 못했어요: " + err.error.message);
  A.students = p.data || []; A.reqs = r.data || []; A.notes = n.data || []; A.anon = q.data || []; A.roster = ro.data || [];
  A.shares = Object.fromEntries((s.data || []).map((x) => [x.note_id, x]));
  A.byId = Object.fromEntries(A.students.map((x) => [x.id, x]));
  const sem = semester();
  A.semCount = {};
  A.notes.forEach((x) => { if (x.counsel_date >= sem.start && x.counsel_date <= sem.end) A.semCount[x.student_id] = (A.semCount[x.student_id] || 0) + 1; });
}
const sName = (id) => { const s = A.byId[id]; return s ? `${esc(s.name)} <span class="meta">(${esc(s.student_no)})</span> ${classBadge(s.class)}` : "알 수 없음"; };

async function renderAdmin() {
  await loadAll();
  const crisisN = A.reqs.filter((r) => r.crisis_flag && ["대기", "확정"].includes(r.status)).length + A.anon.filter((q) => q.crisis_flag && !q.answer).length;
  const waitN = A.reqs.filter((r) => r.status === "대기").length;
  const anonN = A.anon.filter((q) => !q.answer).length;
  $("#app").innerHTML = `
    <nav class="tabs" role="tablist">
      ${[["dash", "대시보드", crisisN], ["reqs", "신청", waitN], ["students", "학생"], ["slots", "상담 시간"], ["anon", "질문함", anonN], ["roster", "명단·내보내기"]]
        .map(([k, t, c]) => `<button class="tab" data-a="${k}">${t}${c ? `<span class="count">${c}</span>` : ""}</button>`).join("")}
    </nav>
    <div id="a-pane"></div>`;
  $$("[data-a]").forEach((b) => (b.onclick = () => { aTab = b.dataset.a; adminPane(); }));
  adminPane();
}
function adminPane() {
  $$("[data-a]").forEach((b) => b.classList.toggle("active", b.dataset.a === aTab));
  ({ dash: adminDash, reqs: adminReqs, students: adminStudents, slots: adminSlots, anon: adminAnon, roster: adminRoster })[aTab]();
}
async function refresh() { await renderAdmin(); }

// 대시보드
function adminDash() {
  const sem = semester();
  const wk = weekRangeKST();
  const crisisReqs = A.reqs.filter((r) => r.crisis_flag && ["대기", "확정"].includes(r.status));
  const crisisAnon = A.anon.filter((q) => q.crisis_flag && !q.answer);
  const week = A.reqs.filter((r) => ["대기", "확정"].includes(r.status) && r.slots && new Date(r.slots.starts_at) >= wk.start && new Date(r.slots.starts_at) < wk.end)
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const high = A.reqs.filter((r) => (r.worry_level || 0) >= 4 && ["대기", "확정"].includes(r.status) && !r.crisis_flag);
  const behind = A.students.filter((s) => (A.semCount[s.id] || 0) < CFG.SEMESTER_GOAL).sort((a, b) => (A.semCount[a.id] || 0) - (A.semCount[b.id] || 0) || (a.class || "").localeCompare(b.class || ""));
  const notJoined = A.roster.filter((r) => !A.students.some((s) => s.student_no === r.student_no));
  const semTotal = Object.values(A.semCount).reduce((a, b) => a + b, 0);
  const reqRow = (r) => `
    <div class="item ${r.crisis_flag ? "flag" : (r.worry_level || 0) >= 4 ? "high" : ""}">
      <div class="row between"><span>${sName(r.student_id)}</span>${badge(r.status)}</div>
      <p class="meta">${r.slots ? fmt(r.slots.starts_at) : "시간 미정"} · ${esc(r.mode)} · ${esc(r.topic)} ${worryBadge(r.worry_level)}</p>
      ${r.concern ? `<p>${esc(r.concern)}</p>` : ""}
      <div class="row end"><button class="small" data-open-student="${r.student_id}">학생 카드</button>${r.status === "대기" ? `<button class="small primary" data-confirm="${r.id}">확정</button>` : ""}</div>
    </div>`;
  $("#a-pane").innerHTML = `
    <div class="stats">
      <div class="stat"><div class="k">${sem.label} 상담</div><div class="v">${semTotal}<small> 회</small></div></div>
      <div class="stat"><div class="k">가입 학생</div><div class="v">${A.students.length}<small> / ${A.roster.length}명</small></div></div>
      <div class="stat"><div class="k">확인할 신청</div><div class="v">${A.reqs.filter((r) => r.status === "대기").length}<small> 건</small></div></div>
      <div class="stat"><div class="k">목표(${CFG.SEMESTER_GOAL}회) 미달</div><div class="v">${behind.length}<small> 명</small></div></div>
    </div>
    ${crisisReqs.length || crisisAnon.length ? `
    <section class="card alert-card">
      <h2>⚠ 먼저 확인해 주세요</h2>
      <p class="hint">자해·자살 관련 표현이 있거나 고민의 크기를 5점으로 고른 경우예요. 가능한 빨리 연락하고, 필요하면 학생상담센터와 연계해 주세요.</p>
      ${crisisReqs.map(reqRow).join("")}
      ${crisisAnon.map((q) => `<div class="item flag"><p class="meta">익명 질문 · ${fmt(q.created_at)}</p><p>${esc(q.body)}</p><p class="hint">익명이라 학생을 알 수 없어요. 질문함에서 답변을 공개해 도움 연락처를 안내해 주세요.</p></div>`).join("")}
    </section>` : ""}
    <section class="card">
      <h2>이번 주 상담 일정</h2>
      ${week.length ? week.map(reqRow).join("") : `<p class="empty">이번 주에 잡힌 상담이 없어요.</p>`}
    </section>
    ${high.length ? `<section class="card"><h2>고민의 크기 4점 이상</h2>${high.map(reqRow).join("")}</section>` : ""}
    <section class="card">
      <h2>이번 학기 상담이 ${CFG.SEMESTER_GOAL}회보다 적은 학생</h2>
      ${behind.length ? `<div class="grid-cards">${behind.map((s) => `
        <div class="item click" data-open-student="${s.id}">
          <div class="row between"><b>${esc(s.name)}</b>${classBadge(s.class)}</div>
          <p class="meta">${esc(s.student_no)} · 이번 학기 ${A.semCount[s.id] || 0}회</p>
        </div>`).join("")}</div>` : `<p class="empty">모든 학생이 목표를 채웠어요.</p>`}
      ${notJoined.length ? `<p class="hint" style="margin-top:10px">아직 가입하지 않은 학생 ${notJoined.length}명: ${notJoined.map((r) => esc(r.name)).join(", ")}</p>` : ""}
    </section>`;
  bindCommon($("#a-pane"));
}

function bindCommon(root) {
  $$("[data-open-student]", root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); aTab = "students"; adminPane(); openStudent(b.dataset.openStudent); }));
  $$("[data-confirm]", root).forEach((b) => (b.onclick = async () => setStatus(b.dataset.confirm, "확정")));
  $$("[data-cancelreq]", root).forEach((b) => (b.onclick = async () => { if (confirm("이 신청을 취소할까요?")) setStatus(b.dataset.cancelreq, "취소"); }));
  $$("[data-write]", root).forEach((b) => (b.onclick = () => openNote({ requestId: b.dataset.write ? Number(b.dataset.write) : null, studentId: b.dataset.student })));
}
async function setStatus(id, st) {
  const { error } = await sb.from("cs_requests").update({ status: st }).eq("id", id);
  if (error) return toast(error.message);
  toast(`${STATUS_LABEL[st]}로 바꿨어요.`); refresh();
}

// 신청 목록
let reqFilter = "대기";
function adminReqs() {
  const list = A.reqs.filter((r) => !reqFilter || r.status === reqFilter);
  $("#a-pane").innerHTML = `
    <section class="card">
      <div class="row between"><h2>상담 신청</h2>
        <select id="req-filter" style="width:auto">${["대기", "확정", "완료", "취소", ""].map((s) => `<option value="${s}" ${s === reqFilter ? "selected" : ""}>${s ? STATUS_LABEL[s] : "전체"}</option>`).join("")}</select>
      </div>
      ${list.length ? list.map((r) => `
        <div class="item ${r.crisis_flag ? "flag" : (r.worry_level || 0) >= 4 ? "high" : ""}">
          <div class="row between"><span>${sName(r.student_id)}</span>${badge(r.status)}</div>
          ${r.crisis_flag ? `<p style="color:var(--warn);font-weight:700">⚠ 위기 표현 또는 고민의 크기 5점 — 먼저 연락해 주세요.</p>` : ""}
          <p class="meta">${r.slots ? fmt(r.slots.starts_at) + ` (${r.slots.duration_min}분)` : "시간 미정"} · ${esc(r.mode)} · ${esc(r.topic)} ${worryBadge(r.worry_level)}</p>
          <dl><dt>고민 내용</dt><dd>${esc(r.concern) || "-"}</dd><dt>고민의 크기</dt><dd>${r.worry_level ? `${r.worry_level}점 · ${WORRY[r.worry_level]}` : "-"}</dd></dl>
          <div class="row end">
            ${r.status === "대기" ? `<button class="small primary" data-confirm="${r.id}">확정</button>` : ""}
            ${["대기", "확정"].includes(r.status) ? `<button class="small" data-cancelreq="${r.id}">취소</button>` : ""}
            ${["대기", "확정"].includes(r.status) ? `<button class="small" data-write="${r.id}" data-student="${r.student_id}">상담 기록 쓰기</button>` : ""}
            <button class="small" data-open-student="${r.student_id}">학생 카드</button>
          </div>
        </div>`).join("") : `<p class="empty">해당하는 신청이 없어요.</p>`}
    </section>`;
  $("#req-filter").onchange = (e) => { reqFilter = e.target.value; adminReqs(); };
  bindCommon($("#a-pane"));
}

// 학생 카드
let classFilter = "";
function adminStudents() {
  const list = A.students.filter((s) => !classFilter || s.class === classFilter);
  $("#a-pane").innerHTML = `
    <section class="card">
      <div class="row between"><h2>학생 (${list.length}명)</h2>
        <select id="class-filter" style="width:auto"><option value="">전체</option><option value="A" ${classFilter === "A" ? "selected" : ""}>A반</option><option value="B" ${classFilter === "B" ? "selected" : ""}>B반</option></select>
      </div>
      ${list.length ? `<div class="grid-cards">${list.map((s) => {
        const last = A.reqs.find((r) => r.student_id === s.id);
        return `<div class="item click ${last?.crisis_flag && ["대기", "확정"].includes(last.status) ? "flag" : ""}" data-sid="${s.id}">
          <div class="row between"><b>${esc(s.name)}</b>${classBadge(s.class)}</div>
          <p class="meta">${esc(s.student_no)} · 이번 학기 ${A.semCount[s.id] || 0}회 ${last ? worryBadge(last.worry_level) : ""}</p>
        </div>`;
      }).join("")}</div>` : `<p class="empty">가입한 학생이 없어요.</p>`}
    </section>
    <div id="student-detail"></div>`;
  $("#class-filter").onchange = (e) => { classFilter = e.target.value; adminStudents(); };
  $$("[data-sid]").forEach((el) => (el.onclick = () => openStudent(el.dataset.sid)));
}
function openStudent(id) {
  const s = A.byId[id];
  if (!s) return;
  const items = [
    ...A.reqs.filter((r) => r.student_id === id).map((r) => ({ kind: "req", at: r.created_at, r })),
    ...A.notes.filter((n) => n.student_id === id).map((n) => ({ kind: "note", at: n.counsel_date + "T23:59:59+09:00", n })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const box = $("#student-detail");
  box.innerHTML = `
    <section class="card">
      <div class="row between"><h2>${esc(s.name)} ${classBadge(s.class)}</h2><button class="small primary" data-write="" data-student="${s.id}">상담 기록 쓰기</button></div>
      <p class="meta">학번 ${esc(s.student_no)} · 이번 학기 상담 ${A.semCount[s.id] || 0}회 · 개인정보 동의 ${s.consent_at ? fmtDate(s.consent_at.slice(0, 10)) : "아직 안 함"}</p>
      <h3>상담 이력</h3>
      ${items.length ? `<div class="timeline">${items.map((it) => it.kind === "req" ? `
        <div class="tl req">
          <p class="meta">${fmt(it.r.created_at)} 신청 ${badge(it.r.status)}</p>
          <p><b>${esc(it.r.topic)}</b> · ${esc(it.r.mode)} · 희망 ${it.r.slots ? fmt(it.r.slots.starts_at) : "-"} ${worryBadge(it.r.worry_level)}</p>
          ${it.r.concern ? `<p>${esc(it.r.concern)}</p>` : ""}
        </div>` : `
        <div class="tl">
          <p class="meta">${fmtDate(it.n.counsel_date)} 상담 기록</p>
          <p><b>${esc(it.n.topic || "")}</b></p>
          <dl>
            <dt>주요 내용</dt><dd>${esc(it.n.content) || "-"}</dd>
            <dt>교수 소견</dt><dd>${esc(it.n.opinion) || "-"}</dd>
            <dt>후속 조치</dt><dd>${esc(it.n.followup) || "-"}${it.n.next_date ? `\n다음 상담 예정 ${fmtDate(it.n.next_date)}` : ""}</dd>
          </dl>
          ${it.n.private_memo ? `<div class="private-box"><b>교수 전용 메모</b><br />${esc(it.n.private_memo)}</div>` : ""}
          ${A.shares[it.n.id] ? `<div class="public-box" style="margin-top:8px"><b>학생에게 공개</b><br />${esc(A.shares[it.n.id].summary || "")}${A.shares[it.n.id].task ? `<br /><b>과제</b> ${esc(A.shares[it.n.id].task)}` : ""}</div>` : ""}
        </div>`).join("")}</div>` : `<p class="empty">아직 기록이 없어요.</p>`}
    </section>`;
  bindCommon(box);
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 상담 기록 작성
function openNote({ requestId, studentId }) {
  const s = A.byId[studentId];
  const req = requestId ? A.reqs.find((r) => r.id === requestId) : null;
  const dlg = $("#note-dialog");
  dlg.innerHTML = `
  <form id="f-note" method="dialog">
    <h2 id="note-title">상담 기록 — ${esc(s?.name)} ${classBadge(s?.class)}</h2>
    ${req ? `<p class="hint">신청: ${esc(req.topic)} · 고민 ${req.worry_level || "-"}점${req.concern ? ` · "${esc(req.concern.slice(0, 80))}"` : ""}</p>` : `<p class="hint">신청 없이 하는 정기 상담 기록이에요.</p>`}
    <div class="row">
      <label>상담 날짜<input type="date" name="date" required value="${req?.slots ? new Date(req.slots.starts_at).toLocaleDateString("sv-SE", KST) : todayKST()}" /></label>
      <label>분야<select name="topic">${TOPICS.map((t) => `<option ${t === (req?.topic || "학교생활 적응") ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    </div>
    <label>주요 내용<textarea name="content" rows="4"></textarea></label>
    <label>교수 소견<textarea name="opinion" rows="3"></textarea></label>
    <label>후속 조치<textarea name="followup" rows="2"></textarea></label>
    <div class="row">
      <label>다음 상담 예정일<input type="date" name="next" /></label>
      <label class="row center" style="gap:8px;color:var(--ink)"><input type="checkbox" name="needs" style="width:22px;min-height:22px;margin:0" /> 후속 조치 필요</label>
    </div>
    <div class="private-box"><label style="margin:0">🔒 교수 전용 메모 — 학생에게 절대 보이지 않아요<textarea name="memo" rows="3"></textarea></label></div>
    <div class="public-box" style="margin-top:12px">
      <label>👀 학생에게 공개할 요약 (비우면 공개하지 않아요)<textarea name="summary" rows="3" placeholder="예: 오늘은 시험 준비 방법을 함께 정리했어요."></textarea></label>
      <label style="margin:0">학생 과제<input name="task" placeholder="예: 다음 주까지 공부 계획표 만들어 오기" /></label>
    </div>
    <div class="row end" style="margin-top:14px">
      <button type="button" id="note-close">닫기</button>
      <button class="primary" type="submit">저장${req ? "하고 완료 처리" : ""}</button>
    </div>
    <p id="note-msg" class="msg err"></p>
  </form>`;
  dlg.showModal();
  $("#note-close").onclick = () => dlg.close();
  $("#f-note").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { data: note, error } = await sb.from("cs_notes").insert({
      request_id: req?.id || null, student_id: studentId, counsel_date: f.get("date"), topic: f.get("topic"),
      content: f.get("content"), opinion: f.get("opinion"), private_memo: f.get("memo"), followup: f.get("followup"),
      needs_followup: f.get("needs") === "on", next_date: f.get("next") || null,
    }).select().single();
    if (error) return ($("#note-msg").textContent = error.message);
    if ((f.get("summary") || "").trim() || (f.get("task") || "").trim()) {
      const { error: e2 } = await sb.from("cs_note_shares").insert({ note_id: note.id, student_id: studentId, summary: f.get("summary") || null, task: f.get("task") || null, counsel_date: note.counsel_date, topic: note.topic });
      if (e2) return ($("#note-msg").textContent = "기록은 저장했지만 공개분 저장에 실패했어요: " + e2.message);
    }
    if (req) await sb.from("cs_requests").update({ status: "완료" }).eq("id", req.id);
    dlg.close(); toast("상담 기록을 저장했어요.");
    await loadAll(); renderAdmin().then(() => { if (aTab === "students") openStudent(studentId); });
  };
}

// 상담 시간 (반복 규칙)
async function adminSlots() {
  const [{ data: rules }, { data: slots }] = await Promise.all([
    sb.from("cs_slot_rules").select("*").order("created_at", { ascending: false }),
    sb.from("cs_slots").select("*, requests:cs_requests(status, student_id)").gte("starts_at", new Date().toISOString()).order("starts_at").limit(200),
  ]);
  const sem = semester();
  const byDay = {};
  (slots || []).forEach((s) => { const d = new Date(s.starts_at).toLocaleDateString("sv-SE", KST); (byDay[d] ||= []).push(s); });
  $("#a-pane").innerHTML = `
    <section class="card">
      <h2>반복 상담 시간 만들기</h2>
      <form id="f-rule">
        <fieldset><legend>요일</legend><div class="chips">${[1, 2, 3, 4, 5].map((d) => `<label class="chip-opt"><input type="checkbox" name="wd" value="${d}" /><span>${WEEKDAYS[d]}</span></label>`).join("")}</div></fieldset>
        <div class="row wrap">
          <label>시작<input type="time" name="st" value="14:00" required /></label>
          <label>끝<input type="time" name="et" value="16:00" required /></label>
          <label>한 번 상담 길이(분)<select name="dur">${[20, 30, 40, 50, 60].map((m) => `<option ${m === 30 ? "selected" : ""}>${m}</option>`).join("")}</select></label>
        </div>
        <div class="row wrap">
          <label>시작 날짜<input type="date" name="from" value="${todayKST()}" required /></label>
          <label>끝 날짜<input type="date" name="to" value="${classEnd()}" required /></label>
        </div>
        <button class="primary" type="submit">상담 시간 만들기</button>
        <p id="rule-msg" class="msg"></p>
      </form>
      ${rules?.length ? `<h3>만든 규칙</h3>${rules.map((r) => `<p class="meta">매주 ${WEEKDAYS[r.weekday]} ${r.start_time.slice(0, 5)}~${r.end_time.slice(0, 5)} · ${r.duration_min}분 · ${r.valid_from} ~ ${r.valid_to}</p>`).join("")}` : ""}
    </section>
    <section class="card">
      <h2>앞으로의 상담 시간</h2>
      <p class="hint">신청이 들어온 시간은 닫거나 지울 수 없어요. 시간을 하나만 추가하려면 시작·끝을 같은 날로 정하세요.</p>
      ${Object.keys(byDay).length ? Object.entries(byDay).map(([d, list]) => `
        <h3>${fmtDate(d)}</h3>
        ${list.map((s) => {
          const act = (s.requests || []).find((r) => ["대기", "확정"].includes(r.status));
          return `<div class="item row between center">
            <span>${new Date(s.starts_at).toLocaleTimeString("ko-KR", { ...KST, hour: "2-digit", minute: "2-digit" })} (${s.duration_min}분)
              ${act ? `${badge(act.status)} ${esc(A.byId[act.student_id]?.name || "")}` : s.is_open ? `<span class="badge b-확정">열림</span>` : `<span class="badge">닫힘</span>`}</span>
            <span>${act ? "" : `<button class="small" data-toggle="${s.id}" data-open="${s.is_open}">${s.is_open ? "닫기" : "열기"}</button> <button class="small warn" data-del="${s.id}">삭제</button>`}</span>
          </div>`;
        }).join("")}`).join("") : `<p class="empty">열린 상담 시간이 없어요.</p>`}
    </section>`;
  $("#f-rule").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const wds = f.getAll("wd").map(Number);
    const m = $("#rule-msg");
    if (!wds.length) { m.classList.add("err"); return (m.textContent = "요일을 하나 이상 골라 주세요."); }
    const rows = wds.map((w) => ({ weekday: w, start_time: f.get("st"), end_time: f.get("et"), duration_min: Number(f.get("dur")), valid_from: f.get("from"), valid_to: f.get("to") }));
    const { data: made, error } = await sb.from("cs_slot_rules").insert(rows).select();
    if (error) { m.classList.add("err"); return (m.textContent = error.message); }
    let total = 0;
    for (const r of made) { const { data: n, error: ge } = await sb.rpc("cs_generate_slots", { p_rule_id: r.id }); if (ge) return toast(ge.message); total += n || 0; }
    toast(`상담 시간 ${total}개를 만들었어요.`); adminSlots();
  };
  $$("[data-toggle]").forEach((b) => (b.onclick = async () => { await sb.from("cs_slots").update({ is_open: b.dataset.open !== "true" }).eq("id", b.dataset.toggle); adminSlots(); }));
  $$("[data-del]").forEach((b) => (b.onclick = async () => { if (!confirm("이 시간을 삭제할까요?")) return; await sb.from("cs_slots").delete().eq("id", b.dataset.del); adminSlots(); }));
}

// 익명 질문함
function adminAnon() {
  $("#a-pane").innerHTML = `
    <section class="card">
      <h2>익명 질문함</h2>
      <p class="hint">누가 썼는지 저장되지 않아요. 답변을 쓰고 "학생 전체에게 공개"를 고르면 모든 학생이 볼 수 있어요.</p>
      ${A.anon.length ? A.anon.map((q) => `
        <div class="item ${q.crisis_flag && !q.answer ? "flag" : ""}">
          <p class="meta">${fmt(q.created_at)} ${q.crisis_flag ? `<span class="badge b-warn">위기 표현</span>` : ""} ${q.is_public ? `<span class="badge b-확정">공개 중</span>` : ""}</p>
          <p><b>Q.</b> ${esc(q.body)}</p>
          <form data-qid="${q.id}">
            <textarea name="answer" rows="3" placeholder="답변">${esc(q.answer || "")}</textarea>
            <div class="row between center" style="margin-top:8px">
              <label class="row center" style="gap:8px;margin:0;color:var(--ink)"><input type="checkbox" name="pub" ${q.is_public ? "checked" : ""} style="width:22px;min-height:22px;margin:0" /> 학생 전체에게 공개</label>
              <span><button type="button" class="small warn" data-qdel="${q.id}">삭제</button> <button class="small primary" type="submit">저장</button></span>
            </div>
          </form>
        </div>`).join("") : `<p class="empty">아직 질문이 없어요.</p>`}
    </section>`;
  $$("[data-qid]").forEach((form) => (form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const answer = (f.get("answer") || "").trim();
    const { error } = await sb.from("cs_anon_questions").update({ answer: answer || null, answered_at: answer ? new Date().toISOString() : null, is_public: !!answer && f.get("pub") === "on" }).eq("id", form.dataset.qid);
    if (error) return toast(error.message);
    toast("저장했어요."); refresh();
  }));
  $$("[data-qdel]").forEach((b) => (b.onclick = async () => { if (!confirm("이 질문을 삭제할까요?")) return; await sb.from("cs_anon_questions").delete().eq("id", b.dataset.qdel); refresh(); }));
}

// 명단·내보내기·졸업생 삭제
function adminRoster() {
  const joined = new Set(A.students.map((s) => s.student_no));
  const sem = semester();
  $("#a-pane").innerHTML = `
    <section class="card">
      <h2>학기말 보고용 내보내기</h2>
      <p class="hint">학생별·분야별 상담 횟수 집계표를 엑셀 파일로 받아요. 상담 내용과 교수 전용 메모는 들어가지 않아요.</p>
      <div class="row wrap">
        <label>기간<select id="exp-range"><option value="sem">${sem.label} (${sem.start} ~ ${sem.end})</option><option value="all">전체 기간</option></select></label>
        <button class="primary" id="exp-btn">엑셀로 받기</button>
      </div>
    </section>
    <section class="card">
      <h2>학생 명단 추가</h2>
      <p class="hint">한 줄에 한 명씩 "학번 이름 반"으로 적으세요(반은 A 또는 B, 생략 가능). 엑셀에서 세 칸을 복사해 붙여 넣어도 돼요.</p>
      <form id="f-roster">
        <textarea name="list" rows="5" placeholder="2612101 김가인 A"></textarea>
        <button class="primary" type="submit" style="margin-top:10px">명단에 추가</button>
        <p id="roster-msg" class="msg"></p>
      </form>
    </section>
    <section class="card">
      <div class="row between"><h2>등록된 명단 <span class="hint">(${A.roster.length}명 중 ${A.roster.filter((r) => joined.has(r.student_no)).length}명 가입)</span></h2></div>
      <p class="hint">졸업생 기록 삭제: 학생을 고르고 아래 버튼을 누르면 명단·계정·상담 기록이 모두 지워지고 되돌릴 수 없어요.</p>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>반</th><th>학번</th><th>이름</th><th>가입</th></tr></thead>
        <tbody>${A.roster.slice().sort((a, b) => (a.class || "").localeCompare(b.class || "") || a.student_no.localeCompare(b.student_no)).map((r) => `
          <tr><td><input type="checkbox" class="pick" value="${esc(r.student_no)}" style="width:20px;min-height:20px;margin:0" /></td>
          <td>${esc(r.class || "-")}</td><td>${esc(r.student_no)}</td><td>${esc(r.name)}</td>
          <td>${joined.has(r.student_no) ? `<span class="badge b-확정">가입</span>` : `<span class="badge">미가입</span>`}</td></tr>`).join("")}</tbody>
      </table></div>
      <div class="row end" style="margin-top:12px"><button class="warn" id="purge-btn">고른 학생 기록 삭제</button></div>
    </section>`;
  $("#f-roster").onsubmit = async (e) => {
    e.preventDefault();
    const rows = [], bad = [];
    String(new FormData(e.target).get("list")).split(/\r?\n/).forEach((line) => {
      const t = line.trim(); if (!t) return;
      const m = t.match(/^(\d{4,12})[\s,]+(.+?)(?:[\s,]+([ABab]))?$/);
      if (m) rows.push({ student_no: m[1], name: m[2].replace(/\s+/g, " ").trim(), class: m[3] ? m[3].toUpperCase() : null });
      else bad.push(t);
    });
    const msg = $("#roster-msg");
    if (!rows.length) { msg.classList.add("err"); return (msg.textContent = '"학번 이름 반" 형식으로 적어 주세요.'); }
    const { error } = await sb.from("cs_roster").upsert(rows, { onConflict: "student_no" });
    if (error) { msg.classList.add("err"); return (msg.textContent = error.message); }
    toast(`${rows.length}명을 넣었어요.` + (bad.length ? ` 형식이 맞지 않은 줄 ${bad.length}개는 뺐어요.` : ""));
    refresh();
  };
  $("#purge-btn").onclick = async () => {
    const nos = $$(".pick").filter((c) => c.checked).map((c) => c.value);
    if (!nos.length) return toast("삭제할 학생을 골라 주세요.");
    const typed = prompt(`${nos.length}명의 명단·계정·상담 기록을 모두 지웁니다. 되돌릴 수 없어요.\n계속하려면 "삭제"라고 입력하세요.`);
    if (typed !== "삭제") return;
    const { data: n, error } = await sb.rpc("cs_purge_students", { p_student_nos: nos });
    if (error) return toast(error.message);
    toast(`${nos.length}명을 삭제했어요 (계정 ${n}개).`); refresh();
  };
  $("#exp-btn").onclick = () => exportXlsx($("#exp-range").value);
}

async function exportXlsx(range) {
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
  const sem = semester();
  const inRange = (d) => range === "all" || (d >= sem.start && d <= sem.end);
  const notes = A.notes.filter((n) => inRange(n.counsel_date));
  const rosterByNo = Object.fromEntries(A.roster.map((r) => [r.student_no, r]));
  const people = A.roster.map((r) => ({ no: r.student_no, name: r.name, class: r.class || "", id: A.students.find((s) => s.student_no === r.student_no)?.id }));
  A.students.forEach((s) => { if (!rosterByNo[s.student_no]) people.push({ no: s.student_no, name: s.name, class: s.class || "", id: s.id }); });
  people.sort((a, b) => a.class.localeCompare(b.class) || a.no.localeCompare(b.no));
  const sheet1 = people.map((p) => {
    const mine = notes.filter((n) => n.student_id === p.id);
    const row = { 반: p.class, 학번: p.no, 이름: p.name };
    TOPICS.forEach((t) => (row[t] = mine.filter((n) => n.topic === t).length));
    row["합계"] = mine.length;
    row[`목표(${CFG.SEMESTER_GOAL}회) 달성`] = mine.length >= CFG.SEMESTER_GOAL ? "O" : "X";
    return row;
  });
  const total = { 반: "", 학번: "", 이름: "합계" };
  TOPICS.forEach((t) => (total[t] = notes.filter((n) => n.topic === t).length));
  total["합계"] = notes.length;
  sheet1.push(total);
  const sheet2 = notes.slice().sort((a, b) => a.counsel_date.localeCompare(b.counsel_date)).map((n) => {
    const s = A.byId[n.student_id] || {};
    return { 상담일: n.counsel_date, 반: s.class || "", 학번: s.student_no || "", 이름: s.name || "", 분야: n.topic || "", "신청 상담": n.request_id ? "신청" : "정기", "후속 조치 필요": n.needs_followup ? "O" : "" };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet1), "학생별 집계");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet2.length ? sheet2 : [{ 상담일: "기록 없음" }]), "상담 목록");
  XLSX.writeFile(wb, `지도상담_${range === "all" ? "전체" : sem.label}_${todayKST()}.xlsx`);
}

boot();
