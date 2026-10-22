const { app, BrowserWindow, ipcMain, shell, safeStorage, Tray, Menu, net, dialog } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { Client, Authenticator } = require("minecraft-launcher-core");
const { Auth } = require("msmc");
const { autoUpdater } = require("electron-updater");
const { installPack, packName, listMods, setModEnabled, searchMods, installOwnMod } = require("./modpack");
const { getJava, JVM_FLAGS } = require("./java");
const content = require("./content");
const { analyze, findCrashReport } = require("./crash");
const disk = require("./disk");

const ICON = path.join(__dirname, "assets", "icon.png");

// Domyślne ustawienia graficzne dla nowej wersji (tylko gdy gra nie ma jeszcze options.txt)
const DEFAULT_OPTIONS = [
  "renderDistance:12",
  "simulationDistance:8",
  "maxFps:260",
  "enableVsync:false",
  "graphicsMode:1",
  "biomeBlendRadius:1",
  "mipmapLevels:2",
  "entityDistanceScaling:1.0",
  "lang:pl_pl",
].join("\n");

const GAME_DIR = path.join(app.getPath("appData"), ".minecraft_by_xbobersonx");
const SETTINGS_FILE = path.join(GAME_DIR, "launcher_settings.json");
const ACCOUNT_FILE = path.join(GAME_DIR, "account.dat");
const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META = "https://meta.fabricmc.net/v2/versions/loader";

let win;
let tray = null;
let gameRunning = false;
let msMinecraft = null; // zalogowane konto Microsoft (obiekt Minecraft z msmc)

// Na czas gry launcher chowa się do zasobnika (obok zegara) i wraca po zamknięciu gry
function hideToTray() {
  if (!win || win.isDestroyed()) return;
  if (!tray) {
    tray = new Tray(ICON);
    tray.setToolTip("Minecraft by xBobersonx — gra działa");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Pokaż launcher", click: showFromTray },
      { label: "Zamknij launcher", click: () => app.quit() },
    ]));
    tray.on("click", showFromTray);
  }
  win.hide();
}

function showFromTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
}

// Automatyczne aktualizacje z GitHub Releases (tylko w zainstalowanej wersji;
// wersja portable i uruchomienie przez npm start ich nie obsługują)
function setupAutoUpdate() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", info => send("update:available", info.version));
  autoUpdater.on("download-progress", p => send("update:progress", Math.round(p.percent)));
  autoUpdater.on("update-downloaded", info => send("update:ready", info.version));
  autoUpdater.on("error", err => console.error("Aktualizacja:", err.message));
  autoUpdater.checkForUpdates().catch(err => console.error("Aktualizacja:", err.message));
}

ipcMain.handle("update:install", () => autoUpdater.quitAndInstall());

function createWindow() {
  win = new BrowserWindow({
    width: 860,
    height: 520,
    resizable: false,
    maximizable: false,
    title: "Minecraft Launcher by xBobersonx",
    backgroundColor: "#6fa8e8",
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));
  win.webContents.once("did-finish-load", setupAutoUpdate);
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return { nick: "", version: "", ram: 4, showSnapshots: false };
  }
}

function saveSettings(settings) {
  fs.mkdirSync(GAME_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

ipcMain.handle("settings:load", () => loadSettings());
ipcMain.handle("settings:save", (_e, s) => saveSettings(s));
ipcMain.handle("system:ram", () => Math.floor(os.totalmem() / 1024 ** 3));

// ---------- Tryb offline ----------

// Pobiera JSON i zapisuje kopię; bez internetu zwraca ostatnią zapisaną kopię
async function cachedJson(url, name) {
  const file = path.join(GAME_DIR, "cache", "launcher", `${name}.json`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    return { data, offline: false };
  } catch (err) {
    if (!fs.existsSync(file)) throw err;
    return { data: JSON.parse(fs.readFileSync(file, "utf8")), offline: true };
  }
}

// Wersje, które były już uruchomione (mają pobraną paczkę) — tylko na nich da się grać bez internetu
function installedVersions() {
  const dir = path.join(GAME_DIR, "instances");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(n => n.startsWith("pack-") && fs.existsSync(path.join(dir, n, ".xbobersonx-pack.json")))
    .map(n => n.slice("pack-".length));
}

ipcMain.handle("versions:list", async () => {
  const { data, offline } = await cachedJson(MANIFEST_URL, "version_manifest");
  return {
    latest: data.latest,
    versions: data.versions.map(v => ({ id: v.id, type: v.type })),
    offline,
    installed: installedVersions(),
  };
});

// Pobiera profil Fabric dla danej wersji gry i zapisuje go w versions/,
// zwraca jego id (np. "fabric-loader-0.16.10-1.21.1") do użycia jako version.custom.
// Bez internetu używa wcześniej zapisanego profilu.
async function installFabric(gameVersion) {
  try {
    const res = await fetch(`${FABRIC_META}/${gameVersion}`);
    const loaders = await res.json();
    if (!Array.isArray(loaders) || loaders.length === 0) {
      throw new Error(`Fabric nie jest dostępny dla wersji ${gameVersion}`);
    }
    const loader = (loaders.find(l => l.loader.stable) || loaders[0]).loader.version;

    const profileRes = await fetch(`${FABRIC_META}/${gameVersion}/${loader}/profile/json`);
    const profile = await profileRes.json();
    const dir = path.join(GAME_DIR, "versions", profile.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${profile.id}.json`), JSON.stringify(profile, null, 2));
    return profile.id;
  } catch (err) {
    const versionsDir = path.join(GAME_DIR, "versions");
    const saved = fs.existsSync(versionsDir)
      ? fs.readdirSync(versionsDir)
          .filter(n => n.startsWith("fabric-loader-") && n.endsWith(`-${gameVersion}`))
          .filter(n => fs.existsSync(path.join(versionsDir, n, `${n}.json`)))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : [];
    if (saved.length === 0) throw new Error(`Brak internetu — wersję ${gameVersion} trzeba raz uruchomić z internetem`);
    return saved[saved.length - 1];
  }
}

ipcMain.handle("fabric:versions", async () => {
  const { data } = await cachedJson("https://meta.fabricmc.net/v2/versions/game", "fabric_versions");
  return data.map(v => v.version);
});

ipcMain.handle("app:version", () => require("./package.json").version);

// Paczka modów ma osobny folder gry na każdą wersję, żeby mody się nie mieszały
function packDir(version) {
  return path.join(GAME_DIR, "instances", `pack-${version}`);
}

ipcMain.handle("pack:name", () => packName);

ipcMain.handle("mods:list", (_e, { version }) => listMods(packDir(version)));
ipcMain.handle("mods:toggle", (_e, { version, tab, key, enabled }) =>
  setModEnabled(packDir(version), tab, key, enabled));
ipcMain.handle("mods:search", (_e, { version, query }) => searchMods(packDir(version), version, query));
ipcMain.handle("mods:install", (_e, { version, id }) =>
  installOwnMod(packDir(version), version, id, msg => win.webContents.send("game:log", msg)));

// Shadery i paczki tekstur (type: "shader" | "resourcepack")
ipcMain.handle("content:list", (_e, { version, type }) => content.listContent(packDir(version), type));
ipcMain.handle("content:search", (_e, { version, type, query }) =>
  content.searchContent(packDir(version), version, type, query));
ipcMain.handle("content:install", (_e, { version, type, id }) =>
  content.installContent(packDir(version), version, type, id));
ipcMain.handle("content:toggle", (_e, { version, type, file, enabled }) =>
  content.setContentEnabled(packDir(version), type, file, enabled));
ipcMain.handle("content:delete", (_e, { version, type, file }) =>
  content.deleteContent(packDir(version), type, file));

ipcMain.handle("folder:mods", (_e, { version, loader, preinstalled, content: type } = {}) => {
  const base = loader === "pack" ? packDir(version) : GAME_DIR;
  const folders = { shader: "shaderpacks", resourcepack: "resourcepacks" };
  const dir = type ? path.join(base, folders[type]) : path.join(base, "mods", preinstalled ? "preinstalled" : "");
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});

// Token odświeżania Microsoft zapisany na dysku, zaszyfrowany przez system (DPAPI w Windows)
function saveRefreshToken(xbox) {
  fs.mkdirSync(GAME_DIR, { recursive: true });
  const token = xbox.save();
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token);
  fs.writeFileSync(ACCOUNT_FILE, data);
}

function readRefreshToken() {
  const data = fs.readFileSync(ACCOUNT_FILE);
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString();
}

// Nazwa, UUID i skin konta (bez tokenów) — żeby bez internetu grać na tym samym profilu
const PROFILE_FILE = path.join(GAME_DIR, "account-profile.json");
let offlineProfile = null;

async function finishLogin(xbox) {
  const mc = await xbox.getMinecraft();
  if (!mc.profile) throw new Error("To konto Microsoft nie ma kupionego Minecrafta");
  msMinecraft = mc;
  offlineProfile = null;
  saveRefreshToken(xbox);
  const skins = msMinecraft.profile.skins || [];
  const skin = (skins.find(s => s.state === "ACTIVE") || skins[0] || {}).url || null;
  const profile = { id: mc.profile.id, name: mc.profile.name, skin: skin && skin.replace(/^http:/, "https:") };
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile));
  return { name: profile.name, skin: profile.skin };
}

ipcMain.handle("auth:microsoft", async () => {
  const xbox = await new Auth("select_account").launch("electron");
  return finishLogin(xbox);
});

// Przy starcie: zaloguj ponownie z zapisanego tokenu (bez okna logowania).
// Bez internetu używa zapisanego profilu — single player działa na tym samym koncie.
ipcMain.handle("auth:restore", async () => {
  if (!fs.existsSync(ACCOUNT_FILE)) return null;
  try {
    const xbox = await new Auth("select_account").refresh(readRefreshToken());
    return await finishLogin(xbox);
  } catch (err) {
    console.error("Nie udało się przywrócić logowania:", err);
    if (net.isOnline() || !fs.existsSync(PROFILE_FILE)) return null;
    offlineProfile = JSON.parse(fs.readFileSync(PROFILE_FILE, "utf8"));
    return { name: offlineProfile.name, skin: null, offline: true };
  }
});

ipcMain.handle("auth:logout", () => {
  msMinecraft = null;
  offlineProfile = null;
  fs.rmSync(ACCOUNT_FILE, { force: true });
  fs.rmSync(PROFILE_FILE, { force: true });
});

// Dane logowania dla gry: konto Microsoft (odświeżone, jeśli się da), zapisany profil bez internetu
// albo konto non-premium z samym nickiem
async function gameAuthorization(nick, log) {
  if (msMinecraft) {
    // token Minecrafta ważny jest ok. 24h — odśwież, jeśli wygasł
    if (!msMinecraft.validate()) {
      try {
        msMinecraft = await msMinecraft.refresh(true);
      } catch (err) {
        log(`[konto] Nie można odświeżyć logowania (${err.message || err}) — gram offline na tym koncie`);
      }
    }
    return msMinecraft.mclc();
  }
  if (offlineProfile) {
    log("[konto] Brak internetu — gram offline na zapisanym koncie Microsoft");
    return {
      access_token: "0",
      client_token: "0",
      uuid: offlineProfile.id,
      name: offlineProfile.name,
      user_properties: "{}",
      meta: { type: "msa", demo: false },
    };
  }
  return Authenticator.getAuth(nick);
}

// Analiza crasha + powiązanie podejrzanych modów z plikami, żeby można je było wyłączyć
function describeCrash(instanceDir, version, log, code, reportFile) {
  const report = reportFile ? fs.readFileSync(reportFile, "utf8") : "";
  const { reason, suspects, details } = analyze(log, code, report);
  const { own, pre } = listMods(instanceDir);
  const all = [...own.map(m => ({ ...m, tab: "own" })), ...pre.map(m => ({ ...m, tab: "pre" }))];
  const mods = [];
  const unknown = [];
  for (const id of suspects) {
    const mod = all.find(m => m.modId === id);
    if (mod) mods.push({ title: mod.title, tab: mod.tab, key: mod.key, enabled: mod.enabled, library: !!mod.library });
    else unknown.push(id);
  }
  return { version, reason, details, mods, unknown, report: reportFile };
}

ipcMain.handle("crash:open-report", (_e, file) => shell.openPath(file));

// ---------- Miejsce na dysku ----------
const UPDATER_CACHE = path.join(app.getPath("home"), "AppData", "Local", "minecraft-by-xbobersonx-updater");

function ensureGameClosed() {
  if (gameRunning) throw new Error("Zamknij grę, zanim zaczniesz sprzątać");
}

ipcMain.handle("disk:scan", () => disk.scan(GAME_DIR, UPDATER_CACHE));
ipcMain.handle("disk:clean", () => {
  ensureGameClosed();
  return disk.cleanJunk(GAME_DIR, UPDATER_CACHE);
});
ipcMain.handle("disk:delete-version", async (_e, { version, worlds }) => {
  ensureGameClosed();
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: "Usuń wersję",
    message: `Usunąć Minecraft ${version}?`,
    detail: worlds > 0
      ? `Razem z wersją znikną ${worlds} ${worlds === 1 ? "świat" : "światy"}, mody, shadery i ustawienia tej wersji. Tego nie da się cofnąć.`
      : "Znikną mody, shadery i ustawienia tej wersji. Przy następnym uruchomieniu wszystko pobierze się od nowa.",
    buttons: ["Usuń", "Anuluj"],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return null;
  return disk.deleteVersion(GAME_DIR, version);
});
ipcMain.handle("disk:open", () => shell.openPath(GAME_DIR));

ipcMain.handle("game:launch", async (_e, { nick, version, type, ram, loader }) => {
  const launcher = new Client();
  const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);

  // type trafia do --versionType; Minecraft pokazuje go na dole ekranu tytułowego
  // („Minecraft 1.21.11/xBobersonx”) i w F3
  const gameVersion = { number: version, type: "xBobersonx" };
  if (loader === "fabric" || loader === "pack") {
    send("game:log", "Instalowanie Fabric...");
    gameVersion.custom = await installFabric(version);
    send("game:log", `Fabric: ${gameVersion.custom}`);
  }
  const javaPath = await getJava(version, {
    runtimeRoot: path.join(GAME_DIR, "runtime"),
    manifestUrl: MANIFEST_URL,
    localJson: path.join(GAME_DIR, "versions", version, `${version}.json`),
    log: msg => send("game:log", msg),
    progress: p => send("game:progress", p),
  });

  const jvmArgs = [...JVM_FLAGS];
  if (loader === "pack") {
    const preinstalled = await installPack(packDir(version), version, {
      log: msg => send("game:log", msg),
      progress: p => send("game:progress", p),
    });
    // Fabric nie czyta podfolderów mods/, więc wskazujemy mu preinstalled/ wprost
    jvmArgs.push(`-Dfabric.addMods=${preinstalled}`);

    // domyślne ustawienia tylko dla wersji, w której gra jeszcze ich nie zapisała
    // (options.txt mógł powstać wcześniej z samą listą paczek tekstur)
    const options = path.join(packDir(version), "options.txt");
    const current = fs.existsSync(options) ? fs.readFileSync(options, "utf8") : "";
    if (!current.includes("renderDistance:")) fs.writeFileSync(options, `${DEFAULT_OPTIONS}\n${current}`);
  }

  // ostatnie linie logu gry — do analizy, jeśli gra się wysypie
  const logTail = [];
  const remember = text => {
    logTail.push(...text.split(/\r?\n/));
    if (logTail.length > 800) logTail.splice(0, logTail.length - 800);
  };
  const startedAt = Date.now();

  launcher.on("progress", p => send("game:progress", p));
  launcher.on("download-status", p => send("game:download", p));
  launcher.on("data", d => {
    send("game:log", d.toString());
    remember(d.toString());
  });
  launcher.on("debug", d => send("game:log", d.toString()));
  launcher.on("arguments", () => {
    gameRunning = true;
    send("game:started");
    hideToTray();
  });
  launcher.on("close", code => {
    gameRunning = false;
    showFromTray();
    send("game:closed", code);
    const instanceDir = loader === "pack" ? packDir(version) : GAME_DIR;
    const report = findCrashReport(instanceDir, startedAt);
    if (code !== 0 || report) {
      send("game:crash", describeCrash(instanceDir, version, logTail.join("\n"), code, report));
    }
  });

  const authorization = await gameAuthorization(nick, msg => send("game:log", msg));

  const proc = await launcher.launch({
    root: GAME_DIR,
    authorization,
    version: gameVersion,
    memory: { max: `${ram}G`, min: `${Math.min(2, ram)}G` },
    javaPath,
    overrides: loader === "pack" ? { gameDirectory: packDir(version) } : {},
    customArgs: jvmArgs,
  });
  if (!proc) throw new Error("Nie udało się uruchomić gry (sprawdź logi).");
  return true;
});


app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
