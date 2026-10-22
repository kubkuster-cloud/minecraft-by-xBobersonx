const $ = id => document.getElementById(id);

let settings;

function log(text) {
  const el = $("log");
  el.textContent += text.endsWith("\n") ? text : text + "\n";
  el.scrollTop = el.scrollHeight;
}

function setStatus(text, percent) {
  $("status").textContent = text;
  if (percent !== undefined) {
    document.querySelector(".progress").hidden = false;
    $("bar").style.width = `${percent}%`;
  }
}

function persist() {
  settings.nick = $("nick").value.trim();
  settings.version = $("version").value;
  settings.ram = Number($("ram").value);
  window.api.saveSettings(settings);
}

// Tylko wbudowana paczka modów, dla każdej wersji obsługiwanej przez Fabric
function fillVersions(versions, fabricVersions, packName) {
  const select = $("version");
  select.innerHTML = "";
  for (const v of versions) {
    if (v.type !== "release" || !fabricVersions.has(v.id)) continue;
    const opt = document.createElement("option");
    opt.value = `${v.id}|pack`;
    opt.textContent = `Minecraft ${v.id} – ${packName}`;
    select.appendChild(opt);
  }
  if (settings.version && select.querySelector(`option[value="${settings.version}"]`)) {
    select.value = settings.version;
  }
}

function setAccount(name) {
  $("account").textContent = name ? `Microsoft: ${name}` : "Non-premium (nick)";
  $("btn-ms").hidden = !!name;
  $("btn-logout").hidden = !name;
  $("nick").disabled = !!name;
  if (name) $("nick").value = name;
}

async function init() {
  settings = await window.api.loadSettings();
  const totalRam = await window.api.totalRam();
  $("app-version").textContent = await window.api.appVersion();

  $("nick").value = settings.nick || "";
  $("ram").max = Math.max(2, totalRam - 2);
  $("ram").value = settings.ram || 4;
  $("ram-val").textContent = `${$("ram").value} GB`;

  window.api.restoreLogin().then(account => {
    if (account) setAccount(account.name);
  });

  try {
    const [{ versions }, fabric, packName] = await Promise.all([
      window.api.listVersions(),
      window.api.fabricVersions().catch(() => []),
      window.api.packName(),
    ]);
    fillVersions(versions, new Set(fabric), packName);
  } catch (err) {
    $("version").innerHTML = "<option>Brak połączenia</option>";
    setStatus("Nie można pobrać listy wersji — sprawdź internet");
    log(String(err));
  }
}

$("nick").onchange = persist;
$("version").onchange = persist;
$("ram").oninput = () => { $("ram-val").textContent = `${$("ram").value} GB`; };
$("ram").onchange = persist;

// ---------- Okno „Własne mody” ----------
let modsTab = "own";
let modsData = { own: [], pre: [] };

function modsVersion() {
  return $("version").value.split("|")[0];
}

async function loadMods() {
  modsData = await window.api.listMods(modsVersion());
  $("count-own").textContent = `(${modsData.own.length})`;
  $("count-pre").textContent = `(${modsData.pre.length})`;
  renderMods();
}

function renderMods() {
  if (modsTab === "search") return renderSearch();
  if (isContentTab(modsTab)) return renderContent();
  const query = $("mods-search").value.trim().toLowerCase();
  const list = $("mods-list");
  const mods = modsData[modsTab].filter(m => !query || m.title.toLowerCase().includes(query) || m.file.toLowerCase().includes(query));
  list.innerHTML = "";

  if (mods.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = query ? "Nic nie znaleziono"
      : modsTab === "own" ? "Brak własnych modów — kliknij „Otwórz folder” i wrzuć pliki .jar"
      : "Mody z paczki pojawią się po pierwszym kliknięciu „Uruchom grę” na tej wersji";
    list.appendChild(li);
  }

  for (const mod of mods) {
    const li = document.createElement("li");
    li.classList.toggle("off", !mod.enabled);
    li.title = mod.file;

    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = mod.enabled;

    const title = document.createElement("span");
    title.className = "mod-title";
    title.textContent = mod.title;
    li.append(box, title);

    if (mod.library) {
      const tag = document.createElement("span");
      tag.className = "mod-tag";
      tag.textContent = "biblioteka";
      li.appendChild(tag);
    }
    const version = document.createElement("span");
    version.className = "mod-version";
    version.textContent = mod.version;
    li.appendChild(version);

    const toggle = async () => {
      const enabled = !mod.enabled;
      try {
        await window.api.toggleMod({ version: modsVersion(), tab: modsTab, key: mod.key, enabled });
        mod.enabled = enabled;
        $("mods-hint").textContent = mod.library && !enabled
          ? "Uwaga: inne mody mogą wymagać tej biblioteki — gra może się nie uruchomić."
          : "";
      } catch (err) {
        $("mods-hint").textContent = String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      }
      renderMods();
    };
    li.onclick = e => { if (e.target !== box) toggle(); };
    box.onchange = toggle;
    list.appendChild(li);
  }
}

// ---------- Zakładka „Szukaj modów” (Modrinth) ----------
let searchResults = null; // null = trwa wyszukiwanie
let searchError = "";
let searchTimer = null;
let searchSeq = 0;

function niceNumber(n) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} mln` : n >= 1e3 ? `${Math.round(n / 1e3)} tys.` : String(n);
}

function cleanError(err) {
  return String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

const isContentTab = tab => tab === "shader" || tab === "resourcepack";
let contentInstalled = [];

async function doSearch() {
  const seq = ++searchSeq;
  const tab = modsTab;
  searchResults = null;
  searchError = "";
  renderMods();
  try {
    const query = $("mods-search").value.trim();
    const results = isContentTab(tab)
      ? await window.api.searchContent({ version: modsVersion(), type: tab, query })
      : await window.api.searchMods({ version: modsVersion(), query });
    if (seq !== searchSeq) return;
    searchResults = results;
  } catch (err) {
    if (seq !== searchSeq) return;
    searchResults = [];
    searchError = "Nie udało się połączyć z Modrinth — sprawdź internet";
  }
  renderMods();
}

function renderSearch() {
  const list = $("mods-list");
  list.innerHTML = "";
  if (!searchResults || searchResults.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = !searchResults ? "Szukanie…" : searchError || "Nic nie znaleziono";
    list.appendChild(li);
    return;
  }
  for (const mod of searchResults) list.appendChild(resultItem(mod, installModResult));
}

async function installModResult(mod) {
  const files = await window.api.installMod({ version: modsVersion(), id: mod.id });
  await loadMods();
  return files.length > 1
    ? `Zainstalowano ${mod.title} + ${files.length - 1} wymaganych bibliotek`
    : `Zainstalowano ${mod.title}`;
}

// ---------- Zakładki „Shadery” i „Tekstury” ----------

async function loadContent() {
  if (!isContentTab(modsTab)) return;
  contentInstalled = await window.api.listContent({ version: modsVersion(), type: modsTab });
  renderMods();
}

function section(text) {
  const li = document.createElement("li");
  li.className = "section";
  li.textContent = text;
  return li;
}

function contentRow(item, type) {
  const li = document.createElement("li");
  li.classList.toggle("on", item.enabled);
  const input = document.createElement("input");
  input.type = type === "shader" ? "radio" : "checkbox";
  input.name = "shader";
  input.checked = item.enabled;
  const title = document.createElement("span");
  title.className = "mod-title";
  title.textContent = item.title;
  li.append(input, title);

  const set = async enabled => {
    try {
      await window.api.toggleContent({ version: modsVersion(), type, file: item.file, enabled });
      $("mods-hint").textContent = "";
    } catch (err) {
      $("mods-hint").textContent = cleanError(err);
    }
    await loadContent();
  };
  // shader: kliknięcie wybiera go (jak przełącznik); paczka tekstur: włącza/wyłącza
  const click = () => set(type === "shader" ? true : !item.enabled);
  li.onclick = e => { if (e.target !== input && e.target.tagName !== "BUTTON") click(); };
  input.onchange = click;

  if (item.file) {
    const del = document.createElement("button");
    del.className = "small";
    del.textContent = "Usuń";
    del.onclick = async () => {
      await window.api.deleteContent({ version: modsVersion(), type, file: item.file });
      await loadContent();
      if (searchResults) doSearch();
    };
    li.appendChild(del);
  }
  return li;
}

function renderContent() {
  const type = modsTab;
  const list = $("mods-list");
  list.innerHTML = "";

  list.appendChild(section(`Zainstalowane (${contentInstalled.length})`));
  if (type === "shader") {
    const none = contentRow({ title: "Bez shaderów", enabled: !contentInstalled.some(i => i.enabled) }, type);
    none.onclick = async () => {
      await window.api.toggleContent({ version: modsVersion(), type, file: null, enabled: false });
      await loadContent();
    };
    list.appendChild(none);
  } else if (contentInstalled.length === 0) {
    const li = document.createElement("li");
    li.className = "section";
    li.style.fontWeight = "normal";
    li.textContent = "Nic jeszcze nie zainstalowano — wybierz coś poniżej";
    list.appendChild(li);
  }
  for (const item of contentInstalled) list.appendChild(contentRow(item, type));

  list.appendChild(section(type === "shader" ? "Shadery do pobrania (Modrinth, działają z Iris)" : "Paczki tekstur do pobrania (Modrinth)"));
  if (!searchResults || searchResults.length === 0) {
    const li = document.createElement("li");
    li.className = "section";
    li.style.fontWeight = "normal";
    li.textContent = !searchResults ? "Szukanie…" : searchError || "Nic nie znaleziono";
    list.appendChild(li);
    return;
  }
  for (const item of searchResults) {
    list.appendChild(resultItem(item, async () => {
      await window.api.installContent({ version: modsVersion(), type, id: item.id });
      await loadContent();
      return type === "shader"
        ? `Zainstalowano i włączono shader ${item.title}`
        : `Zainstalowano i włączono paczkę tekstur ${item.title}`;
    }));
  }
}

// Wiersz wyniku wyszukiwania z przyciskiem „Zainstaluj”; install() zwraca tekst podpowiedzi
function resultItem(mod, install) {
  {
    const li = document.createElement("li");
    li.className = "result";

    const icon = document.createElement("img");
    icon.className = "result-icon";
    if (mod.icon) icon.src = mod.icon;
    icon.alt = "";

    const body = document.createElement("div");
    body.className = "result-body";
    const title = document.createElement("div");
    title.className = "result-title";
    title.textContent = mod.title + " ";
    const author = document.createElement("small");
    author.textContent = `od ${mod.author}`;
    title.appendChild(author);
    const desc = document.createElement("div");
    desc.className = "result-desc";
    desc.textContent = mod.description;
    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.textContent = `${niceNumber(mod.downloads)} pobrań`;
    body.append(title, desc, meta);

    const button = document.createElement("button");
    button.textContent = mod.installed ? "Zainstalowany" : "Zainstaluj";
    button.disabled = mod.installed;
    if (!mod.installed) button.classList.add("primary");
    button.onclick = async () => {
      button.disabled = true;
      button.textContent = "Instalowanie…";
      try {
        const hint = await install(mod);
        mod.installed = true;
        button.textContent = "Zainstalowany";
        button.classList.remove("primary");
        $("mods-hint").textContent = hint;
      } catch (err) {
        button.disabled = false;
        button.textContent = "Zainstaluj";
        $("mods-hint").textContent = cleanError(err);
      }
    };

    li.append(icon, body, button);
    return li;
  }
}

function setModsTab(tab) {
  modsTab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  $("mods-hint").textContent = "";
  $("mods-search").value = "";
  $("mods-search").placeholder = tab === "search" || isContentTab(tab) ? "Szukaj na Modrinth…" : "Szukaj…";
  $("btn-mods-folder").hidden = tab === "search";
  $("mods-list").scrollTop = 0;
  if (isContentTab(tab)) {
    contentInstalled = [];
    loadContent();
  }
  if (tab === "search" || isContentTab(tab)) doSearch();
  else renderMods();
}

$("btn-mods").onclick = async () => {
  const option = $("version").selectedOptions[0];
  if (!option || !option.value.includes("|")) return;
  $("mods-title").textContent = `Mody — ${option.textContent}`;
  $("mods-search").value = "";
  setModsTab("own");
  $("mods").hidden = false;
  await loadMods();
};
document.querySelectorAll(".tab").forEach(t => { t.onclick = () => setModsTab(t.dataset.tab); });
$("mods-search").oninput = () => {
  if (modsTab !== "search" && !isContentTab(modsTab)) return renderMods();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 400);
};
$("btn-close-mods").onclick = () => { $("mods").hidden = true; };
$("btn-mods-folder").onclick = () =>
  window.api.openMods({ version: modsVersion(), loader: "pack", preinstalled: modsTab === "pre", content: isContentTab(modsTab) ? modsTab : null });
window.addEventListener("focus", () => {
  if ($("mods").hidden) return;
  loadMods();
  loadContent();
});
$("btn-settings").onclick = () => { $("settings").hidden = false; };

// ---------- Aktualizacje launchera ----------
window.api.on("update:available", version => {
  $("update-bar").hidden = false;
  $("update-text").textContent = `Pobieranie aktualizacji ${version}…`;
});
window.api.on("update:progress", percent => {
  $("update-text").textContent = `Pobieranie aktualizacji… ${percent}%`;
});
window.api.on("update:ready", version => {
  $("update-bar").hidden = false;
  $("update-text").textContent = `Nowa wersja ${version} jest gotowa`;
  $("btn-update").hidden = false;
});
$("btn-update").onclick = () => window.api.installUpdate();
$("btn-close-settings").onclick = () => { $("settings").hidden = true; };

$("btn-ms").onclick = async () => {
  try {
    const { name } = await window.api.loginMicrosoft();
    setAccount(name);
  } catch (err) {
    log(`Logowanie nieudane: ${err}`);
  }
};
$("btn-logout").onclick = async () => {
  await window.api.logout();
  setAccount(null);
  $("nick").value = settings.nick || "";
};

$("btn-play").onclick = async () => {
  const nick = $("nick").value.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
    setStatus("Nick: 3–16 znaków, litery, cyfry lub _");
    return;
  }
  const [version, loader] = $("version").value.split("|");
  if (!loader) return;

  persist();
  setPlaying(true);
  setStatus("Przygotowywanie…", 0);
  try {
    await window.api.launch({ nick, version, type: "release", ram: Number($("ram").value), loader });
  } catch (err) {
    setStatus("Błąd uruchamiania — szczegóły w ustawieniach (⚙)");
    log(String(err));
    setPlaying(false);
  }
};

function setPlaying(on) {
  $("btn-play").disabled = on;
  $("play-label").textContent = on ? "Uruchamianie…" : "Uruchom grę";
}

const STAGES = {
  mods: "Mody",
  java: "Java",
  assets: "Zasoby gry",
  "assets-copy": "Kopiowanie zasobów",
  classes: "Biblioteki",
  "classes-custom": "Biblioteki Fabric",
  "classes-maven-custom": "Biblioteki Fabric",
  natives: "Pliki systemowe",
};

window.api.on("game:progress", p => {
  const percent = p.total ? Math.round((p.task / p.total) * 100) : 0;
  setStatus(`${STAGES[p.type] || p.type}: ${p.task}/${p.total}`, percent);
});
window.api.on("game:log", log);
window.api.on("game:started", () => {
  setStatus("Gra uruchomiona!", 100);
  $("play-label").textContent = "Gra działa";
});
window.api.on("game:closed", code => {
  setStatus(code === 0 ? "" : `Gra zamknięta (kod ${code})`);
  document.querySelector(".progress").hidden = true;
  setPlaying(false);
});

init();
