/* ─── Config ────────────────────────────────────────────────────────── */
const API = "";  // same origin; change to http://localhost:8000 for dev

/* ─── State ─────────────────────────────────────────────────────────── */
const state = {
  filter: "all",
  search: "",
  page: 1,
  perPage: 30,
  stats: {},
  sources: [],
  categories: [],
  currentArticleId: null,
  searchTimer: null,
  articleCache: new Map(),  // id → article object (url, note, dates, source 등 보존)
};

/* ─── Utils ─────────────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const resp = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast-msg ${type}`;
  el.textContent = msg;
  document.getElementById("toast").appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));  // UTC 보정
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ─── Data loading ──────────────────────────────────────────────────── */
async function loadStats() {
  const data = await api("/api/stats");
  state.stats = data;
  document.getElementById("badge-all").textContent = data.total_articles || "";
  document.getElementById("badge-unread").textContent = data.unread || "";
  document.getElementById("badge-bookmarked").textContent = data.bookmarked || "";
  return data;
}

async function loadCategories() {
  const cats = await api("/api/categories");
  state.categories = cats;
  renderCategories();
}

async function loadSources() {
  const sources = await api("/api/sources");
  state.sources = sources;
  renderSources();
}

function buildArticleParams() {
  const params = new URLSearchParams({ page: state.page, per_page: state.perPage });
  if (state.search) params.set("search", state.search);
  if (state.filter === "unread") params.set("unread", "true");
  else if (state.filter === "bookmarked") params.set("bookmarked", "true");
  else if (state.filter.startsWith("category:")) params.set("category", state.filter.slice(9));
  else if (state.filter.startsWith("source:")) params.set("source_id", state.filter.slice(7));
  return params;
}

async function loadArticles() {
  const grid = document.getElementById("articles-grid");
  grid.innerHTML = `<div class="empty-state"><div class="emoji">⏳</div><p>불러오는 중...</p></div>`;

  const data = await api(`/api/articles?${buildArticleParams()}`);

  // 캐시 갱신 — 이 페이지의 기사들을 최신 상태로 저장
  for (const a of data.articles) {
    state.articleCache.set(a.id, a);
  }

  renderArticleGrid(data);
  renderPagination(data);
  document.getElementById("articles-count").textContent =
    data.total > 0 ? `총 ${data.total.toLocaleString()}개 기사` : "";
}

/* ─── Render helpers ────────────────────────────────────────────────── */
function renderCategories() {
  const el = document.getElementById("category-list");
  const catMap = Object.fromEntries((state.stats.categories || []).map(c => [c.category, c.count]));

  el.innerHTML = state.categories.map(cat => `
    <button class="nav-item ${state.filter === `category:${cat}` ? "active" : ""}"
            data-filter="category:${esc(cat)}">
      <span>${esc(cat)}</span>
      <span class="badge">${catMap[cat] || ""}</span>
    </button>
  `).join("");

  el.querySelectorAll(".nav-item").forEach(btn =>
    btn.addEventListener("click", () => setFilter(btn.dataset.filter))
  );
}

function renderSources() {
  const el = document.getElementById("source-list");
  el.innerHTML = state.sources.filter(s => s.is_active).map(s => `
    <button class="nav-item ${state.filter === `source:${s.id}` ? "active" : ""}"
            data-filter="source:${s.id}">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.name)}</span>
    </button>
  `).join("");

  el.querySelectorAll(".nav-item").forEach(btn =>
    btn.addEventListener("click", () => setFilter(btn.dataset.filter))
  );
}

function renderArticleGrid({ articles }) {
  const grid = document.getElementById("articles-grid");
  if (!articles.length) {
    grid.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>기사가 없습니다</p></div>`;
    return;
  }

  grid.innerHTML = articles.map(a => `
    <div class="article-card ${a.is_read ? "is-read" : ""} ${a.is_bookmarked ? "is-bookmarked" : ""}"
         data-id="${a.id}">
      <div class="article-card-badges">
        ${!a.is_read ? '<span class="dot-unread" title="읽지 않음"></span>' : ""}
        ${a.is_bookmarked ? '<span class="star-bookmarked" title="북마크">⭐</span>' : ""}
        ${a.note ? '<span title="메모 있음" style="font-size:12px">📝</span>' : ""}
      </div>
      ${a.image_url ? `<img class="article-image" src="${esc(a.image_url)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
      <div class="article-source-tag">${esc(a.source?.name ?? "")}</div>
      <div class="article-title">${esc(a.title)}</div>
      ${a.summary ? `<div class="article-summary">${esc(a.summary)}</div>` : ""}
      <div class="article-footer">
        <span class="article-date">${fmtDate(a.published_at || a.fetched_at)}</span>
        <div class="article-quick-actions">
          <button class="quick-btn" data-action="bookmark" data-id="${a.id}"
                  title="${a.is_bookmarked ? "북마크 해제" : "북마크"}">
            ${a.is_bookmarked ? "⭐" : "☆"}
          </button>
          <button class="quick-btn" data-action="read" data-id="${a.id}"
                  title="${a.is_read ? "읽지 않음으로" : "읽음으로"}">
            ${a.is_read ? "✓" : "○"}
          </button>
          <button class="quick-btn" data-action="hide" data-id="${a.id}" title="숨기기">✕</button>
        </div>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".article-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".quick-btn")) return;
      openArticle(parseInt(card.dataset.id));
    });
  });

  grid.querySelectorAll(".quick-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      quickAction(btn.dataset.action, parseInt(btn.dataset.id));
    });
  });
}

function renderPagination({ page, total_pages }) {
  const el = document.getElementById("pagination");
  if (total_pages <= 1) { el.innerHTML = ""; return; }

  const pages = [];
  const delta = 2;
  for (let i = Math.max(1, page - delta); i <= Math.min(total_pages, page + delta); i++) {
    pages.push(i);
  }

  el.innerHTML = `
    <button class="page-btn" ${page === 1 ? "disabled" : ""} data-page="${page - 1}">‹ 이전</button>
    ${pages.map(p => `<button class="page-btn ${p === page ? "active" : ""}" data-page="${p}">${p}</button>`).join("")}
    <button class="page-btn" ${page === total_pages ? "disabled" : ""} data-page="${page + 1}">다음 ›</button>
  `;

  el.querySelectorAll(".page-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!btn.disabled) { state.page = parseInt(btn.dataset.page); loadArticles(); }
    });
  });
}

/* ─── Article detail ─────────────────────────────────────────────────── */
function openArticle(id) {
  // 캐시에서 완전한 기사 데이터 조회 (URL, 메모, 날짜 등 포함)
  const data = state.articleCache.get(id);
  if (!data) return;

  state.currentArticleId = id;

  document.getElementById("detail-title").textContent = data.title;
  document.getElementById("detail-meta").innerHTML = `
    <span>📰 ${esc(data.source?.name ?? "")}</span>
    ${data.source?.category ? `<span>🏷 ${esc(data.source.category)}</span>` : ""}
    <span>🕐 ${fmtDate(data.published_at || data.fetched_at) || "날짜 불명"}</span>
  `;
  document.getElementById("detail-summary").textContent = data.summary || "요약 없음";
  document.getElementById("detail-link").href = data.url;
  document.getElementById("detail-note").value = data.note || "";

  const bmBtn = document.getElementById("detail-bookmark");
  bmBtn.textContent = data.is_bookmarked ? "⭐ 북마크 해제" : "☆ 북마크";

  document.getElementById("modal-article").classList.remove("hidden");
  document.getElementById("detail-note").focus();
  document.getElementById("detail-note").blur();

  // 읽음 처리
  if (!data.is_read) {
    data.is_read = true;  // 캐시 업데이트
    patchArticle(id, { is_read: true });
    const card = document.querySelector(`.article-card[data-id="${id}"]`);
    if (card) {
      card.classList.add("is-read");
      card.querySelector(".dot-unread")?.remove();
    }
  }
}

document.getElementById("btn-close-article").addEventListener("click", closeArticle);
document.getElementById("article-backdrop").addEventListener("click", closeArticle);

function closeArticle() {
  document.getElementById("modal-article").classList.add("hidden");
  state.currentArticleId = null;
}

document.getElementById("detail-bookmark").addEventListener("click", async () => {
  const id = state.currentArticleId;
  if (!id) return;
  const data = state.articleCache.get(id);
  if (!data) return;

  const wasBookmarked = data.is_bookmarked;
  data.is_bookmarked = !wasBookmarked;  // 캐시 업데이트
  await patchArticle(id, { is_bookmarked: data.is_bookmarked });

  // 카드 UI 동기화
  const card = document.querySelector(`.article-card[data-id="${id}"]`);
  if (card) {
    card.classList.toggle("is-bookmarked", data.is_bookmarked);
    const badges = card.querySelector(".article-card-badges");
    const starEl = badges?.querySelector(".star-bookmarked");
    if (data.is_bookmarked && !starEl) {
      badges?.insertAdjacentHTML("afterbegin", '<span class="star-bookmarked" title="북마크">⭐</span>');
    } else if (!data.is_bookmarked && starEl) {
      starEl.remove();
    }
    const quickBtn = card.querySelector(`[data-action="bookmark"]`);
    if (quickBtn) quickBtn.textContent = data.is_bookmarked ? "⭐" : "☆";
  }

  document.getElementById("detail-bookmark").textContent = data.is_bookmarked ? "⭐ 북마크 해제" : "☆ 북마크";
  toast(wasBookmarked ? "북마크 해제됨" : "북마크 추가됨", "success");
  loadStats();
});

document.getElementById("detail-hide").addEventListener("click", async () => {
  const id = state.currentArticleId;
  if (!id) return;
  await patchArticle(id, { is_hidden: true });
  state.articleCache.delete(id);
  document.querySelector(`.article-card[data-id="${id}"]`)?.remove();
  closeArticle();
  toast("숨겼습니다");
  loadStats();
});

document.getElementById("btn-save-note").addEventListener("click", async () => {
  const id = state.currentArticleId;
  if (!id) return;
  const note = document.getElementById("detail-note").value.trim();
  await patchArticle(id, { note });

  // 캐시 및 카드 메모 아이콘 업데이트
  const data = state.articleCache.get(id);
  if (data) data.note = note;

  const card = document.querySelector(`.article-card[data-id="${id}"]`);
  if (card) {
    const badges = card.querySelector(".article-card-badges");
    const noteEl = badges?.querySelector("[title='메모 있음']");
    if (note && !noteEl) {
      badges?.insertAdjacentHTML("beforeend", '<span title="메모 있음" style="font-size:12px">📝</span>');
    } else if (!note && noteEl) {
      noteEl.remove();
    }
  }

  toast("메모 저장됨", "success");
});

/* ─── Quick actions ─────────────────────────────────────────────────── */
async function quickAction(action, id) {
  const card = document.querySelector(`.article-card[data-id="${id}"]`);
  const data = state.articleCache.get(id);

  if (action === "bookmark") {
    const was = data?.is_bookmarked ?? card.classList.contains("is-bookmarked");
    if (data) data.is_bookmarked = !was;
    await patchArticle(id, { is_bookmarked: !was });
    card.classList.toggle("is-bookmarked");
    card.querySelector(`[data-action="bookmark"]`).textContent = was ? "☆" : "⭐";
    // 북마크 배지 동기화
    const badges = card.querySelector(".article-card-badges");
    const starEl = badges?.querySelector(".star-bookmarked");
    if (!was && !starEl) badges?.insertAdjacentHTML("afterbegin", '<span class="star-bookmarked" title="북마크">⭐</span>');
    else if (was && starEl) starEl.remove();
    toast(was ? "북마크 해제" : "북마크 추가", "success");
    loadStats();

  } else if (action === "read") {
    const was = data?.is_read ?? card.classList.contains("is-read");
    if (data) data.is_read = !was;
    await patchArticle(id, { is_read: !was });
    card.classList.toggle("is-read");
    card.querySelector(`[data-action="read"]`).textContent = was ? "○" : "✓";
    // 읽지않음 점 배지 동기화
    const badges = card.querySelector(".article-card-badges");
    const dotEl = badges?.querySelector(".dot-unread");
    if (was && !dotEl) badges?.insertAdjacentHTML("afterbegin", '<span class="dot-unread" title="읽지 않음"></span>');
    else if (!was && dotEl) dotEl.remove();
    loadStats();

  } else if (action === "hide") {
    await patchArticle(id, { is_hidden: true });
    state.articleCache.delete(id);
    card.remove();
    toast("숨겼습니다");
    loadStats();
  }
}

async function patchArticle(id, data) {
  try {
    await api(`/api/articles/${id}`, { method: "PATCH", body: data });
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ─── Filter / Search ───────────────────────────────────────────────── */
function setFilter(filter) {
  state.filter = filter;
  state.page = 1;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const target = document.querySelector(`[data-filter="${CSS.escape(filter)}"]`);
  if (target) target.classList.add("active");
  loadArticles();
}

document.getElementById("search-input").addEventListener("input", e => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    state.page = 1;
    loadArticles();
  }, 400);
});

document.querySelectorAll(".nav-item[data-filter]").forEach(btn => {
  btn.addEventListener("click", () => setFilter(btn.dataset.filter));
});

/* ─── Mark all read ─────────────────────────────────────────────────── */
document.getElementById("btn-mark-read").addEventListener("click", async () => {
  const params = {};
  if (state.filter.startsWith("category:")) params.category = state.filter.slice(9);
  else if (state.filter.startsWith("source:")) params.source_id = parseInt(state.filter.slice(7));

  const qs = new URLSearchParams(params).toString();
  await api(`/api/articles/mark-all-read${qs ? "?" + qs : ""}`, { method: "POST" });
  toast("모두 읽음으로 표시했습니다", "success");

  // 캐시 전체 읽음 처리
  state.articleCache.forEach(a => { a.is_read = true; });
  loadArticles();
  loadStats();
});

/* ─── Refresh ───────────────────────────────────────────────────────── */
document.getElementById("btn-refresh").addEventListener("click", async () => {
  const btn = document.getElementById("btn-refresh");
  btn.classList.add("spinning");
  const status = document.getElementById("refresh-status");
  status.textContent = "수집 중...";
  try {
    const res = await api("/api/fetch-all", { method: "POST" });
    toast(`새 기사 ${res.total_new}개 수집됨`, "success");
    status.textContent = `마지막 수집: ${new Date().toLocaleTimeString("ko-KR")}`;
    await Promise.all([loadArticles(), loadStats(), loadCategories(), loadSources()]);
  } catch (e) {
    toast(e.message, "error");
    status.textContent = "오류 발생";
  } finally {
    btn.classList.remove("spinning");
  }
});

/* ─── Keyboard shortcuts ────────────────────────────────────────────── */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!document.getElementById("modal-article").classList.contains("hidden")) {
      closeArticle();
    } else if (!document.getElementById("modal-admin").classList.contains("hidden")) {
      document.getElementById("modal-admin").classList.add("hidden");
    }
  }
  // "/" 키로 검색창 포커스
  if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
    e.preventDefault();
    document.getElementById("search-input").focus();
  }
});

/* ─── Admin modal ───────────────────────────────────────────────────── */
document.getElementById("btn-admin").addEventListener("click", () => {
  renderSourcesTable();
  document.getElementById("modal-admin").classList.remove("hidden");
});
document.getElementById("btn-close-admin").addEventListener("click", () => {
  document.getElementById("modal-admin").classList.add("hidden");
});
document.getElementById("modal-backdrop").addEventListener("click", () => {
  document.getElementById("modal-admin").classList.add("hidden");
});

function renderSourcesTable() {
  const tbody = document.getElementById("sources-tbody");
  tbody.innerHTML = state.sources.map(s => `
    <tr>
      <td>
        <strong>${esc(s.name)}</strong><br>
        <small style="color:var(--text-muted);word-break:break-all">${esc(s.url)}</small>
      </td>
      <td>
        <select class="source-category-sel" data-id="${s.id}" style="border:1px solid var(--border);padding:3px 6px;border-radius:4px;font-size:12px">
          ${["종합","IT/기술","경제","정치/사회","해외","스포츠","문화/연예","기타"].map(
            c => `<option ${c === s.category ? "selected" : ""}>${esc(c)}</option>`
          ).join("")}
        </select>
      </td>
      <td style="white-space:nowrap">${s.last_fetched ? fmtDate(s.last_fetched) : "미수집"}</td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" class="source-toggle" data-id="${s.id}" ${s.is_active ? "checked" : ""}>
          <span class="toggle-track"></span>
        </label>
      </td>
      <td style="white-space:nowrap">
        <button class="outline-btn sm source-fetch-btn" data-id="${s.id}">가져오기</button>
        <button class="danger-btn sm source-del-btn" data-id="${s.id}">삭제</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".source-toggle").forEach(el => {
    el.addEventListener("change", async () => {
      await api(`/api/sources/${el.dataset.id}`, { method: "PATCH", body: { is_active: el.checked } });
      const src = state.sources.find(s => s.id === parseInt(el.dataset.id));
      if (src) src.is_active = el.checked;
      renderSources();
    });
  });

  tbody.querySelectorAll(".source-category-sel").forEach(el => {
    el.addEventListener("change", async () => {
      await api(`/api/sources/${el.dataset.id}`, { method: "PATCH", body: { category: el.value } });
      const src = state.sources.find(s => s.id === parseInt(el.dataset.id));
      if (src) src.category = el.value;
      toast("카테고리 변경됨", "success");
      loadCategories();
    });
  });

  tbody.querySelectorAll(".source-fetch-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "수집 중...";
      try {
        const res = await api(`/api/sources/${btn.dataset.id}/fetch`, { method: "POST" });
        toast(res.message, "success");
        await loadSources();
        renderSourcesTable();
        loadStats();
        loadArticles();
      } catch (e) {
        toast(e.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "가져오기";
      }
    });
  });

  tbody.querySelectorAll(".source-del-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const src = state.sources.find(s => s.id === parseInt(btn.dataset.id));
      if (!confirm(`"${src?.name}" 소스와 모든 기사를 삭제할까요?`)) return;
      await api(`/api/sources/${btn.dataset.id}`, { method: "DELETE" });
      toast("소스 삭제됨");
      await loadSources();
      renderSourcesTable();
      loadStats();
      loadArticles();
    });
  });
}

/* ─── Add source ────────────────────────────────────────────────────── */
async function addSource() {
  const name = document.getElementById("new-source-name").value.trim();
  const url = document.getElementById("new-source-url").value.trim();
  const category = document.getElementById("new-source-category").value;
  if (!name || !url) { toast("이름과 URL을 입력하세요", "error"); return; }
  try {
    await api("/api/sources", { method: "POST", body: { name, url, category } });
    toast(`"${name}" 소스 추가됨`, "success");
    document.getElementById("new-source-name").value = "";
    document.getElementById("new-source-url").value = "";
    await loadSources();
    renderSourcesTable();
  } catch (e) {
    toast(e.message, "error");
  }
}

document.getElementById("btn-add-source").addEventListener("click", addSource);

// 소스 추가 폼에서 Enter 키 지원
["new-source-name", "new-source-url"].forEach(id => {
  document.getElementById(id).addEventListener("keydown", e => {
    if (e.key === "Enter") addSource();
  });
});

/* ─── Fetch all from admin ──────────────────────────────────────────── */
document.getElementById("btn-fetch-all").addEventListener("click", async () => {
  const btn = document.getElementById("btn-fetch-all");
  btn.disabled = true;
  btn.textContent = "수집 중...";
  try {
    const res = await api("/api/fetch-all", { method: "POST" });
    toast(`새 기사 ${res.total_new}개 수집됨`, "success");
    await loadSources();
    renderSourcesTable();
    loadStats();
    loadArticles();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "전체 가져오기";
  }
});

/* ─── Cleanup ───────────────────────────────────────────────────────── */
document.getElementById("btn-cleanup").addEventListener("click", async () => {
  if (!confirm("북마크 제외, 30일 이상 된 기사를 모두 삭제할까요?")) return;
  const res = await api("/api/articles/cleanup?days=30", { method: "DELETE" });
  toast(res.message, "success");
  state.articleCache.clear();
  loadStats();
  loadArticles();
});

/* ─── Auto-refresh stats every 5 min ───────────────────────────────── */
setInterval(loadStats, 5 * 60 * 1000);

/* ─── Init ──────────────────────────────────────────────────────────── */
async function init() {
  try {
    await Promise.all([loadStats(), loadCategories(), loadSources()]);
    await loadArticles();
    document.getElementById("refresh-status").textContent =
      `마지막 수집: ${new Date().toLocaleTimeString("ko-KR")}`;
  } catch (e) {
    toast("서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.", "error");
  }
}

init();
