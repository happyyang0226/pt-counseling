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
const TOPICS = ["공부·성적", "진로·취업", "학교생활", "친구·대인관계", "마음·스트레스", "경제·생활", "잘 모르겠어요"];
const REQUIRED = 3; // 한 학기 의무 상담 횟수

// 항목 사전(cs_items): 화면 문구와 별개인 고유 ID
let ITEMS = [];
const LBL = {};
const itemsOf = (kind, area) => ITEMS.filter((i) => i.kind === kind && (area === undefined || i.area_id === area)).sort((x, y) => x.sort - y.sort);
async function loadItems() {
  if (ITEMS.length) return;
  const { data } = await sb.from("cs_items").select("*").eq("active", true);
  ITEMS = data || [];
  ITEMS.forEach((i) => (LBL[i.id] = i.label));
}
const CENTER_AREAS = [
  ["가정", "가족 사이의 갈등이나 집안에 생긴 어려운 일 때문에 마음이 힘들 때"],
  ["이성관계", "연애 관계가 어렵고 힘들게 느껴지거나, 관계에 지나치게 매달리게 되어 괴로울 때"],
  ["성격", "소심함이나 수줍음 때문에 생활이 불편하거나, 내 성격이 마음에 들지 않아 더 성숙해지고 싶을 때"],
  ["성 상담", "성에 관한 궁금증이나 정체감의 혼란이 있을 때, 성폭력·성희롱으로 어려움을 겪을 때 (피해가 있었다면 학생상담센터나 전문 기관에 바로 도움을 요청하세요)"],
];
function renderAreas() {
  $("#area-list-intro").innerHTML = itemsOf("area").map((a) => `<div class="area"><div class="area-head"><span class="area-icon" aria-hidden="true">${a.icon}</span><b>${esc(a.label)}</b></div>
    <p>${esc(a.hint)}</p><p class="area-ex">${itemsOf("concern", a.id).slice(0, 3).map((c) => `"${esc(c.label)}"`).join(" ")}</p></div>`).join("");
  $("#area-list-center").innerHTML = CENTER_AREAS.map(([t, d]) => `<div class="area center"><div class="area-head"><b>${t}</b></div><p>${d}</p></div>`).join("");
}
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
  await loadItems();
  renderAreas();
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
  document.body.classList.remove("landing");
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
  document.body.classList.add("landing");
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

// ---------- 학생: 단계별 상담 신청 ----------
// 응답은 메모리(W)에만 둔다. URL, localStorage, 콘솔에 남기지 않는다.
const WZ_STEPS = ["상담분야", "고민 고르기", "상담 준비하기", "방식·시간", "신청 내용 확인"];
const newWizard = () => ({
  step: 1, area: null, concerns: [], otherText: "", moreOpen: false, moreTab: null, areaNote: null,
  first: null, since: null, impact: null, help: [], mode: null, slot: null, extra: "",
  token: crypto.randomUUID(), submitting: false, done: null,
});
let W = newWizard();
let SLOTS = [];
let MYINFO = null;

const isCommon = (id) => id.startsWith("common.");
const realConcerns = () => W.concerns.filter((id) => !isCommon(id));
const areaOf = (id) => ITEMS.find((i) => i.id === id)?.area_id;
const areaItem = (id) => ITEMS.find((i) => i.id === id && i.kind === "area");
const slotLabel = (id) => {
  const s = SLOTS.find((x) => String(x.id) === String(id));
  return s ? `${fmt(s.starts_at)} (${s.duration_min}분)` : "";
};

function optHTML({ type, name, id, label, sub, icon, checked }) {
  return `<label class="opt ${checked ? "on" : ""}">
    <input type="${type}" name="${name}" value="${esc(id)}" ${checked ? "checked" : ""} />
    <span class="opt-mark" aria-hidden="true"></span>
    ${icon ? `<span class="opt-icon" aria-hidden="true">${icon}</span>` : ""}
    <span class="opt-text"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
  </label>`;
}
function groupHTML({ legend, multi, name, items, selected, gid, extra = "" }) {
  return `<fieldset class="q" id="${gid || "q-" + name}">
    <legend>${legend}</legend>
    <p class="q-hint">${multi ? "여러 개 골라도 돼요" : "하나를 골라 주세요"}</p>
    ${extra}
    <div class="opts">${items.map((i) => optHTML({ type: multi ? "checkbox" : "radio", name, id: i.id, label: i.label, sub: i.sub, icon: i.icon,
      checked: multi ? selected.includes(i.id) : selected === i.id })).join("")}</div>
  </fieldset>`;
}
const concernItems = (area) => itemsOf("concern", area).map((c) => ({ id: c.id, label: c.label }));

async function loadStudent() {
  const [{ data: slots }, { data: info }] = await Promise.all([sb.rpc("cs_available_slots"), sb.rpc("cs_my_info")]);
  SLOTS = slots || [];
  MYINFO = info;
  if (W.slot && W.slot !== "later" && !SLOTS.some((s) => String(s.id) === String(W.slot))) W.slot = null;
  renderWizard(false);
  loadMyRequests();
  loadPublicQuestions();
  loadMyProgress();
  loadMyFeedback();
  watchFeedback();
}

function renderProgress() {
  const done = W.step > WZ_STEPS.length;
  show($("#wz-progress"), !done);
  show($("#wz-nav"), !done);
  if (done) return;
  $("#wz-steps").innerHTML = WZ_STEPS.map((t, i) => {
    const n = i + 1, st = n < W.step ? "done" : n === W.step ? "now" : "";
    return `<li class="${st}" ${n === W.step ? 'aria-current="step"' : ""}><span class="n">${n < W.step ? "✓" : n}</span><span class="t">${t}</span></li>`;
  }).join("");
  $("#wz-bar").style.width = `${(W.step / WZ_STEPS.length) * 100}%`;
  $("#wz-count").textContent = `${W.step} / ${WZ_STEPS.length} 단계 · ${WZ_STEPS[W.step - 1]}`;
  show($("#wz-prev"), W.step > 1);
  $("#wz-next").textContent = W.step === WZ_STEPS.length ? "상담 신청하기" : "다음";
  $("#wz-next").disabled = W.submitting;
}

function renderWizard(moveFocus = true) {
  $("#wz-msg").textContent = "";
  renderProgress();
  const body = $("#wz-body");
  body.innerHTML = [null, step1, step2, step3, step4, step5, stepDone][W.step]();
  bindWizard();
  if (moveFocus) {
    const h = $(".wz-title", body);
    if (h) { h.focus({ preventScroll: true }); $("#wizard").scrollIntoView({ behavior: "smooth", block: "start" }); }
  }
}

// 1단계: 상담분야
function step1() {
  const areas = itemsOf("area").map((a) => ({ id: a.id, label: a.label, sub: a.hint, icon: a.icon }));
  return `<h3 class="wz-title" tabindex="-1">상담분야 고르기</h3>` +
    groupHTML({ legend: "어떤 이야기를 나누고 싶으세요?", name: "area", items: areas, selected: W.area }) +
    `<div id="wz-area-note" aria-live="polite">${areaNoteHTML()}</div>
     <p class="hint">다음 단계에서 다른 분야의 고민도 함께 고를 수 있어요.</p>`;
}
function areaNoteHTML() {
  if (!W.areaNote) return "";
  const kept = realConcerns().filter((c) => areaOf(c) === W.areaNote);
  if (!kept.length) return "";
  return `<div class="note-box">앞에서 고른 <b>${esc(LBL[W.areaNote])}</b> 고민 ${kept.length}개는 지우지 않고 그대로 두었어요.
    다음 단계의 "다른 분야의 고민"에서 확인할 수 있어요.
    <button type="button" class="small" id="wz-clear-prev">그 고민 ${kept.length}개 지우기</button></div>`;
}

// 2단계: 고민 고르기
function otherAreas() { return itemsOf("area").filter((a) => a.id !== W.area); }
function step2() {
  const a = areaItem(W.area);
  const others = otherAreas();
  if (!W.moreTab || W.moreTab === W.area) W.moreTab = (others.find((o) => realConcerns().some((c) => areaOf(c) === o.id)) || others[0]).id;
  const otherCount = realConcerns().filter((c) => areaOf(c) !== W.area).length;
  if (otherCount) W.moreOpen = true;
  return `<h3 class="wz-title" tabindex="-1">고민 고르기</h3>` +
    groupHTML({ legend: "어떤 고민이 있으신가요? 해당하는 것을 골라 주세요.", multi: true, name: "concern", gid: "q-concern",
      items: concernItems(W.area), selected: W.concerns,
      extra: `<p class="q-area"><span aria-hidden="true">${a.icon}</span> ${esc(a.label)}</p>` }) +
    `<div class="more">
      <button type="button" class="more-btn" id="wz-more-btn" aria-expanded="${W.moreOpen}" aria-controls="wz-more">
        <span aria-hidden="true">＋</span> 다른 분야의 고민도 추가할래요 <span class="more-n" id="wz-more-n">${otherCount ? `(${otherCount}개 골랐어요)` : ""}</span></button>
      <div id="wz-more" ${W.moreOpen ? "" : "hidden"}>
        <div class="area-tabs" role="tablist" aria-label="다른 상담분야">
          ${others.map((o) => `<button type="button" role="tab" id="tab-${o.id}" data-tab="${o.id}" aria-controls="wz-more-panel"
              aria-selected="${o.id === W.moreTab}" tabindex="${o.id === W.moreTab ? 0 : -1}">
              <span aria-hidden="true">${o.icon}</span> ${esc(o.label)} <span class="tab-n" data-n="${o.id}"></span></button>`).join("")}
        </div>
        <div role="tabpanel" id="wz-more-panel" aria-labelledby="tab-${W.moreTab}">${morePanelHTML()}</div>
      </div>
    </div>
    <div class="opts commons">
      ${optHTML({ type: "checkbox", name: "common", id: "common.other", label: "여기에 없는 고민이 있어요", checked: W.concerns.includes("common.other") })}
      <div id="wz-other" class="other-box" ${W.concerns.includes("common.other") ? "" : "hidden"}>
        <label for="wz-other-text">어떤 고민인지 짧게 적어 주세요 <span class="optional">(선택)</span></label>
        <textarea id="wz-other-text" rows="2" maxlength="500">${esc(W.otherText)}</textarea>
        <p class="hint">적지 않아도 다음으로 넘어갈 수 있어요.</p>
      </div>
      ${optHTML({ type: "checkbox", name: "common", id: "common.later", label: "자세한 이야기는 상담 때 할게요", checked: W.concerns.includes("common.later") })}
    </div>
    <div id="wz-first" aria-live="polite">${firstHTML()}</div>`;
}
function morePanelHTML() {
  return `<div class="opts">${concernItems(W.moreTab).map((c) => optHTML({ type: "checkbox", name: "concern", id: c.id, label: c.label, checked: W.concerns.includes(c.id) })).join("")}</div>`;
}
function firstHTML() {
  const real = realConcerns();
  if (real.length < 2) return "";
  if (W.first && W.first !== "first.later" && !real.includes(W.first)) W.first = null;
  const items = real.map((id) => ({ id, label: LBL[id], sub: areaOf(id) !== W.area ? LBL[areaOf(id)] : "" }))
    .concat([{ id: "first.later", label: "상담하면서 정할게요" }]);
  return groupHTML({ legend: "이 중에서 먼저 이야기하고 싶은 것은 무엇인가요?", name: "first", items, selected: W.first });
}
function refreshStep2() {
  const otherCount = realConcerns().filter((c) => areaOf(c) !== W.area).length;
  $("#wz-more-n").textContent = otherCount ? `(${otherCount}개 골랐어요)` : "";
  $$("[data-n]").forEach((s) => {
    const n = realConcerns().filter((c) => areaOf(c) === s.dataset.n).length;
    s.textContent = n ? n : "";
  });
  const had = $("#wz-first").innerHTML.trim() !== "";
  $("#wz-first").innerHTML = firstHTML();
  bindInputs($("#wz-first"));
  if (!had && realConcerns().length >= 2) $("#wz-first").classList.add("pop");
}

// 3단계: 상담 준비하기
function step3() {
  const opts = (kind) => itemsOf(kind).map((i) => ({ id: i.id, label: i.label }));
  return `<h3 class="wz-title" tabindex="-1">상담 준비하기</h3>
    <p class="hint">상담 전에 몇 가지만 골라 주세요. 정답은 없어요. 말하기 어려우면 "상담 때 이야기할게요"를 고르면 돼요.</p>` +
    groupHTML({ legend: "이 고민은 언제부터 있었나요?", name: "since", items: opts("since"), selected: W.since }) +
    groupHTML({ legend: "요즘 이 고민이 일상이나 공부에 얼마나 영향을 주나요?", name: "impact", items: opts("impact"), selected: W.impact }) +
    groupHTML({ legend: "상담에서 어떤 도움을 받고 싶으세요?", multi: true, name: "help", items: opts("help"), selected: W.help });
}

// 4단계: 방식·시간
function step4() {
  const modes = itemsOf("mode").map((i) => ({ id: i.id, label: i.label }));
  const slots = SLOTS.map((s) => ({ id: String(s.id), label: fmt(s.starts_at), sub: `${s.duration_min}분 · 교수님이 확인하면 확정돼요` }))
    .concat([{ id: "later", label: "시간은 교수님과 따로 정할게요", sub: "교수님이 연락드려요" }]);
  return `<h3 class="wz-title" tabindex="-1">상담 방식과 시간</h3>` +
    groupHTML({ legend: "어떤 방식으로 상담받고 싶으세요?", name: "mode", items: modes, selected: W.mode }) +
    groupHTML({ legend: "언제 만나면 좋을까요?", name: "slot", items: slots, selected: W.slot,
      extra: SLOTS.length ? "" : `<p class="note-box">지금 열려 있는 상담 시간이 없어요. "따로 정할게요"를 고르면 교수님이 시간을 알려 드려요.</p>` }) +
    `<div class="q extra">
      <label for="wz-extra" class="q-legend">추가로 전하고 싶은 이야기가 있나요? <span class="optional">(선택)</span></label>
      <textarea id="wz-extra" rows="3" maxlength="2000" placeholder="적지 않아도 신청할 수 있어요.">${esc(W.extra)}</textarea>
      <div id="wz-help" class="crisis" ${CRISIS_RE.test(W.extra) ? "" : "hidden"}>${crisisHTML()}</div>
    </div>`;
}

// 5단계: 확인
function step5() {
  const real = realConcerns();
  const groups = [W.area, ...itemsOf("area").map((a) => a.id).filter((id) => id !== W.area)]
    .map((a) => [a, real.filter((c) => areaOf(c) === a)]).filter(([, ids]) => ids.length);
  const concernsHTML = (groups.map(([a, ids]) => `<div class="sum-group"><span class="badge topic">${esc(LBL[a])}</span>
      <ul>${ids.map((id) => `<li>${esc(LBL[id])}</li>`).join("")}</ul></div>`).join("") || "")
    + (W.concerns.includes("common.other") ? `<p>여기에 없는 고민: ${W.otherText.trim() ? esc(W.otherText.trim()) : "<span class='hint'>(적지 않음)</span>"}</p>` : "")
    + (W.concerns.includes("common.later") ? `<p>자세한 이야기는 상담 때 할게요</p>` : "");
  const first = real.length >= 2 ? LBL[W.first] : real.length === 1 ? LBL[real[0]] : "상담하면서 정할게요";
  const who = MYINFO ? `${esc(MYINFO.name)} · ${esc(MYINFO.student_no)}${MYINFO.class ? ` · ${CLASS_NAME[MYINFO.class]}` : ""}` : esc(me.name);
  const row = (label, value, step) => `<div class="sum-row"><dt>${label}</dt><dd>${value}</dd>
      <dd class="sum-edit">${step ? `<button type="button" class="small" data-goto="${step}" aria-label="${label} 수정">수정</button>` : ""}</dd></div>`;
  return `<h3 class="wz-title" tabindex="-1">신청 내용 확인</h3>
    <p class="hint">아래 내용으로 신청할게요. 고치고 싶은 곳은 "수정"을 누르세요. 고른 내용은 그대로 남아 있어요.</p>
    <dl class="summary-list">
      ${row("신청하는 사람", who)}
      ${row("주된 상담분야", `<span aria-hidden="true">${areaItem(W.area).icon}</span> ${esc(LBL[W.area])}`, 1)}
      ${row("선택한 고민", concernsHTML, 2)}
      ${row("먼저 이야기할 고민", esc(first), 2)}
      ${row("고민이 시작된 때", esc(LBL[W.since]), 3)}
      ${row("일상·공부에 주는 영향", esc(LBL[W.impact]), 3)}
      ${row("받고 싶은 도움", W.help.map((h) => esc(LBL[h])).join(", "), 3)}
      ${row("상담 방식", esc(LBL[W.mode]), 4)}
      ${row("희망 시간", W.slot === "later" ? "교수님과 따로 정하기" : `${esc(slotLabel(W.slot))} <span class="badge s-대기">교수님 확정 전</span>`, 4)}
      ${row("추가로 전한 이야기", W.extra.trim() ? esc(W.extra.trim()) : "<span class='hint'>없음</span>", 4)}
    </dl>`;
}

function stepDone() {
  const d = W.done;
  return `<div class="done-box">
    <div class="done-check" aria-hidden="true">✓</div>
    <h3 class="wz-title" tabindex="-1">상담 신청이 접수됐어요</h3>
    <p>${d.slot ? `희망 시간 <b>${esc(d.slot)}</b>은 아직 <b>확정 전</b>이에요. 교수님이 확인하면 "내 상담 내역"에서 "확정"으로 바뀌어요.`
      : "교수님이 상담 시간을 정해 연락드릴게요."}</p>
    <p class="hint">${esc(d.area)} · ${esc(d.mode)}</p>
    <button type="button" class="primary" id="wz-new">다른 상담 신청하기</button>
  </div>`;
}

// 입력 연결
function bindInputs(root) {
  $$("input", root).forEach((inp) => (inp.onchange = () => onPick(inp)));
}
function bindWizard() {
  const body = $("#wz-body");
  bindInputs(body);
  $("#wz-clear-prev")?.addEventListener("click", clearPrevArea);
  const more = $("#wz-more-btn");
  if (more) more.onclick = () => {
    W.moreOpen = !W.moreOpen;
    more.setAttribute("aria-expanded", W.moreOpen);
    $("#wz-more").hidden = !W.moreOpen;
    if (W.moreOpen) $(`#tab-${W.moreTab}`).focus();
  };
  const tabs = $$('[role="tab"]', body);
  tabs.forEach((t, i) => {
    t.onclick = () => selectTab(t.dataset.tab);
    t.onkeydown = (e) => {
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (k) { e.preventDefault(); const nx = tabs[(i + k + tabs.length) % tabs.length]; selectTab(nx.dataset.tab); nx.focus(); }
      if (e.key === "Home") { e.preventDefault(); selectTab(tabs[0].dataset.tab); tabs[0].focus(); }
      if (e.key === "End") { e.preventDefault(); const l = tabs[tabs.length - 1]; selectTab(l.dataset.tab); l.focus(); }
    };
  });
  if (W.step === 2) refreshStep2();
  const other = $("#wz-other-text");
  if (other) other.oninput = () => (W.otherText = other.value);
  const extra = $("#wz-extra");
  if (extra) extra.oninput = () => { W.extra = extra.value; $("#wz-help").hidden = !CRISIS_RE.test(W.extra); };
  $$("[data-goto]", body).forEach((b) => (b.onclick = () => { W.step = Number(b.dataset.goto); renderWizard(); }));
  $("#wz-new")?.addEventListener("click", () => { W = newWizard(); renderWizard(); });
}
function selectTab(id) {
  W.moreTab = id;
  $$('[role="tab"]').forEach((t) => { const on = t.dataset.tab === id; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; });
  const panel = $("#wz-more-panel");
  panel.setAttribute("aria-labelledby", `tab-${id}`);
  panel.innerHTML = morePanelHTML();
  bindInputs(panel);
}
function clearPrevArea() {
  const prev = W.areaNote;
  W.concerns = W.concerns.filter((c) => areaOf(c) !== prev);
  W.areaNote = null;
  $("#wz-area-note").innerHTML = `<p class="note-box">지웠어요.</p>`;
}

function onPick(inp) {
  const { name, value, checked, type } = inp;
  // 선택 표시(배경·테두리·체크) 갱신: 같은 이름의 모든 보기
  $$(`#wz-body input[name="${name}"]`).forEach((x) => {
    if (x.value === value && type === "checkbox") x.checked = checked;
    x.closest(".opt").classList.toggle("on", x.checked);
  });
  if (name === "area") {
    const prev = W.area;
    W.area = value;
    if (prev && prev !== value && realConcerns().some((c) => areaOf(c) === prev)) W.areaNote = prev;
    else if (W.areaNote === value) W.areaNote = null;
    $("#wz-area-note").innerHTML = areaNoteHTML();
    $("#wz-clear-prev")?.addEventListener("click", clearPrevArea);
  } else if (name === "concern" || name === "common") {
    W.concerns = checked ? [...new Set([...W.concerns, value])] : W.concerns.filter((c) => c !== value);
    if (value === "common.other") { $("#wz-other").hidden = !checked; if (checked) $("#wz-other-text").focus(); }
    refreshStep2();
  } else if (name === "first") W.first = value;
  else if (name === "since") W.since = value;
  else if (name === "impact") W.impact = value;
  else if (name === "help") W.help = checked ? [...new Set([...W.help, value])] : W.help.filter((h) => h !== value);
  else if (name === "mode") W.mode = value;
  else if (name === "slot") W.slot = value;
  $("#wz-msg").textContent = "";
}

// 단계별 확인 (빠진 답이 있으면 그 질문으로 안내)
function wzCheck() {
  const need = (ok, msg, gid) => (ok ? null : { msg, gid });
  const checks = {
    1: [need(W.area, "상담분야를 하나 골라 주세요. 잘 모르겠으면 \"잘 모르겠어요\"를 골라도 돼요.", "q-area")],
    2: [need(W.concerns.length, "고민을 하나 이상 고르거나, \"자세한 이야기는 상담 때 할게요\"를 눌러 주세요.", "q-concern"),
        need(realConcerns().length < 2 || W.first, "먼저 이야기하고 싶은 고민을 하나 골라 주세요. 정하기 어려우면 \"상담하면서 정할게요\"를 고르면 돼요.", "q-first")],
    3: [need(W.since, "고민이 언제부터 있었는지 하나 골라 주세요.", "q-since"),
        need(W.impact, "고민이 주는 영향을 하나 골라 주세요.", "q-impact"),
        need(W.help.length, "받고 싶은 도움을 하나 이상 골라 주세요.", "q-help")],
    4: [need(W.mode, "상담 방식을 하나 골라 주세요.", "q-mode"),
        need(W.slot, "희망 시간을 고르거나 \"따로 정할게요\"를 골라 주세요.", "q-slot")],
  }[W.step] || [];
  return checks.find(Boolean);
}

$("#wz-prev").onclick = () => { if (W.step > 1) { W.step--; renderWizard(); } };
$("#wz-next").onclick = async () => {
  if (W.step === WZ_STEPS.length) return submitWizard();
  const miss = wzCheck();
  if (miss) {
    $("#wz-msg").textContent = miss.msg;
    const g = document.getElementById(miss.gid);
    if (g) { g.classList.add("missing"); g.scrollIntoView({ behavior: "smooth", block: "center" }); g.querySelector("input")?.focus({ preventScroll: true }); }
    return;
  }
  W.step++;
  renderWizard();
};

async function submitWizard() {
  if (W.submitting) return; // 두 번 누름 방지
  W.submitting = true;
  const btn = $("#wz-next");
  btn.disabled = true;
  btn.textContent = "신청하는 중…";
  const real = realConcerns();
  const row = {
    student_id: me.id,
    client_token: W.token, // 같은 신청이 두 번 저장되지 않게 하는 표
    area_id: W.area,
    concern_ids: W.concerns,
    first_concern_id: real.length >= 2 ? W.first : real[0] || null,
    other_concern: W.concerns.includes("common.other") ? W.otherText.trim() || null : null,
    since_id: W.since,
    impact_id: W.impact,
    help_ids: W.help,
    mode_id: W.mode,
    slot_id: W.slot === "later" ? null : Number(W.slot),
    concern: W.extra.trim() || null,
    mode: "대면", topic: "잘 모르겠어요", // 서버가 선택한 ID에 맞게 다시 채운다
  };
  const { error } = await sb.from("cs_requests").insert(row);
  W.submitting = false;
  if (error && !/client_token/.test(error.message)) {
    btn.disabled = false;
    btn.textContent = "상담 신청하기";
    if (/cs_one_active_request_per_slot/.test(error.message)) {
      const { data: slots } = await sb.rpc("cs_available_slots");
      SLOTS = slots || [];
      W.slot = null;
      W.step = 4;
      renderWizard();
      $("#wz-msg").textContent = "방금 다른 학생이 그 시간을 신청했어요. 다른 시간을 골라 주세요. 나머지 답은 그대로 남아 있어요.";
    } else {
      $("#wz-msg").textContent = "신청을 저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요. 고른 내용은 그대로 남아 있어요.";
    }
    return;
  }
  // 저장 성공(또는 이미 저장된 같은 신청)일 때만 완료 화면
  W.done = { slot: W.slot === "later" ? "" : slotLabel(W.slot), area: LBL[W.area], mode: LBL[W.mode] };
  W.step = WZ_STEPS.length + 1;
  renderWizard();
  loadMyRequests();
  const { data: slots } = await sb.rpc("cs_available_slots");
  SLOTS = slots || [];
}

const STATUS_LABEL = { 대기: "확정 대기", 확정: "확정", 완료: "상담 완료", 취소: "취소" };
async function loadMyRequests() {
  const { data, error } = await sb.from("cs_requests").select("*, slots:cs_slots(starts_at, duration_min)").order("created_at", { ascending: false });
  const box = $("#my-requests");
  if (error) return (box.textContent = "신청 내역을 불러오지 못했어요.");
  if (!data.length) return (box.innerHTML = `<p class="hint">아직 신청한 상담이 없습니다.</p>`);
  box.innerHTML = data.map((r) => {
    const first = r.first_concern_id && r.first_concern_id !== "first.later" ? LBL[r.first_concern_id] : "";
    return `<div class="item">
      <div class="row between">
        <b>${esc(LBL[r.area_id] || r.topic)}${first ? ` · ${esc(first)}` : ""}</b>
        <span class="badge s-${esc(r.status)}">${esc(STATUS_LABEL[r.status] || r.status)}</span>
      </div>
      <p class="hint">${r.slots ? `희망 시간 ${fmt(r.slots.starts_at)}${r.status === "대기" ? " (확정 전)" : ""}` : "시간은 교수님과 정하기로 했어요"} · ${esc(LBL[r.mode_id] || r.mode)}</p>
      ${r.public_summary ? `<p class="summary"><b>교수님 상담 요약</b><br />${esc(r.public_summary)}</p>` : ""}
      ${r.status === "대기" ? `<button class="small" data-cancel="${r.id}">신청 취소</button>` : ""}
    </div>`;
  }).join("");
  $$("[data-cancel]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm("이 신청을 취소할까요?")) return;
    const { error } = await sb.from("cs_requests").update({ status: "취소" }).eq("id", b.dataset.cancel);
    if (error) alert("취소하지 못했어요. 다시 시도해 주세요.");
    loadMyRequests();
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
  if ($("#area-filter").options.length < 2) {
    $("#area-filter").insertAdjacentHTML("beforeend", itemsOf("area").map((a) => `<option value="${a.id}">${esc(a.label)}</option>`).join(""));
  }
  ({ dashboard: loadDashboard, requests: loadRequests, slots: loadSlots, students: loadStudents, followup: loadFollowup, questions: loadQuestions, roster: loadRoster })[pane]();
}

function semesterStart() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  if (m >= 9) return { start: `${y}-09-01`, label: `${y}년 2학기` };
  if (m >= 3) return { start: `${y}-03-01`, label: `${y}년 1학기` };
  return { start: `${y - 1}-09-01`, label: `${y - 1}년 2학기·겨울방학` };
}

// 신청별 응답 요약 (ID → 문구)
function answerSummaryHTML(r) {
  if (!r.area_id) { // 예전 형식 신청
    return `<dl><dt>요즘 고민</dt><dd>${esc(r.concern) || "-"}</dd>${r.wish ? `<dt>바라는 점</dt><dd>${esc(r.wish)}</dd>` : ""}</dl>`;
  }
  const ids = r.concern_ids || [];
  const real = ids.filter((c) => !c.startsWith("common."));
  const areas = [r.area_id, ...itemsOf("area").map((a) => a.id).filter((a) => a !== r.area_id)];
  const groups = areas.map((a) => [a, real.filter((c) => areaOf(c) === a)]).filter(([, l]) => l.length);
  const first = r.first_concern_id;
  return `<dl class="answers">
    <dt>선택한 고민</dt><dd>${groups.map(([a, l]) => `<div class="ans-group"><span class="badge topic">${esc(LBL[a])}</span>
        ${l.map((id) => `<span class="ans-chip ${id === first ? "first" : ""}">${id === first ? "★ " : ""}${esc(LBL[id] || id)}</span>`).join("")}</div>`).join("") || "-"}
      ${ids.includes("common.other") ? `<div>여기에 없는 고민: ${r.other_concern ? esc(r.other_concern) : "<span class='hint'>(적지 않음)</span>"}</div>` : ""}
      ${ids.includes("common.later") ? `<div class="hint">자세한 이야기는 상담 때 하기로 했어요</div>` : ""}</dd>
    <dt>먼저 이야기할 고민</dt><dd>${first ? esc(LBL[first] || first) : "-"}</dd>
    <dt>시작된 때</dt><dd>${esc(LBL[r.since_id] || "-")}</dd>
    <dt>일상·공부 영향</dt><dd>${esc(LBL[r.impact_id] || "-")}</dd>
    <dt>원하는 도움</dt><dd>${(r.help_ids || []).map((h) => esc(LBL[h] || h)).join(", ") || "-"}</dd>
    <dt>상담 방식</dt><dd>${esc(LBL[r.mode_id] || r.mode)}</dd>
    <dt>추가 이야기</dt><dd>${esc(r.concern) || "-"}</dd>
  </dl>`;
}
const textFlagHTML = `<p class="crisis-tag">학생이 직접 쓴 글에 도움이 필요할 수 있는 표현이 있어요. 글을 먼저 읽어 보고 필요하면 상담 일정과 관계없이 연락해 주세요.</p>`;
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
  const alerts = open.filter((r) => r.crisis_flag);
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
    ["글 먼저 확인", alerts.length, "requests", alerts.length ? "warn" : ""],
    ["7일 내 상담", upcoming.length, "slots"],
    ["답변 안 한 질문", qCount || 0, "questions"],
    [`의무 ${REQUIRED}회 완료 학생`, `${doneN}/${studentsIn.length}`, "students"],
  ].map(([t, n, go, cls]) => `<button class="stat ${cls || ""}" data-go="${go}"><b>${n}</b><span>${t}</span></button>`).join("");
  $$("[data-go]").forEach((b) => (b.onclick = () => loadAdmin(b.dataset.go)));

  $("#dash-alerts").innerHTML = alerts.length ? alerts.map((r) => `
    <div class="item flag">
      <div class="row between"><b>${esc(r.profiles?.name)} (${esc(r.profiles?.student_no)}) ${classTag(r.profiles?.student_no)}</b>
        <span class="badge s-${esc(r.status)}">${esc(r.status)}</span></div>
      ${textFlagHTML}
      <p>${esc(LBL[r.area_id] || r.topic)} · ${r.slots ? fmt(r.slots.starts_at) : "시간 미정"}</p>
      ${r.other_concern ? `<p class="hint">여기에 없는 고민: ${esc(r.other_concern)}</p>` : ""}
      ${r.concern ? `<p class="hint">추가 이야기: ${esc(r.concern)}</p>` : ""}
    </div>`).join("") : `<p class="hint">지금 먼저 확인할 글이 없습니다.</p>`;

  $("#dash-week").innerHTML = upcoming.length ? `<table><tbody>${upcoming.map((r) => `
    <tr><td>${fmt(r.slots.starts_at)}</td><td>${esc(r.profiles?.name)} ${classTag(r.profiles?.student_no)}</td><td>${esc(r.mode)} · ${esc(LBL[r.area_id] || r.topic)}</td>
    <td><span class="badge s-${esc(r.status)}">${esc(r.status)}</span></td></tr>`).join("")}</tbody></table>`
    : `<p class="hint">앞으로 7일 안에 잡힌 상담이 없습니다.</p>`;

  $("#dash-sem").textContent = `(${sem.label}, ${none.length}명)`;
  $("#dash-none").innerHTML = !studentsIn.length ? `<p class="hint">가입한 학생이 없습니다.</p>`
    : none.length ? `<div class="chips">${none.map((s) => `<span class="chip">${esc(s.name)} <b class="cnt c${semCnt[s.id] || 0}">${semCnt[s.id] || 0}/${REQUIRED}</b> <small>${CMAP[s.student_no] ? CLASS_NAME[CMAP[s.student_no]] : ""}</small></span>`).join("")}</div>`
    : `<p class="hint">모든 학생이 이번 학기 의무 상담 ${REQUIRED}회를 마쳤습니다.</p>`;
}

$("#status-filter").onchange = () => loadRequests();
$("#area-filter").onchange = () => loadRequests();

async function loadRequests() {
  const status = $("#status-filter").value;
  let q = sb.from("cs_requests").select("*, profiles:cs_profiles(name, student_no), slots:cs_slots(starts_at, duration_min)").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data: all, error } = await q;
  const box = $("#request-list");
  if (error) return (box.textContent = error.message);
  const area = $("#area-filter").value;
  const data = all.filter((r) => inClass(r.profiles?.student_no))
    .filter((r) => !area || r.area_id === area || (r.concern_ids || []).some((c) => areaOf(c) === area));
  if (!data.length) return (box.innerHTML = `<p class="hint">해당하는 신청이 없습니다.</p>`);
  box.innerHTML = data.map((r) => `
    <div class="item ${r.crisis_flag ? "flag" : ""}">
      <div class="row between">
        <b>${esc(r.profiles?.name)} (${esc(r.profiles?.student_no)}) ${classTag(r.profiles?.student_no)}</b>
        <span><span class="badge topic">${esc(LBL[r.area_id] || r.topic)}</span><span class="badge s-${esc(r.status)}">${esc(r.status)}</span></span>
      </div>
      ${r.crisis_flag ? textFlagHTML : ""}
      <p>${r.slots ? fmt(r.slots.starts_at) + ` (${r.slots.duration_min}분)` : "시간 협의 필요"} · 신청 ${new Date(r.created_at).toLocaleDateString("ko-KR")}</p>
      ${answerSummaryHTML(r)}
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
  f.topic.innerHTML = TOPICS.map((t) => `<option>${t}</option>`).join("");
  const topic = TOPICS.includes(r?.topic) ? r.topic : "잘 모르겠어요";
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
    sb.from("cs_requests").select("*").eq("student_id", s.id).order("created_at", { ascending: false }),
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
    `<h3>상담 신청 때 고른 응답</h3>` +
    (reqs?.length ? reqs.map((r) => `<div class="item ${r.crisis_flag ? "flag" : ""}"><b>${new Date(r.created_at).toLocaleDateString("ko-KR")} · ${esc(LBL[r.area_id] || r.topic)}</b> <span class="badge s-${esc(r.status)}">${esc(r.status)}</span>
      ${r.crisis_flag ? textFlagHTML : ""}${answerSummaryHTML(r)}</div>`).join("") : `<p class="hint">응답이 없습니다.</p>`);
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
  const topicOf = (t) => (TOPICS.includes(t) ? t : "잘 모르겠어요");
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
