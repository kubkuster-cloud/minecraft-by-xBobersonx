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
// onlyInstalled: bez internetu pokazujemy tylko wersje, które już są pobrane
function fillVersions(versions, fabricVersions, packName, onlyInstalled) {
  const select = $("version");
  select.innerHTML = "";
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

function drawHead(skinUrl) {
  const ctx = $("head").getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const drawDefault = () => {
    ctx.clearRect(0, 0, 24, 24);
    DEFAULT_HEAD.forEach((row, y) => [...row].forEach((c, x) => {
      ctx.fillStyle = HEAD_COLORS[c];
      ctx.fillRect(x * 3, y * 3, 3, 3);
    }));
  };
  if (!skinUrl) return drawDefault();

  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, 24, 24);
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 24, 24);   // twarz
    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 24, 24);  // druga warstwa (czapka, włosy)
  };
  img.onerror = drawDefault;
  img.src = skinUrl;
}

function setAccount(name, skin, offline) {
  drawHead(name ? skin : null);
  $("account").textContent = name ? `Microsoft: ${name}${offline ? " (offline)" : ""}` : "Non-premium (nick)";
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

  drawHead(null);
  window.api.restoreLogin().then(account => {
    if (account) setAccount(account.name, account.skin, account.offline);
  });

  try {
    const [{ versions, offline, installed }, fabric, packName] = await Promise.all([
      window.api.listVersions(),
      window.api.fabricVersions().catch(() => []),
      window.api.packName(),
    ]);
    fillVersions(versions, new Set(fabric), packName, offline ? installed : null);
    if (offline) {
      setStatus(installed.length
        ? "Brak internetu — tryb offline: grasz na pobranych wersjach"
        : "Brak internetu — żadna wersja nie jest jeszcze pobrana");
    }
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
        await window.api.toggleMod({ version: crash.version, tab: mod.tab, key: mod.key, enabled: false });
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
  $("settings").hidden = false;
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
        const freed = await window.api.diskDeleteVersion({ version: v.version, worlds: v.worlds });
        if (freed === null) return;
        $("disk-hint").textContent = `Usunięto Minecraft ${v.version} — zwolniono ${niceSize(freed)}`;
        loadDisk();
      } catch (err) {
        $("disk-hint").textContent = cleanError(err);
      }
    };
    list.appendChild(diskRow(`Minecraft ${v.version}`, detail, v.size, max, del));
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

// ---------- Własne tło ----------

// url = data URL własnego obrazu albo null dla domyślnego tła
function setBackground(url) {
  $("bg-img").src = url || "assets/background.png";
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
window.api.getBackground().then(url => { if (url) setBackground(url); });

init();
