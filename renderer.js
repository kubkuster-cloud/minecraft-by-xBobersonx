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
  settings.window = {
    fullscreen: $("win-fullscreen").checked,
    width: Number($("win-width").value) || 1280,
    height: Number($("win-height").value) || 720,
  };
  settings.afterLaunch = $("after-launch").value;
  settings.javaArgs = $("java-args").value.trim();
  settings.syncOptions = $("sync-options").checked;
  window.api.saveSettings(settings);
}

// Najpierw zainstalowane modpacki, potem paczka xBobersonx dla każdej wersji obsługiwanej przez Fabric.
// onlyInstalled: bez internetu pokazujemy tylko wersje, które już są pobrane
function fillVersions(versions, fabricVersions, packName, onlyInstalled, modpacks = []) {
  const select = $("version");
  select.innerHTML = "";
  for (const mp of modpacks) {
    const opt = document.createElement("option");
    opt.value = `${mp.gameVersion}|mp:${mp.slug}`;
    opt.textContent = `📦 ${mp.title} (${mp.gameVersion})`;
    select.appendChild(opt);
  }
  for (const v of versions) {
    if (v.type !== "release" || !fabricVersions.has(v.id)) continue;
    if (onlyInstalled && !onlyInstalled.includes(v.id)) continue;
    const opt = document.createElement("option");
    opt.value = `${v.id}|pack`;
    opt.textContent = `Minecraft ${v.id} – ${packName}`;
    select.appendChild(opt);
  }
  if (settings.version && select.querySelector(`option[value="${settings.version}"]`)) {
    select.value = settings.version;
  }
}

// ---------- Skin (główka obok nicku) ----------

// Domyślna głowa dla konta non-premium, 8x8 pikseli
const DEFAULT_HEAD = [
  "HHHHHHHH",
  "HHHHHHHH",
  "HSSSSSSH",
  "SSSSSSSS",
  "SWBSSBWS",
  "SSSNNSSS",
  "SSMMMMSS",
  "SsSSSSsS",
];
const HEAD_COLORS = { H: "#3b2a1a", S: "#b98a6a", s: "#a9785a", W: "#ffffff", B: "#4a3a8a", N: "#8a5a40", M: "#6a3a2a" };

// Rysuje głowę na obu płótnach: obok nicku (24 px) i w karcie konta w ustawieniach (64 px)
function drawHead(skinUrl) {
  const canvases = [$("head"), $("account-head")];
  const drawDefault = () => {
    for (const c of canvases) {
      const ctx = c.getContext("2d");
      const px = c.width / 8;
      ctx.clearRect(0, 0, c.width, c.height);
      DEFAULT_HEAD.forEach((row, y) => [...row].forEach((ch, x) => {
        ctx.fillStyle = HEAD_COLORS[ch];
        ctx.fillRect(x * px, y * px, px, px);
      }));
    }
  };
  if (!skinUrl) return drawDefault();

  const img = new Image();
  img.onload = () => {
    for (const c of canvases) {
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, c.width, c.height);   // twarz
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, c.width, c.height);  // druga warstwa (czapka, włosy)
    }
  };
  img.onerror = drawDefault;
  img.src = skinUrl;
}

function setAccount(name, skin, offline) {
  drawHead(name ? skin : null);
  $("account-name").textContent = name || $("nick").value.trim() || "—";
  $("account").textContent = name ? `Konto Microsoft${offline ? " (offline)" : ""}` : "Konto non-premium";
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
  systemRam = totalRam;
  $("ram").max = Math.max(2, totalRam);
  $("ram").value = settings.ram || recommendedRam();
  updateRam();

  const w = settings.window || {};
  $("win-fullscreen").checked = !!w.fullscreen;
  $("win-width").value = w.width || 1280;
  $("win-height").value = w.height || 720;
  updateWindowInputs();
  $("after-launch").value = settings.afterLaunch || "tray";
  $("java-args").value = settings.javaArgs || "";
  $("sync-options").checked = settings.syncOptions !== false;
  $("about-version").textContent = $("app-version").textContent;

  setAccount(null);
  window.api.restoreLogin().then(account => {
    if (account) setAccount(account.name, account.skin, account.offline);
  });

  await loadVersions();
}

// Lista wersji (też po instalacji/usunięciu modpacka); select = wpis do zaznaczenia
async function loadVersions(select) {
  try {
    const [{ versions, offline, installed, modpacks }, fabric, packName] = await Promise.all([
      window.api.listVersions(),
      window.api.fabricVersions().catch(() => []),
      window.api.packName(),
    ]);
    fillVersions(versions, new Set(fabric), packName, offline ? installed : null, modpacks);
    if (select) {
      $("version").value = select;
      persist();
    }
    if (offline) {
      setStatus(installed.length || modpacks.length
        ? "Brak internetu — tryb offline: grasz na pobranych wersjach"
        : "Brak internetu — żadna wersja nie jest jeszcze pobrana");
    }
  } catch (err) {
    $("version").innerHTML = "<option>Brak połączenia</option>";
    setStatus("Nie można pobrać listy wersji — sprawdź internet");
    log(String(err));
  }
}

$("nick").onchange = () => {
  persist();
  if ($("btn-logout").hidden) $("account-name").textContent = $("nick").value.trim() || "—";
};
$("version").onchange = persist;
// Suwak sięga całej pamięci komputera; podpowiedź ostrzega przed zbyt dużą ilością
let systemRam = 16;

// Około połowy pamięci komputera, w granicach 4–10 GB
function recommendedRam() {
  return Math.min(10, Math.max(4, Math.round(systemRam / 2)));
}

function updateRam() {
  const ram = Number($("ram").value);
  $("ram-val").textContent = `${ram} GB`;
  document.querySelectorAll(".ram-preset").forEach(b => {
    b.classList.toggle("selected", Number(b.dataset.gb) === ram);
    b.disabled = Number(b.dataset.gb) > systemRam;
  });
  $("btn-ram-auto").textContent = `Zalecane (${recommendedRam()} GB)`;
  const hint = $("ram-hint");
  if (systemRam - ram < 2) {
    hint.className = "bad";
    hint.textContent = `Dla Windowsa zostanie ${Math.max(0, systemRam - ram)} GB — komputer i gra mogą się zacinać`;
  } else if (ram > 12) {
    hint.className = "info";
    hint.textContent = "Ponad 12 GB rzadko pomaga, a może wydłużać przycięcia";
  } else if (ram >= 4) {
    hint.className = "good";
    hint.textContent = "Dobra ilość dla paczki modów";
  } else {
    hint.className = "bad";
    hint.textContent = "Za mało dla paczki modów — ustaw co najmniej 4 GB";
  }
}

$("ram").oninput = updateRam;
$("ram").onchange = persist;

function setRam(gb) {
  $("ram").value = gb;
  updateRam();
  persist();
}
document.querySelectorAll(".ram-preset").forEach(b => { b.onclick = () => setRam(Number(b.dataset.gb)); });
$("btn-ram-auto").onclick = () => setRam(recommendedRam());

// ---------- Pozostałe ustawienia ----------

function updateWindowInputs() {
  const full = $("win-fullscreen").checked;
  $("win-width").disabled = full;
  $("win-height").disabled = full;
}
$("win-fullscreen").onchange = () => { updateWindowInputs(); persist(); };
$("win-width").onchange = persist;
$("win-height").onchange = persist;
$("after-launch").onchange = persist;
$("java-args").onchange = persist;
$("sync-options").onchange = persist;

document.querySelectorAll(".nav-item").forEach(item => {
  item.onclick = () => {
    document.querySelectorAll(".nav-item").forEach(i => i.classList.toggle("active", i === item));
    document.querySelectorAll(".page").forEach(p => { p.hidden = p.dataset.page !== item.dataset.page; });
  };
});

function showSettingsPage(page) {
  document.querySelector(`.nav-item[data-page="${page}"]`).click();
  $("settings").hidden = false;
}

$("btn-game-folder").onclick = () => window.api.diskOpen();
$("btn-log-clear").onclick = () => { $("log").textContent = ""; };
$("btn-log-copy").onclick = async () => {
  await navigator.clipboard.writeText($("log").textContent);
  $("btn-log-copy").textContent = "Skopiowano!";
  setTimeout(() => { $("btn-log-copy").textContent = "Kopiuj"; }, 1500);
};
$("btn-github").onclick = () => window.api.openGithub();
$("btn-check-update").onclick = async () => {
  $("update-status").textContent = "Sprawdzanie…";
  $("update-status").textContent = await window.api.checkUpdate();
};

// ---------- Okno „Własne mody” ----------
let modsTab = "own";
let modsData = { own: [], pre: [] };

function modsVersion() {
  return $("version").value.split("|")[0];
}

// Wybrany wpis z listy: wersja gry + instancja ("pack" albo "mp:<slug>")
function modsTarget() {
  const [version, instance] = $("version").value.split("|");
  return { version, instance };
}

async function loadMods() {
  modsData = await window.api.listMods(modsTarget());
  $("count-own").textContent = `(${modsData.own.length})`;
  $("count-pre").textContent = `(${modsData.pre.length})`;
  renderMods();
  showUpdateButton();
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
    // własny mod, który i tak jest w paczce — można go usunąć z folderu
    if (modsTab === "own" && mod.modId && modsData.pre.some(p => p.modId === mod.modId)) {
      const tag = document.createElement("span");
      tag.className = "mod-tag";
      tag.textContent = "jest też w paczce";
      tag.title = "Ten mod jest już w paczce xBobersonx Mods — kopia we własnych modach nie jest potrzebna";
      li.appendChild(tag);
    }
    const update = modsTab === "own" && modUpdates.get(mod.key);
    const version = document.createElement("span");
    version.className = "mod-version";
    version.textContent = update ? `${update.from} → ${update.to}` : mod.version;
    if (update) {
      version.classList.add("has-update");
      version.title = update.changelog || "";
    }
    li.appendChild(version);

    if (update) {
      const btn = document.createElement("button");
      btn.className = "small primary";
      btn.textContent = "Aktualizuj";
      btn.onclick = async e => {
        e.stopPropagation();
        btn.disabled = true;
        btn.textContent = "…";
        await updateOneMod(update);
        await loadMods();
      };
      li.appendChild(btn);
    }

    const toggle = async () => {
      const enabled = !mod.enabled;
      try {
        await window.api.toggleMod({ ...modsTarget(), tab: modsTab, key: mod.key, enabled });
        mod.enabled = enabled;
        $("mods-hint").textContent = mod.library && !enabled
          ? "Uwaga: inne mody mogą wymagać tej biblioteki — gra może się nie uruchomić."
          : "";
      } catch (err) {
        $("mods-hint").textContent = String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      }
      renderMods();
    };
    li.onclick = e => { if (e.target !== box && e.target.tagName !== "BUTTON") toggle(); };
    box.onchange = toggle;
    list.appendChild(li);
  }
}

// ---------- Aktualizacje własnych modów ----------
let modUpdates = new Map(); // plik -> { file, from, to, changelog }

async function updateOneMod(update) {
  try {
    await window.api.updateMod({ ...modsTarget(), file: update.file });
    modUpdates.delete(update.file);
    $("mods-hint").textContent = `Zaktualizowano do ${update.to}`;
    return true;
  } catch (err) {
    $("mods-hint").textContent = cleanError(err);
    return false;
  }
}

function showUpdateButton() {
  const btn = $("btn-mods-updates");
  btn.hidden = modsTab !== "own" || modsData.own.length === 0;
  btn.disabled = false;
  btn.textContent = modUpdates.size ? `Aktualizuj wszystkie (${modUpdates.size})` : "Sprawdź aktualizacje";
}

$("btn-mods-updates").onclick = async () => {
  const btn = $("btn-mods-updates");
  btn.disabled = true;
  if (modUpdates.size) {
    btn.textContent = "Aktualizowanie…";
    let done = 0;
    for (const update of [...modUpdates.values()]) if (await updateOneMod(update)) done++;
    $("mods-hint").textContent = `Zaktualizowano ${done} ${done === 1 ? "mod" : "modów"}`;
    await loadMods();
  } else {
    btn.textContent = "Sprawdzanie…";
    try {
      const updates = await window.api.checkModUpdates(modsTarget());
      modUpdates = new Map(updates.map(u => [u.file, u]));
      $("mods-hint").textContent = updates.length
        ? `Aktualizacje dostępne dla ${updates.length} ${updates.length === 1 ? "moda" : "modów"}`
        : "Wszystkie własne mody są aktualne (sprawdzono te, które są na Modrinth)";
      renderMods();
    } catch (err) {
      $("mods-hint").textContent = "Nie udało się sprawdzić — sprawdź internet";
    }
  }
  showUpdateButton();
};

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
      ? await window.api.searchContent({ ...modsTarget(), type: tab, query })
      : await window.api.searchMods({ ...modsTarget(), query });
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
  const files = await window.api.installMod({ ...modsTarget(), id: mod.id });
  await loadMods();
  return files.length > 1
    ? `Zainstalowano ${mod.title} + ${files.length - 1} wymaganych bibliotek`
    : `Zainstalowano ${mod.title}`;
}

// ---------- Zakładki „Shadery” i „Tekstury” ----------

async function loadContent() {
  if (!isContentTab(modsTab)) return;
  contentInstalled = await window.api.listContent({ ...modsTarget(), type: modsTab });
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
      await window.api.toggleContent({ ...modsTarget(), type, file: item.file, enabled });
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
      await window.api.deleteContent({ ...modsTarget(), type, file: item.file });
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
      await window.api.toggleContent({ ...modsTarget(), type, file: null, enabled: false });
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
      await window.api.installContent({ ...modsTarget(), type, id: item.id });
      await loadContent();
      return type === "shader"
        ? `Zainstalowano i włączono shader ${item.title}`
        : `Zainstalowano i włączono paczkę tekstur ${item.title}`;
    }));
  }
}

// Wiersz wyniku wyszukiwania z przyciskiem „Zainstaluj”; install() zwraca tekst podpowiedzi
function resultItem(mod, install, hintId = "mods-hint") {
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
        $(hintId).textContent = hint;
      } catch (err) {
        button.disabled = false;
        button.textContent = "Zainstaluj";
        $(hintId).textContent = cleanError(err);
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
  showUpdateButton();
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
  modUpdates = new Map();
  // modpack nie ma paczki xBobersonx — jego mody są w zakładce „Własne mody”
  document.querySelector('.tab[data-tab="pre"]').hidden = modsTarget().instance !== "pack";
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
  window.api.openMods({ ...modsTarget(), preinstalled: modsTab === "pre", content: isContentTab(modsTab) ? modsTab : null });
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
    const { name, skin } = await window.api.loginMicrosoft();
    setAccount(name, skin);
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
    await window.api.launch({
      nick,
      version,
      type: "release",
      ram: Number($("ram").value),
      loader,
      window: settings.window,
      afterLaunch: settings.afterLaunch || "tray",
      javaArgs: settings.javaArgs || "",
      syncOptions: settings.syncOptions !== false,
    });
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

// ---------- Okno „Gra się wysypała” ----------
let crashReport = null;

window.api.on("game:crash", crash => {
  crashReport = crash.report;
  $("crash-reason").textContent = crash.reason;
  $("crash-details").textContent = crash.details.join("\n");
  $("crash-details").hidden = crash.details.length === 0;
  $("btn-crash-report").hidden = !crash.report;
  setStatus("Gra się wysypała — zobacz okno z wyjaśnieniem");

  const list = $("crash-mods");
  list.innerHTML = "";
  for (const mod of crash.mods) {
    const li = document.createElement("li");
    li.classList.toggle("off", !mod.enabled);
    const title = document.createElement("span");
    title.className = "mod-title";
    title.textContent = `${mod.title}${mod.tab === "own" ? " (własny mod)" : ""}${mod.library ? " — biblioteka" : ""}`;
    const button = document.createElement("button");
    button.textContent = mod.enabled ? "Wyłącz" : "Wyłączony";
    button.disabled = !mod.enabled;
    button.onclick = async () => {
      try {
        await window.api.toggleMod({ version: crash.version, instance: crash.instance, tab: mod.tab, key: mod.key, enabled: false });
        li.classList.add("off");
        button.textContent = "Wyłączony";
        button.disabled = true;
      } catch (err) {
        button.textContent = cleanError(err);
      }
    };
    li.append(title, button);
    list.appendChild(li);
  }
  for (const id of crash.unknown) {
    const li = document.createElement("li");
    li.textContent = `${id} (wbudowany w inny mod — nie da się wyłączyć osobno)`;
    list.appendChild(li);
  }
  $("crash-mods-box").hidden = crash.mods.length + crash.unknown.length === 0;
  $("crash").hidden = false;
});

const closeCrash = () => { $("crash").hidden = true; };
$("btn-crash-ok").onclick = closeCrash;
$("btn-close-crash").onclick = closeCrash;
$("btn-crash-report").onclick = () => crashReport && window.api.openCrashReport(crashReport);
$("btn-crash-log").onclick = () => {
  closeCrash();
  showSettingsPage("console");
};

// ---------- Okno „Miejsce na dysku” ----------

function niceSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return bytes === 0 ? "0 KB" : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function diskRow(name, detail, size, max, button) {
  const li = document.createElement("li");
  const label = document.createElement("span");
  label.className = "disk-name";
  label.textContent = name;
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    label.appendChild(small);
  }
  const bar = document.createElement("div");
  bar.className = "disk-bar";
  const fill = document.createElement("div");
  fill.style.width = `${Math.max(2, Math.round((size / max) * 100))}%`;
  bar.appendChild(fill);
  const value = document.createElement("span");
  value.className = "disk-size";
  value.textContent = niceSize(size);
  li.append(label, bar, value);
  if (button) li.appendChild(button);
  return li;
}

function diskSection(text) {
  const li = document.createElement("li");
  li.className = "section";
  li.textContent = text;
  return li;
}

async function loadDisk() {
  $("disk-total").textContent = "Liczenie…";
  $("disk-list").innerHTML = "";
  const data = await window.api.diskScan();
  $("disk-total").innerHTML = `Gra zajmuje razem: <b>${niceSize(data.total)}</b>`;
  const max = Math.max(...data.versions.map(v => v.size), ...data.shared.map(s => s.size), 1);
  const list = $("disk-list");

  list.appendChild(diskSection(`Wersje gry (${data.versions.length})`));
  for (const v of data.versions) {
    const p = v.parts;
    const detail = `światy ${niceSize(p.saves)} (${v.worlds}) · mody ${niceSize(p.mods)} · shadery i tekstury ${niceSize(p.content)} · reszta ${niceSize(p.other)}`;
    const del = document.createElement("button");
    del.textContent = "Usuń";
    del.onclick = async () => {
      try {
        const freed = await window.api.diskDeleteVersion({ key: v.key, label: v.label, worlds: v.worlds });
        if (freed === null) return;
        $("disk-hint").textContent = `Usunięto ${v.label} — zwolniono ${niceSize(freed)}`;
        loadDisk();
        loadVersions();
      } catch (err) {
        $("disk-hint").textContent = cleanError(err);
      }
    };
    list.appendChild(diskRow(v.label, detail, v.size, max, del));
  }

  list.appendChild(diskSection("Pliki wspólne"));
  for (const s of data.shared) list.appendChild(diskRow(s.label, "", s.size, max));

  list.appendChild(diskSection(`Śmieci do wyczyszczenia: ${niceSize(data.junkSize)}`));
  if (data.junk.length === 0) list.appendChild(diskRow("Nic do sprzątania 🎉", "", 0, max));
  for (const j of data.junk) list.appendChild(diskRow(j.label, "", j.size, max));
  $("btn-disk-clean").disabled = data.junkSize === 0;
}

$("btn-disk").onclick = () => {
  $("settings").hidden = true;
  $("disk-hint").textContent = "";
  $("disk").hidden = false;
  loadDisk();
};
$("btn-close-disk").onclick = () => { $("disk").hidden = true; };
$("btn-disk-open").onclick = () => window.api.diskOpen();
$("btn-disk-clean").onclick = async () => {
  try {
    const freed = await window.api.diskClean();
    $("disk-hint").textContent = `Wyczyszczono — zwolniono ${niceSize(freed)}`;
    loadDisk();
  } catch (err) {
    $("disk-hint").textContent = cleanError(err);
  }
};

// ---------- Okno „Modpacki” ----------
let modpacksInstalled = [];
let modpackResults = null; // null = trwa wyszukiwanie
let modpacksTimer = null;
let modpacksSeq = 0;
let modpackInstalling = false;

function modpackRow(mp) {
  const li = document.createElement("li");
  li.className = "result";
  const icon = document.createElement("img");
  icon.className = "result-icon";
  if (mp.icon) icon.src = mp.icon;
  icon.alt = "";
  const body = document.createElement("div");
  body.className = "result-body";
  const title = document.createElement("div");
  title.className = "result-title";
  title.textContent = mp.title;
  const meta = document.createElement("div");
  meta.className = "result-meta";
  meta.textContent = `Minecraft ${mp.gameVersion} · wersja ${mp.version}`;
  body.append(title, meta);

  const buttons = document.createElement("div");
  buttons.className = "result-buttons";
  const play = document.createElement("button");
  play.className = "primary";
  play.textContent = "Wybierz";
  play.onclick = async () => {
    await loadVersions(`${mp.gameVersion}|mp:${mp.slug}`);
    $("modpacks").hidden = true;
    setStatus(`Wybrano ${mp.title} — kliknij „Uruchom grę”`);
  };
  const del = document.createElement("button");
  del.textContent = "Usuń";
  del.onclick = async () => {
    try {
      if (!(await window.api.deleteModpack({ slug: mp.slug, title: mp.title }))) return;
      $("modpacks-hint").textContent = `Usunięto ${mp.title}`;
      await loadVersions();
      await loadModpacks();
    } catch (err) {
      $("modpacks-hint").textContent = cleanError(err);
    }
  };
  buttons.append(play, del);
  li.append(icon, body, buttons);
  return li;
}

function renderModpacks() {
  const list = $("modpacks-list");
  list.innerHTML = "";
  list.appendChild(section(`Zainstalowane (${modpacksInstalled.length})`));
  if (modpacksInstalled.length === 0) {
    const li = document.createElement("li");
    li.className = "section";
    li.style.fontWeight = "normal";
    li.textContent = "Nic jeszcze nie zainstalowano — wybierz modpack poniżej";
    list.appendChild(li);
  }
  for (const mp of modpacksInstalled) list.appendChild(modpackRow(mp));

  list.appendChild(section("Modpacki do pobrania (Modrinth, Fabric)"));
  if (!modpackResults || modpackResults.length === 0) {
    const li = document.createElement("li");
    li.className = "section";
    li.style.fontWeight = "normal";
    li.textContent = !modpackResults ? "Szukanie…" : "Nic nie znaleziono";
    list.appendChild(li);
    return;
  }
  for (const mp of modpackResults) {
    list.appendChild(resultItem(mp, async () => {
      if (modpackInstalling) throw new Error("Poczekaj, aż skończy się instalacja poprzedniego modpacka");
      modpackInstalling = true;
      $("modpacks-progress").hidden = false;
      $("modpacks-bar").style.width = "0%";
      try {
        const info = await window.api.installModpack({ id: mp.id });
        await loadVersions(`${info.gameVersion}|mp:${info.slug}`);
        await loadModpacks();
        return `Zainstalowano ${info.title} (Minecraft ${info.gameVersion}) — wybrany na liście wersji, kliknij „Uruchom grę”`;
      } finally {
        modpackInstalling = false;
        $("modpacks-progress").hidden = true;
      }
    }, "modpacks-hint"));
  }
}

async function loadModpacks() {
  modpacksInstalled = await window.api.listModpacks();
  renderModpacks();
}

async function searchModpacks() {
  const seq = ++modpacksSeq;
  modpackResults = null;
  renderModpacks();
  try {
    const results = await window.api.searchModpacks({ query: $("modpacks-search").value.trim() });
    if (seq === modpacksSeq) modpackResults = results;
  } catch {
    if (seq === modpacksSeq) modpackResults = [];
    $("modpacks-hint").textContent = "Nie udało się połączyć z Modrinth — sprawdź internet";
  }
  renderModpacks();
}

window.api.on("modpacks:progress", p => {
  const percent = p.total ? Math.round((p.task / p.total) * 100) : 0;
  $("modpacks-bar").style.width = `${percent}%`;
  $("modpacks-hint").textContent = `Pobieranie plików modpacka: ${p.task}/${p.total}`;
});

$("btn-modpacks").onclick = () => {
  $("modpacks-hint").textContent = "";
  $("modpacks-search").value = "";
  $("modpacks-list").scrollTop = 0;
  $("modpacks").hidden = false;
  loadModpacks();
  searchModpacks();
};
$("btn-close-modpacks").onclick = () => { $("modpacks").hidden = true; };
$("modpacks-search").oninput = () => {
  clearTimeout(modpacksTimer);
  modpacksTimer = setTimeout(searchModpacks, 400);
};

// ---------- Własne tło ----------

// url = data URL własnego obrazu albo null dla domyślnego tła
function setBackground(url) {
  $("bg-img").src = url || "assets/background.png";
  $("bg-preview").src = url || "assets/background.png";
  $("bg-name").textContent = url ? "Własny obraz" : "Domyślne";
  $("btn-bg-reset").hidden = !url;
}

$("btn-bg-choose").onclick = async () => {
  const url = await window.api.chooseBackground();
  if (url) setBackground(url);
};
$("btn-bg-reset").onclick = async () => {
  await window.api.resetBackground();
  setBackground(null);
};
window.api.getBackground().then(url => setBackground(url));

init();
