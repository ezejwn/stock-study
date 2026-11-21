// 주식 공부 노트 — 프론트엔드 (빌드 없이 동작하는 순수 JS)
const CAT = { value: "장기가치투자", growth: "성장주", dividend: "배당주" };
const KEY = "stockstudy.v1";
const FEED_REFRESH_MS = 5 * 60 * 1000;
const SUMMARY_TTL_MS = 30 * 60 * 1000;

// ---------- 저장소 (브라우저 localStorage) ----------
let db = { stocks: [], memos: {} };
let memoryOnly = false;
try {
  const raw = localStorage.getItem(KEY);
  if (raw) db = { stocks: [], memos: {}, ...JSON.parse(raw) };
} catch { memoryOnly = true; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { memoryOnly = true; }
}
const findStock = (code) => db.stocks.find((s) => s.code === code);
const catOf = (s) => s.override || s.auto || null;

// ---------- 유틸 ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//.test(u || "") ? u : "#");
async function api(path) {
  const res = await fetch(path);
  let data;
  try { data = await res.json(); } catch { throw new Error(`서버 응답 오류 (${res.status})`); }
  if (!res.ok || data.error) throw new Error(data.error || `오류 (${res.status})`);
  return data;
}
const fmtDate = (d) => (d && d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d || "");
function ago(iso) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "");
function priceHtml(price, rate) {
  if (price == null) return '<span class="cd">시세 없음</span>';
  const cls = rate > 0 ? "up" : rate < 0 ? "down" : "";
  const r = rate == null ? "" : ` <span class="${cls}">${rate > 0 ? "+" : ""}${Number(rate).toFixed(2)}%</span>`;
  return `${Number(price).toLocaleString("ko-KR")}원${r}`;
}
const maxRcept = (list) => (list || []).reduce((m, d) => (d.rceptNo > m ? d.rceptNo : m), "");

// ---------- 검색 · 추가 ----------
// 배포 때 만든 상장사 목록(/corps.json)으로 브라우저에서 바로 검색, 없으면 서버 검색
let corpsPromise = null;
async function searchCorps(q) {
  corpsPromise ??= fetch("/corps.json").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const corps = await corpsPromise;
  if (!corps.length) return (await api(`/api/search?q=${encodeURIComponent(q)}`)).results;
  const s = q.toLowerCase().replace(/\s/g, "");
  const exact = [], starts = [], contains = [];
  for (const [name, code] of corps) {
    const n = name.toLowerCase().replace(/\s/g, "");
    if (code === s || n === s) exact.push({ name, code });
    else if (n.startsWith(s) || code.startsWith(s)) starts.push({ name, code });
    else if (n.includes(s)) contains.push({ name, code });
  }
  return [...exact, ...starts, ...contains].slice(0, 10);
}
const input = $("#searchInput");
const suggest = $("#suggest");
let suggestItems = [];
let active = -1;
let timer;
input.addEventListener("input", () => {
  clearTimeout(timer);
  const q = input.value.trim();
  if (!q) { suggest.hidden = true; return; }
  timer = setTimeout(async () => {
    try {
      const results = await searchCorps(q);
      suggestItems = results;
      active = results.length ? 0 : -1;
      drawSuggest();
    } catch (e) {
      suggest.innerHTML = `<li class="err">${esc(e.message)}</li>`;
      suggest.hidden = false;
    }
  }, 200);
});
input.addEventListener("keydown", (e) => {
  if (suggest.hidden) return;
  if (e.key === "ArrowDown") { active = Math.min(active + 1, suggestItems.length - 1); drawSuggest(); e.preventDefault(); }
  if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); drawSuggest(); e.preventDefault(); }
  if (e.key === "Escape") suggest.hidden = true;
});
$("#addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const it = suggestItems[active];
  if (it) pick(it);
});
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) suggest.hidden = true; });
function drawSuggest() {
  if (!suggestItems.length) { suggest.innerHTML = '<li class="cd">검색 결과 없음</li>'; suggest.hidden = false; return; }
  suggest.innerHTML = suggestItems.map((r, i) =>
    `<li data-i="${i}" class="${i === active ? "on" : ""}"><span>${esc(r.name)}</span><span class="code">${esc(r.code)}${findStock(r.code) ? " · 추가됨" : ""}</span></li>`).join("");
  suggest.hidden = false;
  suggest.querySelectorAll("li[data-i]").forEach((li) => li.addEventListener("click", () => pick(suggestItems[+li.dataset.i])));
}
function pick(it) {
  suggest.hidden = true;
  input.value = "";
  if (!findStock(it.code)) {
    db.stocks.push({ code: it.code, name: it.name, auto: null, override: null, addedAt: Date.now() });
    save();
  }
  location.hash = `#/s/${it.code}`;
}

// 종목 요약(분류·시세) 갱신
async function refreshSummary(s, fresh = false) {
  const data = await api(`/api/stock?code=${s.code}${fresh ? `&fresh=${Date.now()}` : ""}`);
  applySummary(s, data);
  return data;
}
function applySummary(s, data) {
  s.name = data.name;
  s.auto = data.category.auto;
  s.reasons = data.category.reasons;
  const val = data.sections.find((x) => x.key === "valuation");
  const priceP = val?.points.find((p) => p.label === "현재가");
  s.priceText = priceP?.value || null;
  s.verdictLabel = data.verdict?.label || null;
  s.verdictTone = data.verdict?.tone || null;
  s.summaryAt = Date.now();
  if (!s.lastSeen) s.lastSeen = maxRcept(data.disclosures);
  save();
}

// ---------- 라우팅 ----------
let homeTab = "all";
let feedTimer = null;
window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && currentCode) loadFeeds(currentCode);
});
let currentCode = null;
function route() {
  clearInterval(feedTimer);
  currentCode = null;
  const m = location.hash.match(/^#\/s\/([0-9A-Z]{6})/);
  if (m) renderDetail(m[1]);
  else renderHome();
  window.scrollTo(0, 0);
}

// ---------- 홈 ----------
function renderHome() {
  const app = $("#app");
  const counts = { all: db.stocks.length, value: 0, growth: 0, dividend: 0 };
  db.stocks.forEach((s) => { const c = catOf(s); if (c) counts[c]++; });
  const list = db.stocks.filter((s) => homeTab === "all" || catOf(s) === homeTab);
  const tabs = [["all", "전체"], ["value", CAT.value], ["growth", CAT.growth], ["dividend", CAT.dividend]]
    .map(([k, l]) => `<button class="tab ${homeTab === k ? "on" : ""}" data-tab="${k}">${l}<span class="n">${counts[k]}</span></button>`).join("");
  app.innerHTML = `
    ${memoryOnly ? '<div class="warn-box">이 브라우저에서는 저장소를 쓸 수 없어 새로고침하면 목록이 사라집니다.</div>' : ""}
    <div class="tabs">${tabs}</div>
    ${db.stocks.length === 0 ? `<div class="empty"><b>위 검색창에 종목을 입력해 추가하세요.</b><br>재무·배당 지표로 장기가치투자 / 성장주 / 배당주를 자동 분류합니다.</div>` :
      list.length === 0 ? `<div class="empty">이 분류에 해당하는 종목이 없습니다.</div>` :
      `<div class="grid">${list.map(cardHtml).join("")}</div>`}`;
  app.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { homeTab = b.dataset.tab; renderHome(); }));
  app.querySelectorAll(".del").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    const code = b.dataset.code;
    const s = findStock(code);
    if (s && confirm(`${s.name} 을(를) 목록에서 뺄까요? (메모도 삭제)`)) {
      db.stocks = db.stocks.filter((x) => x.code !== code);
      delete db.memos[code];
      save();
      renderHome();
    }
  }));
  updateHomeData();
}
function cardHtml(s) {
  const c = catOf(s);
  return `<a class="scard" href="#/s/${s.code}" data-code="${s.code}">
    <button class="del" data-code="${s.code}" title="삭제" aria-label="삭제">×</button>
    <div class="nm">${esc(s.name)}${s.newCount ? `<span class="newbadge">새 공시 ${s.newCount}</span>` : ""}</div>
    <div class="cd">${s.code}</div>
    <div style="margin-top:8px">${c ? `<span class="badge ${c}">${CAT[c]}${s.override ? " · 직접" : ""}</span>` : '<span class="chip">분석 중…</span>'}</div>
    ${s.verdictLabel ? `<div class="vlabel ${s.verdictTone}">판단: ${esc(s.verdictLabel)}</div>` : ""}
    <div class="px">${s.priceText ? esc(s.priceText) : ""}</div>
  </a>`;
}
let homeBusy = false;
async function updateHomeData() {
  if (homeBusy) return;
  homeBusy = true;
  const queue = [...db.stocks];
  let changed = false;
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      try {
        if (!s.summaryAt || Date.now() - s.summaryAt > SUMMARY_TTL_MS) { await refreshSummary(s); changed = true; }
        const d = await api(`/api/disclosures?code=${s.code}&days=30`);
        const n = s.lastSeen ? d.list.filter((x) => x.rceptNo > s.lastSeen).length : 0;
        if (n !== (s.newCount || 0)) { s.newCount = n; changed = true; }
      } catch { /* 개별 실패는 넘어감 */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  homeBusy = false;
  save();
  if (changed && !currentCode && !location.hash.startsWith("#/s/")) renderHome();
}

// ---------- 상세 ----------
async function renderDetail(code, fresh = false) {
  currentCode = code;
  const app = $("#app");
  let s = findStock(code);
  if (!s) {
    s = { code, name: code, auto: null, override: null, addedAt: Date.now() };
    db.stocks.push(s);
    save();
  }
  if (!fresh) app.innerHTML = `<a class="back" href="#/">← 목록</a><div class="loading">${esc(s.name)} 데이터를 불러오는 중…</div>`;
  let data;
  try {
    data = await refreshSummary(s, fresh);
  } catch (e) {
    app.innerHTML = `<a class="back" href="#/">← 목록</a><div class="warn-box">불러오지 못했습니다: ${esc(e.message)}<br>설정 점검: <a href="/api/health" target="_blank">/api/health</a> 에서 키가 모두 true 인지 확인하세요.</div>`;
    return;
  }
  if (currentCode !== code) return;
  const c = catOf(s);
  const memo = db.memos[code] || {};
  const lastSeenBefore = s.lastSeen;
  app.innerHTML = `
    <a class="back" href="#/">← 목록</a>
    ${data.warnings?.length ? `<div class="warn-box">${data.warnings.map(esc).join("<br>")}</div>` : ""}
    <section class="hero">
      <div class="hero-top">
        <h1>${esc(data.name)}</h1><span class="cd">${code}</span>
        <span class="price">${esc(s.priceText || "")}</span>
        <span class="meta">분석 ${clock(data.updatedAt)} <button class="btn" id="reload">새로고침</button></span>
      </div>
      <div class="cat-row">
        <span class="badge ${c}">${CAT[c]}</span>
        <select id="override" aria-label="분류 직접 지정">
          <option value="">자동 (${CAT[data.category.auto]})</option>
          ${Object.entries(CAT).map(([k, l]) => `<option value="${k}" ${s.override === k ? "selected" : ""}>${l}로 지정</option>`).join("")}
        </select>
        ${data.category.reasons.map((r) => `<span class="chip">${esc(r)}</span>`).join("")}
      </div>
    </section>
    ${verdictHtml(data.verdict, catOf(s))}
    <div class="legend"><span><i class="dot good"></i>양호</span><span><i class="dot warn"></i>체크</span><span><i class="dot bad"></i>주의</span><span><i class="dot"></i>참고</span></div>
    <div class="sections">
      ${data.sections.filter((x) => x.key !== "catalyst").map(sectionHtml).join("")}
      ${catalystHtml(data)}
      <section class="sec wide memo">
        <h2>내 판단 메모 <span class="saved" id="savedMsg" hidden>저장됨</span></h2>
        <p class="sum">이 브라우저에만 저장됩니다.</p>
        <label for="m1">이 회사를 한 문장으로 설명하면?</label>
        <textarea id="m1">${esc(memo.oneLine || "")}</textarea>
        <label for="m2">내 판단이 틀렸다면 그 이유는?</label>
        <textarea id="m2">${esc(memo.wrong || "")}</textarea>
      </section>
    </div>
    <div class="feeds">
      <section class="feed"><div class="feed-h"><h2>DART 공시</h2><small id="discTime"></small></div><ul id="discList"><li class="d">불러오는 중…</li></ul></section>
      <section class="feed"><div class="feed-h"><h2>네이버 뉴스</h2><small id="newsTime"></small></div><ul id="newsList"><li class="d">불러오는 중…</li></ul></section>
    </div>`;

  $("#reload").addEventListener("click", (e) => { e.target.classList.add("spin"); renderDetail(code, true); });
  $("#override").addEventListener("change", (e) => {
    s.override = e.target.value || null;
    save();
    const b = app.querySelector(".cat-row .badge");
    const k = catOf(s);
    b.className = `badge ${k}`;
    b.textContent = CAT[k];
    const cl = $("#checklist");
    if (cl) cl.innerHTML = data.verdict.checklists[k].map((x) => `<li>${esc(x)}</li>`).join("");
  });
  let memoT;
  const saveMemo = () => {
    clearTimeout(memoT);
    memoT = setTimeout(() => {
      db.memos[code] = { oneLine: $("#m1").value, wrong: $("#m2").value };
      save();
      const msg = $("#savedMsg");
      if (msg) { msg.hidden = false; setTimeout(() => { msg.hidden = true; }, 1200); }
    }, 400);
  };
  $("#m1").addEventListener("input", saveMemo);
  $("#m2").addEventListener("input", saveMemo);

  detailCtx = { code, name: data.name, lastSeenBefore, discCatalysts: data.catalysts, discRisks: data.risks };
  loadFeeds(code, fresh);
  loadBusiness(code);
  clearInterval(feedTimer);
  feedTimer = setInterval(() => { if (document.visibilityState === "visible") loadFeeds(code, true); }, FEED_REFRESH_MS);
}
let detailCtx = null;

const GRADE_TONE = { 상: "good", 중: "neutral", 하: "bad", 쌈: "good", 적정: "neutral", 비쌈: "bad", 양호: "good", 체크: "warn", 주의: "bad" };
function verdictHtml(v, cat) {
  if (!v) return "";
  const li = (arr, empty) => (arr.length ? arr.map((x) => `<li>${esc(x)}</li>`).join("") : `<li class="d">${empty}</li>`);
  return `<section class="verdict ${v.tone}">
    <div class="v-head"><span class="v-k">종합 판단</span><span class="v-label">${esc(v.label)}</span></div>
    <p class="v-text">${esc(v.text)}</p>
    <div class="grades">${Object.values(v.grades).map((g) => `<div class="grade"><span>${esc(g.desc)}</span><b class="${GRADE_TONE[g.grade] || "neutral"}">${esc(g.grade)}</b></div>`).join("")}</div>
    <div class="v-cols">
      <div><h3 class="c">강점</h3><ul>${li(v.strengths, "뚜렷한 강점 없음")}</ul></div>
      <div><h3 class="r">약점</h3><ul>${li(v.weaknesses, "뚜렷한 약점 없음")}</ul></div>
    </div>
    <div class="v-cols">
      <div><h3>사기 전에 확인할 것</h3><ol id="checklist">${li(v.checklists[cat] || v.checklist, "")}</ol></div>
      <div><h3>이 판단이 틀릴 수 있는 경우</h3><ul>${li(v.wrongIf, "-")}</ul></div>
    </div>
    <p class="v-note">회사 체력 × 가격 조합으로 지표를 자동 해석한 결과예요. 업종 특성은 반영하지 못하니, 판단의 출발점으로 쓰세요. 투자 권유가 아닙니다.</p>
  </section>`;
}

function sectionHtml(sec) {
  return `<section class="sec">
    <h2><span class="no">${sec.no}</span>${esc(sec.title)}</h2>
    <p class="sum">${esc(sec.summary)}</p>
    ${sec.key === "business" ? '<div class="biz" id="bizBox"><p class="d">사업 아이템 불러오는 중…</p></div>' : ""}
    <ul class="pts">${sec.points.map((p) => `<li><i class="dot ${p.tone}"></i><span class="lb">${esc(p.label)}</span><span class="vl">${esc(p.value)}${p.note ? `<span class="nt">${esc(p.note)}</span>` : ""}</span></li>`).join("")}</ul>
  </section>`;
}
function crItem(x, src) {
  return `<li><span class="src">${src}</span><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.title)}</a><span class="kw ${x.tag.type}">#${esc(x.tag.keyword)}</span> <span class="d">${src === "공시" ? fmtDate(x.date) : ago(x.date)}</span></li>`;
}
function catalystHtml(data, news = []) {
  const sec = data.sections.find((x) => x.key === "catalyst");
  const nc = news.filter((n) => n.tag?.type === "catalyst").slice(0, 5);
  const nr = news.filter((n) => n.tag?.type === "risk").slice(0, 5);
  const cs = [...data.catalysts.map((x) => crItem(x, "공시")), ...nc.map((x) => crItem(x, "뉴스"))];
  const rs = [...data.risks.map((x) => crItem(x, "공시")), ...nr.map((x) => crItem(x, "뉴스"))];
  return `<section class="sec wide" id="secCatalyst">
    <h2><span class="no">5</span>촉매 · 리스크</h2>
    <p class="sum">${esc(sec.summary)}${news.length ? ` · 최근 뉴스 촉매 ${nc.length}건 · 리스크 ${nr.length}건` : ""} — 키워드 자동 분류라 원문 확인 필수</p>
    <div class="cr">
      <div><h3 class="c">촉매 (주가를 올릴 수 있는 이벤트)</h3><ul>${cs.join("") || '<li class="d">해당 없음</li>'}</ul></div>
      <div><h3 class="r">리스크 (조심할 신호)</h3><ul>${rs.join("") || '<li class="d">해당 없음</li>'}</ul></div>
    </div>
  </section>`;
}

// 사업 아이템: 사업보고서 '사업의 내용' 요약 + 주요 제품 매출 비중
async function loadBusiness(code) {
  const box = () => $("#bizBox");
  try {
    const b = await api(`/api/business?code=${code}`);
    if (currentCode !== code || !box()) return;
    if (!b.summary && !b.products.length && !b.productsText) {
      box().innerHTML = `<p class="d">사업보고서에서 사업 내용을 찾지 못했어요.${b.report ? ` <a href="${esc(safeUrl(b.report.url))}" target="_blank" rel="noopener">원문 보기</a>` : ""}</p>`;
      return;
    }
    const bars = b.products.map((p) => `<li><span class="bn">${esc(p.name)}</span><span class="bb"><i style="width:${Math.min(100, p.ratio)}%"></i></span><span class="br">${p.ratio}%</span></li>`).join("");
    box().innerHTML = `
      <h3>무엇으로 돈을 버나</h3>
      ${b.summary ? `<p class="bs">${esc(b.summary)}</p>` : ""}
      ${bars ? `<p class="bh">주요 제품·사업 매출 비중</p><ul class="bars">${bars}</ul>` : b.productsText ? `<p class="bs">${esc(b.productsText)}</p>` : ""}
      ${b.report ? `<p class="d">출처: <a href="${esc(safeUrl(b.report.url))}" target="_blank" rel="noopener">${esc(b.report.title)}</a> ‘사업의 내용’</p>` : ""}`;
  } catch (e) {
    if (box()) box().innerHTML = `<p class="d">사업 아이템을 불러오지 못했어요 (${esc(e.message)})</p>`;
  }
}

async function loadFeeds(code, fresh = false) {
  if (!detailCtx || detailCtx.code !== code) return;
  const bust = fresh ? `&fresh=${Math.floor(Date.now() / 60000)}` : "";
  const ctx = detailCtx;
  const s = findStock(code);
  // 공시
  api(`/api/disclosures?code=${code}&days=90${bust}`).then((d) => {
    if (currentCode !== code) return;
    const el = $("#discList");
    el.innerHTML = d.list.length ? d.list.map((x) => `<li class="${ctx.lastSeenBefore && x.rceptNo > ctx.lastSeenBefore ? "new" : ""}">
      <a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.title)}</a>${x.tag ? `<span class="kw ${x.tag.type}">#${esc(x.tag.keyword)}</span>` : ""}
      <div class="d">${fmtDate(x.date)} · ${esc(x.filer)}</div></li>`).join("") : '<li class="d">최근 90일 공시 없음</li>';
    $("#discTime").textContent = `${clock(d.updatedAt)} 기준 · 5분마다 갱신`;
    if (s) { const mx = maxRcept(d.list); if (mx > (s.lastSeen || "")) s.lastSeen = mx; s.newCount = 0; save(); }
  }).catch((e) => { const el = $("#discList"); if (el) el.innerHTML = `<li class="err">${esc(e.message)}</li>`; });
  // 뉴스
  api(`/api/news?q=${encodeURIComponent(ctx.name)}&code=${code}${bust}`).then((d) => {
    if (currentCode !== code) return;
    $("#newsList").innerHTML = d.list.length ? d.list.map((x) => `<li>
      <a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.title)}</a>${x.tag ? `<span class="kw ${x.tag.type}">#${esc(x.tag.keyword)}</span>` : ""}
      <div class="d">${ago(x.date)}${x.office ? ` · ${esc(x.office)}` : ""}${x.naver ? " · 네이버뉴스" : ""}</div></li>`).join("") : '<li class="d">뉴스 없음</li>';
    if (d.notice) $("#newsList").insertAdjacentHTML("afterbegin", `<li class="d">${esc(d.notice)}</li>`);
    $("#newsTime").textContent = `${clock(d.updatedAt)} 기준 · 5분마다 갱신`;
    const sec = $("#secCatalyst");
    if (sec) sec.outerHTML = catalystHtml({ sections: [{ key: "catalyst", summary: `최근 1년 공시 기준 촉매 ${ctx.discCatalysts.length}건 · 리스크 ${ctx.discRisks.length}건` }], catalysts: ctx.discCatalysts, risks: ctx.discRisks }, d.list);
  }).catch((e) => { const el = $("#newsList"); if (el) el.innerHTML = `<li class="err">${esc(e.message)}</li>`; });
}

route();
