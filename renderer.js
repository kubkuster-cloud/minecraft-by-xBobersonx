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

$("btn-mods").onclick = () => {
  const [version, loader] = $("version").value.split("|");
  window.api.openMods({ version, loader });
};
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
  $("btn-play").disabled = true;
  setStatus("Przygotowywanie…", 0);
  try {
    await window.api.launch({ nick, version, type: "release", ram: Number($("ram").value), loader });
  } catch (err) {
    setStatus("Błąd uruchamiania — szczegóły w ⚙ Ustawienia");
    log(String(err));
    $("btn-play").disabled = false;
  }
};

window.api.on("game:progress", p => {
  const percent = p.total ? Math.round((p.task / p.total) * 100) : 0;
  setStatus(`Pobieranie: ${p.type} (${p.task}/${p.total})`, percent);
});
window.api.on("game:log", log);
window.api.on("game:started", () => setStatus("Gra uruchomiona!", 100));
window.api.on("game:closed", code => {
  setStatus(code === 0 ? "" : `Gra zamknięta (kod ${code})`);
  document.querySelector(".progress").hidden = true;
  $("btn-play").disabled = false;
});

init();
