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

function setModsTab(tab) {
  modsTab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  $("mods-hint").textContent = "";
  renderMods();
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
$("mods-search").oninput = renderMods;
$("btn-close-mods").onclick = () => { $("mods").hidden = true; };
$("btn-mods-folder").onclick = () =>
  window.api.openMods({ version: modsVersion(), loader: "pack", preinstalled: modsTab === "pre" });
window.addEventListener("focus", () => { if (!$("mods").hidden) loadMods(); });
$("btn-settings").onclick = () => { $("settings").hidden = false; };
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
