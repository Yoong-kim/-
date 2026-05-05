/* ─── Config ────────────────────────────────────────────────────────── */
const API = "";  // same origin; change to http://localhost:8000 for dev

/* ─── State ─────────────────────────────────────────────────────────── */
const state = {
  filter: "all",       // "all" | "unread" | "bookmarked" | category:X | source:X
  search: "",
  page: 1,
  perPage: 30,
  stats: {},
  sources: [],
  categories: [],
  currentArticleId: null,
  searchTimer: null,
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
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return d.toLocaleDateString("ko-KR");
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
  renderArticleGrid(data);
  renderPagination(data);
  document.getElementById("articles-count").textContent =
    data.total > 0 ? `총 ${data.total.toLocaleString()}개 기사` : "";
}

/* ─── Render helpers ────────────────────────────────────────────────── */
function renderCategories() {
  const el = document.getElementById("category-list");
  const { stats } = state;
  const catMap = Object.fromEntries((stats.categories || []).map(c => [c.category, c.count]));

  el.innerHTML = state.categories.map(cat => `
    <button class="nav-item ${state.filter === `category:${cat}` ? "active" : ""}"
            data-filter="category:${esc(cat)}">
      <span>${esc(cat)}</span>
      <span class="badge">${catMap[cat] || ""}</span>
    </button>
  `).join("");

  el.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => {
    setFilter(btn.dataset.filter);
  }));
}

function renderSources() {
  const el = document.getElementById("source-list");
  el.innerHTML = state.sources.filter(s => s.is_active).map(s => `
    <button class="nav-item ${state.filter === `source:${s.id}` ? "active" : ""}"
            data-filter="source:${s.id}">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.name)}</span>
    </button>
  `).join("");

  el.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => {
    setFilter(btn.dataset.filter);
  }));
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
  const articles = document.querySelectorAll(`.article-card[data-id="${id}"]`);
  const data = findArticleData(id);
  if (!data) return;

  state.currentArticleId = id;

  document.getElementById("detail-title").textContent = data.title;
  document.getElementById("detail-meta").innerHTML = `
    <span>📰 ${esc(data.source?.name ?? "")}</span>
    <span>🕐 ${fmtDate(data.published_at || data.fetched_at)}</span>
    ${data.source?.category ? `<span>🏷 ${esc(data.source.category)}</span>` : ""}
  `;
  document.getElementById("detail-summary").textContent = data.summary || "요약 없음";
  document.getElementById("detail-link").href = data.url;
  document.getElementById("detail-note").value = data.note || "";

  const bmBtn = document.getElementById("detail-bookmark");
  bmBtn.textContent = data.is_bookmarked ? "⭐ 북마크 해제" : "☆ 북마크";

  document.getElementById("modal-article").classList.remove("hidden");

  // Mark as read
  if (!data.is_read) {
    patchArticle(id, { is_read: true });
    articles.forEach(c => c.classList.add("is-read"));
    data.is_read = true;
  }
}

function findArticleData(id) {
  const grid = document.getElementById("articles-grid");
  const card = grid.querySelector(`.article-card[data-id="${id}"]`);
  if (!card) return null;
  // Reconstruct minimal data from DOM (enough for the modal)
  return {
    id,
    title: card.querySelector(".article-title")?.textContent ?? "",
    summary: card.querySelector(".article-summary")?.textContent ?? "",
    url: "#",  // will be re-fetched or patched only
    is_read: card.classList.contains("is-read"),
    is_bookmarked: card.classList.contains("is-bookmarked"),
    note: null,
    source: {
      name: card.querySelector(".article-source-tag")?.textContent ?? "",
      category: null,
    },
    published_at: null,
    fetched_at: null,
  };
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
  const card = document.querySelector(`.article-card[data-id="${id}"]`);
  const wasBookmarked = card?.classList.contains("is-bookmarked");
  await patchArticle(id, { is_bookmarked: !wasBookmarked });
  card?.classList.toggle("is-bookmarked");
  document.getElementById("detail-bookmark").textContent = wasBookmarked ? "☆ 북마크" : "⭐ 북마크 해제";
  toast(wasBookmarked ? "북마크 해제됨" : "북마크 추가됨", "success");
  loadStats();
});

document.getElementById("detail-hide").addEventListener("click", async () => {
  const id = state.currentArticleId;
  if (!id) return;
  await patchArticle(id, { is_hidden: true });
  document.querySelector(`.article-card[data-id="${id}"]`)?.remove();
  closeArticle();
  toast("숨겼습니다");
  loadStats();
});

document.getElementById("btn-save-note").addEventListener("click", async () => {
  const id = state.currentArticleId;
  if (!id) return;
  const note = document.getElementById("detail-note").value;
  await patchArticle(id, { note });
  toast("메모 저장됨", "success");
});

/* ─── Quick actions ─────────────────────────────────────────────────── */
async function quickAction(action, id) {
  const card = document.querySelector(`.article-card[data-id="${id}"]`);
  if (action === "bookmark") {
    const was = card.classList.contains("is-bookmarked");
    await patchArticle(id, { is_bookmarked: !was });
    card.classList.toggle("is-bookmarked");
    const btn = card.querySelector(`[data-action="bookmark"]`);
    if (btn) btn.textContent = was ? "☆" : "⭐";
    toast(was ? "북마크 해제" : "북마크 추가", "success");
    loadStats();
  } else if (action === "read") {
    const was = card.classList.contains("is-read");
    await patchArticle(id, { is_read: !was });
    card.classList.toggle("is-read");
    const btn = card.querySelector(`[data-action="read"]`);
    if (btn) btn.textContent = was ? "○" : "✓";
    loadStats();
  } else if (action === "hide") {
    await patchArticle(id, { is_hidden: true });
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
  const target = document.querySelector(`[data-filter="${filter}"]`);
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

/* Add source */
document.getElementById("btn-add-source").addEventListener("click", async () => {
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
});

/* Fetch all from admin */
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

/* Cleanup */
document.getElementById("btn-cleanup").addEventListener("click", async () => {
  if (!confirm("북마크 제외, 30일 이상 된 기사를 모두 삭제할까요?")) return;
  const res = await api("/api/articles/cleanup?days=30", { method: "DELETE" });
  toast(res.message, "success");
  loadStats();
  loadArticles();
});

/* ─── Auto-refresh every 5 min in browser ───────────────────────────── */
setInterval(() => {
  loadStats();
}, 5 * 60 * 1000);

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
