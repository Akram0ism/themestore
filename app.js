const API_LIST = "./api/themes.json";         // "list endpoint"
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
    out = out.filter(it =>
      (it.name || "").toLowerCase().includes(q) ||
      (it.author || "").toLowerCase().includes(q) ||
      (it.tags || []).some(t => String(t).toLowerCase().includes(q))
    );
  }

  if (state.tag) {
    out = out.filter(it => (it.tags || []).includes(state.tag));
  }

  // sort client-side
  if (state.sort === "new") {
    out.sort((a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  } else if (state.sort === "popular") {
    out.sort((a,b) => (b.likes || 0) - (a.likes || 0));
  } else {
    // trending (demo): likes + recency-ish
    out.sort((a,b) => {
      const la = (a.likes||0), lb = (b.likes||0);
      const ra = (a.updatedAt||""), rb = (b.updatedAt||"");
      if (lb !== la) return lb - la;
      return rb.localeCompare(ra);
    });
  }

  return out;
}

function cardTemplate(it) {
  const tags = (it.tags || []).slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
  return `
    <article class="card" data-id="${escapeAttr(it.id)}">
      <img class="thumb" src="${escapeAttr(it.previewUrl || "")}" alt="preview" loading="lazy" />
      <div class="card-body">
        <div class="name">${escapeHtml(it.name || it.id)}</div>
        <div class="meta">
          <span>by ${escapeHtml(it.author || "Unknown")}</span>
          <span>♥ ${Number(it.likes||0)}</span>
        </div>
        <div class="tags">${tags}</div>
        <button class="btn primary" data-apply="${escapeAttr(it.id)}">Apply</button>
      </div>
    </article>
  `;
}

function render() {
  const grid = $("grid");
  const items = applyFilters(state.items);
  grid.innerHTML = items.map(cardTemplate).join("");

  // card click -> open modal
  grid.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", async (e) => {
      const applyId = e.target?.getAttribute?.("data-apply");
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

async function openModal(id) {
  const it = state.items.find(x => x.id === id);
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
    $("mJson").textContent = String(err);
  }
}

function closeModal() {
  $("modal").classList.add("hidden");
  state.selected = null;
}

async function fetchThemeJson(id) {
  const res = await fetch(API_THEME(id), { cache: "no-store" });
  if (!res.ok) throw new Error("Theme fetch failed");
  const data = await res.json();
  if (!data || !data.theme) throw new Error("Bad theme payload");
  return data.theme;
}

function validateTheme(theme) {
  // super strict whitelist
  const allowedTop = new Set(["meta","style","background","layout"]);
  for (const k of Object.keys(theme)) {
    if (!allowedTop.has(k)) throw new Error(`Unexpected key: ${k}`);
  }
  // background url scheme safety
  const bg = theme.background || {};
  if (
