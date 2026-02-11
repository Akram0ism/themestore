const API_LIST = "./api/themes.json"; // "list endpoint"
const API_THEME = (id) => `./api/themes/${encodeURIComponent(id)}.json`; // "details endpoint"

const $ = (id) => document.getElementById(id);

const state = {
  items: [],
  q: "",
  sort: "trending",
  tag: "",
  selected: null,
};

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.add("hidden"), 1600);
}

async function fetchList() {
  // GitHub Pages is static, so we "simulate" sort/search client-side
  const res = await fetch(API_LIST, { cache: "no-store" });
  if (!res.ok) throw new Error("List fetch failed");
  const data = await res.json();
  return data.items || [];
}

function applyFilters(items) {
  let out = items.slice();

  const q = (state.q || "").trim().toLowerCase();
  if (q) {
    out = out.filter((it) => {
      const name = (it.name || "").toLowerCase();
      const author = (it.author || "").toLowerCase();
      const tags = (it.tags || []).map((t) => String(t).toLowerCase());
      return name.includes(q) || author.includes(q) || tags.some((t) => t.includes(q));
    });
  }

  if (state.tag) {
    out = out.filter((it) => (it.tags || []).includes(state.tag));
  }

  // sort client-side
  if (state.sort === "new") {
    out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  } else if (state.sort === "popular") {
    out.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else {
    // trending (demo): likes + recency-ish
    out.sort((a, b) => {
      const la = a.likes || 0;
      const lb = b.likes || 0;
      const ra = a.updatedAt || "";
      const rb = b.updatedAt || "";
      if (lb !== la) return lb - la;
      return rb.localeCompare(ra);
    });
  }

  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[m] || m;
  });
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

function cardTemplate(it) {
  const tags = (it.tags || [])
    .slice(0, 4)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");

  return `
    <article class="card" data-id="${escapeAttr(it.id)}">
      <img class="thumb" src="${escapeAttr(it.previewUrl || "")}" alt="preview" loading="lazy" />
      <div class="card-body">
        <div class="name">${escapeHtml(it.name || it.id)}</div>
        <div class="meta">
          <span>by ${escapeHtml(it.author || "Unknown")}</span>
          <span>♥ ${Number(it.likes || 0)}</span>
        </div>
        <div class="tags">${tags}</div>
        <button class="btn primary" data-apply="${escapeAttr(it.id)}">Apply</button>
      </div>
    </article>
  `;
}

function render() {
  const grid = $("grid");
  if (!grid) return;

  const items = applyFilters(state.items);
  grid.innerHTML = items.map(cardTemplate).join("");

  grid.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", async (e) => {
      const target = e.target;
      const applyId = target?.getAttribute?.("data-apply");
      const id = applyId || card.getAttribute("data-id");
      if (!id) return;

      // if clicked Apply button, skip opening modal
      if (applyId) {
        e.preventDefault();
        e.stopPropagation();
        await applyThemeById(id);
        return;
      }

      await openModal(id);
    });
  });
}

async function fetchThemeJson(id) {
  const res = await fetch(API_THEME(id), { cache: "no-store" });
  if (!res.ok) throw new Error("Theme fetch failed");
  const data = await res.json();
  if (!data || !data.theme) throw new Error("Bad theme payload");
  return data.theme;
}

function validateTheme(theme) {
  if (!theme || typeof theme !== "object") throw new Error("Theme must be an object");

  // strict whitelist
  const allowedTop = new Set(["meta", "style", "background", "layout"]);
  for (const k of Object.keys(theme)) {
    if (!allowedTop.has(k)) throw new Error(`Unexpected key: ${k}`);
  }

  // background url scheme safety
  const bg = theme.background || {};
  if (bg.url != null && bg.url !== "") {
    const u = String(bg.url);
    if (!/^https?:\/\//i.test(u)) throw new Error("background.url must be http/https");
  }

  return true;
}

async function applyThemeById(id) {
  try {
    const theme = await fetchThemeJson(id);
    validateTheme(theme);

    // Simulate saving (for your extension this would be chrome.storage.local.set)
    localStorage.setItem("themeConfig", JSON.stringify(theme));
    toast("Theme applied (saved to localStorage)");
  } catch (err) {
    toast(`Error: ${err?.message || err}`);
  }
}

function buildShareLink(id) {
  const base = location.origin + location.pathname.replace(/\/index\.html$/, "/");
  return `${base}#theme=${encodeURIComponent(id)}`;
}

async function openModal(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;

  $("mName").textContent = it.name || it.id;
  $("mMeta").textContent = `by ${it.author || "Unknown"} • ♥ ${it.likes || 0} • updated ${it.updatedAt || "-"}`;
  $("mImg").src = it.previewUrl || "";

  $("mJson").textContent = "Loading theme JSON…";
  $("modal").classList.remove("hidden");

  try {
    const theme = await fetchThemeJson(id);
    state.selected = { item: it, theme };
    $("mJson").textContent = JSON.stringify(theme, null, 2);
  } catch (err) {
    $("mJson").textContent = String(err?.message || err);
  }
}

function closeModal() {
  $("modal").classList.add("hidden");
  state.selected = null;
}

async function init() {
  const qEl = $("q");
  const sortEl = $("sort");
  const tagEl = $("tag");
  const reloadEl = $("reload");

  qEl?.addEventListener("input", (e) => {
    state.q = e.target.value;
    render();
  });

  sortEl?.addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });

  tagEl?.addEventListener("change", (e) => {
    state.tag = e.target.value;
    render();
  });

  reloadEl?.addEventListener("click", async () => {
    try {
      state.items = await fetchList();
      render();
      toast("Reloaded");
    } catch (err) {
      toast(`Error: ${err?.message || err}`);
    }
  });

  $("modalClose")?.addEventListener("click", closeModal);
  $("modalX")?.addEventListener("click", closeModal);

  $("mApply")?.addEventListener("click", async () => {
    if (!state.selected) return;
    try {
      validateTheme(state.selected.theme);
      localStorage.setItem("themeConfig", JSON.stringify(state.selected.theme));
      toast("Theme applied (saved to localStorage)");
    } catch (err) {
      toast(`Error: ${err?.message || err}`);
    }
  });

  $("mCopy")?.addEventListener("click", async () => {
    if (!state.selected) return;
    const link = buildShareLink(state.selected.item.id);
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    } catch {
      toast("Clipboard blocked (copy manually)");
      console.log("COPY LINK:", link);
    }
  });

  // Load list
  state.items = await fetchList();
  render();

  // If opened with #theme=ID → open modal automatically
  const m = location.hash.match(/theme=([^&]+)/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    openModal(id).catch(() => {});
  }
}

init().catch((err) => console.error(err));
